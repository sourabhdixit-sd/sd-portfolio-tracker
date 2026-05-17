import { getSignals } from "@/lib/api";
import type { FundWithSignal } from "@/lib/api";
import FundsClient from "@/components/FundsClient";

export default async function FundsPage() {
  let funds: FundWithSignal[] = [];

  try {
    funds = await getSignals();
  } catch {
    // Show empty state on error
  }

  return <FundsClient funds={funds} />;
}
