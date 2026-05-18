"use client";

import { useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { getTransactions, deleteTransaction } from "@/lib/api";
import type { Fund, PortfolioEntry, Transaction } from "@/lib/api";
import AddTransactionForm from "@/components/AddTransactionForm";

interface PortfolioClientProps {
  portfolio: PortfolioEntry[];
  funds: Fund[];
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

function formatXIRR(value: number | null | undefined): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function getPctClass(value: number | null | undefined): string {
  if (value == null) return "text-slate-400";
  if (value < 0) return "text-red-400";
  return "text-green-400";
}

function getGainLossClass(value: number | null | undefined): string {
  if (value == null) return "text-slate-400";
  if (value < 0) return "text-red-400";
  return "text-green-400";
}

export default function PortfolioClient({
  portfolio,
  funds,
}: PortfolioClientProps) {
  const router = useRouter();
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedFundId, setExpandedFundId] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<
    Record<number, Transaction[]>
  >({});
  const [txLoading, setTxLoading] = useState<Record<number, boolean>>({});
  const [txError, setTxError] = useState<Record<number, string>>({});
  const [deletingTxId, setDeletingTxId] = useState<number | null>(null);

  // Summary calculations
  const totalInvested = portfolio.reduce(
    (sum, e) => sum + e.invested_value,
    0
  );
  const totalCurrent = portfolio.reduce(
    (sum, e) => sum + (e.current_value ?? 0),
    0
  );
  const totalGainLoss = totalCurrent - totalInvested;
  const totalGainPct =
    totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;

  async function handleExpandFund(fundId: number) {
    if (expandedFundId === fundId) {
      setExpandedFundId(null);
      return;
    }
    setExpandedFundId(fundId);
    if (transactions[fundId]) return; // already loaded

    setTxLoading((prev) => ({ ...prev, [fundId]: true }));
    setTxError((prev) => ({ ...prev, [fundId]: "" }));
    try {
      const data = await getTransactions(fundId);
      setTransactions((prev) => ({ ...prev, [fundId]: data }));
    } catch (err) {
      setTxError((prev) => ({
        ...prev,
        [fundId]:
          err instanceof Error ? err.message : "Failed to load transactions",
      }));
    } finally {
      setTxLoading((prev) => ({ ...prev, [fundId]: false }));
    }
  }

  async function handleDeleteTransaction(txId: number, fundId: number) {
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    setDeletingTxId(txId);
    try {
      await deleteTransaction(txId);
      // Remove from local state and refresh
      setTransactions((prev) => ({
        ...prev,
        [fundId]: (prev[fundId] ?? []).filter((t) => t.id !== txId),
      }));
      router.refresh();
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to delete transaction."
      );
    } finally {
      setDeletingTxId(null);
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Portfolio</h1>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          {showAddForm ? "Cancel" : "Add Transaction"}
        </button>
      </div>

      {/* Add Transaction Form */}
      {showAddForm && (
        <AddTransactionForm
          funds={funds}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Summary card */}
      {portfolio.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              Total Invested
            </p>
            <p className="text-xl font-bold text-slate-100">
              {formatINR(totalInvested)}
            </p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              Current Value
            </p>
            <p className="text-xl font-bold text-slate-100">
              {totalCurrent > 0 ? formatINR(totalCurrent) : "—"}
            </p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              Total Gain / Loss
            </p>
            <p
              className={`text-xl font-bold ${getGainLossClass(totalGainLoss)}`}
            >
              {totalCurrent > 0 ? formatINR(totalGainLoss) : "—"}
            </p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              Overall Return
            </p>
            <p
              className={`text-xl font-bold ${getPctClass(totalGainPct)}`}
            >
              {totalCurrent > 0 ? formatPct(totalGainPct) : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Portfolio table */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700">
          <p className="text-sm font-semibold text-slate-200">
            Holdings ({portfolio.length})
          </p>
        </div>
        {portfolio.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-500 text-sm">
            No portfolio data. Add transactions to track your holdings.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Fund
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Units
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Avg Buy NAV
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Current NAV
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Invested
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Current Value
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Gain / Loss
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    XIRR
                  </th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {portfolio.map((entry) => (
                  <Fragment key={entry.fund_id}>
                    <tr
                      className="hover:bg-slate-700/30 transition-colors cursor-pointer"
                      onClick={() => handleExpandFund(entry.fund_id)}
                    >
                      <td className="px-4 py-3 font-medium text-slate-200 max-w-[200px]">
                        <div>
                          <span
                            className="truncate block"
                            title={entry.fund_name}
                          >
                            {entry.fund_name}
                          </span>
                          {entry.sector && (
                            <span className="text-xs text-slate-500">
                              {entry.sector}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {entry.total_units.toLocaleString("en-IN", {
                          minimumFractionDigits: 3,
                          maximumFractionDigits: 3,
                        })}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {formatINR(entry.avg_buy_nav)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-200">
                        {formatINR(entry.current_nav)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {formatINR(entry.invested_value)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-200">
                        {formatINR(entry.current_value)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div>
                          <span
                            className={`block ${getGainLossClass(entry.gain_loss)}`}
                          >
                            {formatINR(entry.gain_loss)}
                          </span>
                          <span
                            className={`text-xs ${getPctClass(entry.gain_loss_pct)}`}
                          >
                            {formatPct(entry.gain_loss_pct)}
                          </span>
                        </div>
                      </td>
                      <td
                        className={`px-4 py-3 text-right ${getPctClass(entry.xirr != null ? entry.xirr * 100 : null)}`}
                      >
                        {formatXIRR(entry.xirr)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <svg
                          className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                            expandedFundId === entry.fund_id ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </td>
                    </tr>

                    {/* Expanded transactions */}
                    {expandedFundId === entry.fund_id && (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-6 py-4 bg-slate-900/50 border-b border-slate-700"
                        >
                          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                            Transactions — {entry.fund_name}
                          </div>
                          {txLoading[entry.fund_id] ? (
                            <div className="flex items-center gap-2 text-slate-400 text-sm py-3">
                              <svg
                                className="w-4 h-4 animate-spin"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                />
                              </svg>
                              Loading transactions…
                            </div>
                          ) : txError[entry.fund_id] ? (
                            <p className="text-red-400 text-sm py-2">
                              {txError[entry.fund_id]}
                            </p>
                          ) : !transactions[entry.fund_id] ||
                            transactions[entry.fund_id].length === 0 ? (
                            <p className="text-slate-500 text-sm py-2">
                              No transactions recorded for this fund.
                            </p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-slate-700">
                                  <th className="text-left py-2 pr-4 text-slate-500 font-medium">
                                    Date
                                  </th>
                                  <th className="text-right py-2 pr-4 text-slate-500 font-medium">
                                    Units
                                  </th>
                                  <th className="text-right py-2 pr-4 text-slate-500 font-medium">
                                    Buy NAV
                                  </th>
                                  <th className="text-right py-2 pr-4 text-slate-500 font-medium">
                                    Amount
                                  </th>
                                  <th className="text-left py-2 pr-4 text-slate-500 font-medium">
                                    Notes
                                  </th>
                                  <th className="w-12" />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800">
                                {transactions[entry.fund_id].map((tx) => (
                                  <tr
                                    key={tx.id}
                                    className="hover:bg-slate-700/20"
                                  >
                                    <td className="py-2 pr-4 text-slate-300">
                                      {formatDate(tx.transaction_date)}
                                    </td>
                                    <td className="py-2 pr-4 text-right text-slate-300">
                                      {tx.units.toLocaleString("en-IN", {
                                        minimumFractionDigits: 3,
                                        maximumFractionDigits: 3,
                                      })}
                                    </td>
                                    <td className="py-2 pr-4 text-right text-slate-300">
                                      {formatINR(tx.buy_nav)}
                                    </td>
                                    <td className="py-2 pr-4 text-right text-slate-300">
                                      {formatINR(tx.units * tx.buy_nav)}
                                    </td>
                                    <td className="py-2 pr-4 text-slate-500">
                                      {tx.notes ?? "—"}
                                    </td>
                                    <td className="py-2">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteTransaction(
                                            tx.id,
                                            entry.fund_id
                                          );
                                        }}
                                        disabled={deletingTxId === tx.id}
                                        className="text-xs px-2 py-0.5 rounded bg-red-900/30 hover:bg-red-800/50 text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                                      >
                                        {deletingTxId === tx.id
                                          ? "…"
                                          : "Delete"}
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
    </div>
  );
}
