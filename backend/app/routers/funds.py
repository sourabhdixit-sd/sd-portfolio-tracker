from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Fund, NavHistory
from app.schemas import FundCreate, FundOut
from app.auth import get_current_user
from app.services.signal_engine import compute_signal

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
