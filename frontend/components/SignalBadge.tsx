import type { Signal } from "@/lib/api";

interface SignalBadgeProps {
  signal: Signal;
}

export default function SignalBadge({ signal }: SignalBadgeProps) {
  const styles: Record<Signal, string> = {
    BUY: "bg-green-600 text-white",
    SELL: "bg-red-600 text-white",
    HOLD: "bg-yellow-400 text-slate-900",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tracking-wide ${styles[signal]}`}
    >
      {signal}
    </span>
  );
}
