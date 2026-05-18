"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { triggerSync, getSyncStatus } from "@/lib/api";

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 120000;

export default function SyncButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }

  useEffect(() => () => stopPolling(), []);

  async function handleSync() {
    setStatus("syncing");
    setErrorMsg("");

    try {
      await triggerSync();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Sync failed");
      setTimeout(() => setStatus("idle"), 5000);
      return;
    }

    const syncStarted = new Date();

    // Poll sync/status until last_sync_at is newer than when we started
    pollRef.current = setInterval(async () => {
      try {
        const s = await getSyncStatus();
        if (s.last_sync_at && new Date(s.last_sync_at) > syncStarted) {
          stopPolling();
          setStatus("done");
          router.refresh();
          setTimeout(() => setStatus("idle"), 4000);
        }
      } catch {
        // keep polling on transient errors
      }
    }, POLL_INTERVAL_MS);

    // Give up after 2 minutes
    timeoutRef.current = setTimeout(() => {
      stopPolling();
      setStatus("error");
      setErrorMsg("Sync timed out — check Railway deployment status");
      setTimeout(() => setStatus("idle"), 6000);
    }, TIMEOUT_MS);
  }

  return (
    <div className="flex flex-col items-end gap-1">
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
        {status === "syncing" ? "Syncing…" : status === "done" ? "Synced ✓" : status === "error" ? "Failed" : "Sync Now"}
      </button>
      {status === "syncing" && (
        <span className="text-xs text-slate-400">Fetching live NAV data…</span>
      )}
      {status === "error" && errorMsg && (
        <span className="text-xs text-red-400 text-right max-w-[200px]">{errorMsg}</span>
      )}
    </div>
  );
}
