import { holdingRatePerDay } from "./config";
import type { Config, MarkdownOption } from "./types";

export type { MarkdownOption } from "./types";

export interface MarkdownInput {
  excessUnits: number;
  baseDaily: number;
  unitCost: number;
  price: number;
  priceResponse: number;
  discontinued: boolean;
}

const DISCOUNTS = [0, 0.1, 0.2, 0.3, 0.4];
const HORIZON_DAYS = 90;
const ACTIVE_RESIDUAL = 0.7;

/**
 * Resposta da demanda ao desconto (k em base × (1 + k·d)).
 * Os únicos descontos do histórico são da BF 2025, então desconto e campanha se confundem:
 * atribuímos a fração `markdownPriceShare` do ganho da BF ao preço.
 */
export function priceResponse(categoryBfLift: number, avgBfDiscount: number, cfg: Config): number {
  if (avgBfDiscount <= 0) return 0;
  return Math.min(10, Math.max(0, ((categoryBfLift - 1) * cfg.markdownPriceShare) / avgBfDiscount));
}

export function markdownOptions(input: MarkdownInput, cfg: Config): MarkdownOption[] {
  const hd = holdingRatePerDay(cfg);
  return DISCOUNTS.filter((d) => d <= cfg.maxDiscount + 1e-9).map((discount) => {
    const rate = input.baseDaily * (1 + input.priceResponse * discount);
    const unitsSold90d = Math.min(input.excessUnits, rate * HORIZON_DAYS);
    let unitDays = 0;
    for (let t = 1; t <= HORIZON_DAYS; t++) unitDays += Math.max(0, input.excessUnits - rate * t);
    const holdingCost = unitDays * input.unitCost * hd;
    const revenue = unitsSold90d * input.price * (1 - discount);
    const unsold = input.excessUnits - unitsSold90d;
    const residual = input.discontinued ? 0 : unsold * ACTIVE_RESIDUAL * input.unitCost;
    return {
      discount,
      unitsSold90d,
      revenue,
      capitalFreed: unitsSold90d * input.unitCost,
      holdingCost,
      value: revenue - holdingCost + residual,
    };
  });
}
