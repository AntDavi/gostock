import type { Config } from "./types";

// Valores de case_estoque/parametros.md.
export const defaultConfig: Config = {
  referenceDate: "2026-09-29",
  historyStart: "2025-04-01",
  budget: 1970000,
  windowStart: "2026-10-01",
  windowEnd: "2026-12-29",
  capitalCostYear: 0.18,
  storageCostMonth: 0.012,
  maxDiscount: 0.4,
  serviceTarget: 0.98,
  reviewDays: 30,
  idleCoverageDays: 180,
  tiers: { A: 0.98, B: 0.95, C: 0.9 },
  markdownPriceShare: 0.5,
  campaigns: [
    { id: "bf", name: "Black Friday", start: "2026-11-20", end: "2026-11-30", lastYearStart: "2025-11-20", lastYearEnd: "2025-11-30" },
    { id: "natal", name: "Natal", start: "2026-12-01", end: "2026-12-22", lastYearStart: "2025-12-01", lastYearEnd: "2025-12-22" },
  ],
};

/** Custo de manter estoque por dia, como fração do custo (capital + armazenagem). */
export function holdingRatePerDay(cfg: Config): number {
  return (cfg.capitalCostYear + cfg.storageCostMonth * 12) / 365;
}
