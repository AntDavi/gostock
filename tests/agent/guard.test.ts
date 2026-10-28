import { describe, expect, test } from "vitest";
import { numberGuard } from "@/agent/guard";

const log = [
  JSON.stringify({ totalCost: 1843250.5, fill: 0.968, lots: 7, sku: "KSH-1003", date: "2026-10-02" }),
  JSON.stringify({ reason: "Cobertura atual 46 dias; lead time 32 dias (F05)." }),
];

describe("numberGuard", () => {
  test("valor exato em formato BR", () => expect(numberGuard("Custo total R$ 1.843.250,50", log).ok).toBe(true));
  test("arredondamento com sufixo mi/mil", () => {
    expect(numberGuard("Custo de R$ 1,84 mi", log).ok).toBe(true);
    expect(numberGuard("Custo de R$ 1.843 mil", log).ok).toBe(true);
  });
  test("percentual ↔ fração", () => expect(numberGuard("Nível de 96,8%", log).ok).toBe(true));
  test("códigos e datas ignorados", () => {
    expect(numberGuard("7 lotes do KSH-1003 em 02/10", log).ok).toBe(true);
    expect(numberGuard("Pedido PO-50001 emitido em 2026-10-02, chega 15/11/2026", log).ok).toBe(true);
    expect(numberGuard("Fornecedor F05 em 2026", log).ok).toBe(true);
  });
  test("número inventado é apontado com o texto original", () =>
    expect(numberGuard("Economia de R$ 250 mil", log)).toEqual({ ok: false, unverified: ["R$ 250 mil"] }));
  test("inteiros ≤ 10 liberados", () => expect(numberGuard("Os 3 SKUs críticos", log).ok).toBe(true));
  test("números dentro de textos das ferramentas valem como referência", () => expect(numberGuard("Cobertura de 46 dias", log).ok).toBe(true));
  test("vários números, só os inventados voltam", () =>
    expect(numberGuard("Custo R$ 1,84 mi, fill 96,8% e 37 SKUs cortados", log)).toEqual({ ok: false, unverified: ["37"] }));
  test("texto sem números", () => expect(numberGuard("Plano revisado.", [])).toEqual({ ok: true, unverified: [] }));
  test("toolLog com JSON inválido não quebra", () => expect(numberGuard("Custo 1.843.250,50", ["{oops", ...log]).ok).toBe(true));
});
