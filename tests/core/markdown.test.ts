import { describe, expect, test } from "vitest";
import { defaultConfig as cfg, holdingRatePerDay } from "@/core/config";
import { markdownOptions, priceResponse, type MarkdownInput } from "@/core/markdown";

const inp: MarkdownInput = { excessUnits: 1000, baseDaily: 2, unitCost: 10, price: 40, priceResponse: 4, discontinued: false };

describe("markdown", () => {
  test("priceResponse atribui share do ganho da BF ao preço", () => expect(priceResponse(3, 0.25, cfg)).toBeCloseTo(4));
  test("priceResponse limitado a [0, 10] e sem desconto → 0", () => {
    expect(priceResponse(50, 0.25, cfg)).toBe(10);
    expect(priceResponse(0.5, 0.25, cfg)).toBe(0);
    expect(priceResponse(3, 0, cfg)).toBe(0);
  });

  test("opção 0% sempre presente e descontos nunca acima de maxDiscount", () => {
    expect(markdownOptions(inp, cfg).map((x) => x.discount)).toEqual([0, 0.1, 0.2, 0.3, 0.4]);
    expect(markdownOptions(inp, { ...cfg, maxDiscount: 0.25 }).map((x) => x.discount)).toEqual([0, 0.1, 0.2]);
  });

  test("unidades vendidas em 90 dias limitadas ao excesso", () =>
    expect(markdownOptions({ ...inp, excessUnits: 100, baseDaily: 10 }, cfg)[0].unitsSold90d).toBe(100));

  test("desconto acelera a venda: base × (1 + k·d)", () => {
    const o = markdownOptions(inp, cfg);
    expect(o[0].unitsSold90d).toBeCloseTo(180);
    expect(o[4].unitsSold90d).toBeCloseTo(2 * (1 + 4 * 0.4) * 90);
  });

  test("capital liberado = unidades vendidas × custo e receita com desconto", () => {
    const o = markdownOptions(inp, cfg)[2];
    expect(o.capitalFreed).toBeCloseTo(o.unitsSold90d * 10);
    expect(o.revenue).toBeCloseTo(o.unitsSold90d * 40 * 0.8);
  });

  test("value = receita − custo de manter + residual (ativo 0,7 × custo, descontinuado 0)", () => {
    const hd = holdingRatePerDay(cfg);
    const still = { ...inp, excessUnits: 100, baseDaily: 0 };
    const a = markdownOptions(still, cfg)[0];
    expect(a.holdingCost).toBeCloseTo(100 * 10 * hd * 90);
    expect(a.value).toBeCloseTo(-a.holdingCost + 100 * 0.7 * 10);
    const d = markdownOptions({ ...still, discontinued: true }, cfg)[0];
    expect(d.value).toBeCloseTo(-d.holdingCost);
  });

  test("sem excesso → opções com zeros finitos", () => {
    for (const o of markdownOptions({ ...inp, excessUnits: 0 }, cfg)) {
      expect(o.unitsSold90d).toBe(0);
      expect(o.value).toBe(0);
    }
  });
});
