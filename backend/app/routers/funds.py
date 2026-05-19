import asyncio
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, status
from sqlalchemy import select, delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db, AsyncSessionLocal
from app.models import Fund, NavHistory, Transaction
from app.schemas import FundCreate, FundOut, ImportConfirmPayload, UnifiedImportConfirmPayload
from app.services.portfolio_parser import parse_stocks_from_pdf, parse_stocks_from_excel
from app.models import Stock, StockTransaction
from app.auth import get_current_user
from app.services.signal_engine import compute_signal
from app.services.portfolio_parser import parse_pdf, parse_excel
from app.services.isin_lookup import lookup_all_funds, lookup_amfi_by_name
from app.services.nav_fetcher import fetch_and_store_nav

router = APIRouter(prefix="/funds", tags=["funds"])


async def _lookup_all_parallel(fund_groups: dict) -> list:
    """Parallel AMFI lookup — replaces the sequential lookup_all_funds to avoid 20-30s timeouts."""
    semaphore = asyncio.Semaphore(5)

    async def lookup_one(isin: str, group: dict) -> dict:
        fund_name = group["fund_name"]
        transactions = group["transactions"]
        total_units = sum(t["units"] for t in transactions)
        total_invested = sum(t["investment_amount"] for t in transactions)

        async with semaphore:
            result = await asyncio.to_thread(lookup_amfi_by_name, fund_name)

        return {
            "fund_name": fund_name,
            "isin": isin,
            "amfi_code": result["amfi_code"] if result else None,
            "matched_name": result["matched_name"] if result else None,
            "needs_manual_amfi": result is None,
            "transactions": transactions,
            "total_units": total_units,
            "total_invested": total_invested,
        }

    return list(await asyncio.gather(*[lookup_one(isin, g) for isin, g in fund_groups.items()]))



async def _fetch_navs_background(fund_data: list[tuple[int, str]]):
    """Fetch NAV history for newly imported funds in the background."""
    async with AsyncSessionLocal() as db:
        for fund_id, amfi_code in fund_data:
            try:
                await fetch_and_store_nav(fund_id, amfi_code, db)
            except Exception as e:
                print(f"[import] NAV fetch failed for {amfi_code}: {e}")
        try:
            await db.commit()
        except Exception as e:
            print(f"[import] NAV commit failed: {e}")


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

    funds_list = await _lookup_all_parallel(parsed["funds"])
    return {"report_date": parsed["report_date"], "funds": funds_list}


@router.post("/import/confirm")
async def confirm_import(
    payload: ImportConfirmPayload,
    background_tasks: BackgroundTasks,
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

    # Commit funds + transactions now — before NAV fetch which can take minutes
    await db.commit()

    # Fetch NAV history in background so the HTTP response returns immediately
    if new_funds:
        background_tasks.add_task(
            _fetch_navs_background,
            [(f.id, f.amfi_code) for f in new_funds],
        )

    return {
        "funds_added": funds_added,
        "funds_skipped": funds_skipped,
        "transactions_added": transactions_added,
    }


@router.post("/rematch")
async def rematch_amfi_codes(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(select(Fund).where(Fund.is_active == True))
    funds = result.scalars().all()
    fund_snapshot = [(f.id, f.name, f.amfi_code) for f in funds]

    async def lookup_one(fund_id: int, name: str, current_code: str):
        new = await asyncio.to_thread(lookup_amfi_by_name, name)
        return fund_id, current_code, new

    lookups = await asyncio.gather(*[lookup_one(*f) for f in fund_snapshot])

    updated: list[tuple[int, str]] = []
    for fund_id, current_code, lookup in lookups:
        if lookup is None or lookup["amfi_code"] == current_code:
            continue
        new_code = lookup["amfi_code"]
        await db.execute(sql_delete(NavHistory).where(NavHistory.fund_id == fund_id))
        fund_row = next(f for f in funds if f.id == fund_id)
        fund_row.amfi_code = new_code
        updated.append((fund_id, new_code))
        print(f"[rematch] {fund_row.name}: {current_code} → {new_code}")

    await db.flush()
    if updated:
        background_tasks.add_task(_fetch_navs_background, updated)

    return {"checked": len(fund_snapshot), "updated": len(updated)}


@router.post("/import/unified/parse")
async def unified_parse(
    file: UploadFile = File(...),
    _: str = Depends(get_current_user),
):
    content = await file.read()
    filename = (file.filename or "").lower()

    if filename.endswith(".pdf"):
        mf_parsed = parse_pdf(content)
        eq_parsed = parse_stocks_from_pdf(content)
    elif filename.endswith(".xlsx"):
        mf_parsed = parse_excel(content)
        eq_parsed = parse_stocks_from_excel(content)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type. Upload a .pdf or .xlsx file.")

    funds_list = await _lookup_all_parallel(mf_parsed["funds"])

    def _suggest_symbol(name: str) -> str:
        cleaned = name.upper().split()[0] if name else ""
        return f"{cleaned}.NS" if cleaned else ""

    stocks_list = [
        {
            "stock_name": s["stock_name"],
            "isin": isin,
            "suggested_symbol": _suggest_symbol(s["stock_name"]),
            "shares": s["shares"],
            "avg_cost": s["avg_cost"],
            "investment_amount": s["investment_amount"],
            "market_price": s["market_price"],
        }
        for isin, s in eq_parsed["stocks"].items()
    ]

    return {
        "report_date": mf_parsed["report_date"] or eq_parsed["report_date"],
        "funds": funds_list,
        "stocks": stocks_list,
    }


@router.post("/import/unified/confirm")
async def unified_confirm(
    payload: UnifiedImportConfirmPayload,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    try:
        txn_date = date_type.fromisoformat(payload.transaction_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid transaction_date format. Use YYYY-MM-DD.")

    funds_added = funds_skipped = stocks_added = stocks_skipped = 0
    new_funds: list[Fund] = []

    for import_fund in payload.funds:
        if import_fund.excluded:
            funds_skipped += 1
            continue
        existing = await db.execute(select(Fund).where(Fund.amfi_code == import_fund.amfi_code))
        if existing.scalar_one_or_none():
            funds_skipped += 1
            continue
        fund = Fund(name=import_fund.fund_name, amfi_code=import_fund.amfi_code, sector=import_fund.sector)
        db.add(fund)
        await db.flush()
        await db.refresh(fund)
        for txn in import_fund.transactions:
            db.add(Transaction(fund_id=fund.id, transaction_date=txn_date, units=txn.units, buy_nav=txn.avg_cost))
        await db.flush()
        funds_added += 1
        new_funds.append(fund)

    for item in payload.stocks:
        if item.excluded:
            stocks_skipped += 1
            continue
        existing = await db.execute(select(Stock).where(Stock.isin == item.isin))
        if existing.scalar_one_or_none():
            stocks_skipped += 1
            continue
        stock = Stock(name=item.stock_name, isin=item.isin, symbol=item.symbol.strip())
        db.add(stock)
        await db.flush()
        await db.refresh(stock)
        db.add(StockTransaction(stock_id=stock.id, transaction_date=txn_date, shares=item.shares, buy_price=item.avg_cost))
        await db.flush()
        stocks_added += 1

    await db.commit()

    if new_funds:
        background_tasks.add_task(_fetch_navs_background, [(f.id, f.amfi_code) for f in new_funds])

    return {
        "funds_added": funds_added,
        "funds_skipped": funds_skipped,
        "stocks_added": stocks_added,
        "stocks_skipped": stocks_skipped,
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
