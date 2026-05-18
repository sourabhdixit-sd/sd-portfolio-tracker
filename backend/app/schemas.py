from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel


class FundCreate(BaseModel):
    name: str
    amfi_code: str
    sector: Optional[str] = None


class FundOut(BaseModel):
    id: int
    name: str
    amfi_code: str
    sector: Optional[str]
    is_active: bool
    created_at: datetime
    latest_nav: Optional[float] = None
    latest_nav_date: Optional[date] = None
    signal: Optional[str] = None

    model_config = {"from_attributes": True}


class NavHistoryOut(BaseModel):
    id: int
    fund_id: int
    date: date
    nav_value: float

    model_config = {"from_attributes": True}


class TransactionCreate(BaseModel):
    fund_id: int
    transaction_date: date
    units: float
    buy_nav: float
    notes: Optional[str] = None


class TransactionOut(BaseModel):
    id: int
    fund_id: int
    transaction_date: date
    units: float
    buy_nav: float
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class PortfolioFundOut(BaseModel):
    fund_id: int
    fund_name: str
    amfi_code: str
    sector: Optional[str]
    total_units: float
    avg_buy_nav: float
    current_nav: Optional[float]
    current_value: Optional[float]
    invested_value: float
    gain_loss: Optional[float] = None
    gain_loss_pct: Optional[float]
    xirr: Optional[float]
    signal: Optional[str]


class SignalOut(BaseModel):
    id: int
    fund_id: int
    name: str
    fund_name: str
    amfi_code: str
    sector: Optional[str] = None
    signal: str
    current_nav: Optional[float]
    high_52w: Optional[float]
    low_52w: Optional[float]
    pct_from_high: Optional[float]
    pct_from_low: Optional[float]


class SignalConfigOut(BaseModel):
    id: int
    buy_threshold_pct: float
    sell_threshold_pct: float
    updated_at: datetime

    model_config = {"from_attributes": True}


class SignalConfigUpdate(BaseModel):
    buy_threshold_pct: float
    sell_threshold_pct: float


class SyncStatusOut(BaseModel):
    last_sync_at: Optional[datetime]


class HealthOut(BaseModel):
    status: str


class ImportTransaction(BaseModel):
    units: float
    avg_cost: float


class ImportFund(BaseModel):
    fund_name: str
    amfi_code: str
    sector: Optional[str] = None
    transactions: List[ImportTransaction]
    excluded: bool = False


class ImportConfirmPayload(BaseModel):
    transaction_date: str  # ISO date string "2026-03-08"
    funds: List[ImportFund]
