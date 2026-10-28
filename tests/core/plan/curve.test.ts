import { describe, expect, test } from "vitest";
import { defaultConfig as cfg } from "@/core/config";
import { runPipeline } from "@/core/pipeline";
import { buildBasePlan } from "@/core/plan/allocate";
import { budgetCurve, effectiveBudget, serviceCurve, suggestMarkdowns } from "@/core/plan/curve";
import { defaultScenario } from "@/core/types";
import { rawMini } from "../../fixtures/mini";

const ds = runPipeline(rawMini(), cfg);

describe("serviceCurve", () => {
  const c = serviceCurve(ds, cfg, defaultScenario);
  test("níveis padrão", () => expect(c.map((p) => p.level)).toEqual([0.85, 0.9, 0.95, 0.98, 0.99]));
  test("custo não decresce com o nível", () => {
    for (let i = 1; i < c.length; i++) expect(c[i].cost).toBeGreaterThanOrEqual(c[i - 1].cost);
  });
  test("fill esperado em (0, 1]", () =>
    c.forEach((p) => {
      expect(p.expectedFillRate).toBeGreaterThan(0);
      expect(p.expectedFillRate).toBeLessThanOrEqual(1);
    }));
  test("withinBudget compara com o orçamento efetivo", () => {
    expect(serviceCurve(ds, { ...cfg, budget: 1 }, defaultScenario).every((p) => !p.withinBudget)).toBe(true);
    expect(serviceCurve(ds, { ...cfg, budget: 1e12 }, defaultScenario).every((p) => p.withinBudget)).toBe(true);
  });
});

describe("budgetCurve", () => {
  const full = buildBasePlan(ds, { ...cfg, budget: 1e12 }, defaultScenario);
  const budgets = [0, full.totalCost * 0.3, full.totalCost * 0.6, full.totalCost, full.totalCost * 2];
  const c = budgetCurve(ds, cfg, defaultScenario, budgets);

  test("um ponto por orçamento, custo nunca acima do orçamento", () => {
    expect(c.map((p) => p.budget)).toEqual(budgets);
    c.forEach((p) => expect(p.cost).toBeLessThanOrEqual(p.budget + 1e-6));
  });
  test("fill não decresce com o orçamento", () => {
    for (let i = 1; i < c.length; i++) expect(c[i].expectedFillRate).toBeGreaterThanOrEqual(c[i - 1].expectedFillRate - 1e-12);
  });
  test("cada ponto bate com buildBasePlan no mesmo orçamento", () => {
    for (const b of [budgets[1], budgets[3]]) {
      const p = buildBasePlan(ds, { ...cfg, budget: b }, defaultScenario);
      const pt = c.find((x) => x.budget === b)!;
      expect(pt.cost).toBeCloseTo(p.totalCost, 6);
      expect(pt.expectedFillRate).toBeCloseTo(p.expectedFillRate, 9);
    }
  });
  test("orçamentos padrão são múltiplos do orçamento do cenário e incluem ele", () => {
    const d = budgetCurve(ds, cfg, defaultScenario);
    expect(d.map((p) => p.budget)).toContain(cfg.budget);
    expect(d.length).toBeGreaterThanOrEqual(6);
  });
});

describe("suggestMarkdowns", () => {
  const m = suggestMarkdowns(ds, cfg);
  test("descontinuado com saldo aparece em liquidação", () => expect(m.some((x) => x.sku === "DDD-1")).toBe(true));
  test("nenhuma sugestão acima de maxDiscount nem com desconto 0", () =>
    m.forEach((x) => {
      expect(x.option.discount).toBeGreaterThan(0);
      expect(x.option.discount).toBeLessThanOrEqual(cfg.maxDiscount);
    }));
  test("ordenado por capital liberado", () => {
    for (let i = 1; i < m.length; i++) expect(m[i].option.capitalFreed).toBeLessThanOrEqual(m[i - 1].option.capitalFreed);
  });
  test("motivo cita cobertura e excesso", () => expect(m[0].reason).toMatch(/cobertura/i));
});

describe("effectiveBudget", () => {
  test("soma capital liberado só com reinvestMarkdown", () => {
    expect(effectiveBudget(ds, cfg, defaultScenario)).toBe(cfg.budget);
    expect(effectiveBudget(ds, cfg, { ...defaultScenario, reinvestMarkdown: true })).toBeGreaterThan(cfg.budget);
  });
  test("scenario.budget tem precedência", () => expect(effectiveBudget(ds, cfg, { ...defaultScenario, budget: 10 })).toBe(10));
});
