"use client";

import { useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { getStockTransactions, deleteStockTransaction, deleteStock } from "@/lib/api";
import type { StockPortfolioEntry, StockTransaction } from "@/lib/api";
import ImportStocksModal from "@/components/ImportStocksModal";

interface StocksClientProps {
  portfolio: StockPortfolioEntry[];
}

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

export default function StocksClient({ portfolio }: StocksClientProps) {
  const router = useRouter();
  const [showImport, setShowImport] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Record<number, StockTransaction[]>>({});
  const [txLoading, setTxLoading] = useState<Record<number, boolean>>({});
  const [deletingTxId, setDeletingTxId] = useState<number | null>(null);

  const totalInvested = portfolio.reduce((s, e) => s + e.invested_value, 0);
  const totalCurrent = portfolio.reduce((s, e) => s + (e.current_value ?? 0), 0);
  const totalGainLoss = totalCurrent - totalInvested;
  const totalGainPct = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;

  async function handleExpand(stockId: number) {
    if (expandedId === stockId) { setExpandedId(null); return; }
    setExpandedId(stockId);
    if (transactions[stockId]) return;
    setTxLoading((p) => ({ ...p, [stockId]: true }));
    try {
      const data = await getStockTransactions(stockId);
      setTransactions((p) => ({ ...p, [stockId]: data }));
    } finally {
      setTxLoading((p) => ({ ...p, [stockId]: false }));
    }
  }

  async function handleDeleteTx(txId: number, stockId: number) {
    if (!confirm("Delete this transaction?")) return;
    setDeletingTxId(txId);
    try {
      await deleteStockTransaction(txId);
      setTransactions((p) => ({ ...p, [stockId]: (p[stockId] ?? []).filter((t) => t.id !== txId) }));
      router.refresh();
    } finally {
      setDeletingTxId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Stocks</h1>
        <button onClick={() => setShowImport(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Import Stocks
        </button>
      </div>

      {/* Summary cards */}
      {portfolio.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Total Invested</p>
            <p className="text-xl font-bold text-slate-100">{formatINR(totalInvested)}</p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Current Value</p>
            <p className="text-xl font-bold text-slate-100">{totalCurrent > 0 ? formatINR(totalCurrent) : "—"}</p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Total Gain / Loss</p>
            <p className={`text-xl font-bold ${getGainClass(totalGainLoss)}`}>
              {totalCurrent > 0 ? formatINR(totalGainLoss) : "—"}
            </p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Overall Return</p>
            <p className={`text-xl font-bold ${getGainClass(totalGainPct)}`}>
              {totalCurrent > 0 ? formatPct(totalGainPct) : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Holdings table */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700">
          <p className="text-sm font-semibold text-slate-200">Holdings ({portfolio.length})</p>
        </div>
        {portfolio.length === 0 ? (
          <div className="px-5 py-12 text-center text-slate-500 text-sm">
            No stocks imported yet.{" "}
            <button onClick={() => setShowImport(true)} className="text-blue-400 hover:underline">Import your holdings</button>
            {" "}from an Axis Securities PDF or Excel.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Stock</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Symbol</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Shares</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Buy</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Current Price</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Invested</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Current Value</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Gain / Loss</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">XIRR</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {portfolio.map((entry) => (
                  <Fragment key={entry.stock_id}>
                    <tr className="hover:bg-slate-700/30 transition-colors cursor-pointer"
                      onClick={() => handleExpand(entry.stock_id)}>
                      <td className="px-4 py-3 font-medium text-slate-200 max-w-[180px]">
                        <span className="truncate block" title={entry.stock_name}>{entry.stock_name}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{entry.symbol}</td>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {entry.total_shares.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">{formatINR(entry.avg_buy_price)}</td>
                      <td className="px-4 py-3 text-right text-slate-200">
                        {entry.current_price != null ? formatINR(entry.current_price) : <span className="text-slate-500 text-xs">Unavailable</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">{formatINR(entry.invested_value)}</td>
                      <td className="px-4 py-3 text-right text-slate-200">{formatINR(entry.current_value)}</td>
                      <td className="px-4 py-3 text-right">
                        <div>
                          <span className={`block ${getGainClass(entry.gain_loss)}`}>{formatINR(entry.gain_loss)}</span>
                          <span className={`text-xs ${getGainClass(entry.gain_loss_pct)}`}>{formatPct(entry.gain_loss_pct)}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right ${getGainClass(entry.xirr)}`}>
                        {entry.xirr != null ? `${entry.xirr > 0 ? "+" : ""}${entry.xirr.toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <svg className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expandedId === entry.stock_id ? "rotate-180" : ""}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </td>
                    </tr>

                    {expandedId === entry.stock_id && (
                      <tr>
                        <td colSpan={10} className="px-6 py-4 bg-slate-900/50 border-b border-slate-700">
                          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                            Transactions — {entry.stock_name}
                          </div>
                          {txLoading[entry.stock_id] ? (
                            <p className="text-slate-400 text-sm">Loading…</p>
                          ) : !transactions[entry.stock_id] || transactions[entry.stock_id].length === 0 ? (
                            <p className="text-slate-500 text-sm">No transactions recorded.</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-slate-700">
                                  <th className="text-left py-2 pr-4 text-slate-500 font-medium">Date</th>
                                  <th className="text-right py-2 pr-4 text-slate-500 font-medium">Shares</th>
                                  <th className="text-right py-2 pr-4 text-slate-500 font-medium">Buy Price</th>
                                  <th className="text-right py-2 pr-4 text-slate-500 font-medium">Amount</th>
                                  <th className="text-left py-2 pr-4 text-slate-500 font-medium">Notes</th>
                                  <th className="w-12" />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800">
                                {transactions[entry.stock_id].map((tx) => (
                                  <tr key={tx.id} className="hover:bg-slate-700/20">
                                    <td className="py-2 pr-4 text-slate-300">{formatDate(tx.transaction_date)}</td>
                                    <td className="py-2 pr-4 text-right text-slate-300">{tx.shares.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                                    <td className="py-2 pr-4 text-right text-slate-300">{formatINR(tx.buy_price)}</td>
                                    <td className="py-2 pr-4 text-right text-slate-300">{formatINR(tx.shares * tx.buy_price)}</td>
                                    <td className="py-2 pr-4 text-slate-500">{tx.notes ?? "—"}</td>
                                    <td className="py-2">
                                      <button onClick={(e) => { e.stopPropagation(); handleDeleteTx(tx.id, entry.stock_id); }}
                                        disabled={deletingTxId === tx.id}
                                        className="text-xs px-2 py-0.5 rounded bg-red-900/30 hover:bg-red-800/50 text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors">
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
          onSuccess={() => { setShowImport(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
