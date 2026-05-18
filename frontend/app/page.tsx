import { getSignals, getSignalConfig, getSyncStatus, getPortfolio } from "@/lib/api";
import SignalBadge from "@/components/SignalBadge";
import SyncButton from "@/components/SyncButton";
import RematchButton from "@/components/RematchButton";
import ThresholdForm from "@/components/ThresholdForm";
import type { FundWithSignal, Signal } from "@/lib/api";

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
  const date = new Date(dateStr);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPctClass(value: number | null): string {
  if (value == null) return "text-slate-400";
  if (value < 0) return "text-red-400";
  return "text-green-400";
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

export default async function DashboardPage() {
  let signals: FundWithSignal[] = [];
  let config = { buy_threshold_pct: 10, sell_threshold_pct: 20, rsi_oversold: 30, rsi_overbought: 70, min_buy_signals: 2, min_sell_signals: 2 };
  let lastSync: string | null = null;
  let portfolioTotal = 0;
  let gainersCount = 0;

  try {
    const [signalsData, configData, syncData, portfolioData] =
      await Promise.allSettled([
        getSignals(),
        getSignalConfig(),
        getSyncStatus(),
        getPortfolio(),
      ]);

    if (signalsData.status === "fulfilled") signals = signalsData.value;
    if (configData.status === "fulfilled") config = configData.value;
    if (syncData.status === "fulfilled") lastSync = syncData.value.last_sync_at;
    if (portfolioData.status === "fulfilled") {
      const portfolio = portfolioData.value;
      portfolioTotal = portfolio.reduce(
        (sum, e) => sum + (e.current_value ?? 0),
        0
      );
      gainersCount = portfolio.filter(
        (e) => e.gain_loss != null && e.gain_loss > 0
      ).length;
    }
  } catch (err) {
    console.error("[Dashboard] Failed to fetch data:", err);
  }

  const buySignals = signals.filter((s) => s.signal === "BUY");
  const sellSignals = signals.filter((s) => s.signal === "SELL");
  const activeSignalsCount = buySignals.length + sellSignals.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Last sync: {formatLastSync(lastSync)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RematchButton />
          <SyncButton />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
            Total Portfolio Value
          </p>
          <p className="text-2xl font-bold text-slate-100">
            {portfolioTotal > 0 ? formatINR(portfolioTotal) : "—"}
          </p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
            Funds in Gain
          </p>
          <p className="text-2xl font-bold text-green-400">{gainersCount}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
            Active Signals
          </p>
          <p className="text-2xl font-bold text-slate-100">
            {activeSignalsCount}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-green-400">
              {buySignals.length} BUY
            </span>
            <span className="text-xs text-red-400">
              {sellSignals.length} SELL
            </span>
          </div>
        </div>
      </div>

      {/* Signals table */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-200">
            Fund Signals ({signals.length})
          </h2>
        </div>
        {signals.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-500 text-sm">
            No signals data. Add funds and sync to see signals.
          </div>
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
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider" title="14-day RSI · Green ≤30 oversold · Red ≥70 overbought">RSI</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider" title="% vs 200-day SMA · Green = below SMA (buy zone) · Red = above">vs 200d</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Signal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {signals.map((fund) => (
                  <tr key={fund.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-200 max-w-[180px]">
                      <span className="truncate block" title={fund.name}>{fund.name}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm">
                      {fund.sector ?? <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-200">{formatINR(fund.current_nav)}</td>
                    <td className={`px-4 py-3 text-right text-sm ${getPctClass(fund.pct_from_high)}`}>
                      {formatPct(fund.pct_from_high)}
                    </td>
                    <td className={`px-4 py-3 text-right text-sm ${getPctClass(fund.pct_from_high_26w)}`}>
                      {formatPct(fund.pct_from_high_26w)}
                    </td>
                    <td className={`px-4 py-3 text-right text-sm ${getPctClass(fund.pct_from_high_13w)}`}>
                      {formatPct(fund.pct_from_high_13w)}
                    </td>
                    <td className={`px-4 py-3 text-right text-sm ${getPctClass(fund.pct_from_high_4w)}`}>
                      {formatPct(fund.pct_from_high_4w)}
                    </td>
                    <td className={`px-4 py-3 text-right text-sm ${getRSIClass(fund.rsi_14)}`}>
                      {fund.rsi_14 != null ? fund.rsi_14.toFixed(1) : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right text-sm ${getSMAClass(fund.pct_from_sma_200)}`}>
                      {formatPct(fund.pct_from_sma_200)}
                    </td>
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
          <h2 className="text-sm font-semibold text-slate-200">
            Signal Thresholds
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Current: Buy when{" "}
            <span className="text-slate-300">
              {config.buy_threshold_pct}%
            </span>{" "}
            below 52W high · Sell when{" "}
            <span className="text-slate-300">{config.sell_threshold_pct}%</span>{" "}
            above 52W low
          </p>
        </div>
        <ThresholdForm config={config} />
      </div>
    </div>
  );
}
