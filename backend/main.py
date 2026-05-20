from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import engine, get_db
from app.models import Base, Fund, NavHistory, Transaction
from app.routers import funds, portfolio, signals, sync, stocks
from app.services.scheduler import start_scheduler, stop_scheduler
from app.auth import get_current_user


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add new columns to existing tables if upgrading
        for stmt in [
            "ALTER TABLE signal_config ADD COLUMN IF NOT EXISTS rsi_oversold NUMERIC(5,2) NOT NULL DEFAULT 30.0",
            "ALTER TABLE signal_config ADD COLUMN IF NOT EXISTS rsi_overbought NUMERIC(5,2) NOT NULL DEFAULT 70.0",
            "ALTER TABLE signal_config ADD COLUMN IF NOT EXISTS min_buy_signals INTEGER NOT NULL DEFAULT 2",
            "ALTER TABLE signal_config ADD COLUMN IF NOT EXISTS min_sell_signals INTEGER NOT NULL DEFAULT 2",
            "ALTER TABLE stocks ADD COLUMN IF NOT EXISTS show_on_dashboard BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE stocks ADD COLUMN IF NOT EXISTS current_price NUMERIC(12,4)",
            "ALTER TABLE stocks ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMP",
            "ALTER TABLE amfi_overrides ALTER COLUMN created_at SET DEFAULT NOW()",
        ]:
            await conn.execute(text(stmt))
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="Indian Mutual Fund Tracker",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Catch-all exception handler that ensures CORS headers are present on 500 errors
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    import traceback
    print(f"[unhandled-exception] {request.method} {request.url.path}: {exc}")
    print(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}: {str(exc)}"},
        headers={"Access-Control-Allow-Origin": "*"},
    )


app.include_router(funds.router)
app.include_router(portfolio.router)
app.include_router(signals.router)
app.include_router(sync.router)
app.include_router(stocks.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/ping")
async def ping():
    return {"status": "ok"}


@app.get("/status")
async def status(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    fund_count = await db.scalar(select(func.count(Fund.id)).where(Fund.is_active == True))
    nav_count = await db.scalar(select(func.count(NavHistory.id)))
    txn_count = await db.scalar(select(func.count(Transaction.id)))
    return {
        "funds": fund_count or 0,
        "nav_entries": nav_count or 0,
        "transactions": txn_count or 0,
    }
