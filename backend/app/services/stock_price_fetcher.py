import asyncio
import yfinance as yf


def _fetch_price_sync(symbol: str) -> tuple[float | None, str | None]:
    """Returns (price, error). error is None on success, descriptive string on failure."""
    ticker = yf.Ticker(symbol)

    # Try fast_info first (fastest path when it works)
    try:
        price = ticker.fast_info.last_price
        if price and price > 0:
            return round(float(price), 4), None
    except Exception:
        pass

    # Fallback: use 1d history (slower but more reliable)
    try:
        hist = ticker.history(period="1d")
        if not hist.empty and "Close" in hist.columns:
            close = float(hist["Close"].iloc[-1])
            if close > 0:
                return round(close, 4), None
        return None, "empty history"
    except Exception as e:
        return None, f"{type(e).__name__}: {str(e)[:120]}"


async def fetch_current_price(symbol: str) -> tuple[float | None, str | None]:
    return await asyncio.to_thread(_fetch_price_sync, symbol)


async def fetch_prices_batch(symbols: list[str]) -> dict[str, tuple[float | None, str | None]]:
    """Fetch prices for symbols in parallel, capped at 5 concurrent to avoid Yahoo rate limiting."""
    semaphore = asyncio.Semaphore(5)

    async def bounded_fetch(s: str):
        async with semaphore:
            result = await fetch_current_price(s)
            price, err = result
            status = f"{price}" if price is not None else f"FAIL: {err or 'no data'}"
            print(f"[stock-sync] {s} -> {status}")
            return result

    results = await asyncio.gather(*[bounded_fetch(s) for s in symbols])
    return dict(zip(symbols, results))
