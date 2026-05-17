from datetime import datetime, timezone
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import SignalConfig
from app.schemas import SyncStatusOut
from app.auth import get_current_user
from app.services.nav_fetcher import sync_all_funds
from app.services.signal_engine import get_or_create_signal_config

router = APIRouter(prefix="/sync", tags=["sync"])


async def run_sync_and_update_timestamp(db: AsyncSession):
    await sync_all_funds(db)
    config = await get_or_create_signal_config(db)
    config.last_sync_at = datetime.now(timezone.utc)
    await db.flush()


@router.post("")
async def trigger_sync(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    await run_sync_and_update_timestamp(db)
    return {"message": "NAV sync completed"}


@router.get("/status", response_model=SyncStatusOut)
async def sync_status(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(select(SignalConfig).where(SignalConfig.id == 1))
    config = result.scalar_one_or_none()
    return SyncStatusOut(last_sync_at=config.last_sync_at if config else None)
