import type { Signal } from "@/lib/api";

interface SignalBadgeProps {
  signal: Signal;
}

export default function SignalBadge({ signal }: SignalBadgeProps) {
  const styles: Record<Signal, string> = {
    STRONG_BUY:  "bg-green-500 text-white ring-2 ring-green-300",
    BUY:         "bg-green-700 text-white",
    HOLD:        "bg-yellow-400 text-slate-900",
    SELL:        "bg-red-700 text-white",
    STRONG_SELL: "bg-red-500 text-white ring-2 ring-red-300",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tracking-wide ${styles[signal] ?? "bg-slate-600 text-white"}`}
    >
      {signal.replace("_", " ")}
    </span>
  );
}
