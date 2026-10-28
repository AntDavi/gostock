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

export interface DraftQueue { sku: string; drafts: LineDraft[]; prio: number[]; reason: string }

/** Linhas candidatas de cada SKU ativo (sem orçamento), com prioridade e motivo. */
export function prepareQueues(ds: Dataset, cfg: Config, sc: Scenario): { queues: DraftQueue[]; levels: Record<string, number> } {
  const levels: Record<string, number> = {};
  const queues: DraftQueue[] = [];
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
    queues.push({ sku: s.sku, drafts, prio: drafts.map((d) => priority(d, s, cfg, sc)), reason });
  }
  return { queues, levels };
}

/** Alocação gulosa por prioridade, respeitando a ordem cronológica das linhas de cada SKU. */
export function allocateQueues(queues: DraftQueue[], budget: number): { lines: PlanLine[]; unfunded: LineDraft[] } {
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
  return { lines, unfunded };
}

export function buildBasePlan(ds: Dataset, cfg: Config, sc: Scenario): Plan {
  const budget = sc.budget ?? cfg.budget;
  const { queues, levels } = prepareQueues(ds, cfg, sc);
  const { lines, unfunded } = allocateQueues(queues, budget);
  const fill = planFillRate(ds, lines, cfg, sc);
  return { lines, totalCost: lines.reduce((s, l) => s + l.cost, 0), budget, ...fill, levels, unfunded };
}

/** Demanda e perda esperada de um SKU ativo até o fim da janela, só com as linhas dadas. */
export function skuLoss(ds: Dataset, s: SkuSummary, lines: LineDraft[], cfg: Config, sc: Scenario): { demand: number; lost: number } {
  const lt = leadTimeFor(ds, s.supplier);
  const level = serviceLevelFor(s, cfg, sc);
  const r = simulateSku(s, lt, level, cfg, sc, lines);
  const sigmaL = sigmaLeadTime(s.demand.baseDaily, s.demand.sigmaDaily, lt);
  let lost = r.lostUnits;
  // Perda estatística de cada ciclo; linha que chega após a janela não afeta o período medido.
  for (const l of lines) if (l.arrival <= cfg.windowEnd) lost += sigmaL * normalLoss(zForFillRate(level, l.units, sigmaL));
  return { demand: r.demand, lost };
}

export function fillFromLosses(demandUnits: number, lost: number) {
  const lostUnits = Math.min(lost, demandUnits);
  return { demandUnits, lostUnits, expectedFillRate: demandUnits > 0 ? 1 - lostUnits / demandUnits : 1 };
}

/** Fill rate esperado do plano, re-simulando cada SKU ativo só com as linhas dadas. */
export function planFillRate(ds: Dataset, lines: LineDraft[], cfg: Config, sc: Scenario) {
  const bySku = new Map<string, LineDraft[]>();
  for (const l of lines) bySku.set(l.sku, [...(bySku.get(l.sku) ?? []), l]);
  let demand = 0;
  let lost = 0;
  for (const s of ds.skus) {
    if (s.status !== "ativo") continue;
    const r = skuLoss(ds, s, bySku.get(s.sku) ?? [], cfg, sc);
    demand += r.demand;
    lost += r.lost;
  }
  return fillFromLosses(demand, lost);
}
