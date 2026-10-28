import { addDays } from "../dates";
import type { Campaign, Config, Dataset, ISODate } from "../types";
import { defaultScenario } from "../types";
import { leadTimeFor, serviceLevelFor, type PlanLine } from "./allocate";
import { simulateSku, type LineDraft } from "./simulate";

/** SKUs ativos que rompem antes do início da 1ª campanha mesmo com as linhas dadas (POs em aberto contam). */
export function campaignStockouts(ds: Dataset, cfg: Config, lines: LineDraft[], abc?: "A" | "B" | "C"): { sku: string; date: ISODate }[] {
  const start = [...cfg.campaigns].sort((a, b) => a.start.localeCompare(b.start))[0]?.start;
  if (!start) return [];
  const bySku = new Map<string, LineDraft[]>();
  for (const l of lines) bySku.set(l.sku, [...(bySku.get(l.sku) ?? []), l]);
  const out: { sku: string; date: ISODate }[] = [];
  for (const s of ds.skus) {
    if (s.status !== "ativo" || (abc && s.abc !== abc)) continue;
    const mine = (bySku.get(s.sku) ?? []).sort((a, b) => a.seq - b.seq);
    const r = simulateSku(s, leadTimeFor(ds, s.supplier), serviceLevelFor(s, cfg, defaultScenario), cfg, defaultScenario, mine);
    if (r.stockoutDate && r.stockoutDate < start) out.push({ sku: s.sku, date: r.stockoutDate });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Campanha que a linha deveria atender e pode perder no pior caso comum: chega antes do início pela mediana
 * do fornecedor, mas depois pelo P90. O plano base usa a mediana; este é o risco de cauda que o agente julga.
 */
export function p90MissedCampaign(line: Pick<LineDraft, "emitBy" | "arrival">, p90: number, cfg: Config): Campaign | undefined {
  const arrivalP90 = addDays(line.emitBy, Math.round(p90));
  return cfg.campaigns.find((c) => line.arrival < c.start && arrivalP90 >= c.start);
}

export interface P90Risk {
  lines: number;
  skus: number;
  /** Custo dos pedidos expostos, em reais. */
  cost: number;
  /** Expostos que nem emitindo no início da janela chegam a tempo pelo P90. */
  unfixable: number;
  items: {
    lineId?: string;
    sku: string;
    campaign: string;
    campaignStart: ISODate;
    emitBy: ISODate;
    arrivalP90: ISODate;
    /** Emissão mais tardia em que a chegada pelo P90 cai antes da campanha; null se nem o início da janela resolve. */
    suggestedEmit: ISODate | null;
    cost: number;
  }[];
}

/** Pedidos do plano que podem chegar depois da campanha que atendem, se o fornecedor demorar o P90. */
export function p90CampaignRisk(ds: Pick<Dataset, "suppliers">, cfg: Config, lines: (LineDraft & { id?: string })[]): P90Risk {
  const items: P90Risk["items"] = [];
  for (const l of lines) {
    const p90 = Math.round(leadTimeFor(ds as Dataset, l.supplier).p90);
    const c = p90MissedCampaign(l, p90, cfg);
    if (!c) continue;
    const latest = addDays(c.start, -p90 - 1);
    items.push({
      ...(l.id ? { lineId: l.id } : {}),
      sku: l.sku,
      campaign: c.name,
      campaignStart: c.start,
      emitBy: l.emitBy,
      arrivalP90: addDays(l.emitBy, p90),
      suggestedEmit: latest >= cfg.windowStart ? latest : null,
      cost: l.cost,
    });
  }
  items.sort((a, b) => b.cost - a.cost);
  return {
    lines: items.length,
    skus: new Set(items.map((i) => i.sku)).size,
    cost: items.reduce((a, i) => a + i.cost, 0),
    unfixable: items.filter((i) => i.suggestedEmit === null).length,
    items,
  };
}

export type LineTag = "antecipada" | "adiada" | "aumentada" | "reduzida" | "nova";
export const LINE_TAG_LABEL: Record<LineTag, string> = { antecipada: "Antecipada", adiada: "Adiada", aumentada: "Aumentada", reduzida: "Reduzida", nova: "Nova" };

/** Diferença de uma linha contra a mesma linha no plano base; null se igual. A data pesa mais que a quantidade na etiqueta. */
export function compareToBase(line: PlanLine, base: PlanLine | undefined): { tag: LineTag; emitBy?: ISODate; lots?: number } | null {
  if (!base) return { tag: "nova" };
  const dateChanged = line.emitBy !== base.emitBy;
  const lotsChanged = line.lots !== base.lots;
  if (!dateChanged && !lotsChanged) return null;
  const tag: LineTag = dateChanged ? (line.emitBy < base.emitBy ? "antecipada" : "adiada") : line.lots > base.lots ? "aumentada" : "reduzida";
  return { tag, ...(dateChanged ? { emitBy: base.emitBy } : {}), ...(lotsChanged ? { lots: base.lots } : {}) };
}

const KIND_TEXT: Record<string, [string, string]> = {
  emission: ["mudou a data de", "linha"],
  quantity: ["ajustou a quantidade de", "linha"],
  remove: ["removeu", "linha"],
  add: ["adicionou", "linha"],
  service_level: ["mudou o nível de serviço de", "SKU"],
  markdown: ["sugeriu liquidação para", "SKU"],
  scenario: ["aplicou", "cenário"],
};

/** Resumo do que o agente mudou, gerado pelo código a partir das mudanças registradas (sem texto do modelo). */
export function summarizeChanges(changes: { kind: string }[]): string {
  const counts = new Map<string, number>();
  for (const c of changes) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
  return Object.keys(KIND_TEXT)
    .filter((k) => counts.has(k))
    .map((k) => {
      const n = counts.get(k)!;
      const [verb, noun] = KIND_TEXT[k];
      return `${verb} ${n} ${noun}${n > 1 ? "s" : ""}`;
    })
    .join(" · ");
}
