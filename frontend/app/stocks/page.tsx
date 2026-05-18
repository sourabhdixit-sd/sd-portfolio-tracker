import { getStockPortfolio } from "@/lib/api";
import type { StockPortfolioEntry } from "@/lib/api";
import StocksClient from "@/components/StocksClient";

export default async function StocksPage() {
  let portfolio: StockPortfolioEntry[] = [];
  try {
    portfolio = await getStockPortfolio();
  } catch (err) {
    console.error("[Stocks] Failed to fetch portfolio:", err);
  }

  return <StocksClient portfolio={portfolio} />;
}
