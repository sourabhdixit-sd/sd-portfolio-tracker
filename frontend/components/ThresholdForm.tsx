"use client";

import { useState, FormEvent } from "react";
import { updateSignalConfig } from "@/lib/api";
import type { SignalConfig } from "@/lib/api";

interface ThresholdFormProps {
  config: SignalConfig;
}

export default function ThresholdForm({ config }: ThresholdFormProps) {
  const [buyPct, setBuyPct] = useState(String(config.buy_threshold_pct));
  const [sellPct, setSellPct] = useState(String(config.sell_threshold_pct));
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const buy = parseFloat(buyPct);
    const sell = parseFloat(sellPct);
    if (isNaN(buy) || isNaN(sell)) {
      setStatus("error");
      setErrorMsg("Both thresholds must be valid numbers.");
      return;
    }
    if (buy <= 0 || sell <= 0) {
      setStatus("error");
      setErrorMsg("Thresholds must be positive values.");
      return;
    }
    setLoading(true);
    setStatus("idle");
    setErrorMsg("");
    try {
      await updateSignalConfig({
        buy_threshold_pct: buy,
        sell_threshold_pct: sell,
      });
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to update config."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Buy Threshold (% from 52W High)
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={buyPct}
              onChange={(e) => setBuyPct(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 pr-8 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
              %
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            BUY signal when NAV is this % below 52W high
          </p>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Sell Threshold (% from 52W Low)
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={sellPct}
              onChange={(e) => setSellPct(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 pr-8 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
              %
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            SELL signal when NAV is this % above 52W low
          </p>
        </div>
      </div>

      {status === "error" && errorMsg && (
        <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2">
          {errorMsg}
        </p>
      )}
      {status === "success" && (
        <p className="text-sm text-green-400 bg-green-900/20 border border-green-800/40 rounded px-3 py-2">
          Thresholds updated successfully.
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
        >
          {loading ? "Saving…" : "Save Thresholds"}
        </button>
      </div>
    </form>
  );
}
