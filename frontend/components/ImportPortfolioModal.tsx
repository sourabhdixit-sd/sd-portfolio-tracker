"use client";

import { useState, useRef, ChangeEvent, DragEvent } from "react";
import { parsePortfolioUnified, confirmPortfolioUnified } from "@/lib/api";
import type { ParsedFund, ParsedStock } from "@/lib/api";

interface ImportPortfolioModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type Step = "upload" | "preview" | "done";

interface FundRow extends ParsedFund {
  included: boolean;
  editedAmfiCode: string;
}

interface StockRow extends ParsedStock {
  included: boolean;
  editedSymbol: string;
}

function formatINR(value: number): string {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ImportPortfolioModal({ onClose, onSuccess }: ImportPortfolioModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [transactionDate, setTransactionDate] = useState("");
  const [fundRows, setFundRows] = useState<FundRow[]>([]);
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [result, setResult] = useState<{ funds_added: number; stocks_added: number; funds_skipped: number; stocks_skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(f: File | null) {
    if (!f) return;
    setFile(f);
    setError(null);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files?.[0] ?? null);
  }

  async function handleParse() {
    if (!file) { setError("Please select a file first."); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await parsePortfolioUnified(file);
      setTransactionDate(data.report_date ?? "");
      setFundRows(data.funds.map(f => ({ ...f, included: true, editedAmfiCode: f.amfi_code ?? "" })));
      setStockRows(data.stocks.map(s => ({ ...s, included: true, editedSymbol: s.suggested_symbol })));
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
      const data = await confirmPortfolioUnified({
        transaction_date: transactionDate,
        funds: fundRows.map(row => ({
          fund_name: row.fund_name,
          amfi_code: row.editedAmfiCode.trim(),
          isin: row.isin,
          transactions: row.transactions.map(t => ({ units: t.units, avg_cost: t.avg_cost })),
          excluded: !row.included,
        })),
        stocks: stockRows.map(row => ({
          stock_name: row.stock_name,
          isin: row.isin,
          symbol: row.editedSymbol.trim(),
          shares: row.shares,
          avg_cost: row.avg_cost,
          excluded: !row.included,
        })),
      });
      setResult(data);
      setStep("done");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  const includedFunds = fundRows.filter(r => r.included);
  const includedStocks = stockRows.filter(r => r.included);
  const canConfirm = includedFunds.every(r => r.editedAmfiCode.trim()) && includedStocks.every(r => r.editedSymbol.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">
            {step === "upload" && "Import Portfolio — Funds & Stocks"}
            {step === "preview" && `Preview (${fundRows.length} funds, ${stockRows.length} stocks)`}
            {step === "done" && "Import Complete"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* UPLOAD */}
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Upload your Axis Securities holding statement once. Both mutual funds and equity stocks will be detected automatically.
              </p>
              <div
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${dragOver ? "border-blue-500 bg-blue-500/10" : "border-slate-600 hover:border-slate-500 hover:bg-slate-700/30"}`}
              >
                <svg className="w-10 h-10 mx-auto mb-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-slate-400">{file ? file.name : "Drop PDF or Excel here, or click to browse"}</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,.xlsx" className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFileSelect(e.target.files?.[0] ?? null)} />
              {error && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2">{error}</p>}
            </div>
          )}

          {/* PREVIEW */}
          {step === "preview" && (
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Transaction Date</label>
                  <input type="date" value={transactionDate} onChange={e => setTransactionDate(e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              {/* Mutual Funds section */}
              {fundRows.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-300 mb-2">Mutual Funds ({fundRows.length})</p>
                  <div className="overflow-x-auto rounded border border-slate-700">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-800/80">
                        <tr className="border-b border-slate-700">
                          <th className="text-left p-2 text-slate-500">Include</th>
                          <th className="text-left p-2 text-slate-500">Fund Name</th>
                          <th className="text-right p-2 text-slate-500">Units</th>
                          <th className="text-right p-2 text-slate-500">Invested</th>
                          <th className="text-left p-2 text-slate-500">AMFI Code</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {fundRows.map((row, i) => (
                          <tr key={row.isin} className={row.included ? "" : "opacity-40"}>
                            <td className="p-2">
                              <input type="checkbox" checked={row.included}
                                onChange={() => setFundRows(p => p.map((r, j) => j === i ? { ...r, included: !r.included } : r))}
                                className="w-4 h-4 accent-blue-500" />
                            </td>
                            <td className="p-2 text-slate-200 max-w-[200px]">
                              <span className="truncate block" title={row.fund_name}>{row.fund_name}</span>
                              <span className="text-slate-500 text-xs">{row.isin}</span>
                            </td>
                            <td className="p-2 text-right text-slate-300">{row.total_units?.toFixed(3)}</td>
                            <td className="p-2 text-right text-slate-300">{formatINR(row.total_invested ?? 0)}</td>
                            <td className="p-2">
                              <input type="text" value={row.editedAmfiCode}
                                onChange={e => setFundRows(p => p.map((r, j) => j === i ? { ...r, editedAmfiCode: e.target.value } : r))}
                                placeholder="AMFI code"
                                className={`w-28 bg-slate-700 border rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500 ${row.editedAmfiCode.trim() ? "border-slate-600" : "border-red-500"}`} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Stocks section */}
              {stockRows.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-300 mb-2">Equity Stocks ({stockRows.length})</p>
                  <div className="overflow-x-auto rounded border border-slate-700">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-800/80">
                        <tr className="border-b border-slate-700">
                          <th className="text-left p-2 text-slate-500">Include</th>
                          <th className="text-left p-2 text-slate-500">Stock Name</th>
                          <th className="text-right p-2 text-slate-500">Shares</th>
                          <th className="text-right p-2 text-slate-500">Avg Cost</th>
                          <th className="text-right p-2 text-slate-500">Invested</th>
                          <th className="text-left p-2 text-slate-500">Ticker (NSE/BSE)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {stockRows.map((row, i) => (
                          <tr key={row.isin} className={row.included ? "" : "opacity-40"}>
                            <td className="p-2">
                              <input type="checkbox" checked={row.included}
                                onChange={() => setStockRows(p => p.map((r, j) => j === i ? { ...r, included: !r.included } : r))}
                                className="w-4 h-4 accent-blue-500" />
                            </td>
                            <td className="p-2 text-slate-200 max-w-[160px]">
                              <span className="truncate block" title={row.stock_name}>{row.stock_name}</span>
                              <span className="text-slate-500 text-xs">{row.isin}</span>
                            </td>
                            <td className="p-2 text-right text-slate-300">{row.shares.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-right text-slate-300">{formatINR(row.avg_cost)}</td>
                            <td className="p-2 text-right text-slate-300">{formatINR(row.investment_amount)}</td>
                            <td className="p-2">
                              <input type="text" value={row.editedSymbol}
                                onChange={e => setStockRows(p => p.map((r, j) => j === i ? { ...r, editedSymbol: e.target.value } : r))}
                                placeholder="e.g. RELIANCE.NS"
                                className="w-32 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Format: <code className="text-slate-300">RELIANCE.NS</code> (NSE) or <code className="text-slate-300">HDFCBANK.BO</code> (BSE)</p>
                </div>
              )}

              {fundRows.length === 0 && stockRows.length === 0 && (
                <p className="text-slate-500 text-sm py-4 text-center">No holdings detected in this file. Check the PDF format.</p>
              )}

              {error && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2">{error}</p>}
            </div>
          )}

          {/* DONE */}
          {step === "done" && result && (
            <div className="py-8 text-center space-y-3">
              <svg className="w-12 h-12 mx-auto text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-slate-100 font-medium">Import complete</p>
              <div className="text-sm text-slate-400 space-y-1">
                <p>{result.funds_added} fund{result.funds_added !== 1 ? "s" : ""} imported{result.funds_skipped > 0 ? ` (${result.funds_skipped} skipped)` : ""}</p>
                <p>{result.stocks_added} stock{result.stocks_added !== 1 ? "s" : ""} imported{result.stocks_skipped > 0 ? ` (${result.stocks_skipped} skipped)` : ""}</p>
              </div>
              <p className="text-xs text-slate-500">NAV history is being fetched in background. Click Sync Now to see fund signals. Use Sync Prices on the Stocks tab for live stock prices.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex justify-between items-center">
          <div>
            {step === "preview" && (
              <p className="text-xs text-slate-500">{includedFunds.length} fund{includedFunds.length !== 1 ? "s" : ""} + {includedStocks.length} stock{includedStocks.length !== 1 ? "s" : ""} selected</p>
            )}
          </div>
          <div className="flex gap-3">
            {step !== "done" && (
              <button onClick={onClose} className="px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
            )}
            {step === "upload" && (
              <button onClick={handleParse} disabled={!file || loading}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-md">
                {loading ? "Parsing…" : "Parse File"}
              </button>
            )}
            {step === "preview" && (
              <button onClick={handleConfirm} disabled={loading || (!canConfirm) || (includedFunds.length + includedStocks.length === 0)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-md">
                {loading ? "Importing…" : "Confirm Import"}
              </button>
            )}
            {step === "done" && (
              <button onClick={onClose} className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium rounded-md">Close</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
