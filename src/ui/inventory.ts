import { suggestMarkdowns, type MarkdownSuggestion } from "@/core/plan/curve";
import type { Config, Dataset, ISODate, LeadTimeStats, MarkdownOption, SkuSummary } from "@/core/types";
import { firstCampaign, OVERSTOCK_DAYS } from "./overview";

export type Situation = "ruptura" | "excesso" | "ok";

/** Mesmo critério dos alertas da Visão geral. */
export function skuSituation(s: SkuSummary, stockout: ISODate | null | undefined, cfg: Config): Situation {
  if (stockout && stockout < firstCampaign(cfg).start) return "ruptura";
  if (s.metrics.coverageDays > OVERSTOCK_DAYS) return "excesso";
  return "ok";
}

export const UNSTABLE_RATIO = 1.8;
export function isUnstable(lt: Pick<LeadTimeStats, "median" | "p90">): boolean {
  return lt.median > 0 && lt.p90 / lt.median > UNSTABLE_RATIO;
}

export interface MarkdownRow {
  sku: string;
  summary: SkuSummary;
  option: MarkdownOption;
  options: MarkdownOption[];
  excessUnits: number;
  coverageDays: number;
  /** Custo de manter o estoque por 90 dias que deixa de existir com o desconto. */
  holdingAvoided: number;
  reason: string;
  fromAgent: boolean;
}

/**
 * Sugestões de liquidação do código, com a escolha de desconto do usuário (`choices`, por SKU)
 * e as sugestões do agente por cima (marcadas, com o motivo dele).
 */
export function markdownRows(ds: Dataset, cfg: Config, choices: Record<string, number>, agent: MarkdownSuggestion[], base: MarkdownSuggestion[] = suggestMarkdowns(ds, cfg)): { rows: MarkdownRow[]; totalFreed: number } {
  const bySku = new Map(ds.skus.map((s) => [s.sku, s]));
  const byAgent = new Map(agent.map((m) => [m.sku, m]));
  const merged = new Map<string, MarkdownSuggestion>();
  for (const m of base) merged.set(m.sku, m);
  for (const m of agent) merged.set(m.sku, m);
  const rows: MarkdownRow[] = [];
  for (const m of merged.values()) {
    const s = bySku.get(m.sku);
    if (!s) continue;
    const options = s.markdown.filter((o) => o.discount > 0 && o.discount <= cfg.maxDiscount + 1e-9);
    const chosen = choices[m.sku] === undefined ? m.option : (options.find((o) => o.discount === choices[m.sku]) ?? m.option);
    const none = s.markdown.find((o) => o.discount === 0);
    rows.push({
      sku: m.sku,
      summary: s,
      option: chosen,
      options,
      excessUnits: m.excessUnits,
      coverageDays: m.coverageDays,
      holdingAvoided: none ? none.holdingCost - chosen.holdingCost : 0,
      reason: m.reason,
      fromAgent: byAgent.has(m.sku),
    });
  }
  rows.sort((a, b) => b.option.capitalFreed - a.option.capitalFreed);
  return { rows, totalFreed: rows.reduce((a, r) => a + r.option.capitalFreed, 0) };
}

function cell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV das liquidações na opção escolhida. */
export function markdownToCsv(rows: MarkdownRow[]): string {
  const header = "sku,descricao,status,cobertura_dias,excesso_un,desconto,unidades_vendidas_90d,capital_liberado,custo_manter_evitado,motivo,origem";
  const lines = rows.map((r) =>
    [
      r.sku,
      r.summary.description,
      r.summary.status,
      r.coverageDays,
      Math.round(r.excessUnits),
      `${Math.round(r.option.discount * 100)}%`,
      Math.round(r.option.unitsSold90d),
      r.option.capitalFreed.toFixed(2),
      r.holdingAvoided.toFixed(2),
      r.reason,
      r.fromAgent ? "agente" : "base",
    ]
      .map(cell)
      .join(","),
  );
  return [header, ...lines].join("\n");
}
