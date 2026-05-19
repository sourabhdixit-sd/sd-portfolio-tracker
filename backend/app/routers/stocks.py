import asyncio
import re
from datetime import date, datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from scipy.optimize import brentq

from app.database import get_db, AsyncSessionLocal
from app.models import Stock, StockTransaction
from app.schemas import (
    StockImportConfirmPayload,
    StockTransactionCreate,
    StockTransactionOut,
    StockPortfolioOut,
)
from app.auth import get_current_user
from app.services.portfolio_parser import parse_stocks_from_pdf, parse_stocks_from_excel
from app.services.stock_price_fetcher import fetch_prices_batch

_YAHOO_SEARCH = "https://query2.finance.yahoo.com/v1/finance/search"
_YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json",
}
_CLEAN_SUFFIXES = re.compile(
    r"\s+(ltd\.?|limited|corp\.?|corporation|industries|industry|"
    r"enterprises|company|co\.?|pvt\.?|private|inc\.?)$",
    flags=re.IGNORECASE,
)


def _clean_name(name: str) -> str:
    return _CLEAN_SUFFIXES.sub("", name.strip()).strip()


async def _lookup_nse_symbol(client: httpx.AsyncClient, name: str) -> str | None:
    cleaned = _clean_name(name)
    try:
        r = await client.get(
            _YAHOO_SEARCH,
            params={"q": cleaned, "quotesCount": 6, "newsCount": 0, "country": "India"},
            timeout=10.0,
        )
        if r.status_code != 200:
            return None
        quotes = r.json().get("quotes", [])
        # Prefer NSE (.NS) equity over BSE (.BO)
        equity_ns = [q for q in quotes if q.get("symbol", "").endswith(".NS") and q.get("quoteType") == "EQUITY"]
        equity_bo = [q for q in quotes if q.get("symbol", "").endswith(".BO") and q.get("quoteType") == "EQUITY"]
        best = equity_ns or equity_bo
        return best[0]["symbol"] if best else None
    except Exception:
        return None

router = APIRouter(prefix="/stocks", tags=["stocks"])


def _compute_stock_xirr(transactions: list[StockTransaction], current_value: float | None) -> Optional[float]:
    if not transactions or current_value is None:
        return None
    today = date.today()
    cash_flows = [(txn.transaction_date, -(float(txn.shares) * float(txn.buy_price))) for txn in transactions]
    cash_flows.append((today, current_value))
    if len(cash_flows) < 2:
        return None
    first_date = cash_flows[0][0]

    def npv(rate: float) -> float:
        return sum(
            cf / ((1 + rate) ** ((d - first_date).days / 365.0))
            for d, cf in cash_flows
        )

    try:
        return round(brentq(npv, -0.999, 100.0, maxiter=1000) * 100, 2)
    except (ValueError, RuntimeError):
        return None


def _suggest_symbol(name: str) -> str:
    cleaned = name.upper().split()[0] if name else ""
    return f"{cleaned}.NS" if cleaned else ""


def _build_portfolio_out(stock: Stock, txns: list[StockTransaction]) -> StockPortfolioOut | None:
    if not txns:
        return None
    total_shares = sum(float(t.shares) for t in txns)
    total_invested = sum(float(t.shares) * float(t.buy_price) for t in txns)
    avg_buy_price = round(total_invested / total_shares, 4) if total_shares else 0.0
    # Use getattr for new columns — graceful fallback if DB migration hasn't run yet
    raw_price = getattr(stock, 'current_price', None)
    current_price = float(raw_price) if raw_price is not None else None
    raw_price_updated = getattr(stock, 'price_updated_at', None)
    # Stored as naive UTC; attach tzinfo so JS parses as UTC not local
    price_updated_at = raw_price_updated.replace(tzinfo=timezone.utc) if raw_price_updated else None
    show_on_dashboard = getattr(stock, 'show_on_dashboard', False)
    current_value = round(total_shares * current_price, 2) if current_price else None
    gain_loss = round(current_value - total_invested, 2) if current_value is not None else None
    gain_loss_pct = (
        round(gain_loss / total_invested * 100, 2)
        if gain_loss is not None and total_invested > 0
        else None
    )
    xirr = _compute_stock_xirr(txns, current_value)
    return StockPortfolioOut(
        stock_id=stock.id,
        stock_name=stock.name,
        isin=stock.isin,
        symbol=stock.symbol,
        sector=stock.sector,
        total_shares=round(total_shares, 4),
        avg_buy_price=avg_buy_price,
        current_price=current_price,
        price_updated_at=price_updated_at,
        current_value=current_value,
        invested_value=round(total_invested, 2),
        gain_loss=gain_loss,
        gain_loss_pct=gain_loss_pct,
        xirr=xirr,
        show_on_dashboard=show_on_dashboard,
    )


@router.post("/import/parse")
async def parse_stocks_file(
    file: UploadFile = File(...),
    _: str = Depends(get_current_user),
):
    content = await file.read()
    filename = (file.filename or "").lower()

    if filename.endswith(".pdf"):
        parsed = parse_stocks_from_pdf(content)
    elif filename.endswith(".xlsx"):
        parsed = parse_stocks_from_excel(content)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type. Upload a .pdf or .xlsx file.")

    stocks_out = [
        {
            "stock_name": s["stock_name"],
            "isin": isin,
            "suggested_symbol": _suggest_symbol(s["stock_name"]),
            "shares": s["shares"],
            "avg_cost": s["avg_cost"],
            "investment_amount": s["investment_amount"],
            "market_price": s["market_price"],
        }
        for isin, s in parsed["stocks"].items()
    ]

    return {"report_date": parsed["report_date"], "stocks": stocks_out}


@router.post("/import/confirm")
async def confirm_stocks_import(
    payload: StockImportConfirmPayload,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    try:
        txn_date = date.fromisoformat(payload.transaction_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid transaction_date format. Use YYYY-MM-DD.")

    added = skipped = 0

    for item in payload.stocks:
        if item.excluded:
            skipped += 1
            continue

        existing = await db.execute(select(Stock).where(Stock.isin == item.isin))
        if existing.scalar_one_or_none():
            skipped += 1
            continue

        stock = Stock(name=item.stock_name, isin=item.isin, symbol=item.symbol.strip())
        db.add(stock)
        await db.flush()
        await db.refresh(stock)

        db.add(StockTransaction(
            stock_id=stock.id,
            transaction_date=txn_date,
            shares=item.shares,
            buy_price=item.avg_cost,
        ))
        await db.flush()
        added += 1

    return {"added": added, "skipped": skipped}


@router.get("/portfolio", response_model=list[StockPortfolioOut])
async def get_stock_portfolio(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(select(Stock).where(Stock.is_active == True))
    stocks = result.scalars().all()

    if not stocks:
        return []

    output = []
    for stock in stocks:
        txn_result = await db.execute(
            select(StockTransaction)
            .where(StockTransaction.stock_id == stock.id)
            .order_by(StockTransaction.transaction_date.asc())
        )
        txns = txn_result.scalars().all()
        entry = _build_portfolio_out(stock, txns)
        if entry:
            output.append(entry)

    return output


@router.get("/watchlist", response_model=list[StockPortfolioOut])
async def get_stock_watchlist(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(
        select(Stock).where(Stock.is_active == True, Stock.show_on_dashboard == True)
    )
    stocks = result.scalars().all()

    output = []
    for stock in stocks:
        txn_result = await db.execute(
            select(StockTransaction)
            .where(StockTransaction.stock_id == stock.id)
            .order_by(StockTransaction.transaction_date.asc())
        )
        txns = txn_result.scalars().all()
        entry = _build_portfolio_out(stock, txns)
        if entry:
            output.append(entry)

    return output


@router.post("/sync")
async def sync_stock_prices(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(select(Stock).where(Stock.is_active == True))
    stocks = result.scalars().all()

    if not stocks:
        return {"synced": 0, "failed": 0, "failures": []}

    symbols = [s.symbol for s in stocks]
    price_map = await fetch_prices_batch(symbols)

    synced = failed = 0
    failures: list[dict] = []
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for stock in stocks:
        price, err = price_map.get(stock.symbol, (None, "no result"))
        if price is not None:
            stock.current_price = price
            stock.price_updated_at = now
            synced += 1
        else:
            failed += 1
            failures.append({
                "symbol": stock.symbol,
                "name": stock.name,
                "error": err or "unknown",
            })

    await db.flush()
    print(f"[stock-sync] complete: {synced} synced, {failed} failed")
    return {"synced": synced, "failed": failed, "failures": failures[:10]}


@router.post("/rematch-symbols")
async def rematch_symbols(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Auto-correct NSE/BSE ticker symbols by searching Yahoo Finance by stock name."""
    result = await db.execute(select(Stock).where(Stock.is_active == True))
    stocks = result.scalars().all()

    if not stocks:
        return {"checked": 0, "updated": 0, "changes": []}

    semaphore = asyncio.Semaphore(3)
    changes: list[dict] = []

    async def lookup_one(stock: Stock, client: httpx.AsyncClient) -> tuple[Stock, str | None]:
        async with semaphore:
            await asyncio.sleep(0.15)
            sym = await _lookup_nse_symbol(client, stock.name)
            print(f"[rematch] {stock.name[:35]} -> {sym or 'not found'}")
            return stock, sym

    async with httpx.AsyncClient(headers=_YAHOO_HEADERS, follow_redirects=True) as client:
        results = await asyncio.gather(*[lookup_one(s, client) for s in stocks])

    for stock, new_symbol in results:
        if new_symbol and new_symbol.upper() != stock.symbol.upper():
            changes.append({
                "name": stock.name,
                "old_symbol": stock.symbol,
                "new_symbol": new_symbol,
            })
            stock.symbol = new_symbol
            stock.current_price = None
            stock.price_updated_at = None

    await db.flush()
    print(f"[rematch] complete: checked={len(stocks)}, updated={len(changes)}")
    return {"checked": len(stocks), "updated": len(changes), "changes": changes}


@router.patch("/{stock_id}/symbol")
async def update_stock_symbol(
    stock_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(select(Stock).where(Stock.id == stock_id))
    stock = result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    new_symbol = str(payload.get("symbol", "")).strip().upper()
    if not new_symbol:
        raise HTTPException(status_code=400, detail="symbol is required")
    stock.symbol = new_symbol
    # Clear price so it's re-fetched with correct symbol
    stock.current_price = None
    stock.price_updated_at = None
    await db.flush()
    return {"stock_id": stock_id, "symbol": stock.symbol}


@router.patch("/{stock_id}/watchlist")
async def toggle_watchlist(
    stock_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(select(Stock).where(Stock.id == stock_id))
    stock = result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    stock.show_on_dashboard = not stock.show_on_dashboard
    await db.flush()
    return {"stock_id": stock_id, "show_on_dashboard": stock.show_on_dashboard}


@router.get("/{stock_id}/transactions", response_model=list[StockTransactionOut])
async def get_stock_transactions(
    stock_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(
        select(StockTransaction)
        .where(StockTransaction.stock_id == stock_id)
        .order_by(StockTransaction.transaction_date.desc())
    )
    return result.scalars().all()


@router.post("/transactions", response_model=StockTransactionOut, status_code=status.HTTP_201_CREATED)
async def add_stock_transaction(
    payload: StockTransactionCreate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    stock_result = await db.execute(select(Stock).where(Stock.id == payload.stock_id, Stock.is_active == True))
    if not stock_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Stock not found")

    txn = StockTransaction(
        stock_id=payload.stock_id,
        transaction_date=payload.transaction_date,
        shares=payload.shares,
        buy_price=payload.buy_price,
        notes=payload.notes,
    )
    db.add(txn)
    await db.flush()
    await db.refresh(txn)
    return txn


@router.delete("/transactions/{txn_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stock_transaction(
    txn_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(select(StockTransaction).where(StockTransaction.id == txn_id))
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await db.delete(txn)


@router.delete("/{stock_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stock(
    stock_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(select(Stock).where(Stock.id == stock_id))
    stock = result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    stock.is_active = False
    await db.flush()
