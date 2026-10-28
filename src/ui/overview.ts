import { leadTimeFor, serviceLevelFor } from "@/core/plan/allocate";
import { budgetCurve, serviceCurve, type BudgetPoint } from "@/core/plan/curve";
import { simulateSku } from "@/core/plan/simulate";
import { defaultScenario, type Campaign, type Config, type Dataset, type ISODate, type Scenario } from "@/core/types";

export interface Overview {
  budgetCurve: BudgetPoint[];
  /** Custo dos pedidos para 98% de serviço em todos os SKUs, sem teto de orçamento. */
  uniform98Cost: number;
  /** Data de ruptura de cada SKU ativo se nenhum pedido novo for feito (POs em aberto contam). */
  stockouts: Record<string, ISODate | null>;
}

const OVERSTOCK_DAYS = 365;

/** Cálculo pesado (alguns segundos): roda no Web Worker. */
export function computeOverview(ds: Dataset, cfg: Config, sc: Scenario = defaultScenario): Overview {
  const stockouts: Record<string, ISODate | null> = {};
  for (const s of ds.skus) {
    if (s.status !== "ativo") continue;
    stockouts[s.sku] = simulateSku(s, leadTimeFor(ds, s.supplier), serviceLevelFor(s, cfg, sc), cfg, sc, []).stockoutDate;
  }
  const [p98] = serviceCurve(ds, cfg, sc, [0.98]);
  return { budgetCurve: budgetCurve(ds, cfg, sc), uniform98Cost: p98.cost, stockouts };
}

function firstCampaign(cfg: Config): Campaign {
  return [...cfg.campaigns].sort((a, b) => a.start.localeCompare(b.start))[0];
}

export function lowCoverage(ds: Dataset, ov: Overview, cfg: Config, n = 25) {
  const start = firstCampaign(cfg).start;
  const bySku = new Map(ds.skus.map((s) => [s.sku, s]));
  return Object.entries(ov.stockouts)
    .filter((e): e is [string, ISODate] => e[1] !== null)
    .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([sku, date]) => ({ sku, date, coverageDays: bySku.get(sku)!.metrics.coverageDays, abc: bySku.get(sku)!.abc, beforeCampaign: date < start }));
}

export function topIdle(ds: Dataset, n = 25) {
  return ds.skus
    .filter((s) => s.metrics.idleValue > 0)
    .sort((a, b) => b.metrics.idleValue - a.metrics.idleValue)
    .slice(0, n)
    .map((s) => ({ sku: s.sku, idleValue: s.metrics.idleValue, coverageDays: s.metrics.coverageDays, status: s.status }));
}

export function overviewAlerts(ds: Dataset, ov: Overview, cfg: Config) {
  const campaign = firstCampaign(cfg);
  return {
    campaign,
    stockoutBeforeCampaign: Object.values(ov.stockouts).filter((d) => d !== null && d < campaign.start).length,
    overstock: ds.skus.filter((s) => s.metrics.coverageDays > OVERSTOCK_DAYS).length,
    latePos: ds.kpis.latePoCount,
  };
}
