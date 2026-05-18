from datetime import datetime, timezone
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy import select
from app.database import get_db, AsyncSessionLocal
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import SignalConfig
from app.schemas import SyncStatusOut
from app.auth import get_current_user
from app.services.nav_fetcher import sync_all_funds
from app.services.signal_engine import get_or_create_signal_config

router = APIRouter(prefix="/sync", tags=["sync"])


async def run_sync_background():
    try:
        await sync_all_funds()
    except Exception as e:
        print(f"[sync] sync_all_funds failed: {e}")
        return

    async with AsyncSessionLocal() as db:
        try:
            config = await get_or_create_signal_config(db)
            config.last_sync_at = datetime.now(timezone.utc)
            await db.commit()
        except Exception as e:
            await db.rollback()
            print(f"[sync] last_sync_at update failed: {e}")


@router.post("")
async def trigger_sync(
    background_tasks: BackgroundTasks,
    _: str = Depends(get_current_user),
):
    background_tasks.add_task(run_sync_background)
    return {"message": "Sync started"}


@router.get("/status", response_model=SyncStatusOut)
async def sync_status(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(select(SignalConfig).where(SignalConfig.id == 1))
    config = result.scalar_one_or_none()
    return SyncStatusOut(last_sync_at=config.last_sync_at if config else None)
