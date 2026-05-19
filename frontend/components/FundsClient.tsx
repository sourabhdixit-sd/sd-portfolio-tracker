"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import { deleteFund, getNavHistory, getSignals } from "@/lib/api";
import type { Fund, FundWithSignal, NavPoint } from "@/lib/api";
import SignalBadge from "@/components/SignalBadge";
import NavChart from "@/components/NavChart";
import AddFundForm from "@/components/AddFundForm";
import ImportFundsModal from "@/components/ImportFundsModal";

function formatINR(value: number | null | undefined): string {
  if (value == null) return "—";
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function FundsClient() {
  const router = useRouter();
  const [funds, setFunds] = useState<FundWithSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [expandedFundId, setExpandedFundId] = useState<number | null>(null);
  const [navData, setNavData] = useState<Record<number, NavPoint[]>>({});
  const [navLoading, setNavLoading] = useState<Record<number, boolean>>({});
  const [navError, setNavError] = useState<Record<number, string>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadFunds = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await getSignals();
      setFunds(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load funds");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFunds(); }, [loadFunds]);

  async function handleViewChart(fund: Fund) {
    if (expandedFundId === fund.id) {
      setExpandedFundId(null);
      return;
    }
    setExpandedFundId(fund.id);
    if (navData[fund.id]) return; // already loaded

    setNavLoading((prev) => ({ ...prev, [fund.id]: true }));
    setNavError((prev) => ({ ...prev, [fund.id]: "" }));
    try {
      const data = await getNavHistory(fund.id);
      setNavData((prev) => ({ ...prev, [fund.id]: data }));
    } catch (err) {
      setNavError((prev) => ({
        ...prev,
        [fund.id]: err instanceof Error ? err.message : "Failed to load chart",
      }));
    } finally {
      setNavLoading((prev) => ({ ...prev, [fund.id]: false }));
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await deleteFund(id);
      await loadFunds();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete fund.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Funds</h1>
        <div className="flex items-center gap-2">
        <button
          onClick={() => setShowImport(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-transparent hover:bg-slate-700 text-slate-300 hover:text-slate-100 text-sm font-medium rounded-md border border-slate-600 transition-colors"
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
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          Import PDF/Excel
        </button>
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
          {showAddForm ? "Cancel" : "Add Fund"}
        </button>
        </div>
      </div>

      {/* Add Fund Form */}
      {showAddForm && (
        <AddFundForm onCancel={() => setShowAddForm(false)} />
      )}

      {/* Funds table */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700">
          <p className="text-sm font-semibold text-slate-200">
            All Funds ({funds.length})
          </p>
        </div>
        {loading ? (
          <div className="px-5 py-10 flex items-center justify-center gap-2 text-slate-500 text-sm">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading funds…
          </div>
        ) : loadError ? (
          <div className="px-5 py-10 text-center text-red-400 text-sm">
            <p className="mb-2">Failed to load funds: {loadError}</p>
            <button onClick={loadFunds} className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded">Retry</button>
          </div>
        ) : funds.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-500 text-sm">
            No funds added yet. Click "Add Fund" or "Import PDF/Excel" to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    AMFI Code
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Sector
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Current NAV
                  </th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Signal
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {funds.map((fund) => (
                  <Fragment key={fund.id}>
                    <tr
                      className="hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-200 max-w-[220px]">
                        <span className="truncate block" title={fund.name}>
                          {fund.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                        {fund.amfi_code}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {fund.sector ?? (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-200">
                        {formatINR(fund.current_nav)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <SignalBadge signal={fund.signal} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewChart(fund)}
                            className={`text-xs px-2.5 py-1 rounded transition-colors ${
                              expandedFundId === fund.id
                                ? "bg-blue-700 text-blue-100"
                                : "bg-slate-700 hover:bg-slate-600 text-slate-300"
                            }`}
                          >
                            {expandedFundId === fund.id
                              ? "Hide Chart"
                              : "View Chart"}
                          </button>
                          <button
                            onClick={() => handleDelete(fund.id, fund.name)}
                            disabled={deletingId === fund.id}
                            className="text-xs px-2.5 py-1 rounded bg-red-900/40 hover:bg-red-800/60 text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                          >
                            {deletingId === fund.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedFundId === fund.id && (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 bg-slate-900/40">
                          {navLoading[fund.id] ? (
                            <div className="flex items-center justify-center h-[250px]">
                              <div className="flex items-center gap-2 text-slate-400 text-sm">
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
                                Loading chart…
                              </div>
                            </div>
                          ) : navError[fund.id] ? (
                            <div className="flex items-center justify-center h-[80px] text-red-400 text-sm">
                              {navError[fund.id]}
                            </div>
                          ) : (
                            <NavChart
                              data={navData[fund.id] ?? []}
                              fundName={fund.name}
                            />
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
        <ImportFundsModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            setShowImport(false);
            loadFunds();
          }}
        />
      )}
    </div>
  );
}
