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
  const [rsiOversold, setRsiOversold] = useState(String(config.rsi_oversold ?? 30));
  const [rsiOverbought, setRsiOverbought] = useState(String(config.rsi_overbought ?? 70));
  const [minBuy, setMinBuy] = useState(String(config.min_buy_signals ?? 2));
  const [minSell, setMinSell] = useState(String(config.min_sell_signals ?? 2));
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const buy = parseFloat(buyPct);
    const sell = parseFloat(sellPct);
    const rsiO = parseFloat(rsiOversold);
    const rsiOB = parseFloat(rsiOverbought);
    const minB = parseInt(minBuy);
    const minS = parseInt(minSell);

    if ([buy, sell, rsiO, rsiOB].some(isNaN) || [minB, minS].some(isNaN)) {
      setStatus("error"); setErrorMsg("All fields must be valid numbers."); return;
    }
    if (buy <= 0 || sell <= 0) {
      setStatus("error"); setErrorMsg("Buy/sell thresholds must be positive."); return;
    }
    if (rsiO >= rsiOB) {
      setStatus("error"); setErrorMsg("RSI oversold must be less than overbought."); return;
    }
    if (minB < 1 || minB > 5 || minS < 1 || minS > 5) {
      setStatus("error"); setErrorMsg("Min signals must be between 1 and 5."); return;
    }

    setLoading(true); setStatus("idle"); setErrorMsg("");
    try {
      await updateSignalConfig({
        buy_threshold_pct: buy,
        sell_threshold_pct: sell,
        rsi_oversold: rsiO,
        rsi_overbought: rsiOB,
        min_buy_signals: minB,
        min_sell_signals: minS,
      });
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to update config.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 pr-8 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";
  const labelCls = "block text-xs text-slate-400 mb-1";
  const hintCls = "text-xs text-slate-500 mt-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Price thresholds */}
      <div>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Price Thresholds (applied to 52W, 26W, 13W windows)</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Buy Threshold (%)</label>
            <div className="relative">
              <input type="number" step="0.1" min="0.1" value={buyPct} onChange={(e) => setBuyPct(e.target.value)} className={inputCls} />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
            </div>
            <p className={hintCls}>BUY vote when NAV is this % below window high</p>
          </div>
          <div>
            <label className={labelCls}>Sell Threshold (%)</label>
            <div className="relative">
              <input type="number" step="0.1" min="0.1" value={sellPct} onChange={(e) => setSellPct(e.target.value)} className={inputCls} />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
            </div>
            <p className={hintCls}>SELL vote when NAV is this % above window low</p>
          </div>
        </div>
      </div>

      {/* RSI thresholds */}
      <div>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">RSI-14 Thresholds</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Oversold (buy vote ≤)</label>
            <input type="number" step="1" min="1" max="49" value={rsiOversold} onChange={(e) => setRsiOversold(e.target.value)} className={inputCls} />
            <p className={hintCls}>RSI at or below this = buy vote</p>
          </div>
          <div>
            <label className={labelCls}>Overbought (sell vote ≥)</label>
            <input type="number" step="1" min="51" max="99" value={rsiOverbought} onChange={(e) => setRsiOverbought(e.target.value)} className={inputCls} />
            <p className={hintCls}>RSI at or above this = sell vote</p>
          </div>
        </div>
      </div>

      {/* Composite verdict thresholds */}
      <div>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Verdict Thresholds (out of 5 indicators)</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Min votes for BUY</label>
            <input type="number" step="1" min="1" max="5" value={minBuy} onChange={(e) => setMinBuy(e.target.value)} className={inputCls} />
            <p className={hintCls}>≥ 4 votes → STRONG BUY</p>
          </div>
          <div>
            <label className={labelCls}>Min votes for SELL</label>
            <input type="number" step="1" min="1" max="5" value={minSell} onChange={(e) => setMinSell(e.target.value)} className={inputCls} />
            <p className={hintCls}>≥ 4 votes → STRONG SELL</p>
          </div>
        </div>
      </div>

      {status === "error" && errorMsg && (
        <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2">{errorMsg}</p>
      )}
      {status === "success" && (
        <p className="text-sm text-green-400 bg-green-900/20 border border-green-800/40 rounded px-3 py-2">Thresholds updated successfully.</p>
      )}

      <div>
        <button type="submit" disabled={loading} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors">
          {loading ? "Saving…" : "Save Thresholds"}
        </button>
      </div>
    </form>
  );
}
