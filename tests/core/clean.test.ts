import { describe, expect, test } from "vitest";
import { buildDailySeries, dedupeSales, openOrders, unitsPer } from "@/core/clean";
import { leadTimeStats } from "@/core/leadtime";
import type { PurchaseRow, SaleRow, StockRow } from "@/core/types";

const sale = (date: string, units: number, sku = "X"): SaleRow => ({ sku, date, units, revenue: units * 2 });
const st = (date: string, onHand: number, sku = "X"): StockRow => ({ sku, date, onHand });
const po = (p: Partial<PurchaseRow>): PurchaseRow => ({
  poId: "PO-1", supplier: "F01", sku: "X", orderDate: "2026-01-01", receivedDate: null, quantity: 10, unit: "un", ...p,
});

describe("clean", () => {
  test("unitsPer", () => {
    expect(unitsPer("cx12")).toBe(12);
    expect(unitsPer("un")).toBe(1);
  });

  test("dedupeSales remove duplicata idêntica por sku+data", () => {
    const s = sale("2026-01-01", 5);
    const r = dedupeSales([s, { ...s }, sale("2026-01-02", 3)]);
    expect(r.removed).toBe(1);
    expect(r.sales).toHaveLength(2);
  });

  test("reconstrói dia faltante", () => {
    const ser = buildDailySeries("X", [st("2026-01-01", 100), st("2026-01-03", 70)], [sale("2026-01-02", 10), sale("2026-01-03", 20)], [], "2026-01-03");
    expect(ser.map((p) => p.onHand)).toEqual([100, 90, 70]);
  });

  test("negativo vira 0 e censurado", () => {
    const [p] = buildDailySeries("X", [st("2026-01-01", -4)], [], [], "2026-01-01");
    expect(p.onHand).toBe(0);
    expect(p.censored).toBe(true);
  });

  test("dia sem linha de venda tem units 0 e revenue 0", () => {
    const ser = buildDailySeries("X", [st("2026-01-01", 10), st("2026-01-02", 10)], [], [], "2026-01-02");
    expect(ser[1]).toMatchObject({ units: 0, revenue: 0, censored: false });
  });

  test("série começa no primeiro registro de estoque e vai até `to`", () => {
    const ser = buildDailySeries("X", [st("2026-01-05", 50)], [sale("2026-01-01", 1)], [], "2026-01-08");
    expect(ser[0].date).toBe("2026-01-05");
    expect(ser[ser.length - 1].date).toBe("2026-01-08");
    expect(ser).toHaveLength(4);
  });

  test("recebimento em cx12 soma 12×quantidade no dia faltante reconstruído", () => {
    const ser = buildDailySeries(
      "X", [st("2026-01-01", 10)], [], [po({ receivedDate: "2026-01-02", quantity: 2, unit: "cx12" })], "2026-01-02",
    );
    expect(ser[1].onHand).toBe(34);
  });

  test("ignora linhas de outros SKUs", () => {
    const ser = buildDailySeries("X", [st("2026-01-01", 10), st("2026-01-01", 99, "Y")], [sale("2026-01-01", 3, "Y")], [], "2026-01-01");
    expect(ser).toEqual([{ date: "2026-01-01", units: 0, revenue: 0, onHand: 10, censored: false }]);
  });

  test("PO aberto no prazo", () => {
    const lt = leadTimeStats([24]);
    const [o] = openOrders("X", [po({ orderDate: "2026-09-20", quantity: 300 })], lt, "2026-09-29");
    expect(o).toMatchObject({ units: 300, expectedDate: "2026-10-14", late: false });
  });

  test("PO atrasado usa p90 ou referência + 1", () => {
    const lt = { ...leadTimeStats([24]), p90: 30 };
    const [o] = openOrders("X", [po({ orderDate: "2026-08-01" })], lt, "2026-09-29");
    expect(o).toMatchObject({ late: true, expectedDate: "2026-09-30" });
  });

  test("PO atrasado com p90 ainda no futuro", () => {
    const lt = { ...leadTimeStats([20]), p90: 40 };
    const [o] = openOrders("X", [po({ orderDate: "2026-09-05" })], lt, "2026-09-29");
    expect(o).toMatchObject({ late: true, expectedDate: "2026-10-15" });
  });

  test("PO aberto em cx12 converte unidades e ignora recebidos", () => {
    const os = openOrders("X", [po({ quantity: 20, unit: "cx12", orderDate: "2026-09-20" }), po({ receivedDate: "2026-09-01" })], leadTimeStats([24]), "2026-09-29");
    expect(os).toHaveLength(1);
    expect(os[0].units).toBe(240);
  });
});
