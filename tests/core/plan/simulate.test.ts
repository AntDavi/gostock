import { describe, expect, test } from "vitest";
import { defaultConfig as cfg } from "@/core/config";
import { inRange } from "@/core/dates";
import { simulateSku } from "@/core/plan/simulate";
import { defaultScenario } from "@/core/types";
import { flatModel, lt, mkSku } from "../../helpers";

const sku = mkSku();
const lt10 = lt(10);

describe("simulateSku", () => {
  const r = simulateSku(sku, lt10, 0.98, cfg, defaultScenario);

  test("primeiro pedido (demanda plana)", () =>
    expect(r.lines[0]).toMatchObject({ sku: "S-1", supplier: "F01", emitBy: "2026-10-01", lots: 7, units: 350, arrival: "2026-10-11", cost: 3500, seq: 0 }));

  test("todas as quantidades são múltiplas do lote", () => r.lines.forEach((l) => expect(l.units % 50).toBe(0)));

  test("emissões dentro da janela e seq crescente", () => {
    r.lines.forEach((l, i) => {
      expect(inRange(l.emitBy, "2026-10-01", "2026-12-29")).toBe(true);
      expect(l.seq).toBe(i);
    });
    expect(r.lines.length).toBeGreaterThan(1);
  });

  test("com estoque inicial cobrindo o lead time e sem variabilidade não há perda", () => {
    const ok = simulateSku(mkSku({ onHand: 200 }), lt10, 0.98, cfg, defaultScenario);
    expect(ok.lostUnits).toBe(0);
    expect(ok.stockoutDate).toBeNull();
    expect(ok.demand).toBeCloseTo(10 * 91);
  });

  test("ruptura inevitável antes da janela abrir é contada", () => {
    expect(r.lostUnits).toBeCloseTo(10);
    expect(r.stockoutDate).toBe("2026-10-10");
  });

  test("descontinuado não gera linhas", () =>
    expect(simulateSku({ ...sku, status: "descontinuado" }, lt10, 0.98, cfg, defaultScenario).lines).toEqual([]));

  test("PO em aberto conta como posição", () => {
    const r2 = simulateSku(
      { ...sku, onOrder: [{ poId: "PO-1", units: 400, orderDate: "2026-09-25", expectedDate: "2026-10-05", late: false }] },
      lt10, 0.98, cfg, defaultScenario,
    );
    expect(r2.lines[0].emitBy > "2026-10-01").toBe(true);
  });

  test("fixedLines: simula só com as linhas dadas e reporta perda", () => {
    const r3 = simulateSku(sku, lt10, 0.98, cfg, defaultScenario, []);
    expect(r3.lines).toEqual([]);
    expect(r3.lostUnits).toBeCloseTo(10 * 91 - 100);
    expect(r3.stockoutDate).toBe("2026-10-10");
  });

  test("variabilidade gera estoque de segurança (pedido maior)", () => {
    const rv = simulateSku({ ...sku, demand: flatModel(10, 20) }, lt(10, 6), 0.98, cfg, defaultScenario);
    expect(rv.lines[0].units).toBeGreaterThan(350);
  });

  test("sem demanda não gera linhas nem NaN", () => {
    const r0 = simulateSku({ ...sku, demand: flatModel(0) }, lt10, 0.98, cfg, defaultScenario);
    expect(r0.lines).toEqual([]);
    expect(r0.lostUnits).toBe(0);
  });

  test("projeção diária até o fim da janela", () => {
    expect(r.projected[0]).toEqual({ date: "2026-09-30", onHand: 90 });
    expect(r.projected[r.projected.length - 1].date).toBe("2026-12-29");
  });
});
