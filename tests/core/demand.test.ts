import { describe, expect, test } from "vitest";
import { defaultConfig as cfg } from "@/core/config";
import { dateRange, diffDays, inRange } from "@/core/dates";
import { categoryFallback, fitDemand, forecastDaily, uncensoredDemand } from "@/core/demand";
import { defaultScenario, type DayPoint, type DemandModel } from "@/core/types";

function series(from: string, to: string, units: (d: string, i: number) => number, censored: (d: string) => boolean = () => false): DayPoint[] {
  return dateRange(from, to).map((date, i) => {
    const c = censored(date);
    return { date, units: units(date, i), revenue: 0, onHand: c ? 0 : 100, censored: c };
  });
}

const full = (fn: (d: string, i: number) => number) => series("2025-04-01", "2026-09-29", fn);
const bf25 = (d: string) => inRange(d, "2025-11-20", "2025-11-30");

describe("uncensoredDemand", () => {
  test("dia censurado recebe média dos não censurados em ±14 dias", () => {
    const s = series("2026-01-01", "2026-01-30", (_d, i) => (i >= 19 && i <= 23 ? 2 : 10), (d) => d >= "2026-01-20" && d <= "2026-01-24");
    const d = uncensoredDemand(s);
    expect(d[21]).toBeCloseTo(10);
    expect(d[5]).toBe(10);
  });

  test("demanda nunca menor que a venda observada", () => {
    const s = series("2026-01-01", "2026-01-30", (_d, i) => (i === 10 ? 50 : 10), (d) => d === "2026-01-11");
    expect(uncensoredDemand(s)[10]).toBe(50);
  });

  test("série toda censurada → 0, sem NaN", () => {
    const s = series("2026-01-01", "2026-01-10", () => 0, () => true);
    expect(uncensoredDemand(s).every((x) => x === 0)).toBe(true);
  });
});

describe("fitDemand", () => {
  test("baseDaily = média descensurada dos últimos 56 dias fora de campanha", () => {
    const m = fitDemand(full(() => 10), cfg);
    expect(m.baseDaily).toBeCloseTo(10);
    expect(m.sigmaDaily).toBeCloseTo(0);
    expect(m.source).toBe("sku");
    expect(m.historyDays).toBe(diffDays("2025-04-01", "2026-09-29") + 1);
  });

  test("lift de campanha = média na janela do ano anterior / média dos 28 dias antes", () => {
    const m = fitDemand(full((d) => (bf25(d) ? 30 : 10)), cfg);
    expect(m.campaignLift.bf).toBeCloseTo(3, 1);
    expect(m.campaignLift.natal).toBeCloseTo(1, 1);
  });

  test("lift limitado a [1, 6]", () => {
    expect(fitDemand(full((d) => (bf25(d) ? 100 : 10)), cfg).campaignLift.bf).toBe(6);
    expect(fitDemand(full((d) => (bf25(d) ? 2 : 10)), cfg).campaignLift.bf).toBe(1);
  });

  test("trendMonthly limitado a [-0.05, 0.05]", () => {
    expect(fitDemand(full((_d, i) => 1 + i), cfg).trendMonthly).toBe(0.05);
    expect(fitDemand(full((_d, i) => 2000 - 3 * i), cfg).trendMonthly).toBe(-0.05);
    expect(fitDemand(full(() => 10), cfg).trendMonthly).toBeCloseTo(0);
  });

  test("SKU sem a janela da campanha no histórico não tem lift próprio", () => {
    const m = fitDemand(series("2026-01-01", "2026-09-29", () => 10), cfg);
    expect(m.campaignLift).not.toHaveProperty("bf");
    expect(m.campaignLift).not.toHaveProperty("natal");
  });

  test("histórico curto (< 8 semanas) → trend 0", () => {
    expect(fitDemand(series("2026-08-15", "2026-09-29", (_d, i) => 1 + i), cfg).trendMonthly).toBe(0);
  });

  test("série vazia → base 0 sem NaN", () => {
    const m = fitDemand([], cfg);
    expect(m.baseDaily).toBe(0);
    expect(Number.isFinite(m.sigmaDaily)).toBe(true);
  });
});

describe("categoryFallback", () => {
  test("mediana dos lifts e da tendência", () => {
    const mk = (bf: number | undefined, t: number): DemandModel => ({
      baseDaily: 1, sigmaDaily: 0, trendMonthly: t, campaignLift: bf === undefined ? {} : { bf }, historyDays: 500, source: "sku",
    });
    expect(categoryFallback([mk(2, 0.01), mk(3, 0.02), mk(4, 0.03), mk(undefined, 0.04)])).toEqual({ campaignLift: { bf: 3 }, trendMonthly: 0.025 });
  });
});

describe("forecastDaily", () => {
  const m: DemandModel = { baseDaily: 10, sigmaDaily: 0, trendMonthly: 0, campaignLift: { bf: 3 }, historyDays: 500, source: "sku" };

  test("na BF aplica multiplicador do cenário só sobre o ganho", () => {
    expect(forecastDaily(m, "2026-11-25", cfg, { ...defaultScenario, campaignMultiplier: { bf: 1.2 } })).toBeCloseTo(34);
    expect(forecastDaily(m, "2026-11-25", cfg, defaultScenario)).toBeCloseTo(30);
    expect(forecastDaily(m, "2026-10-15", cfg, defaultScenario)).toBeCloseTo(10);
  });

  test("tendência composta por mês desde a referência", () => {
    expect(forecastDaily({ ...m, trendMonthly: 0.05, campaignLift: {} }, "2026-10-29", cfg, defaultScenario)).toBeCloseTo(10.5, 1);
  });

  test("campanha sem lift no modelo não altera a previsão", () => {
    expect(forecastDaily({ ...m, campaignLift: {} }, "2026-12-10", cfg, defaultScenario)).toBeCloseTo(10);
  });
});
