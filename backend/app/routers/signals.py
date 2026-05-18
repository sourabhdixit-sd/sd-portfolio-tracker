from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Fund, SignalConfig
from app.schemas import SignalOut, SignalConfigOut, SignalConfigUpdate
from app.auth import get_current_user
from app.services.signal_engine import compute_signal, get_or_create_signal_config

router = APIRouter(prefix="/signals", tags=["signals"])


@router.get("", response_model=list[SignalOut])
async def list_signals(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(select(Fund).where(Fund.is_active == True))
    funds = result.scalars().all()

    output = []
    for fund in funds:
        sig = await compute_signal(fund.id, db)
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
    await db.flush()
    await db.refresh(config)
    return config
