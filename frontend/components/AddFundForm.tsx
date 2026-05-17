"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addFund } from "@/lib/api";

interface AddFundFormProps {
  onCancel: () => void;
}

export default function AddFundForm({ onCancel }: AddFundFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [amfiCode, setAmfiCode] = useState("");
  const [sector, setSector] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !amfiCode.trim()) {
      setError("Fund name and AMFI code are required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await addFund({
        name: name.trim(),
        amfi_code: amfiCode.trim(),
        sector: sector.trim() || undefined,
      });
      router.refresh();
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add fund.");
      setLoading(false);
    }
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 mb-4">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Add New Fund</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Fund Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Parag Parikh Flexi Cap"
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              AMFI Code <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={amfiCode}
              onChange={(e) => setAmfiCode(e.target.value)}
              placeholder="e.g. 122639"
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Sector <span className="text-slate-600">(optional)</span>
            </label>
            <input
              type="text"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder="e.g. Equity, Debt"
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
            disabled={loading}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
          >
            {loading ? "Adding…" : "Add Fund"}
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
