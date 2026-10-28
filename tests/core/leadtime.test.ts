import { describe, expect, test } from "vitest";
import { leadTimeStats, supplierLeadTimes } from "@/core/leadtime";
import type { PurchaseRow } from "@/core/types";

describe("leadtime", () => {
  test("estatísticas", () =>
    expect(leadTimeStats([10, 20, 30, 40])).toMatchObject({ n: 4, median: 25, mean: 25, p90: 40, min: 10, max: 40 }));

  test("vazio → zeros", () => expect(leadTimeStats([])).toEqual({ n: 0, median: 0, mean: 0, p90: 0, std: 0, min: 0, max: 0 }));

  test("por fornecedor, só POs recebidos", () => {
    const p = (supplier: string, o: string, r: string | null): PurchaseRow => ({ poId: "x", supplier, sku: "s", orderDate: o, receivedDate: r, quantity: 1, unit: "un" });
    const r = supplierLeadTimes([p("F01", "2026-01-01", "2026-01-11"), p("F01", "2026-01-01", "2026-01-21"), p("F02", "2026-01-01", null)]);
    expect(r.F01).toMatchObject({ n: 2, median: 15 });
    expect(r.F02).toBeUndefined();
  });
});
