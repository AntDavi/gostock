import { isISODate } from "./dates";
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

/** Erros de uma configuração editada na tela (vazio = válida). */
export function validateConfig(cfg: Config): string[] {
  const errors: string[] = [];
  const dates: [string, string][] = [
    ["Data de referência", cfg.referenceDate],
    ["Início do histórico", cfg.historyStart],
    ["Início da janela", cfg.windowStart],
    ["Fim da janela", cfg.windowEnd],
  ];
  for (const [label, d] of dates) if (!isISODate(d)) errors.push(`${label}: data inválida (use AAAA-MM-DD).`);
  if (!errors.length) {
    if (cfg.windowStart > cfg.windowEnd) errors.push("A janela de emissão termina antes de começar.");
    if (cfg.windowStart <= cfg.referenceDate) errors.push("A janela de emissão precisa começar depois da data de referência.");
    if (cfg.historyStart >= cfg.referenceDate) errors.push("O início do histórico precisa ser anterior à data de referência.");
  }
  if (!(cfg.budget > 0)) errors.push("O orçamento precisa ser maior que zero.");
  if (!(cfg.maxDiscount > 0 && cfg.maxDiscount <= 1)) errors.push("O desconto máximo precisa estar entre 0% e 100%.");
  const levels = [cfg.serviceTarget, cfg.tiers.A, cfg.tiers.B, cfg.tiers.C];
  if (levels.some((l) => !(l >= 0.5 && l <= 0.999))) errors.push("Níveis de serviço precisam estar entre 50% e 99,9%.");
  if (!(cfg.reviewDays >= 1 && Number.isInteger(cfg.reviewDays))) errors.push("Dias de revisão precisam ser um inteiro positivo.");
  if (!(cfg.idleCoverageDays > 0)) errors.push("A cobertura de estoque parado precisa ser maior que zero.");
  if (!(cfg.capitalCostYear >= 0 && cfg.storageCostMonth >= 0)) errors.push("Custos de manter não podem ser negativos.");
  if (!(cfg.markdownPriceShare >= 0 && cfg.markdownPriceShare <= 1)) errors.push("A participação do preço precisa estar entre 0% e 100%.");
  for (const c of cfg.campaigns) {
    const ds = [c.start, c.end, c.lastYearStart, c.lastYearEnd];
    if (ds.some((d) => !isISODate(d))) errors.push(`${c.name}: data inválida.`);
    else if (c.start > c.end || c.lastYearStart > c.lastYearEnd) errors.push(`${c.name}: fim antes do início.`);
  }
  return errors;
}
