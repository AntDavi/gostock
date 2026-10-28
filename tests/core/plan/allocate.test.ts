import { describe, expect, test } from "vitest";
import { defaultConfig } from "@/core/config";
import { addDays } from "@/core/dates";
import { runPipeline } from "@/core/pipeline";
import { buildBasePlan, planFillRate, serviceLevelFor } from "@/core/plan/allocate";
import { planToCsv } from "@/core/plan/export";
import { validatePlan } from "@/core/plan/validate";
import { defaultScenario } from "@/core/types";
import { rawMini } from "../../fixtures/mini";
import { mkSku } from "../../helpers";

const cfg = defaultConfig;
const ds = runPipeline(rawMini(), cfg);
const full = buildBasePlan(ds, { ...cfg, budget: 1e12 }, defaultScenario);

function contiguous(lines: { sku: string; seq: number }[]) {
  const bySku = new Map<string, number[]>();
  for (const l of lines) bySku.set(l.sku, [...(bySku.get(l.sku) ?? []), l.seq]);
  for (const seqs of bySku.values()) expect([...seqs].sort((a, b) => a - b)).toEqual(seqs.map((_, i) => i));
}

describe("buildBasePlan", () => {
  test("orçamento infinito: todas as linhas, nenhuma de descontinuado", () => {
    expect(full.unfunded).toEqual([]);
    expect(full.lines.length).toBeGreaterThan(0);
    expect(full.lines.some((l) => l.sku === "DDD-1")).toBe(false);
    expect(full.lines.every((l) => l.origin === "base" && l.id === `${l.sku}-${l.seq}`)).toBe(true);
  });

  test("nunca excede o orçamento e o resto vai para unfunded", () => {
    const p = buildBasePlan(ds, { ...cfg, budget: 5000 }, defaultScenario);
    expect(p.totalCost).toBeLessThanOrEqual(5000);
    expect(p.budget).toBe(5000);
    expect(p.lines.length + p.unfunded.length).toBe(full.lines.length);
  });

  test("linha seq N só entra se seq N−1 do mesmo SKU entrou", () => {
    const cheapest = Math.min(...full.lines.map((l) => l.cost));
    for (const budget of [cheapest, cheapest * 3, full.totalCost / 2]) contiguous(buildBasePlan(ds, { ...cfg, budget }, defaultScenario).lines);
  });

  test("scenario.budget sobrescreve cfg.budget", () =>
    expect(buildBasePlan(ds, { ...cfg, budget: 1e12 }, { ...defaultScenario, budget: 1 }).lines).toEqual([]));

  test("prioridade conta só a demanda dentro da janela: linha que chega após o fim vale 0", () => {
    const after = full.lines.filter((l) => l.arrival > cfg.windowEnd);
    const before = full.lines.filter((l) => l.arrival <= addDays(cfg.windowEnd, -cfg.reviewDays));
    expect(after.length).toBeGreaterThan(0);
    after.forEach((l) => expect(l.priority).toBe(0));
    before.forEach((l) => expect(l.priority).toBeGreaterThan(0));
  });

  test("motivo cita cobertura e lead time", () => expect(full.lines[0].reason).toMatch(/Cobertura atual \d+ dias.*lead time \d+ dias/));

  test("plano válido pelo validador", () => expect(validatePlan(full.lines, ds, cfg, 1e12)).toEqual([]));

  test("fill esperado em [0, 1] e consistente com a perda", () => {
    expect(full.expectedFillRate).toBeGreaterThan(0.9);
    expect(full.expectedFillRate).toBeLessThanOrEqual(1);
    expect(full.expectedFillRate).toBeCloseTo(1 - full.lostUnits / full.demandUnits, 6);
    const none = planFillRate(ds, [], cfg, defaultScenario);
    expect(none.expectedFillRate).toBeLessThan(full.expectedFillRate);
  });
});

describe("serviceLevelFor", () => {
  test("tiered: A 0,98 / B 0,95 / C 0,90", () => {
    expect(serviceLevelFor(mkSku({ abc: "A" }), cfg, defaultScenario)).toBe(0.98);
    expect(serviceLevelFor(mkSku({ abc: "B" }), cfg, defaultScenario)).toBe(0.95);
    expect(serviceLevelFor(mkSku({ abc: "C" }), cfg, defaultScenario)).toBe(0.9);
  });
  test("uniform usa uniformLevel (ou a meta)", () => {
    expect(serviceLevelFor(mkSku({ abc: "C" }), cfg, { ...defaultScenario, serviceMode: "uniform", uniformLevel: 0.97 })).toBe(0.97);
    expect(serviceLevelFor(mkSku({ abc: "C" }), cfg, { ...defaultScenario, serviceMode: "uniform" })).toBe(0.98);
  });
  test("marca protegida sobe para a meta", () =>
    expect(serviceLevelFor(mkSku({ abc: "C", brand: "Kokeshi" }), cfg, { ...defaultScenario, protectedBrands: ["Kokeshi"] })).toBe(0.98));
});

describe("planToCsv", () => {
  test("cabeçalho, unidade de compra e quantidade na unidade", () => {
    const csv = planToCsv(full.lines, ds).split("\n");
    expect(csv[0]).toBe("emitir_ate,sku,descricao,fornecedor,quantidade,unidade,unidades,valor,motivo,origem");
    const bbb = csv.find((r) => r.includes(",BBB-1,"))!;
    const l = full.lines.find((x) => x.sku === "BBB-1")!;
    expect(bbb).toContain(`,${l.lots * 10},cx 12 un,${l.units},`);
  });
  test("motivo com aspas e vírgula é escapado", () => {
    const l = { ...full.lines[0], reason: 'a, "b"' };
    expect(planToCsv([l], ds).split("\n")[1]).toContain('"a, ""b"""');
  });
});
