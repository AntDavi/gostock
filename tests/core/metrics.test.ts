import { describe, expect, test } from "vitest";
import { defaultConfig as cfg } from "@/core/config";
import { dateRange, inRange } from "@/core/dates";
import { abcClasses, skuMetrics } from "@/core/metrics";
import type { DayPoint, DemandModel, SkuRow } from "@/core/types";

const sku: SkuRow = { sku: "A", brand: "X", description: "d", category: "c", status: "ativo", unitCost: 10, price: 40, supplier: "F01", purchaseUnit: "un", moq: 1 };
const model = (baseDaily: number): DemandModel => ({ baseDaily, sigmaDaily: 0, trendMonthly: 0, campaignLift: {}, historyDays: 500, source: "sku" });

function series(onHandLast: number, units = 10, censoredFrom?: string, censoredTo?: string): DayPoint[] {
  const days = dateRange("2025-09-30", "2026-09-29"); // 365 dias
  return days.map((date, i) => {
    const c = censoredFrom !== undefined && inRange(date, censoredFrom, censoredTo!);
    return { date, units: c ? 0 : units, revenue: c ? 0 : units * 40, onHand: c ? 0 : i === days.length - 1 ? onHandLast : 500, censored: c };
  });
}

describe("skuMetrics", () => {
  test("valor a custo", () => expect(skuMetrics(series(1000), model(2), sku, cfg).stockValue).toBe(10000));

  test("parado ativo = excedente acima de 180 dias", () => {
    const m = skuMetrics(series(1000), model(2), sku, cfg);
    expect(m.coverageDays).toBe(500);
    expect(m.idleUnits).toBe(640);
    expect(m.idleValue).toBe(6400);
  });

  test("parado descontinuado = todo o saldo", () => {
    const m = skuMetrics(series(300), model(20), { ...sku, status: "descontinuado" }, cfg);
    expect(m.idleUnits).toBe(300);
    expect(m.idleValue).toBe(3000);
  });

  test("sem demanda → cobertura 9999 e sem NaN", () => {
    const m = skuMetrics(series(100, 0), model(0), sku, cfg);
    expect(m.coverageDays).toBe(9999);
    for (const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true);
    expect(m.fillRate12m).toBe(1);
  });

  test("venda perdida = (demanda − observado) em dias censurados dos últimos 365 dias", () => {
    const m = skuMetrics(series(100, 10, "2026-08-01", "2026-08-05"), model(10), sku, cfg);
    expect(m.lostUnits12m).toBeCloseTo(50);
    expect(m.lostRevenue12m).toBeCloseTo(2000);
    expect(m.avgPrice12m).toBeCloseTo(40);
  });

  test("fill rate = observado / demanda nos últimos 365 dias", () => {
    const m = skuMetrics(series(100, 10, "2026-08-01", "2026-08-05"), model(10), sku, cfg);
    expect(m.fillRate12m).toBeCloseTo(1 - 50 / 3650, 3);
    expect(m.revenue12m).toBeCloseTo(3600 * 40);
    expect(m.unitsSold12m).toBe(3600);
    expect(m.demandUnits12m).toBeCloseTo(3650);
  });

  test("sem venda no período usa preço cheio para valorar a perda", () => {
    const m = skuMetrics(series(0, 0, "2025-09-30", "2026-09-29"), model(1), sku, cfg);
    expect(m.avgPrice12m).toBe(40);
  });

  test("série vazia → zeros finitos", () => {
    const m = skuMetrics([], model(0), sku, cfg);
    expect(m.onHand).toBe(0);
    expect(m.coverageDays).toBe(9999);
  });
});

describe("abcClasses", () => {
  test("ABC por receita acumulada 80/95", () => expect(abcClasses({ a: 80, b: 15, c: 5 })).toEqual({ a: "A", b: "B", c: "C" }));
  test("receita total zero → tudo C", () => expect(abcClasses({ a: 0, b: 0 })).toEqual({ a: "C", b: "C" }));
});
