from datetime import datetime, date
from sqlalchemy import (
    Integer, String, Boolean, Numeric, Date, DateTime,
    ForeignKey, UniqueConstraint, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Fund(Base):
    __tablename__ = "funds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    amfi_code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    sector: Mapped[str | None] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    nav_history: Mapped[list["NavHistory"]] = relationship("NavHistory", back_populates="fund")
    transactions: Mapped[list["Transaction"]] = relationship("Transaction", back_populates="fund")


class NavHistory(Base):
    __tablename__ = "nav_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    fund_id: Mapped[int] = mapped_column(Integer, ForeignKey("funds.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    nav_value: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)

    __table_args__ = (UniqueConstraint("fund_id", "date", name="uq_nav_fund_date"),)

    fund: Mapped["Fund"] = relationship("Fund", back_populates="nav_history")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    fund_id: Mapped[int] = mapped_column(Integer, ForeignKey("funds.id"), nullable=False)
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    units: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    buy_nav: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    fund: Mapped["Fund"] = relationship("Fund", back_populates="transactions")


class SignalConfig(Base):
    __tablename__ = "signal_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    buy_threshold_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=10.0, nullable=False)
    sell_threshold_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=20.0, nullable=False)
    rsi_oversold: Mapped[float] = mapped_column(Numeric(5, 2), default=30.0, nullable=False)
    rsi_overbought: Mapped[float] = mapped_column(Numeric(5, 2), default=70.0, nullable=False)
    min_buy_signals: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    min_sell_signals: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
