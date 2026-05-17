from datetime import date, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import NavHistory, SignalConfig


async def get_or_create_signal_config(db: AsyncSession) -> SignalConfig:
    result = await db.execute(select(SignalConfig).where(SignalConfig.id == 1))
    config = result.scalar_one_or_none()
    if config is None:
        config = SignalConfig(id=1, buy_threshold_pct=10.0, sell_threshold_pct=20.0)
        db.add(config)
        await db.flush()
    return config


async def compute_signal(fund_id: int, db: AsyncSession) -> dict:
    config = await get_or_create_signal_config(db)
    buy_threshold = float(config.buy_threshold_pct)
    sell_threshold = float(config.sell_threshold_pct)

    cutoff = date.today() - timedelta(days=365)

    result = await db.execute(
        select(NavHistory)
        .where(NavHistory.fund_id == fund_id, NavHistory.date >= cutoff)
        .order_by(NavHistory.date.desc())
    )
    rows = result.scalars().all()

    if not rows:
        return {
            "signal": "HOLD",
            "current_nav": None,
            "high_52w": None,
            "low_52w": None,
            "pct_from_high": None,
            "pct_from_low": None,
        }

    current_nav = float(rows[0].nav_value)
    navs = [float(r.nav_value) for r in rows]
    high_52w = max(navs)
    low_52w = min(navs)

    pct_from_high = ((high_52w - current_nav) / high_52w) * 100 if high_52w else None
    pct_from_low = ((current_nav - low_52w) / low_52w) * 100 if low_52w else None

    if pct_from_high is not None and current_nav <= high_52w * (1 - buy_threshold / 100):
        signal = "BUY"
    elif pct_from_low is not None and current_nav >= low_52w * (1 + sell_threshold / 100):
        signal = "SELL"
    else:
        signal = "HOLD"

    return {
        "signal": signal,
        "current_nav": current_nav,
        "high_52w": high_52w,
        "low_52w": low_52w,
        "pct_from_high": round(pct_from_high, 2) if pct_from_high is not None else None,
        "pct_from_low": round(pct_from_low, 2) if pct_from_low is not None else None,
    }
