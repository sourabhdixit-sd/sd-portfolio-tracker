"use client";

import { useState, useEffect, Fragment } from "react";
import { getStockPortfolio, getStockTransactions, deleteStockTransaction, syncStockPrices, toggleStockWatchlist } from "@/lib/api";
import type { StockPortfolioEntry, StockTransaction } from "@/lib/api";
import ImportStocksModal from "@/components/ImportStocksModal";

function formatINR(value: number | null | undefined): string {
  if (value == null) return "—";
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function getGainClass(value: number | null | undefined): string {
  if (value == null) return "text-slate-400";
  return value < 0 ? "text-red-400" : "text-green-400";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatPriceAge(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never synced";
  return new Date(dateStr).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function StocksClient() {
  const [portfolio, setPortfolio] = useState<StockPortfolioEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Record<number, StockTransaction[]>>({});
  const [txLoading, setTxLoading] = useState<Record<number, boolean>>({});
  const [deletingTxId, setDeletingTxId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string>("");
  const [togglingId, setTogglingId] = useState<number | null>(null);

  async function loadPortfolio() {
    try {
      const data = await getStockPortfolio();
      setPortfolio(data);
    } catch (err) {
      console.error("[Stocks] Failed to load portfolio:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPortfolio(); }, []);

  const totalInvested = portfolio.reduce((s, e) => s + e.invested_value, 0);
  const totalCurrent = portfolio.reduce((s, e) => s + (e.current_value ?? 0), 0);
  const totalGainLoss = totalCurrent - totalInvested;
  const totalGainPct = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;

  const lastUpdated = portfolio.reduce<string | null>((latest, e) => {
    if (!e.price_updated_at) return latest;
    if (!latest) return e.price_updated_at;
    return e.price_updated_at > latest ? e.price_updated_at : latest;
  }, null);

  async function handleExpand(stockId: number) {
    if (expandedId === stockId) { setExpandedId(null); return; }
    setExpandedId(stockId);
    if (transactions[stockId]) return;
    setTxLoading(p => ({ ...p, [stockId]: true }));
    try {
      const data = await getStockTransactions(stockId);
      setTransactions(p => ({ ...p, [stockId]: data }));
    } finally {
      setTxLoading(p => ({ ...p, [stockId]: false }));
    }
  }

  async function handleDeleteTx(txId: number, stockId: number) {
    if (!confirm("Delete this transaction?")) return;
    setDeletingTxId(txId);
    try {
      await deleteStockTransaction(txId);
      setTransactions(p => ({ ...p, [stockId]: (p[stockId] ?? []).filter(t => t.id !== txId) }));
      loadPortfolio();
    } finally {
      setDeletingTxId(null);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult("");
    try {
      const result = await syncStockPrices();
      setSyncResult(`${result.synced} updated${result.failed > 0 ? `, ${result.failed} failed` : ""}`);
      await loadPortfolio();
    } catch (err) {
      setSyncResult("Sync failed");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(""), 5000);
    }
  }

  async function handleToggleWatchlist(stockId: number) {
    setTogglingId(stockId);
    try {
      const result = await toggleStockWatchlist(stockId);
      setPortfolio(p => p.map(s => s.stock_id === stockId ? { ...s, show_on_dashboard: result.show_on_dashboard } : s));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Stocks</h1>
        <div className="flex items-center gap-2">
          {/* Sync Prices button */}
          <div className="flex flex-col items-end gap-0.5">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-sm font-medium rounded-md transition-colors"
            >
              {syncing && (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {syncing ? "Syncing…" : "Sync Prices"}
            </button>
            {syncResult && <span className="text-xs text-slate-400">{syncResult}</span>}
            {!syncResult && lastUpdated && (
              <span className="text-xs text-slate-500">Updated: {formatPriceAge(lastUpdated)}</span>
            )}
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import Stocks
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {portfolio.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Invested", value: formatINR(totalInvested), cls: "text-slate-100" },
            { label: "Current Value", value: totalCurrent > 0 ? formatINR(totalCurrent) : "—", cls: "text-slate-100" },
            { label: "Total Gain / Loss", value: totalCurrent > 0 ? formatINR(totalGainLoss) : "—", cls: getGainClass(totalGainLoss) },
            { label: "Overall Return", value: totalCurrent > 0 ? formatPct(totalGainPct) : "—", cls: getGainClass(totalGainPct) },
          ].map(c => (
            <div key={c.label} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{c.label}</p>
              <p className={`text-xl font-bold ${c.cls}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Holdings table */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700">
          <p className="text-sm font-semibold text-slate-200">Holdings ({portfolio.length})</p>
        </div>
        {loading ? (
          <div className="px-5 py-10 flex items-center justify-center gap-2 text-slate-500 text-sm">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading…
          </div>
        ) : portfolio.length === 0 ? (
          <div className="px-5 py-12 text-center text-slate-500 text-sm">
            No stocks yet.{" "}
            <button onClick={() => setShowImport(true)} className="text-blue-400 hover:underline">Import your holdings</button>
            {" "}from an Axis Securities PDF or Excel.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/50">
                  <th className="w-8 px-3" title="Show on Dashboard" />
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Stock</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Symbol</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Shares</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Buy</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Price</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Invested</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Current</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Gain/Loss</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">XIRR</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {portfolio.map(entry => (
                  <Fragment key={entry.stock_id}>
                    <tr className="hover:bg-slate-700/30 transition-colors">
                      {/* Star / watchlist toggle */}
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleToggleWatchlist(entry.stock_id)}
                          disabled={togglingId === entry.stock_id}
                          title={entry.show_on_dashboard ? "Remove from dashboard" : "Show on dashboard"}
                          className="text-lg leading-none disabled:opacity-40"
                        >
                          {entry.show_on_dashboard ? "★" : "☆"}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-200 max-w-[160px] cursor-pointer" onClick={() => handleExpand(entry.stock_id)}>
                        <span className="truncate block" title={entry.stock_name}>{entry.stock_name}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs cursor-pointer" onClick={() => handleExpand(entry.stock_id)}>{entry.symbol}</td>
                      <td className="px-4 py-3 text-right text-slate-300 cursor-pointer" onClick={() => handleExpand(entry.stock_id)}>
                        {entry.total_shares.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300 cursor-pointer" onClick={() => handleExpand(entry.stock_id)}>{formatINR(entry.avg_buy_price)}</td>
                      <td className="px-4 py-3 text-right text-slate-200 cursor-pointer" onClick={() => handleExpand(entry.stock_id)}>
                        {entry.current_price != null ? formatINR(entry.current_price) : <span className="text-slate-500 text-xs">Sync needed</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300 cursor-pointer" onClick={() => handleExpand(entry.stock_id)}>{formatINR(entry.invested_value)}</td>
                      <td className="px-4 py-3 text-right text-slate-200 cursor-pointer" onClick={() => handleExpand(entry.stock_id)}>{formatINR(entry.current_value)}</td>
                      <td className="px-4 py-3 text-right cursor-pointer" onClick={() => handleExpand(entry.stock_id)}>
                        <div>
                          <span className={`block ${getGainClass(entry.gain_loss)}`}>{formatINR(entry.gain_loss)}</span>
                          <span className={`text-xs ${getGainClass(entry.gain_loss_pct)}`}>{formatPct(entry.gain_loss_pct)}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right cursor-pointer ${getGainClass(entry.xirr)}`} onClick={() => handleExpand(entry.stock_id)}>
                        {entry.xirr != null ? `${entry.xirr > 0 ? "+" : ""}${entry.xirr.toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center cursor-pointer" onClick={() => handleExpand(entry.stock_id)}>
                        <svg className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expandedId === entry.stock_id ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </td>
                    </tr>

                    {expandedId === entry.stock_id && (
                      <tr>
                        <td colSpan={11} className="px-6 py-4 bg-slate-900/50 border-b border-slate-700">
                          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Transactions — {entry.stock_name}</div>
                          {txLoading[entry.stock_id] ? (
                            <p className="text-slate-400 text-sm">Loading…</p>
                          ) : !transactions[entry.stock_id] || transactions[entry.stock_id].length === 0 ? (
                            <p className="text-slate-500 text-sm">No transactions recorded.</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-slate-700">
                                  {["Date", "Shares", "Buy Price", "Amount", "Notes", ""].map(h => (
                                    <th key={h} className={`py-2 pr-4 text-slate-500 font-medium ${h === "" ? "" : h === "Date" || h === "Notes" ? "text-left" : "text-right"}`}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800">
                                {transactions[entry.stock_id].map(tx => (
                                  <tr key={tx.id} className="hover:bg-slate-700/20">
                                    <td className="py-2 pr-4 text-slate-300">{formatDate(tx.transaction_date)}</td>
                                    <td className="py-2 pr-4 text-right text-slate-300">{tx.shares.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                                    <td className="py-2 pr-4 text-right text-slate-300">{formatINR(tx.buy_price)}</td>
                                    <td className="py-2 pr-4 text-right text-slate-300">{formatINR(tx.shares * tx.buy_price)}</td>
                                    <td className="py-2 pr-4 text-slate-500">{tx.notes ?? "—"}</td>
                                    <td className="py-2">
                                      <button
                                        onClick={e => { e.stopPropagation(); handleDeleteTx(tx.id, entry.stock_id); }}
                                        disabled={deletingTxId === tx.id}
                                        className="text-xs px-2 py-0.5 rounded bg-red-900/30 hover:bg-red-800/50 text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                                      >
                                        {deletingTxId === tx.id ? "…" : "Delete"}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showImport && (
        <ImportStocksModal
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); loadPortfolio(); }}
        />
      )}
    </div>
  );
}
