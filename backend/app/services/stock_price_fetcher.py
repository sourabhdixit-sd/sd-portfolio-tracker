"""
Fetches live stock prices directly from Yahoo Finance's REST API via httpx.
"""

import asyncio
import httpx

YAHOO_API = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
YAHOO_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": "https://finance.yahoo.com",
}

_DELAY_BETWEEN_REQUESTS = 0.2  # seconds between each fetch to avoid 429


async def _fetch_one(
    client: httpx.AsyncClient,
    symbol: str,
    semaphore: asyncio.Semaphore,
) -> tuple[float | None, str | None]:
    async with semaphore:
        await asyncio.sleep(_DELAY_BETWEEN_REQUESTS)
        try:
            r = await client.get(
                YAHOO_API.format(symbol=symbol),
                params={"interval": "1d", "range": "5d"},
                timeout=15.0,
            )
            if r.status_code == 429:
                # Rate limited — retry once after a longer pause
                await asyncio.sleep(2.0)
                r = await client.get(
                    YAHOO_API.format(symbol=symbol),
                    params={"interval": "1d", "range": "5d"},
                    timeout=15.0,
                )
            if r.status_code != 200:
                return None, f"HTTP {r.status_code}"

            result = r.json().get("chart", {}).get("result", [])
            if not result:
                return None, "no chart data (symbol may be invalid)"

            price = result[0].get("meta", {}).get("regularMarketPrice")
            if price and float(price) > 0:
                return round(float(price), 4), None

            return None, "price missing or zero"

        except httpx.TimeoutException:
            return None, "request timed out"
        except Exception as e:
            return None, f"{type(e).__name__}: {str(e)[:120]}"


async def fetch_prices_batch(symbols: list[str]) -> dict[str, tuple[float | None, str | None]]:
    """
    Fetch prices for the given symbols.
    Deduplicates symbols first so identical tickers are only fetched once.
    Uses semaphore(3) + 200ms delay to stay under Yahoo's rate limit.
    """
    unique_symbols = list(dict.fromkeys(symbols))  # deduplicate, preserve order
    skipped = len(symbols) - len(unique_symbols)
    if skipped:
        print(f"[stock-sync] deduplicated {len(symbols)} → {len(unique_symbols)} unique symbols")

    semaphore = asyncio.Semaphore(5)

    async with httpx.AsyncClient(
        headers=YAHOO_HEADERS,
        follow_redirects=True,
    ) as client:
        async def fetch_and_log(s: str):
            result = await _fetch_one(client, s, semaphore)
            price, err = result
            status = str(price) if price is not None else f"FAIL: {err or 'unknown'}"
            print(f"[stock-sync] {s} -> {status}")
            return s, result

        pairs = await asyncio.gather(*[fetch_and_log(s) for s in unique_symbols])

    return dict(pairs)
