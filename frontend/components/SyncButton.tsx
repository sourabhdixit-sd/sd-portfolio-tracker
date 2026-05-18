"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { triggerSync } from "@/lib/api";

export default function SyncButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => () => clearTimer(), []);

  async function handleSync() {
    setStatus("syncing");
    setErrorMsg("");
    setSecondsLeft(20);

    try {
      await triggerSync();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Sync failed");
      setTimeout(() => setStatus("idle"), 4000);
      return;
    }

    // Sync started in background — count down 20s then refresh
    let remaining = 20;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearTimer();
        setStatus("done");
        router.refresh();
        setTimeout(() => setStatus("idle"), 3000);
      }
    }, 1000);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleSync}
        disabled={status === "syncing"}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
          status === "done"
            ? "bg-green-700 text-green-100"
            : status === "error"
            ? "bg-red-700 text-red-100"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        {status === "syncing" && (
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {status === "syncing"
          ? `Syncing… (${secondsLeft}s)`
          : status === "done"
          ? "Synced ✓"
          : status === "error"
          ? "Failed"
          : "Sync Now"}
      </button>
      {status === "error" && errorMsg && (
        <span className="text-xs text-red-400">{errorMsg}</span>
      )}
    </div>
  );
}
