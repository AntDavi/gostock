import { describe, expect, test } from "vitest";
import { applyEdits, loadApprovals, saveApprovals, type StoredApprovals } from "@/ui/approvals";
import type { PlanLine } from "@/core/plan/allocate";

const KEY = "gostock:approvals";
const mem = (init: Record<string, string> = {}) => {
  const data = { ...init };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
};

describe("approvals", () => {
  test("ida e volta", () => {
    const st = mem();
    const a: StoredApprovals = { datasetId: "d1", decisions: { "A-0": "approved" }, edits: { "A-0": { lots: 2, emitBy: "2026-10-05" } } };
    saveApprovals(st, a);
    expect(loadApprovals(st, "d1")).toEqual(a);
  });
  test("descarta aprovações de outro dataset", () => {
    const st = mem({ [KEY]: JSON.stringify({ datasetId: "old", decisions: { "A-0": "approved" }, edits: {} }) });
    expect(loadApprovals(st, "new")).toEqual({ datasetId: "new", decisions: {}, edits: {} });
  });
  test("JSON corrompido → vazio", () => expect(loadApprovals(mem({ [KEY]: "{oops" }), "d1").decisions).toEqual({}));
  test("formato inesperado → vazio", () => expect(loadApprovals(mem({ [KEY]: JSON.stringify({ datasetId: "d1", decisions: 3 }) }), "d1").decisions).toEqual({}));
  test("storage que lança → vazio, sem exceção", () => {
    const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadApprovals(bad, "d1").decisions).toEqual({});
    expect(() => saveApprovals(bad, { datasetId: "d1", decisions: {}, edits: {} })).not.toThrow();
  });
});

describe("applyEdits", () => {
  const line: PlanLine = { id: "A-0", sku: "A", supplier: "F1", emitBy: "2026-10-10", arrival: "2026-10-30", lots: 3, units: 36, cost: 300, seq: 0, reason: "r", origin: "base", priority: 1 };
  test("recalcula unidades, custo e chegada pela diferença de data", () => {
    const [l] = applyEdits([line], { "A-0": { lots: 5, emitBy: "2026-10-01" } }, () => ({ lotUnits: 12, lotCost: 100 }));
    expect(l).toMatchObject({ lots: 5, units: 60, cost: 500, emitBy: "2026-10-01", arrival: "2026-10-21" });
  });
  test("linha sem edição fica igual", () => expect(applyEdits([line], {}, () => ({ lotUnits: 12, lotCost: 100 }))[0]).toBe(line));
});

describe("approvalsKey", () => {
  test("muda quando a configuração muda", async () => {
    const { approvalsKey } = await import("@/ui/approvals");
    expect(approvalsKey("d1", { budget: 1 })).toBe(approvalsKey("d1", { budget: 1 }));
    expect(approvalsKey("d1", { budget: 1 })).not.toBe(approvalsKey("d1", { budget: 2 }));
    expect(approvalsKey("d1", { budget: 1 })).not.toBe(approvalsKey("d2", { budget: 1 }));
  });
});
