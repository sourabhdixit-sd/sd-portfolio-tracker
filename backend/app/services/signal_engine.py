from datetime import date, timedelta
from sqlalchemy import select
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


def _window_metrics(rows, days: int, current_nav: float) -> tuple:
    cutoff = date.today() - timedelta(days=days)
    navs = [float(r.nav_value) for r in rows if r.date >= cutoff]
    if not navs:
        return None, None, None, None
    high, low = max(navs), min(navs)
    return (
        high,
        low,
        round(((high - current_nav) / high) * 100, 2),
        round(((current_nav - low) / low) * 100, 2),
    )


def _compute_sma(navs_asc: list[float], period: int) -> float | None:
    if len(navs_asc) < period:
        return None
    return round(sum(navs_asc[-period:]) / period, 4)


def _compute_rsi(navs_asc: list[float], period: int = 14) -> float | None:
    if len(navs_asc) < period + 1:
        return None
    changes = [navs_asc[i] - navs_asc[i - 1] for i in range(len(navs_asc) - period, len(navs_asc))]
    gains = [max(c, 0) for c in changes]
    losses = [abs(min(c, 0)) for c in changes]
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    return round(100 - (100 / (1 + avg_gain / avg_loss)), 2)


_EMPTY_SIGNAL = {
    "signal": "HOLD", "current_nav": None, "buy_votes": 0, "sell_votes": 0,
    "high_52w": None, "low_52w": None, "pct_from_high": None, "pct_from_low": None,
    "high_26w": None, "low_26w": None, "pct_from_high_26w": None, "pct_from_low_26w": None,
    "high_13w": None, "low_13w": None, "pct_from_high_13w": None, "pct_from_low_13w": None,
    "high_4w": None, "low_4w": None, "pct_from_high_4w": None, "pct_from_low_4w": None,
    "sma_200": None, "pct_from_sma_200": None, "rsi_14": None,
}


async def compute_signal(fund_id: int, db: AsyncSession) -> dict:
    config = await get_or_create_signal_config(db)
    buy_thr = float(config.buy_threshold_pct)
    sell_thr = float(config.sell_threshold_pct)
    rsi_oversold = float(config.rsi_oversold)
    rsi_overbought = float(config.rsi_overbought)
    min_buy = int(config.min_buy_signals)
    min_sell = int(config.min_sell_signals)

    cutoff = date.today() - timedelta(days=400)
    result = await db.execute(
        select(NavHistory)
        .where(NavHistory.fund_id == fund_id, NavHistory.date >= cutoff)
        .order_by(NavHistory.date.desc())
    )
    rows = result.scalars().all()

    if not rows:
        return dict(_EMPTY_SIGNAL)

    current_nav = float(rows[0].nav_value)
    navs_asc = [float(r.nav_value) for r in reversed(rows)]

    high_52w, low_52w, pct_from_high,     pct_from_low     = _window_metrics(rows, 365, current_nav)
    high_26w, low_26w, pct_from_high_26w, pct_from_low_26w = _window_metrics(rows, 182, current_nav)
    high_13w, low_13w, pct_from_high_13w, pct_from_low_13w = _window_metrics(rows, 91,  current_nav)
    high_4w,  low_4w,  pct_from_high_4w,  pct_from_low_4w  = _window_metrics(rows, 28,  current_nav)

    sma_200 = _compute_sma(navs_asc, 200)
    pct_from_sma_200 = round(((current_nav - sma_200) / sma_200) * 100, 2) if sma_200 else None
    rsi_14 = _compute_rsi(navs_asc)

    buy_votes = sell_votes = 0

    # Window votes: 52W, 26W, 13W (same configured thresholds)
    for high, low in [(high_52w, low_52w), (high_26w, low_26w), (high_13w, low_13w)]:
        if high and current_nav <= high * (1 - buy_thr / 100):
            buy_votes += 1
        if low and current_nav >= low * (1 + sell_thr / 100):
            sell_votes += 1

    # RSI vote
    if rsi_14 is not None:
        if rsi_14 <= rsi_oversold:
            buy_votes += 1
        elif rsi_14 >= rsi_overbought:
            sell_votes += 1

    # SMA-200 vote
    if pct_from_sma_200 is not None:
        if pct_from_sma_200 < 0:
            buy_votes += 1
        else:
            sell_votes += 1

    # Composite verdict
    if buy_votes >= min_buy and buy_votes > sell_votes:
        signal = "STRONG_BUY" if buy_votes >= 4 else "BUY"
    elif sell_votes >= min_sell and sell_votes > buy_votes:
        signal = "STRONG_SELL" if sell_votes >= 4 else "SELL"
    else:
        signal = "HOLD"

    return {
        "signal": signal, "current_nav": current_nav,
        "buy_votes": buy_votes, "sell_votes": sell_votes,
        "high_52w": high_52w, "low_52w": low_52w,
        "pct_from_high": pct_from_high, "pct_from_low": pct_from_low,
        "high_26w": high_26w, "low_26w": low_26w,
        "pct_from_high_26w": pct_from_high_26w, "pct_from_low_26w": pct_from_low_26w,
        "high_13w": high_13w, "low_13w": low_13w,
        "pct_from_high_13w": pct_from_high_13w, "pct_from_low_13w": pct_from_low_13w,
        "high_4w": high_4w, "low_4w": low_4w,
        "pct_from_high_4w": pct_from_high_4w, "pct_from_low_4w": pct_from_low_4w,
        "sma_200": sma_200, "pct_from_sma_200": pct_from_sma_200, "rsi_14": rsi_14,
    }
