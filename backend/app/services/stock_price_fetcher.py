import asyncio
import yfinance as yf


def _fetch_price_sync(symbol: str) -> float | None:
    try:
        ticker = yf.Ticker(symbol)
        price = ticker.fast_info.last_price
        return round(float(price), 4) if price else None
    except Exception:
        return None


async def fetch_current_price(symbol: str) -> float | None:
    return await asyncio.to_thread(_fetch_price_sync, symbol)


async def fetch_prices_batch(symbols: list[str]) -> dict[str, float | None]:
    results = await asyncio.gather(*[fetch_current_price(s) for s in symbols])
    return dict(zip(symbols, results))
