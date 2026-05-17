"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addTransaction } from "@/lib/api";
import type { Fund } from "@/lib/api";

interface AddTransactionFormProps {
  funds: Fund[];
  onCancel: () => void;
}

export default function AddTransactionForm({
  funds,
  onCancel,
}: AddTransactionFormProps) {
  const router = useRouter();
  const [fundId, setFundId] = useState<string>(
    funds.length > 0 ? String(funds[0].id) : ""
  );
  const [date, setDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [units, setUnits] = useState("");
  const [buyNav, setBuyNav] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fundId || !date || !units || !buyNav) {
      setError("Fund, date, units, and buy NAV are required.");
      return;
    }
    const unitsNum = parseFloat(units);
    const navNum = parseFloat(buyNav);
    if (isNaN(unitsNum) || unitsNum <= 0) {
      setError("Units must be a positive number.");
      return;
    }
    if (isNaN(navNum) || navNum <= 0) {
      setError("Buy NAV must be a positive number.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await addTransaction({
        fund_id: parseInt(fundId, 10),
        transaction_date: date,
        units: unitsNum,
        buy_nav: navNum,
        notes: notes.trim() || undefined,
      });
      router.refresh();
      onCancel();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add transaction."
      );
      setLoading(false);
    }
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 mb-4">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">
        Add Transaction
      </h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Fund <span className="text-red-400">*</span>
            </label>
            <select
              value={fundId}
              onChange={(e) => setFundId(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {funds.length === 0 && (
                <option value="">No funds available</option>
              )}
              {funds.map((f) => (
                <option key={f.id} value={String(f.id)}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Units <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              placeholder="e.g. 10.500"
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Buy NAV (₹) <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={buyNav}
              onChange={(e) => setBuyNav(e.target.value)}
              placeholder="e.g. 45.2300"
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">
              Notes <span className="text-slate-600">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. SIP for April"
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={loading || funds.length === 0}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
          >
            {loading ? "Adding…" : "Add Transaction"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-md transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
