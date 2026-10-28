import { addDays } from "../dates";
import { forecastDaily } from "../demand";
import { leadTimeStats } from "../leadtime";
import { normalLoss } from "../stats";
import type { Config, Dataset, ISODate, LeadTimeStats, Scenario, SkuSummary } from "../types";
import { sigmaLeadTime, zForFillRate } from "./safety";
import { simulateSku, type LineDraft } from "./simulate";

export interface PlanLine extends LineDraft { id: string; reason: string; origin: "base" | "agent"; priority: number }
export interface Plan {
  lines: PlanLine[];
  totalCost: number;
  budget: number;
  demandUnits: number;
  lostUnits: number;
  expectedFillRate: number;
  levels: Record<string, number>;
  unfunded: LineDraft[];
}

const EMPTY_LT = leadTimeStats([]);

export function leadTimeFor(ds: Dataset, supplier: string): LeadTimeStats {
  return ds.suppliers.find((x) => x.supplier === supplier)?.leadTime ?? EMPTY_LT;
}

export function serviceLevelFor(s: SkuSummary, cfg: Config, sc: Scenario): number {
  const level = sc.serviceMode === "uniform" ? (sc.uniformLevel ?? cfg.serviceTarget) : cfg.tiers[s.abc];
  return sc.protectedBrands.includes(s.brand) ? Math.max(level, cfg.serviceTarget) : level;
}

const dateBR = (d: ISODate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * Margem esperada protegida por real investido: margem × unidades vendidas no período coberto ÷ custo.
 * Só conta a demanda até o fim da janela, para o orçamento ir primeiro ao que evita ruptura no período.
 */
function priority(line: LineDraft, s: SkuSummary, cfg: Config, sc: Scenario): number {
  if (line.cost <= 0) return 0;
  let sold = 0;
  for (let k = 0; k < cfg.reviewDays; k++) {
    const d = addDays(line.arrival, k);
    if (d <= cfg.windowEnd) sold += forecastDaily(s.demand, d, cfg, sc);
  }
  return (Math.max(0, s.unitMargin) * Math.min(line.units, sold)) / line.cost;
}

export function buildBasePlan(ds: Dataset, cfg: Config, sc: Scenario): Plan {
  const budget = sc.budget ?? cfg.budget;
  const levels: Record<string, number> = {};
  const queues: { drafts: LineDraft[]; prio: number[]; reason: string }[] = [];

  for (const s of ds.skus) {
    if (s.status !== "ativo") continue;
    const level = serviceLevelFor(s, cfg, sc);
    levels[s.sku] = level;
    const lt = leadTimeFor(ds, s.supplier);
    const drafts = simulateSku(s, lt, level, cfg, sc).lines;
    if (!drafts.length) continue;
    const stockout = simulateSku(s, lt, level, cfg, sc, []).stockoutDate;
    const reason =
      `Cobertura atual ${s.metrics.coverageDays} dias; ` +
      `ruptura prevista sem compra em ${stockout ? dateBR(stockout) : "—"}; ` +
      `lead time ${Math.round(lt.median)} dias (${s.supplier}).`;
    queues.push({ drafts, prio: drafts.map((d) => priority(d, s, cfg, sc)), reason });
  }

  // Alocação gulosa por prioridade, respeitando a ordem cronológica das linhas de cada SKU.
  const lines: PlanLine[] = [];
  const unfunded: LineDraft[] = [];
  const next = queues.map(() => 0);
  let remaining = budget;
  for (;;) {
    let best = -1;
    for (let i = 0; i < queues.length; i++) {
      if (next[i] < queues[i].drafts.length && (best < 0 || queues[i].prio[next[i]] > queues[best].prio[next[best]])) best = i;
    }
    if (best < 0) break;
    const q = queues[best];
    const d = q.drafts[next[best]];
    if (d.cost <= remaining + 1e-9) {
      remaining -= d.cost;
      lines.push({ ...d, id: `${d.sku}-${d.seq}`, reason: q.reason, origin: "base", priority: q.prio[next[best]] });
      next[best]++;
    } else {
      unfunded.push(...q.drafts.slice(next[best]));
      next[best] = q.drafts.length;
    }
  }
  lines.sort((a, b) => (a.emitBy === b.emitBy ? a.sku.localeCompare(b.sku) || a.seq - b.seq : a.emitBy < b.emitBy ? -1 : 1));

  const fill = planFillRate(ds, lines, cfg, sc);
  return { lines, totalCost: lines.reduce((s, l) => s + l.cost, 0), budget, ...fill, levels, unfunded };
}

/**
 * Fill rate esperado do plano: re-simula cada SKU ativo só com as linhas dadas (perda determinística)
 * e soma a perda estatística σL·G(z) de cada linha.
 */
export function planFillRate(ds: Dataset, lines: LineDraft[], cfg: Config, sc: Scenario) {
  const bySku = new Map<string, LineDraft[]>();
  for (const l of lines) bySku.set(l.sku, [...(bySku.get(l.sku) ?? []), l]);
  let demandUnits = 0;
  let lostUnits = 0;
  for (const s of ds.skus) {
    if (s.status !== "ativo") continue;
    const lt = leadTimeFor(ds, s.supplier);
    const level = serviceLevelFor(s, cfg, sc);
    const mine = bySku.get(s.sku) ?? [];
    const r = simulateSku(s, lt, level, cfg, sc, mine);
    demandUnits += r.demand;
    lostUnits += r.lostUnits;
    const sigmaL = sigmaLeadTime(s.demand.baseDaily, s.demand.sigmaDaily, lt);
    for (const l of mine) lostUnits += sigmaL * normalLoss(zForFillRate(level, l.units, sigmaL));
  }
  lostUnits = Math.min(lostUnits, demandUnits);
  return { demandUnits, lostUnits, expectedFillRate: demandUnits > 0 ? 1 - lostUnits / demandUnits : 1 };
}
