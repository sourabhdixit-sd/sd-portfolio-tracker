import { getPortfolio, getFunds } from "@/lib/api";
import type { PortfolioEntry, Fund } from "@/lib/api";
import PortfolioClient from "@/components/PortfolioClient";

export default async function PortfolioPage() {
  let portfolio: PortfolioEntry[] = [];
  let funds: Fund[] = [];

  try {
    const [portfolioData, fundsData] = await Promise.allSettled([
      getPortfolio(),
      getFunds(),
    ]);

    if (portfolioData.status === "fulfilled") portfolio = portfolioData.value;
    if (fundsData.status === "fulfilled") funds = fundsData.value;
  } catch (err) {
    console.error("[Portfolio] Failed to fetch data:", err);
  }

  return <PortfolioClient portfolio={portfolio} funds={funds} />;
}
