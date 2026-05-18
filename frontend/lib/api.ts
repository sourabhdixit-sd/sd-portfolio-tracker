export type Signal = "BUY" | "SELL" | "HOLD";

export interface Fund {
  id: number;
  name: string;
  amfi_code: string;
  sector: string | null;
  is_active: boolean;
  created_at: string;
}

export interface FundWithSignal extends Fund {
  signal: Signal;
  current_nav: number | null;
  high_52w: number | null;
  low_52w: number | null;
  pct_from_high: number | null;
  pct_from_low: number | null;
}

export interface NavPoint {
  date: string;
  nav_value: number;
}

export interface Transaction {
  id: number;
  fund_id: number;
  transaction_date: string;
  units: number;
  buy_nav: number;
  notes: string | null;
  created_at: string;
}

export interface PortfolioEntry {
  fund_id: number;
  fund_name: string;
  sector: string | null;
  total_units: number;
  avg_buy_nav: number;
  current_nav: number | null;
  current_value: number | null;
  invested_value: number;
  gain_loss: number | null;
  gain_loss_pct: number | null;
  xirr: number | null;
}

export interface SignalConfig {
  buy_threshold_pct: number;
  sell_threshold_pct: number;
}

export interface SyncStatus {
  last_sync_at: string | null;
}

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

function getAuthHeader(): string {
  const password = process.env.NEXT_PUBLIC_APP_PASSWORD ?? "changeme";
  const credentials = `admin:${password}`;
  const encoded =
    typeof btoa !== "undefined"
      ? btoa(credentials)
      : Buffer.from(credentials).toString("base64");
  return `Basic ${encoded}`;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: getAuthHeader(),
    ...(options.headers ?? {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }

  // Handle 204 No Content or empty body
  const contentLength = res.headers.get("content-length");
  const contentType = res.headers.get("content-type") ?? "";
  if (res.status === 204 || contentLength === "0") {
    return {} as T;
  }
  if (!contentType.includes("application/json")) {
    return {} as T;
  }

  return res.json() as Promise<T>;
}

// Fund endpoints
export async function getFunds(): Promise<Fund[]> {
  return apiFetch<Fund[]>("/funds");
}

export async function addFund(data: {
  name: string;
  amfi_code: string;
  sector?: string;
}): Promise<Fund> {
  return apiFetch<Fund>("/funds", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteFund(id: number): Promise<void> {
  await apiFetch<unknown>(`/funds/${id}`, { method: "DELETE" });
}

// Portfolio endpoints
export async function getPortfolio(): Promise<PortfolioEntry[]> {
  return apiFetch<PortfolioEntry[]>("/portfolio");
}

export async function getTransactions(fundId: number): Promise<Transaction[]> {
  return apiFetch<Transaction[]>(`/portfolio/${fundId}/transactions`);
}

export async function addTransaction(data: {
  fund_id: number;
  transaction_date: string;
  units: number;
  buy_nav: number;
  notes?: string;
}): Promise<Transaction> {
  return apiFetch<Transaction>("/portfolio/transactions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteTransaction(id: number): Promise<void> {
  await apiFetch<unknown>(`/portfolio/transactions/${id}`, {
    method: "DELETE",
  });
}

// Signal endpoints
export async function getSignals(): Promise<FundWithSignal[]> {
  return apiFetch<FundWithSignal[]>("/signals");
}

export async function getSignalConfig(): Promise<SignalConfig> {
  return apiFetch<SignalConfig>("/signals/config");
}

export async function updateSignalConfig(
  data: SignalConfig
): Promise<SignalConfig> {
  return apiFetch<SignalConfig>("/signals/config", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// Sync endpoints
export async function triggerSync(): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/sync", { method: "POST" });
}

export async function getSyncStatus(): Promise<SyncStatus> {
  return apiFetch<SyncStatus>("/sync/status");
}

// NAV history
export async function getNavHistory(fundId: number): Promise<NavPoint[]> {
  return apiFetch<NavPoint[]>(`/funds/${fundId}/nav-history`);
}

// Portfolio import types
export interface ParsedTransaction {
  units: number;
  avg_cost: number;
  investment_amount: number;
  market_price: number;
}

export interface ParsedFund {
  fund_name: string;
  isin: string;
  amfi_code: string | null;
  matched_name: string | null;
  needs_manual_amfi: boolean;
  transactions: ParsedTransaction[];
  total_units: number;
  total_invested: number;
}

export interface ParsedImportResult {
  report_date: string;
  funds: ParsedFund[];
}

export interface ImportConfirmPayload {
  transaction_date: string;
  funds: Array<{
    fund_name: string;
    amfi_code: string;
    sector?: string;
    transactions: Array<{ units: number; avg_cost: number }>;
    excluded: boolean;
  }>;
}

export interface ImportResult {
  funds_added: number;
  funds_skipped: number;
  transactions_added: number;
}

// Portfolio import endpoints
export async function parsePortfolioFile(
  file: File
): Promise<ParsedImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const url = `${getBaseUrl()}/funds/import/parse`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: getAuthHeader() },
    body: formData,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function confirmPortfolioImport(
  data: ImportConfirmPayload
): Promise<ImportResult> {
  return apiFetch<ImportResult>("/funds/import/confirm", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
