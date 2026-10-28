import type { DemandModel, LeadTimeStats, SkuSummary } from "@/core/types";

export const flatModel = (baseDaily: number, sigmaDaily = 0): DemandModel => ({
  baseDaily, sigmaDaily, trendMonthly: 0, campaignLift: {}, historyDays: 500, source: "sku",
});

export const lt = (median: number, std = 0, p90 = median): LeadTimeStats => ({
  n: 10, median, mean: median, p90, std, min: median, max: p90,
});

export function mkSku(p: Partial<SkuSummary> = {}): SkuSummary {
  return {
    sku: "S-1", brand: "X", description: "Produto", category: "C", status: "ativo", supplier: "F01",
    purchaseUnit: "un", moq: 50, lotUnits: 50, lotCost: 500, unitMargin: 30, onHand: 100, onOrder: [],
    demand: flatModel(10), abc: "A",
    metrics: {
      onHand: 100, stockValue: 1000, coverageDays: 10, idleUnits: 0, idleValue: 0, lostUnits12m: 0, lostRevenue12m: 0,
      fillRate12m: 1, revenue12m: 0, unitsSold12m: 0, demandUnits12m: 0,
    },
    markdown: [], weekly: [],
    ...p,
  };
}
