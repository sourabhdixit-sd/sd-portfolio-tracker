from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Fund, NavHistory, Transaction
from app.schemas import FundCreate, FundOut, ImportConfirmPayload
from app.auth import get_current_user
from app.services.signal_engine import compute_signal
from app.services.portfolio_parser import parse_pdf, parse_excel
from app.services.isin_lookup import lookup_all_funds
from app.services.nav_fetcher import fetch_and_store_nav

router = APIRouter(prefix="/funds", tags=["funds"])


@router.get("", response_model=list[FundOut])
async def list_funds(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(select(Fund).where(Fund.is_active == True))
    funds = result.scalars().all()

    output = []
    for fund in funds:
        latest_result = await db.execute(
            select(NavHistory)
            .where(NavHistory.fund_id == fund.id)
            .order_by(NavHistory.date.desc())
            .limit(1)
        )
        latest_nav_row = latest_result.scalar_one_or_none()

        sig_data = await compute_signal(fund.id, db)

        output.append(FundOut(
            id=fund.id,
            name=fund.name,
            amfi_code=fund.amfi_code,
            sector=fund.sector,
            is_active=fund.is_active,
            created_at=fund.created_at,
            latest_nav=float(latest_nav_row.nav_value) if latest_nav_row else None,
            latest_nav_date=latest_nav_row.date if latest_nav_row else None,
            signal=sig_data["signal"],
        ))

    return output


@router.post("", response_model=FundOut, status_code=status.HTTP_201_CREATED)
async def add_fund(
    payload: FundCreate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    existing = await db.execute(select(Fund).where(Fund.amfi_code == payload.amfi_code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Fund with this AMFI code already exists")

    fund = Fund(name=payload.name, amfi_code=payload.amfi_code, sector=payload.sector)
    db.add(fund)
    await db.flush()
    await db.refresh(fund)

    return FundOut(
        id=fund.id,
        name=fund.name,
        amfi_code=fund.amfi_code,
        sector=fund.sector,
        is_active=fund.is_active,
        created_at=fund.created_at,
        latest_nav=None,
        latest_nav_date=None,
        signal="HOLD",
    )


@router.get("/{fund_id}/nav-history")
async def get_nav_history(
    fund_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(
        select(NavHistory)
        .where(NavHistory.fund_id == fund_id)
        .order_by(NavHistory.date.asc())
    )
    rows = result.scalars().all()
    return [{"date": str(r.date), "nav_value": float(r.nav_value)} for r in rows]


@router.post("/import/parse")
async def parse_import_file(
    file: UploadFile = File(...),
    _: str = Depends(get_current_user),
):
    content = await file.read()
    filename = (file.filename or "").lower()

    if filename.endswith(".pdf"):
        parsed = parse_pdf(content)
    elif filename.endswith(".xlsx"):
        parsed = parse_excel(content)
    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload a .pdf or .xlsx file.",
        )

    funds_list = lookup_all_funds(parsed["funds"])
    return {"report_date": parsed["report_date"], "funds": funds_list}


@router.post("/import/confirm")
async def confirm_import(
    payload: ImportConfirmPayload,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    try:
        transaction_date = date_type.fromisoformat(payload.transaction_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid transaction_date format. Use ISO format YYYY-MM-DD.")

    funds_added = 0
    funds_skipped = 0
    transactions_added = 0
    new_funds: list[Fund] = []

    for import_fund in payload.funds:
        if import_fund.excluded:
            funds_skipped += 1
            continue

        # Check if fund already exists
        existing_result = await db.execute(
            select(Fund).where(Fund.amfi_code == import_fund.amfi_code)
        )
        existing_fund = existing_result.scalar_one_or_none()

        if existing_fund:
            funds_skipped += 1
            continue

        # Create new Fund record
        fund = Fund(
            name=import_fund.fund_name,
            amfi_code=import_fund.amfi_code,
            sector=import_fund.sector,
        )
        db.add(fund)
        await db.flush()
        await db.refresh(fund)

        # Create Transaction records
        for txn in import_fund.transactions:
            transaction = Transaction(
                fund_id=fund.id,
                transaction_date=transaction_date,
                units=txn.units,
                buy_nav=txn.avg_cost,
            )
            db.add(transaction)
            transactions_added += 1

        await db.flush()
        funds_added += 1
        new_funds.append(fund)

    # Fetch NAV history for all newly added funds
    for fund in new_funds:
        try:
            await fetch_and_store_nav(fund.id, fund.amfi_code, db)
        except Exception:
            pass  # NAV fetch failure should not block the import

    return {
        "funds_added": funds_added,
        "funds_skipped": funds_skipped,
        "transactions_added": transactions_added,
    }


@router.delete("/{fund_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_fund(
    fund_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(select(Fund).where(Fund.id == fund_id))
    fund = result.scalar_one_or_none()
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")
    fund.is_active = False
    await db.flush()
