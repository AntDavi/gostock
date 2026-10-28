import { describe, expect, test } from "vitest";
import { defaultConfig } from "@/core/config";
import { buildBasePlan } from "@/core/plan/allocate";
import { campaignStockouts, compareToBase, summarizeChanges } from "@/core/plan/risk";
import { runPipeline } from "@/core/pipeline";
import { defaultScenario } from "@/core/types";
import type { PlanLine } from "@/core/plan/allocate";
import { rawMini } from "../../fixtures/mini";

const ds = runPipeline(rawMini(), { ...defaultConfig, budget: 1e9 });
const cfg = { ...defaultConfig, budget: 1e9 };
const plan = buildBasePlan(ds, cfg, defaultScenario);

describe("campaignStockouts", () => {
  test("sem pedidos, lista quem rompe antes da 1ª campanha; com o plano, a lista não cresce", () => {
    const none = campaignStockouts(ds, cfg, []);
    const withPlan = campaignStockouts(ds, cfg, plan.lines);
    for (const r of none) expect(r.date < cfg.campaigns[0].start).toBe(true);
    expect(withPlan.length).toBeLessThanOrEqual(none.length);
  });
  test("filtro por curva", () => {
    const all = campaignStockouts(ds, cfg, []);
    const a = campaignStockouts(ds, cfg, [], "A");
    expect(a.every((r) => ds.skus.find((s) => s.sku === r.sku)!.abc === "A")).toBe(true);
    expect(a.length).toBeLessThanOrEqual(all.length);
  });
});

describe("compareToBase", () => {
  const base: PlanLine = { id: "X-0", sku: "X", supplier: "F1", emitBy: "2026-10-20", arrival: "2026-11-10", lots: 3, units: 36, cost: 300, seq: 0, reason: "r", origin: "base", priority: 1 };
  test("emissão antecipada e quantidade reduzida", () => {
    const d = compareToBase({ ...base, emitBy: "2026-10-01", lots: 2, units: 24, origin: "agent" }, base);
    expect(d).toEqual({ tag: "antecipada", emitBy: "2026-10-20", lots: 3 });
  });
  test("adiada, aumentada, nova e igual", () => {
    expect(compareToBase({ ...base, emitBy: "2026-11-01" }, base)?.tag).toBe("adiada");
    expect(compareToBase({ ...base, lots: 5 }, base)?.tag).toBe("aumentada");
    expect(compareToBase({ ...base, id: "X-a1", origin: "agent" }, undefined)?.tag).toBe("nova");
    expect(compareToBase(base, base)).toBeNull();
  });
});

describe("summarizeChanges", () => {
  const c = (kind: string) => ({ id: kind, kind, sku: "X", before: "", after: "", reason: "" }) as never;
  test("conta por tipo em português", () => {
    expect(summarizeChanges([c("emission"), c("emission"), c("remove"), c("add")])).toBe("mudou a data de 2 linhas · removeu 1 linha · adicionou 1 linha");
    expect(summarizeChanges([])).toBe("");
  });
});
