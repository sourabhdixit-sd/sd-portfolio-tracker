export type Signal = "BUY" | "SELL" | "HOLD" | "STRONG_BUY" | "STRONG_SELL";

export interface Fund {
  id: number;
  name: string;
  amfi_code: string;
  sector: string | null;
  is_active: boolean;
  created_at: string;
  latest_nav?: number | null;
  latest_nav_date?: string | null;
  signal?: Signal;
}

export interface FundWithSignal extends Fund {
  signal: Signal;
  current_nav: number | null;
  high_52w: number | null;
  low_52w: number | null;
  pct_from_high: number | null;
  pct_from_low: number | null;
  buy_votes: number;
  sell_votes: number;
  pct_from_high_26w: number | null;
  pct_from_high_13w: number | null;
  pct_from_high_4w: number | null;
  pct_from_sma_200: number | null;
  rsi_14: number | null;
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
  rsi_oversold: number;
  rsi_overbought: number;
  min_buy_signals: number;
  min_sell_signals: number;
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  const startTime = Date.now();
  let res: Response;

  try {
    res = await fetch(url, {
      ...options,
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const elapsed = Date.now() - startTime;
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request to ${path} timed out after ${elapsed}ms — backend may be slow or unreachable`);
    }
    console.error(`[apiFetch] ${path} network error after ${elapsed}ms:`, err);
    throw new Error(`Network error calling ${path}: ${err instanceof Error ? err.message : String(err)} (after ${elapsed}ms)`);
  }

  clearTimeout(timeoutId);
  const elapsed = Date.now() - startTime;
  if (typeof console !== "undefined") {
    console.log(`[apiFetch] ${path} → ${res.status} in ${elapsed}ms`);
  }

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

export async function rematchFunds(): Promise<{ checked: number; updated: number }> {
  return apiFetch<{ checked: number; updated: number }>("/funds/rematch", { method: "POST" });
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

// Diagnostics
export async function pingBackend(): Promise<boolean> {
  try {
    const url = `${getBaseUrl()}/ping`;
    const res = await fetch(url, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export interface BackendStatus {
  funds: number;
  nav_entries: number;
  transactions: number;
}

export async function getBackendStatus(): Promise<BackendStatus> {
  return apiFetch<BackendStatus>("/status");
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

// Stock types
export interface StockPortfolioEntry {
  stock_id: number;
  stock_name: string;
  isin: string;
  symbol: string;
  sector: string | null;
  total_shares: number;
  avg_buy_price: number;
  current_price: number | null;
  price_updated_at: string | null;
  current_value: number | null;
  invested_value: number;
  gain_loss: number | null;
  gain_loss_pct: number | null;
  xirr: number | null;
  show_on_dashboard: boolean;
}

export interface StockTransaction {
  id: number;
  stock_id: number;
  transaction_date: string;
  shares: number;
  buy_price: number;
  notes: string | null;
  created_at: string;
}

export interface ParsedStock {
  stock_name: string;
  isin: string;
  suggested_symbol: string;
  shares: number;
  avg_cost: number;
  investment_amount: number;
  market_price: number;
}

export interface ParsedStocksResult {
  report_date: string | null;
  stocks: ParsedStock[];
}

export interface StockImportConfirmPayload {
  transaction_date: string;
  stocks: Array<{
    stock_name: string;
    isin: string;
    symbol: string;
    shares: number;
    avg_cost: number;
    excluded: boolean;
  }>;
}

// Stock API functions
export async function getStockPortfolio(): Promise<StockPortfolioEntry[]> {
  return apiFetch<StockPortfolioEntry[]>("/stocks/portfolio");
}

export async function getStockTransactions(stockId: number): Promise<StockTransaction[]> {
  return apiFetch<StockTransaction[]>(`/stocks/${stockId}/transactions`);
}

export async function deleteStockTransaction(id: number): Promise<void> {
  await apiFetch<unknown>(`/stocks/transactions/${id}`, { method: "DELETE" });
}

export async function deleteStock(id: number): Promise<void> {
  await apiFetch<unknown>(`/stocks/${id}`, { method: "DELETE" });
}

export async function parseStocksFile(file: File): Promise<ParsedStocksResult> {
  const formData = new FormData();
  formData.append("file", file);
  const url = `${getBaseUrl()}/stocks/import/parse`;
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

export async function confirmStocksImport(
  data: StockImportConfirmPayload
): Promise<{ added: number; skipped: number }> {
  return apiFetch<{ added: number; skipped: number }>("/stocks/import/confirm", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface StockSyncResult {
  synced: number;
  failed: number;
  failures?: Array<{ symbol: string; name: string; error: string }>;
}

export async function updateStockSymbol(
  stockId: number,
  symbol: string
): Promise<{ stock_id: number; symbol: string }> {
  return apiFetch(`/stocks/${stockId}/symbol`, {
    method: "PATCH",
    body: JSON.stringify({ symbol }),
  });
}

export async function syncStockPrices(): Promise<StockSyncResult> {
  return apiFetch<StockSyncResult>("/stocks/sync", { method: "POST" });
}

export async function getStockWatchlist(): Promise<StockPortfolioEntry[]> {
  return apiFetch<StockPortfolioEntry[]>("/stocks/watchlist");
}

export async function toggleStockWatchlist(stockId: number): Promise<{ stock_id: number; show_on_dashboard: boolean }> {
  return apiFetch<{ stock_id: number; show_on_dashboard: boolean }>(`/stocks/${stockId}/watchlist`, { method: "PATCH" });
}

// Unified import types
export interface UnifiedParseResult {
  report_date: string | null;
  funds: ParsedFund[];
  stocks: ParsedStock[];
}

export interface UnifiedImportConfirmPayload {
  transaction_date: string;
  funds: Array<{
    fund_name: string;
    amfi_code: string;
    sector?: string;
    transactions: Array<{ units: number; avg_cost: number }>;
    excluded: boolean;
  }>;
  stocks: Array<{
    stock_name: string;
    isin: string;
    symbol: string;
    shares: number;
    avg_cost: number;
    excluded: boolean;
  }>;
}

export async function parsePortfolioUnified(file: File): Promise<UnifiedParseResult> {
  const formData = new FormData();
  formData.append("file", file);
  const url = `${getBaseUrl()}/funds/import/unified/parse`;
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

export async function confirmPortfolioUnified(
  data: UnifiedImportConfirmPayload
): Promise<{ funds_added: number; stocks_added: number; funds_skipped: number; stocks_skipped: number }> {
  return apiFetch("/funds/import/unified/confirm", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
