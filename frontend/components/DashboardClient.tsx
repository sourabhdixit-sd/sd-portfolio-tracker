"use client";

import { useState, useEffect, useCallback } from "react";
import { getSignals, getSignalConfig, getSyncStatus, getPortfolio, getStockWatchlist, getStockPortfolio, toggleStockWatchlist } from "@/lib/api";
import type { FundWithSignal, Signal, SignalConfig, StockPortfolioEntry } from "@/lib/api";
import SignalBadge from "@/components/SignalBadge";
import SyncButton from "@/components/SyncButton";
import RematchButton from "@/components/RematchButton";
import ThresholdForm from "@/components/ThresholdForm";
import ImportPortfolioModal from "@/components/ImportPortfolioModal";

function formatINR(value: number | null | undefined): string {
  if (value == null) return "—";
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatLastSync(dateStr: string | null): string {
  if (!dateStr) return "Never synced";
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function getPctClass(value: number | null): string {
  if (value == null) return "text-slate-400";
  return value < 0 ? "text-red-400" : "text-green-400";
}

function getRSIClass(value: number | null): string {
  if (value == null) return "text-slate-400";
  if (value <= 30) return "text-green-400";
  if (value >= 70) return "text-red-400";
  return "text-slate-300";
}

function getSMAClass(value: number | null): string {
  if (value == null) return "text-slate-400";
  return value < 0 ? "text-green-400" : "text-red-400";
}

function getGainClass(value: number | null | undefined): string {
  if (value == null) return "text-slate-400";
  return value < 0 ? "text-red-400" : "text-green-400";
}

export default function DashboardClient() {
  const [signals, setSignals] = useState<FundWithSignal[]>([]);
  const [config, setConfig] = useState<SignalConfig>({
    buy_threshold_pct: 10, sell_threshold_pct: 20,
    rsi_oversold: 30, rsi_overbought: 70, min_buy_signals: 2, min_sell_signals: 2,
  });
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [mfCurrent, setMfCurrent] = useState(0);
  const [mfInvested, setMfInvested] = useState(0);
  const [stocksCurrent, setStocksCurrent] = useState(0);
  const [stocksInvested, setStocksInvested] = useState(0);
  const [gainersCount, setGainersCount] = useState(0);
  const [watchlist, setWatchlist] = useState<StockPortfolioEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [togglingStarId, setTogglingStarId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [signalsRes, configRes, syncRes, portfolioRes, watchlistRes, stocksRes] = await Promise.allSettled([
      getSignals(), getSignalConfig(), getSyncStatus(), getPortfolio(), getStockWatchlist(), getStockPortfolio(),
    ]);
    if (signalsRes.status === "fulfilled") setSignals(signalsRes.value);
    if (configRes.status === "fulfilled") setConfig(configRes.value);
    if (syncRes.status === "fulfilled") setLastSync(syncRes.value.last_sync_at);
    if (portfolioRes.status === "fulfilled") {
      const p = portfolioRes.value;
      setMfCurrent(p.reduce((s, e) => s + (e.current_value ?? 0), 0));
      setMfInvested(p.reduce((s, e) => s + e.invested_value, 0));
      setGainersCount(p.filter(e => e.gain_loss != null && e.gain_loss > 0).length);
    }
    if (stocksRes.status === "fulfilled") {
      const s = stocksRes.value;
      setStocksCurrent(s.reduce((sum, e) => sum + (e.current_value ?? 0), 0));
      setStocksInvested(s.reduce((sum, e) => sum + e.invested_value, 0));
    }
    if (watchlistRes.status === "fulfilled") setWatchlist(watchlistRes.value);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh when user returns to this tab (e.g. after starring on Stocks page)
    const handleFocus = () => load();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [load]);

  async function handleUnstar(stockId: number) {
    setTogglingStarId(stockId);
    // Optimistic update — remove immediately
    setWatchlist(prev => prev.filter(s => s.stock_id !== stockId));
    try {
      await toggleStockWatchlist(stockId);
    } catch (err) {
      console.error("[Dashboard] Unstar failed:", err);
      // Reload to restore correct state on error
      load();
    } finally {
      setTogglingStarId(null);
    }
  }

  const buySignals = signals.filter(s => s.signal === "BUY" || s.signal === "STRONG_BUY");
  const sellSignals = signals.filter(s => s.signal === "SELL" || s.signal === "STRONG_SELL");
  const activeSignalsCount = buySignals.length + sellSignals.length;

  const totalCurrent  = mfCurrent + stocksCurrent;
  const totalInvested = mfInvested + stocksInvested;
  const totalGainLoss = totalCurrent - totalInvested;
  const totalGainPct  = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;
  const mfGainLoss    = mfCurrent - mfInvested;
  const mfGainPct     = mfInvested > 0 ? (mfGainLoss / mfInvested) * 100 : 0;
  const stocksGainLoss = stocksCurrent - stocksInvested;
  const stocksGainPct  = stocksInvested > 0 ? (stocksGainLoss / stocksInvested) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Last sync: {formatLastSync(lastSync)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-md transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import Portfolio
          </button>
          <RematchButton />
          <SyncButton />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Portfolio */}
        <div className="col-span-2 lg:col-span-1 bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Total Portfolio</p>
          <p className="text-2xl font-bold text-slate-100">{totalCurrent > 0 ? formatINR(totalCurrent) : "—"}</p>
          {totalInvested > 0 && (
            <div className="mt-1 space-y-0.5">
              <p className="text-xs text-slate-500">Invested: {formatINR(totalInvested)}</p>
              <p className={`text-sm font-medium ${getGainClass(totalGainLoss)}`}>
                {formatINR(totalGainLoss)} ({formatPct(totalGainPct)})
              </p>
            </div>
          )}
        </div>

        {/* Mutual Funds */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Mutual Funds</p>
          <p className="text-xl font-bold text-slate-100">{mfCurrent > 0 ? formatINR(mfCurrent) : "—"}</p>
          {mfInvested > 0 && (
            <p className={`text-sm mt-1 ${getGainClass(mfGainLoss)}`}>{formatPct(mfGainPct)}</p>
          )}
          <p className="text-xs text-slate-500 mt-0.5">{gainersCount} fund{gainersCount !== 1 ? "s" : ""} in gain</p>
        </div>

        {/* Stocks */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Stocks</p>
          <p className="text-xl font-bold text-slate-100">{stocksCurrent > 0 ? formatINR(stocksCurrent) : "—"}</p>
          {stocksInvested > 0 && stocksCurrent > 0 && (
            <p className={`text-sm mt-1 ${getGainClass(stocksGainLoss)}`}>{formatPct(stocksGainPct)}</p>
          )}
          {stocksInvested > 0 && stocksCurrent === 0 && (
            <p className="text-xs text-slate-500 mt-1">Sync prices to see value</p>
          )}
        </div>

        {/* Active Signals */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Active Signals</p>
          <p className="text-2xl font-bold text-slate-100">{activeSignalsCount}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-green-400">{buySignals.length} BUY</span>
            <span className="text-xs text-red-400">{sellSignals.length} SELL</span>
          </div>
        </div>
      </div>

      {/* My Stocks watchlist */}
      {(watchlist.length > 0 || !loading) && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">My Stocks</h2>
            <a href="/stocks" className="text-xs text-blue-400 hover:text-blue-300">Manage →</a>
          </div>
          {watchlist.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500 text-center">
              Go to the <a href="/stocks" className="text-blue-400 hover:underline">Stocks tab</a> and star stocks to show them here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800/50">
                    <th className="w-8 px-3" title="Remove from dashboard" />
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Stock</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Symbol</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Price</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Invested</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Current</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Gain/Loss</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {watchlist.map(s => (
                    <tr key={s.stock_id} className="hover:bg-slate-700/30">
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => handleUnstar(s.stock_id)}
                          disabled={togglingStarId === s.stock_id}
                          title="Remove from dashboard"
                          className="text-lg leading-none text-yellow-400 hover:text-slate-500 disabled:opacity-40 transition-colors"
                        >
                          ★
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-200 max-w-[160px]">
                        <span className="truncate block" title={s.stock_name}>{s.stock_name}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{s.symbol}</td>
                      <td className="px-4 py-3 text-right text-slate-200">{formatINR(s.current_price)}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{formatINR(s.invested_value)}</td>
                      <td className="px-4 py-3 text-right text-slate-200">{formatINR(s.current_value)}</td>
                      <td className="px-4 py-3 text-right">
                        <div>
                          <span className={`block ${getGainClass(s.gain_loss)}`}>{formatINR(s.gain_loss)}</span>
                          <span className={`text-xs ${getGainClass(s.gain_loss_pct)}`}>{formatPct(s.gain_loss_pct)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Signals table */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-200">Fund Signals ({signals.length})</h2>
        </div>
        {loading ? (
          <div className="px-5 py-10 flex items-center justify-center gap-2 text-slate-500 text-sm">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading signals…
          </div>
        ) : signals.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-500 text-sm">No signals data. Add funds and sync to see signals.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Fund</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Sector</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">NAV</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider" title="% below 52-week high">52W ↓</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider" title="% below 26-week high">26W ↓</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider" title="% below 13-week high">13W ↓</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider" title="% below 4-week high">4W ↓</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider" title="14-day RSI">RSI</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider" title="% vs 200-day SMA">vs 200d</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Signal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {signals.map(fund => (
                  <tr key={fund.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-200 max-w-[180px]">
                      <span className="truncate block" title={fund.name}>{fund.name}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm">{fund.sector ?? <span className="text-slate-600">—</span>}</td>
                    <td className="px-4 py-3 text-right text-slate-200">{formatINR(fund.current_nav)}</td>
                    <td className={`px-4 py-3 text-right text-sm ${getPctClass(fund.pct_from_high)}`}>{formatPct(fund.pct_from_high)}</td>
                    <td className={`px-4 py-3 text-right text-sm ${getPctClass(fund.pct_from_high_26w)}`}>{formatPct(fund.pct_from_high_26w)}</td>
                    <td className={`px-4 py-3 text-right text-sm ${getPctClass(fund.pct_from_high_13w)}`}>{formatPct(fund.pct_from_high_13w)}</td>
                    <td className={`px-4 py-3 text-right text-sm ${getPctClass(fund.pct_from_high_4w)}`}>{formatPct(fund.pct_from_high_4w)}</td>
                    <td className={`px-4 py-3 text-right text-sm ${getRSIClass(fund.rsi_14)}`}>
                      {fund.rsi_14 != null ? fund.rsi_14.toFixed(1) : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right text-sm ${getSMAClass(fund.pct_from_sma_200)}`}>{formatPct(fund.pct_from_sma_200)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <SignalBadge signal={fund.signal as Signal} />
                        <span className="text-xs text-slate-500">{fund.buy_votes}B · {fund.sell_votes}S</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Threshold config */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-200">Signal Thresholds</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Current: Buy when <span className="text-slate-300">{config.buy_threshold_pct}%</span> below high · Sell when <span className="text-slate-300">{config.sell_threshold_pct}%</span> above low
          </p>
        </div>
        <ThresholdForm config={config} />
      </div>

      {showImport && (
        <ImportPortfolioModal
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); window.location.reload(); }}
        />
      )}
    </div>
  );
}
