import { inRange, isISODate } from "../dates";
import type { Config, Dataset, ISODate } from "../types";

export type ValidationCode = "UNKNOWN_SKU" | "DISCONTINUED" | "MOQ" | "NON_POSITIVE" | "WINDOW" | "BUDGET" | "DISCOUNT" | "BAD_DATE";
export interface ValidationError { code: ValidationCode; message: string }

const br = (d: ISODate) => d.split("-").reverse().join("/");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Regras de negócio de uma linha de pedido. Primeiro erro é o mais fundamental. */
export function validateLine(line: { sku: string; units: number; emitBy: ISODate }, ds: Dataset, cfg: Config) {
  const errors: ValidationError[] = [];
  const s = ds.skus.find((x) => x.sku === line.sku);
  if (!s) return [{ code: "UNKNOWN_SKU", message: `SKU ${line.sku} não existe no cadastro.` }] as ValidationError[];
  if (s.status === "descontinuado") errors.push({ code: "DISCONTINUED", message: `SKU ${s.sku} é descontinuado e não pode ser recomprado.` });
  if (!Number.isInteger(line.units) || line.units <= 0) {
    errors.push({ code: "NON_POSITIVE", message: "Quantidade deve ser um número inteiro positivo de unidades." });
  } else if (line.units % s.lotUnits !== 0) {
    errors.push({ code: "MOQ", message: `Quantidade deve ser múltiplo do lote mínimo (${s.lotUnits} un).` });
  }
  if (!isISODate(line.emitBy)) {
    errors.push({ code: "BAD_DATE", message: `Data de emissão inválida: ${line.emitBy} (use AAAA-MM-DD).` });
  } else if (!inRange(line.emitBy, cfg.windowStart, cfg.windowEnd)) {
    errors.push({ code: "WINDOW", message: `Data de emissão fora da janela de ${br(cfg.windowStart)} a ${br(cfg.windowEnd)}.` });
  }
  return errors;
}

export function validatePlan(lines: { sku: string; units: number; emitBy: ISODate; cost: number }[], ds: Dataset, cfg: Config, budget: number): ValidationError[] {
  const errors = lines.flatMap((l) => validateLine(l, ds, cfg));
  const total = lines.reduce((s, l) => s + l.cost, 0);
  if (total > budget + 0.005) errors.push({ code: "BUDGET", message: `Plano excede o orçamento: ${brl(total)} de ${brl(budget)}.` });
  return errors;
}

export function validateDiscount(discount: number, cfg: Config): ValidationError[] {
  if (!Number.isFinite(discount) || discount < 0 || discount > cfg.maxDiscount + 1e-9) {
    return [{ code: "DISCOUNT", message: `Desconto deve estar entre 0% e ${Math.round(cfg.maxDiscount * 100)}%.` }];
  }
  return [];
}
