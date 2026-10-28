import { describe, expect, test } from "vitest";
import { defaultConfig } from "@/core/config";
import { runPipeline, stripForAgent } from "@/core/pipeline";
import { rawMini } from "../fixtures/mini";

const ds = runPipeline(rawMini(), defaultConfig);
const get = (sku: string) => ds.skus.find((s) => s.sku === sku)!;

describe("runPipeline", () => {
  test("remove duplicatas", () => expect(ds.kpis.duplicatesRemoved).toBe(1));
  test("BBB-1 lote em unidades e custo do lote", () => {
    expect(get("BBB-1").lotUnits).toBe(120);
    expect(get("BBB-1").lotCost).toBe(600);
  });
  test("POs em aberto contados", () => expect(ds.kpis.openPoCount).toBe(2));
  test("contagens de SKU", () => {
    expect(ds.kpis.skuCount).toBe(3);
    expect(ds.kpis.activeCount).toBe(2);
  });
  test("resumo não expõe custo nem preço crus", () => {
    for (const s of ds.skus) {
      expect(s).not.toHaveProperty("unitCost");
      expect(s).not.toHaveProperty("price");
    }
    expect(ds.daily).toBeUndefined();
  });
  test("nenhum NaN ou Infinity no dataset", () => {
    JSON.stringify(ds, (_k, v) => {
      if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
      return v;
    });
  });
  test("lift da BF medido no AAA-1 (30/dia vs 10/dia)", () => expect(get("AAA-1").demand.campaignLift.bf).toBeCloseTo(3, 1));
  test("venda perdida do AAA-1 vem da ruptura de agosto", () => expect(get("AAA-1").metrics.lostUnits12m).toBeGreaterThanOrEqual(40));
  test("descontinuado com saldo tem opções de liquidação", () => {
    expect(get("DDD-1").markdown.length).toBe(5);
    expect(get("DDD-1").metrics.idleUnits).toBe(get("DDD-1").onHand);
  });
  test("KPIs agregam os SKUs", () => {
    expect(ds.kpis.stockValue).toBeCloseTo(ds.skus.reduce((s, x) => s + x.metrics.stockValue, 0));
    expect(ds.kpis.fillRate12m).toBeGreaterThan(0.9);
    expect(ds.kpis.fillRate12m).toBeLessThan(1);
  });
  test("fornecedores com lead time e POs em aberto", () => {
    const f01 = ds.suppliers.find((s) => s.supplier === "F01")!;
    expect(f01.name).toBe("Alfa");
    expect(f01.leadTime.n).toBeGreaterThan(0);
    expect(f01.openOrders).toBe(1);
  });
  test("histórico semanal com segunda-feira como início", () => {
    const w = get("AAA-1").weekly;
    expect(w.length).toBeGreaterThan(70);
    expect(new Date(w[1].week + "T00:00:00Z").getUTCDay()).toBe(1);
  });
  test("includeDaily traz série diária", () =>
    expect(runPipeline(rawMini(), defaultConfig, { includeDaily: true }).daily!["AAA-1"].length).toBeGreaterThan(500));
  test("stripForAgent remove weekly e daily", () => {
    const s = stripForAgent(runPipeline(rawMini(), defaultConfig, { includeDaily: true }));
    expect(s.skus[0].weekly).toEqual([]);
    expect(s.daily).toBeUndefined();
  });
  test("SKU com histórico curto usa fallback de categoria", () => {
    const raw = rawMini();
    raw.skus.push({ ...raw.skus[0], sku: "NEW-1" });
    raw.stock.push({ sku: "NEW-1", date: "2026-09-20", onHand: 50 });
    const n = runPipeline(raw, defaultConfig).skus.find((s) => s.sku === "NEW-1")!;
    expect(n.demand.source).toBe("category");
    expect(n.demand.campaignLift.bf).toBeCloseTo(2, 1); // mediana de AAA-1 (3) e BBB-1 (1)
  });
});
