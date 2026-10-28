import { diffDays } from "./dates";
import { mean, median, percentile, std } from "./stats";
import type { LeadTimeStats, PurchaseRow } from "./types";

export function leadTimeStats(days: number[]): LeadTimeStats {
  if (!days.length) return { n: 0, median: 0, mean: 0, p90: 0, std: 0, min: 0, max: 0 };
  return {
    n: days.length,
    median: median(days),
    mean: mean(days),
    p90: percentile(days, 0.9),
    std: std(days),
    min: Math.min(...days),
    max: Math.max(...days),
  };
}

/** Lead time (dias entre emissão e recebimento) por fornecedor, só POs recebidos. */
export function supplierLeadTimes(purchases: PurchaseRow[]): Record<string, LeadTimeStats> {
  const bySupplier: Record<string, number[]> = {};
  for (const p of purchases) {
    if (!p.receivedDate) continue;
    (bySupplier[p.supplier] ??= []).push(diffDays(p.orderDate, p.receivedDate));
  }
  return Object.fromEntries(Object.entries(bySupplier).map(([s, d]) => [s, leadTimeStats(d)]));
}
