import { addDays, diffDays } from "../dates";
import { forecastDaily } from "../demand";
import type { Config, ISODate, LeadTimeStats, Scenario, SkuSummary } from "../types";
import { sigmaLeadTime, zForFillRate } from "./safety";

export interface LineDraft { sku: string; supplier: string; emitBy: ISODate; arrival: ISODate; lots: number; units: number; cost: number; seq: number }
export interface SimResult {
  lines: LineDraft[];
  demand: number;
  lostUnits: number;
  projected: { date: ISODate; onHand: number }[];
  stockoutDate: ISODate | null;
}

/**
 * Simula o estoque dia a dia a partir da referência com política (s, S):
 * em cada dia da janela de emissão, se a posição (em mão + a caminho) ≤ demanda no lead time + segurança,
 * pede até cobrir lead time + período de revisão + segurança, arredondado para cima em lotes.
 * Com `fixedLines`, não cria pedidos: só aplica as linhas dadas e mede a perda.
 */
export function simulateSku(s: SkuSummary, lt: LeadTimeStats, level: number, cfg: Config, sc: Scenario, fixedLines?: LineDraft[]): SimResult {
  const LT = Math.max(1, Math.round(lt.median));
  const start = addDays(cfg.referenceDate, 1);
  const end = addDays(cfg.windowEnd, LT + cfg.reviewDays);
  const horizon = diffDays(start, end) + LT + cfg.reviewDays + 1;
  const f: number[] = [];
  for (let k = 0; k < horizon; k++) f.push(forecastDaily(s.demand, addDays(start, k), cfg, sc));
  const sumF = (from: number, len: number) => {
    let acc = 0;
    for (let k = from; k < from + len; k++) acc += f[k] ?? 0;
    return acc;
  };

  const arrivals = new Map<ISODate, number>();
  const addArrival = (d: ISODate, u: number) => arrivals.set(d, (arrivals.get(d) ?? 0) + u);
  for (const o of s.onOrder) addArrival(o.expectedDate > cfg.referenceDate ? o.expectedDate : start, o.units);
  const lines: LineDraft[] = fixedLines ? [...fixedLines] : [];
  for (const l of lines) addArrival(l.arrival, l.units);
  let pending = [...arrivals.values()].reduce((a, b) => a + b, 0);

  const canOrder = !fixedLines && s.status === "ativo" && s.lotUnits > 0;
  let onHand = s.onHand;
  let demand = 0;
  let lostUnits = 0;
  let stockoutDate: ISODate | null = null;
  const projected: SimResult["projected"] = [];

  for (let k = 0, t = start; t <= end; k++, t = addDays(t, 1)) {
    const arrived = arrivals.get(t) ?? 0;
    onHand += arrived;
    pending -= arrived;

    if (canOrder && t >= cfg.windowStart && t <= cfg.windowEnd) {
      const dLT = sumF(k, LT);
      const sigmaL = sigmaLeadTime(dLT / LT, s.demand.sigmaDaily, lt);
      const q0 = Math.max(s.lotUnits, sumF(k + LT, cfg.reviewDays));
      const safety = zForFillRate(level, q0, sigmaL) * sigmaL;
      const position = onHand + pending;
      if (dLT > 0 && position <= dLT + safety) {
        const target = sumF(k, LT + cfg.reviewDays) + safety;
        const lots = Math.ceil((target - position) / s.lotUnits);
        if (lots > 0) {
          const units = lots * s.lotUnits;
          const arrival = addDays(t, LT);
          lines.push({ sku: s.sku, supplier: s.supplier, emitBy: t, arrival, lots, units, cost: lots * s.lotCost, seq: lines.length });
          addArrival(arrival, units);
          pending += units;
        }
      }
    }

    const want = f[k];
    const sold = Math.min(onHand, want);
    onHand -= sold;
    if (t <= cfg.windowEnd) {
      demand += want;
      if (want - sold > 1e-9) {
        lostUnits += want - sold;
        stockoutDate ??= t;
      }
      projected.push({ date: t, onHand });
    }
  }
  return { lines, demand, lostUnits, projected, stockoutDate };
}
