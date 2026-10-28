import type { Config, Dataset, MarkdownOption, Scenario } from "../types";
import { allocateQueues, buildBasePlan, fillFromLosses, prepareQueues, skuLoss } from "./allocate";
import type { LineDraft } from "./simulate";

export interface CurvePoint { level: number; cost: number; expectedFillRate: number; withinBudget: boolean }
export interface BudgetPoint { budget: number; cost: number; expectedFillRate: number }
export interface MarkdownSuggestion { sku: string; option: MarkdownOption; excessUnits: number; coverageDays: number; reason: string }

const UNLIMITED = 1e15;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Quanto custaria comprar para cada nível de serviço uniforme, sem teto de orçamento. */
export function serviceCurve(ds: Dataset, cfg: Config, sc: Scenario, levels = [0.85, 0.9, 0.95, 0.98, 0.99]): CurvePoint[] {
  const budget = effectiveBudget(ds, cfg, sc);
  return levels.map((level) => {
    const p = buildBasePlan(ds, cfg, { ...sc, serviceMode: "uniform", uniformLevel: level, protectedBrands: [], budget: UNLIMITED });
    return { level, cost: p.totalCost, expectedFillRate: p.expectedFillRate, withinBudget: p.totalCost <= budget };
  });
}

/**
 * Fill esperado alcançável com cada orçamento (mesmo motor do plano base).
 * As linhas candidatas são simuladas uma vez; a perda por SKU é memorizada pelo nº de linhas aceitas.
 */
export function budgetCurve(ds: Dataset, cfg: Config, sc: Scenario, budgets?: number[]): BudgetPoint[] {
  const base = effectiveBudget(ds, cfg, sc);
  const list = budgets ?? [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3].map((k) => k * base);
  const { queues } = prepareQueues(ds, cfg, sc);
  const memo = new Map<string, { demand: number; lost: number }>();
  return list.map((budget) => {
    const { lines } = allocateQueues(queues, budget);
    const bySku = new Map<string, LineDraft[]>();
    for (const l of lines) bySku.set(l.sku, [...(bySku.get(l.sku) ?? []), l]);
    let demand = 0;
    let lost = 0;
    for (const s of ds.skus) {
      if (s.status !== "ativo") continue;
      const mine = (bySku.get(s.sku) ?? []).sort((a, b) => a.seq - b.seq);
      const key = `${s.sku}|${mine.length}`;
      let r = memo.get(key);
      if (!r) memo.set(key, (r = skuLoss(ds, s, mine, cfg, sc)));
      demand += r.demand;
      lost += r.lost;
    }
    return { budget, cost: lines.reduce((a, l) => a + l.cost, 0), expectedFillRate: fillFromLosses(demand, lost).expectedFillRate };
  });
}

/**
 * Melhor opção de desconto (> 0) por SKU com excesso. Ativo só entra se liquidar vale mais que manter;
 * descontinuado sempre entra, porque não será recomprado.
 */
export function suggestMarkdowns(ds: Dataset, cfg: Config): MarkdownSuggestion[] {
  const out: MarkdownSuggestion[] = [];
  for (const s of ds.skus) {
    const none = s.markdown.find((o) => o.discount === 0);
    const options = s.markdown.filter((o) => o.discount > 0 && o.discount <= cfg.maxDiscount + 1e-9);
    if (!options.length) continue;
    const best = options.reduce((a, b) => (b.value > a.value ? b : a));
    if (s.status === "ativo" && none && best.value < none.value) continue;
    out.push({
      sku: s.sku,
      option: best,
      excessUnits: s.metrics.idleUnits,
      coverageDays: s.metrics.coverageDays,
      reason:
        `${s.status === "descontinuado" ? "Descontinuado" : "Excesso"}: cobertura de ${s.metrics.coverageDays} dias, ` +
        `${Math.round(s.metrics.idleUnits)} un acima do alvo; com ${Math.round(best.discount * 100)}% de desconto ` +
        `libera ${brl(best.capitalFreed)} em 90 dias.`,
    });
  }
  return out.sort((a, b) => b.option.capitalFreed - a.option.capitalFreed);
}

/** Orçamento do cenário, mais o capital liberado pelas liquidações quando o cenário reinveste. */
export function effectiveBudget(ds: Dataset, cfg: Config, sc: Scenario): number {
  const base = sc.budget ?? cfg.budget;
  if (!sc.reinvestMarkdown) return base;
  return base + suggestMarkdowns(ds, cfg).reduce((s, m) => s + m.option.capitalFreed, 0);
}
