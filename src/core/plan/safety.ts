import { normalLoss } from "../stats";
import type { LeadTimeStats } from "../types";

/** Desvio padrão da demanda durante o lead time: √(LT·σd² + d²·σLT²). */
export function sigmaLeadTime(d: number, sigmaD: number, lt: LeadTimeStats): number {
  return Math.sqrt(lt.median * sigmaD ** 2 + d ** 2 * lt.std ** 2);
}

/** Fill rate esperado de um ciclo com lote Q e estoque de segurança z·σL: 1 − σL·G(z)/Q. */
export function expectedFillRate(z: number, orderQty: number, sigmaL: number): number {
  if (orderQty <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - (sigmaL * normalLoss(z)) / orderQty));
}

/** Menor z ∈ [0, 4] cujo fill rate esperado atinge a meta (bisseção). */
export function zForFillRate(target: number, orderQty: number, sigmaL: number): number {
  if (sigmaL <= 0 || orderQty <= 0) return 0;
  if (expectedFillRate(0, orderQty, sigmaL) >= target) return 0;
  if (expectedFillRate(4, orderQty, sigmaL) < target) return 4;
  let lo = 0;
  let hi = 4;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (expectedFillRate(mid, orderQty, sigmaL) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}
