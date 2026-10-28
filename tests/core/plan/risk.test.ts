import { describe, expect, test } from "vitest";
import { defaultConfig } from "@/core/config";
import { buildBasePlan } from "@/core/plan/allocate";
import { campaignStockouts, compareToBase, p90CampaignRisk, p90MissedCampaign, summarizeChanges } from "@/core/plan/risk";
import { leadTimeStats } from "@/core/leadtime";
import type { Dataset } from "@/core/types";
import type { LineDraft } from "@/core/plan/simulate";
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

describe("risco de campanha pelo P90", () => {
  // Mediana 10 d, P90 45 d. BF começa em 20/11 e Natal em 01/12 (config padrão).
  const lt = { ...leadTimeStats([10]), median: 10, p90: 45 };
  const dsLt = { suppliers: [{ supplier: "F1", name: "F1", leadTime: lt }] } as unknown as Dataset;
  const line = (sku: string, emitBy: string, arrival: string, cost = 100): LineDraft => ({ sku, supplier: "F1", emitBy, arrival, lots: 1, units: 12, cost, seq: 0 });

  test("chega antes da BF pela mediana e depois pelo P90: em risco", () => {
    expect(p90MissedCampaign(line("A", "2026-10-10", "2026-10-20"), lt.p90, defaultConfig)?.id).toBe("bf");
  });
  test("antecipar a emissão tira a linha do risco", () => {
    expect(p90MissedCampaign(line("A", "2026-10-01", "2026-10-11"), lt.p90, defaultConfig)).toBeUndefined();
  });
  test("linha que já chega depois da BF pela mediana mira o Natal, não a BF", () => {
    expect(p90MissedCampaign(line("A", "2026-11-15", "2026-11-25"), lt.p90, defaultConfig)?.id).toBe("natal");
    expect(p90MissedCampaign(line("A", "2026-12-25", "2027-01-04"), lt.p90, defaultConfig)).toBeUndefined();
  });
  test("agrega linhas, SKUs distintos e custo exposto", () => {
    const r = p90CampaignRisk(dsLt, defaultConfig, [line("A", "2026-10-10", "2026-10-20", 100), line("A", "2026-10-12", "2026-10-22", 50), line("B", "2026-10-01", "2026-10-11", 999)]);
    expect(r).toMatchObject({ lines: 2, skus: 1, cost: 150, unfixable: 0 });
    expect(r.items.map((i) => i.campaign)).toEqual(["Black Friday", "Black Friday"]);
  });
  test("data sugerida: a emissão mais tardia em que a chegada pelo P90 ainda cai antes da campanha", () => {
    const r = p90CampaignRisk(dsLt, defaultConfig, [line("A", "2026-10-10", "2026-10-20")]);
    // BF começa em 20/11; P90 de 45 d → emitir até 05/10 chega em 19/11.
    expect(r.items[0].suggestedEmit).toBe("2026-10-05");
    const back = p90CampaignRisk(dsLt, defaultConfig, [line("A", "2026-10-05", "2026-10-15")]);
    expect(back.lines).toBe(0);
  });
  test("sem solução quando nem emitir no início da janela chega a tempo", () => {
    const slow = { suppliers: [{ supplier: "F1", name: "F1", leadTime: { ...lt, p90: 60 } }] } as unknown as Dataset;
    const r = p90CampaignRisk(slow, defaultConfig, [line("A", "2026-10-03", "2026-10-13")]);
    expect(r.items[0].suggestedEmit).toBeNull();
    expect(r.unfixable).toBe(1);
  });
  test("leva o id da linha quando existe", () => {
    const r = p90CampaignRisk(dsLt, defaultConfig, [{ ...line("A", "2026-10-10", "2026-10-20"), id: "A-0" }]);
    expect(r.items[0].lineId).toBe("A-0");
  });
  test("bate com os casos críticos do plano base", () => {
    const r = p90CampaignRisk(ds, cfg, plan.lines);
    for (const i of r.items) expect(plan.lines.some((l) => l.sku === i.sku)).toBe(true);
    expect(r.cost).toBeGreaterThanOrEqual(0);
  });
});
