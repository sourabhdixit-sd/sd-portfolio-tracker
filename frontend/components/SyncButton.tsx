"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { triggerSync } from "@/lib/api";

export default function SyncButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleSync() {
    setStatus("loading");
    setErrorMsg("");
    try {
      await triggerSync();
      setStatus("done");
      router.refresh();
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Sync failed");
      setTimeout(() => setStatus("idle"), 4000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleSync}
        disabled={status === "loading"}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
          status === "done"
            ? "bg-green-700 text-green-100"
            : status === "error"
            ? "bg-red-700 text-red-100"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        {status === "loading" && (
          <svg
            className="w-3.5 h-3.5 animate-spin"
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
        )}
        {status === "loading"
          ? "Syncing…"
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
