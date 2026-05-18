"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rematchFunds } from "@/lib/api";

export default function RematchButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [label, setLabel] = useState("");

  async function handleRematch() {
    setStatus("running");
    setLabel("");
    try {
      const data = await rematchFunds();
      if (data.updated > 0) {
        setLabel(`${data.updated} fund${data.updated > 1 ? "s" : ""} updated — sync to refresh NAV`);
        router.refresh();
      } else {
        setLabel("All funds matched correctly");
      }
      setStatus("done");
      setTimeout(() => { setStatus("idle"); setLabel(""); }, 6000);
    } catch (err) {
      setLabel(err instanceof Error ? err.message : "Re-match failed");
      setStatus("error");
      setTimeout(() => { setStatus("idle"); setLabel(""); }, 5000);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleRematch}
        disabled={status === "running"}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
          status === "done"
            ? "bg-green-700 text-green-100"
            : status === "error"
            ? "bg-red-700 text-red-100"
            : "bg-slate-700 hover:bg-slate-600 text-slate-200"
        }`}
      >
        {status === "running" && (
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {status === "running"
          ? "Re-matching…"
          : status === "done"
          ? "Re-matched ✓"
          : status === "error"
          ? "Failed"
          : "Fix Fund Matching"}
      </button>
      {label && (
        <span className={`text-xs text-right max-w-[220px] ${status === "error" ? "text-red-400" : "text-slate-400"}`}>
          {label}
        </span>
      )}
    </div>
  );
}
