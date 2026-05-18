from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from scipy.optimize import brentq
from app.database import get_db
from app.models import Fund, NavHistory, Transaction
from app.schemas import TransactionCreate, TransactionOut, PortfolioFundOut
from app.auth import get_current_user
from app.services.signal_engine import compute_signal

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def compute_xirr(transactions: list[Transaction], current_value: float) -> Optional[float]:
    if not transactions or current_value is None:
        return None

    today = date.today()
    cash_flows = []

    for txn in transactions:
        txn_date = txn.transaction_date
        amount = float(txn.units) * float(txn.buy_nav)
        cash_flows.append((txn_date, -amount))

    cash_flows.append((today, current_value))

    if len(cash_flows) < 2:
        return None

    first_date = cash_flows[0][0]

    def npv(rate: float) -> float:
        total = 0.0
        for cf_date, cf_amount in cash_flows:
            days = (cf_date - first_date).days
            years = days / 365.0
            total += cf_amount / ((1 + rate) ** years)
        return total

    try:
        xirr = brentq(npv, -0.999, 100.0, maxiter=1000)
        return round(xirr * 100, 2)
    except (ValueError, RuntimeError):
        return None


@router.get("", response_model=list[PortfolioFundOut])
async def get_portfolio(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    funds_result = await db.execute(select(Fund).where(Fund.is_active == True))
    funds = funds_result.scalars().all()

    output = []
    for fund in funds:
        txn_result = await db.execute(
            select(Transaction)
            .where(Transaction.fund_id == fund.id)
            .order_by(Transaction.transaction_date.asc())
        )
        transactions = txn_result.scalars().all()

        if not transactions:
            continue

        total_units = sum(float(t.units) for t in transactions)
        total_invested = sum(float(t.units) * float(t.buy_nav) for t in transactions)
        avg_buy_nav = total_invested / total_units if total_units else 0.0

        nav_result = await db.execute(
            select(NavHistory)
            .where(NavHistory.fund_id == fund.id)
            .order_by(NavHistory.date.desc())
            .limit(1)
        )
        latest_nav_row = nav_result.scalar_one_or_none()
        current_nav = float(latest_nav_row.nav_value) if latest_nav_row else None

        current_value = total_units * current_nav if current_nav is not None else None
        gain_loss = (
            round(current_value - total_invested, 2) if current_value is not None else None
        )
        gain_loss_pct = (
            ((current_value - total_invested) / total_invested) * 100
            if current_value is not None and total_invested > 0
            else None
        )

        xirr = compute_xirr(transactions, current_value) if current_value is not None else None
        sig_data = await compute_signal(fund.id, db)

        output.append(PortfolioFundOut(
            fund_id=fund.id,
            fund_name=fund.name,
            amfi_code=fund.amfi_code,
            sector=fund.sector,
            total_units=round(total_units, 4),
            avg_buy_nav=round(avg_buy_nav, 4),
            current_nav=current_nav,
            current_value=round(current_value, 2) if current_value is not None else None,
            invested_value=round(total_invested, 2),
            gain_loss=gain_loss,
            gain_loss_pct=round(gain_loss_pct, 2) if gain_loss_pct is not None else None,
            xirr=xirr,
            signal=sig_data["signal"],
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
    await db.flush()
