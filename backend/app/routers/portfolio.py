from collections import defaultdict
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from scipy.optimize import brentq

from app.database import get_db
from app.models import Fund, NavHistory, Transaction
from app.schemas import TransactionCreate, TransactionOut, PortfolioFundOut
from app.auth import get_current_user
from app.services.signal_engine import get_or_create_signal_config, compute_signal_from_rows

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def compute_xirr(transactions: list, current_value: float) -> Optional[float]:
    if not transactions or current_value is None:
        return None

    today = date.today()
    cash_flows = [(txn.transaction_date, -(float(txn.units) * float(txn.buy_nav))) for txn in transactions]
    cash_flows.append((today, current_value))

    if len(cash_flows) < 2:
        return None

    first_date = cash_flows[0][0]

    def npv(rate: float) -> float:
        return sum(
            cf / ((1 + rate) ** ((d - first_date).days / 365.0))
            for d, cf in cash_flows
        )

    try:
        return round(brentq(npv, -0.999, 100.0, maxiter=1000) * 100, 2)
    except (ValueError, RuntimeError):
        return None


@router.get("", response_model=list[PortfolioFundOut])
async def get_portfolio(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    funds_result = await db.execute(select(Fund).where(Fund.is_active == True))
    funds = funds_result.scalars().all()

    if not funds:
        return []

    fund_ids = [f.id for f in funds]

    # 1. All transactions in one query
    all_txns = (await db.execute(
        select(Transaction)
        .where(Transaction.fund_id.in_(fund_ids))
        .order_by(Transaction.fund_id, Transaction.transaction_date.asc())
    )).scalars().all()

    txns_by_fund: dict[int, list] = defaultdict(list)
    for t in all_txns:
        txns_by_fund[t.fund_id].append(t)

    # 2. All nav history (covers latest nav AND signal computation) in one query
    config = await get_or_create_signal_config(db)
    cutoff = date.today() - timedelta(days=400)

    all_nav = (await db.execute(
        select(NavHistory)
        .where(NavHistory.fund_id.in_(fund_ids), NavHistory.date >= cutoff)
        .order_by(NavHistory.fund_id, NavHistory.date.desc())
    )).scalars().all()

    nav_by_fund: dict[int, list] = defaultdict(list)
    for row in all_nav:
        nav_by_fund[row.fund_id].append(row)

    output = []
    for fund in funds:
        txns = txns_by_fund.get(fund.id, [])
        if not txns:
            continue

        rows = nav_by_fund.get(fund.id, [])
        current_nav = float(rows[0].nav_value) if rows else None

        total_units    = sum(float(t.units) for t in txns)
        total_invested = sum(float(t.units) * float(t.buy_nav) for t in txns)
        avg_buy_nav    = total_invested / total_units if total_units else 0.0
        current_value  = round(total_units * current_nav, 2) if current_nav else None
        gain_loss      = round(current_value - total_invested, 2) if current_value is not None else None
        gain_loss_pct  = (
            round(gain_loss / total_invested * 100, 2)
            if gain_loss is not None and total_invested > 0 else None
        )
        xirr = compute_xirr(txns, current_value) if current_value is not None else None
        sig  = compute_signal_from_rows(rows, config)

        output.append(PortfolioFundOut(
            fund_id=fund.id,
            fund_name=fund.name,
            amfi_code=fund.amfi_code,
            sector=fund.sector,
            total_units=round(total_units, 4),
            avg_buy_nav=round(avg_buy_nav, 4),
            current_nav=current_nav,
            current_value=current_value,
            invested_value=round(total_invested, 2),
            gain_loss=gain_loss,
            gain_loss_pct=gain_loss_pct,
            xirr=xirr,
            signal=sig["signal"],
        ))

    return output


@router.get("/{fund_id}/transactions", response_model=list[TransactionOut])
async def get_transactions(
    fund_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    fund_result = await db.execute(select(Fund).where(Fund.id == fund_id))
    if not fund_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Fund not found")

    result = await db.execute(
        select(Transaction)
        .where(Transaction.fund_id == fund_id)
        .order_by(Transaction.transaction_date.desc())
    )
    return result.scalars().all()


@router.post("/transactions", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
async def add_transaction(
    payload: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    fund_result = await db.execute(
        select(Fund).where(Fund.id == payload.fund_id, Fund.is_active == True)
    )
    if not fund_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Fund not found or inactive")

    txn = Transaction(
        fund_id=payload.fund_id,
        transaction_date=payload.transaction_date,
        units=payload.units,
        buy_nav=payload.buy_nav,
        notes=payload.notes,
    )
    db.add(txn)
    await db.flush()
    await db.refresh(txn)
    return txn


@router.delete("/transactions/{txn_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    txn_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(select(Transaction).where(Transaction.id == txn_id))
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await db.delete(txn)
