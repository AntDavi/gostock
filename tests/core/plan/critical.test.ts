import { describe, expect, test } from "vitest";
import { defaultConfig as cfg } from "@/core/config";
import { runPipeline } from "@/core/pipeline";
import { buildBasePlan } from "@/core/plan/allocate";
import { findCriticalCases } from "@/core/plan/critical";
import { defaultScenario } from "@/core/types";
import { rawMini } from "../../fixtures/mini";

const ds = runPipeline(rawMini(), cfg);

describe("findCriticalCases", () => {
  test("late_po para PO atrasado do fixture (AAA-1)", () => {
    const cases = findCriticalCases(buildBasePlan(ds, { ...cfg, budget: 1e12 }, defaultScenario), ds, cfg, defaultScenario);
    expect(cases.some((c) => c.kind === "late_po" && c.sku === "AAA-1")).toBe(true);
    expect(cases.some((c) => c.kind === "late_po" && c.sku === "BBB-1")).toBe(false);
  });

  test("budget_cut para SKU A com linha não financiada", () => {
    const p = buildBasePlan(ds, { ...cfg, budget: 1 }, defaultScenario);
    const cut = findCriticalCases(p, ds, cfg, defaultScenario).filter((c) => c.kind === "budget_cut");
    expect(cut.map((c) => c.sku).sort()).toEqual(["AAA-1", "BBB-1"]);
    expect(Number(cut[0].detail.unfundedCost)).toBeGreaterThan(0);
  });

  test("stockout_before_campaign quando nada é comprado e o estoque não chega à BF", () => {
    const p = buildBasePlan(ds, { ...cfg, budget: 1 }, defaultScenario);
    expect(findCriticalCases(p, ds, cfg, defaultScenario).some((c) => c.kind === "stockout_before_campaign")).toBe(true);
  });

  test("sem duplicatas por (kind, sku)", () => {
    const cases = findCriticalCases(buildBasePlan(ds, { ...cfg, budget: 1 }, defaultScenario), ds, cfg, defaultScenario);
    const keys = cases.map((c) => `${c.kind}|${c.sku}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
