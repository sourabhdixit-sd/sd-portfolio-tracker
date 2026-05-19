from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Fund, NavHistory, SignalConfig
from app.schemas import SignalOut, SignalConfigOut, SignalConfigUpdate
from app.auth import get_current_user
from app.services.signal_engine import get_or_create_signal_config, compute_signal_from_rows

router = APIRouter(prefix="/signals", tags=["signals"])


@router.get("", response_model=list[SignalOut])
async def list_signals(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    funds_result = await db.execute(select(Fund).where(Fund.is_active == True))
    funds = funds_result.scalars().all()

    if not funds:
        return []

    config = await get_or_create_signal_config(db)
    fund_ids = [f.id for f in funds]
    cutoff = date.today() - timedelta(days=400)

    # ONE batched query for all funds' nav history
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
        rows = nav_by_fund.get(fund.id, [])
        sig = compute_signal_from_rows(rows, config)
        output.append(SignalOut(
            id=fund.id,
            fund_id=fund.id,
            name=fund.name,
            fund_name=fund.name,
            amfi_code=fund.amfi_code,
            sector=fund.sector,
            **sig,
        ))

    return output


@router.get("/config", response_model=SignalConfigOut)
async def get_signal_config(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    config = await get_or_create_signal_config(db)
    await db.flush()
    return config


@router.put("/config", response_model=SignalConfigOut)
async def update_signal_config(
    payload: SignalConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    config = await get_or_create_signal_config(db)
    config.buy_threshold_pct = payload.buy_threshold_pct
    config.sell_threshold_pct = payload.sell_threshold_pct
    config.rsi_oversold = payload.rsi_oversold
    config.rsi_overbought = payload.rsi_overbought
    config.min_buy_signals = payload.min_buy_signals
    config.min_sell_signals = payload.min_sell_signals
    await db.flush()
    await db.refresh(config)
    return config
