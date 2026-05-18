"use client";

import { useState, useRef, ChangeEvent, DragEvent } from "react";
import { parseStocksFile, confirmStocksImport, type ParsedStock } from "@/lib/api";

interface ImportStocksModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type Step = "upload" | "preview" | "done";

interface StockRow extends ParsedStock {
  included: boolean;
  editedSymbol: string;
}

function formatINR(value: number): string {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ImportStocksModal({ onClose, onSuccess }: ImportStocksModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [reportDate, setReportDate] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(f: File | null) {
    if (!f) return;
    setFile(f);
    setError(null);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFileSelect(dropped);
  }

  async function handleParse() {
    if (!file) { setError("Please select a file first."); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await parseStocksFile(file);
      const rows: StockRow[] = result.stocks.map((s) => ({
        ...s,
        included: true,
        editedSymbol: s.suggested_symbol,
      }));
      setStockRows(rows);
      const d = result.report_date ?? "";
      setReportDate(d);
      setTransactionDate(d);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const result = await confirmStocksImport({
        transaction_date: transactionDate,
        stocks: stockRows.map((row) => ({
          stock_name: row.stock_name,
          isin: row.isin,
          symbol: row.editedSymbol.trim(),
          shares: row.shares,
          avg_cost: row.avg_cost,
          excluded: !row.included,
        })),
      });
      setImportResult(result);
      setStep("done");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">
            {step === "upload" && "Import Stocks from PDF or Excel"}
            {step === "preview" && `Review Detected Stocks (${stockRows.length} found)`}
            {step === "done" && "Import Complete"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* UPLOAD */}
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Upload your Axis Securities holding statement. Stock holdings will be detected and shown for review.
                You can correct the NSE/BSE ticker symbol before confirming.
              </p>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                  dragOver ? "border-blue-500 bg-blue-500/10" : "border-slate-600 hover:border-slate-500 hover:bg-slate-700/30"
                }`}
              >
                <svg className="w-10 h-10 mx-auto mb-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-slate-400">{file ? file.name : "Drop PDF or Excel here, or click to browse"}</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,.xlsx" className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFileSelect(e.target.files?.[0] ?? null)} />
              {error && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2">{error}</p>}
              <button onClick={handleParse} disabled={!file || loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors">
                {loading ? "Parsing…" : "Parse File"}
              </button>
            </div>
          )}

          {/* PREVIEW */}
          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Transaction Date</label>
                  <input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
                </div>
                <p className="text-xs text-slate-500 mt-4">
                  Edit the NSE/BSE ticker symbol for each stock. Format: <code className="text-slate-300">RELIANCE.NS</code> or <code className="text-slate-300">TCS.BO</code>
                </p>
              </div>

              {stockRows.length === 0 ? (
                <p className="text-slate-500 text-sm py-4">No stocks detected in this file.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-xs text-slate-500 uppercase">
                        <th className="text-left pb-2 pr-3">Include</th>
                        <th className="text-left pb-2 pr-3">Stock</th>
                        <th className="text-left pb-2 pr-3">ISIN</th>
                        <th className="text-right pb-2 pr-3">Shares</th>
                        <th className="text-right pb-2 pr-3">Avg Cost</th>
                        <th className="text-right pb-2 pr-3">Invested</th>
                        <th className="text-left pb-2">Ticker Symbol</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {stockRows.map((row, i) => (
                        <tr key={row.isin} className={row.included ? "" : "opacity-40"}>
                          <td className="py-2 pr-3">
                            <input type="checkbox" checked={row.included}
                              onChange={() => setStockRows((prev) => prev.map((r, j) => j === i ? { ...r, included: !r.included } : r))}
                              className="w-4 h-4 accent-blue-500" />
                          </td>
                          <td className="py-2 pr-3 text-slate-200 max-w-[160px]">
                            <span className="truncate block" title={row.stock_name}>{row.stock_name}</span>
                          </td>
                          <td className="py-2 pr-3 text-slate-400 text-xs font-mono">{row.isin}</td>
                          <td className="py-2 pr-3 text-right text-slate-300">{row.shares.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 pr-3 text-right text-slate-300">{formatINR(row.avg_cost)}</td>
                          <td className="py-2 pr-3 text-right text-slate-300">{formatINR(row.investment_amount)}</td>
                          <td className="py-2">
                            <input type="text" value={row.editedSymbol}
                              onChange={(e) => setStockRows((prev) => prev.map((r, j) => j === i ? { ...r, editedSymbol: e.target.value } : r))}
                              placeholder="e.g. RELIANCE.NS"
                              className="w-36 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {error && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2">{error}</p>}
            </div>
          )}

          {/* DONE */}
          {step === "done" && importResult && (
            <div className="py-6 text-center space-y-3">
              <svg className="w-12 h-12 mx-auto text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-slate-100 font-medium">{importResult.added} stock{importResult.added !== 1 ? "s" : ""} imported</p>
              {importResult.skipped > 0 && <p className="text-slate-400 text-sm">{importResult.skipped} skipped (already imported or excluded)</p>}
              <p className="text-xs text-slate-500">Current prices will be fetched from NSE/BSE when you view the Stocks page.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
          {step === "upload" && (
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
          )}
          {step === "preview" && (
            <>
              <button onClick={onClose} className="px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={handleConfirm} disabled={loading || stockRows.filter(r => r.included).length === 0}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors">
                {loading ? "Importing…" : `Import ${stockRows.filter(r => r.included).length} Stocks`}
              </button>
            </>
          )}
          {step === "done" && (
            <button onClick={onClose} className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium rounded-md">Close</button>
          )}
        </div>
      </div>
    </div>
  );
}
