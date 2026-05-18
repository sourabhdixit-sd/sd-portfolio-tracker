"use client";

import { useState, useRef, ChangeEvent, DragEvent } from "react";
import {
  parsePortfolioFile,
  confirmPortfolioImport,
  type ParsedFund,
  type ImportConfirmPayload,
} from "@/lib/api";

interface ImportFundsModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type Step = "upload" | "preview" | "done";

interface FundRow extends ParsedFund {
  included: boolean;
  editedAmfiCode: string;
}

interface ImportResult {
  funds_added: number;
  funds_skipped: number;
  transactions_added: number;
}

function formatINR(value: number): string {
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ImportFundsModal({
  onClose,
  onSuccess,
}: ImportFundsModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Preview state
  const [reportDate, setReportDate] = useState<string>("");
  const [transactionDate, setTransactionDate] = useState<string>("");
  const [fundRows, setFundRows] = useState<FundRow[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(selected: File | null) {
    if (!selected) return;
    setFile(selected);
    setError(null);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    handleFileSelect(e.target.files?.[0] ?? null);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFileSelect(dropped);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  async function handleParse() {
    if (!file) {
      setError("Please select a file first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await parsePortfolioFile(file);
      const rows: FundRow[] = result.funds.map((f) => ({
        ...f,
        included: true,
        editedAmfiCode: f.amfi_code ?? "",
      }));
      setFundRows(rows);
      const dateStr = result.report_date ?? "";
      setReportDate(dateStr);
      setTransactionDate(dateStr);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file.");
    } finally {
      setLoading(false);
    }
  }

  function toggleIncluded(idx: number) {
    setFundRows((prev) =>
      prev.map((row, i) =>
        i === idx ? { ...row, included: !row.included } : row
      )
    );
  }

  function updateAmfiCode(idx: number, value: string) {
    setFundRows((prev) =>
      prev.map((row, i) =>
        i === idx ? { ...row, editedAmfiCode: value } : row
      )
    );
  }

  const includedFunds = fundRows.filter((r) => r.included);
  const allAmfiCodesFilled = includedFunds.every(
    (r) => r.editedAmfiCode.trim() !== ""
  );

  async function handleConfirm() {
    if (!allAmfiCodesFilled) return;
    setLoading(true);
    setError(null);
    try {
      const payload: ImportConfirmPayload = {
        transaction_date: transactionDate,
        funds: fundRows.map((row) => ({
          fund_name: row.fund_name,
          amfi_code: row.editedAmfiCode.trim(),
          transactions: row.transactions.map((t) => ({
            units: t.units,
            avg_cost: t.avg_cost,
          })),
          excluded: !row.included,
        })),
      };
      const result = await confirmPortfolioImport(payload);
      setImportResult(result);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">
            {step === "upload" && "Import from PDF or Excel"}
            {step === "preview" &&
              `Review Parsed Funds (${fundRows.length} funds found)`}
            {step === "done" && "Import Complete"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* UPLOAD STEP */}
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Upload your Axis Securities portfolio holding statement (PDF or Excel).
                Mutual Fund holdings will be parsed and imported automatically.
              </p>

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-slate-600 hover:border-slate-500 hover:bg-slate-700/30"
                }`}
              >
                <svg
                  className="w-10 h-10 mx-auto mb-3 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                {file ? (
                  <p className="text-sm text-blue-400 font-medium">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-slate-300">
                      Drag and drop your file here, or{" "}
                      <span className="text-blue-400 underline">browse</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Accepts .pdf and .xlsx files
                    </p>
                  </>
                )}
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.xlsx"
                className="hidden"
                onChange={handleInputChange}
              />

              {error && (
                <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleParse}
                  disabled={!file || loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                >
                  {loading ? "Parsing…" : "Upload & Parse"}
                </button>
              </div>
            </div>
          )}

          {/* PREVIEW STEP */}
          {step === "preview" && (
            <div className="space-y-4">
              {/* Transaction date */}
              <div className="flex items-center gap-3">
                <label className="text-sm text-slate-300 whitespace-nowrap">
                  Transaction Date (applied to all)
                </label>
                <input
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Funds table */}
              <div className="overflow-x-auto overflow-y-auto max-h-96 border border-slate-700 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-800 z-10">
                    <tr className="border-b border-slate-700">
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-8">
                        Inc.
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Fund Name
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        ISIN
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        AMFI Code
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Lots
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Total Units
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Total Invested
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {fundRows.map((row, idx) => (
                      <tr
                        key={row.isin}
                        className={`transition-colors ${
                          row.included
                            ? "hover:bg-slate-700/30"
                            : "opacity-40 bg-slate-900/30"
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={row.included}
                            onChange={() => toggleIncluded(idx)}
                            className="w-4 h-4 accent-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-slate-200 max-w-[180px]">
                          <span
                            className="truncate block text-xs"
                            title={row.fund_name}
                          >
                            {row.fund_name}
                          </span>
                          {row.matched_name && (
                            <span
                              className="block text-xs text-slate-500 truncate"
                              title={row.matched_name}
                            >
                              {row.matched_name}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-400 font-mono text-xs">
                          {row.isin}
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="text"
                            value={row.editedAmfiCode}
                            onChange={(e) => updateAmfiCode(idx, e.target.value)}
                            placeholder="Enter AMFI code"
                            className={`w-28 px-2 py-1 text-xs font-mono bg-slate-700 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-200 ${
                              row.included &&
                              row.needs_manual_amfi &&
                              row.editedAmfiCode.trim() === ""
                                ? "border-red-500"
                                : "border-slate-600"
                            }`}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-400 text-xs">
                          {row.transactions.length}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-200 text-xs">
                          {row.total_units.toFixed(3)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-200 text-xs">
                          {formatINR(row.total_invested)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">
                  {error}
                </p>
              )}

              {!allAmfiCodesFilled && (
                <p className="text-xs text-amber-400">
                  Some included funds are missing AMFI codes. Please fill them in before importing.
                </p>
              )}
            </div>
          )}

          {/* DONE STEP */}
          {step === "done" && importResult && (
            <div className="flex flex-col items-center py-6 space-y-4 text-center">
              <div className="w-14 h-14 rounded-full bg-green-900/40 flex items-center justify-center">
                <svg
                  className="w-7 h-7 text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div>
                <p className="text-slate-100 font-semibold text-base">
                  Import complete!
                </p>
                <p className="text-slate-400 text-sm mt-1">
                  {importResult.funds_added} fund{importResult.funds_added !== 1 ? "s" : ""} added,{" "}
                  {importResult.transactions_added} transaction{importResult.transactions_added !== 1 ? "s" : ""} imported.
                  {importResult.funds_skipped > 0 &&
                    ` (${importResult.funds_skipped} skipped — already exist or excluded)`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
          {step === "upload" && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
          )}

          {step === "preview" && (
            <>
              <button
                onClick={() => setStep("upload")}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={!allAmfiCodesFilled || loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
              >
                {loading
                  ? "Importing…"
                  : `Import ${includedFunds.length} Fund${includedFunds.length !== 1 ? "s" : ""}`}
              </button>
            </>
          )}

          {step === "done" && (
            <button
              onClick={onSuccess}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
