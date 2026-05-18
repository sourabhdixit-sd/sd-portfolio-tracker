from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from app.database import AsyncSessionLocal
from app.services.nav_fetcher import sync_all_funds
from app.models import SignalConfig
from sqlalchemy import select
from datetime import datetime, timezone

scheduler = AsyncIOScheduler(timezone="UTC")


async def scheduled_sync():
    try:
        await sync_all_funds()
    except Exception as e:
        print(f"[scheduler] sync_all_funds failed: {e}")
        raise

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(SignalConfig).where(SignalConfig.id == 1))
            config = result.scalar_one_or_none()
            if config is None:
                config = SignalConfig(id=1, buy_threshold_pct=10.0, sell_threshold_pct=20.0)
                db.add(config)
            config.last_sync_at = datetime.now(timezone.utc)
            await db.commit()
        except Exception:
            await db.rollback()
            raise


def start_scheduler():
    scheduler.add_job(
        scheduled_sync,
        trigger=CronTrigger(hour=14, minute=30, timezone="UTC"),
        id="daily_nav_sync",
        replace_existing=True,
    )
    scheduler.start()


def stop_scheduler():
    scheduler.shutdown(wait=False)
