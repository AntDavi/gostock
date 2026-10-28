import { describe, expect, test } from "vitest";
import { defaultConfig as cfg } from "@/core/config";
import { runPipeline } from "@/core/pipeline";
import { buildBasePlan } from "@/core/plan/allocate";
import { validateDiscount, validateLine, validatePlan } from "@/core/plan/validate";
import { defaultScenario } from "@/core/types";
import { rawMini } from "../../fixtures/mini";

const ds = runPipeline(rawMini(), cfg);
const code = (errs: { code: string }[]) => errs[0]?.code;

describe("validateLine", () => {
  test.each([
    [{ sku: "ZZZ", units: 100, emitBy: "2026-10-01" }, "UNKNOWN_SKU"],
    [{ sku: "DDD-1", units: 50, emitBy: "2026-10-01" }, "DISCONTINUED"],
    [{ sku: "BBB-1", units: 100, emitBy: "2026-10-01" }, "MOQ"],
    [{ sku: "AAA-1", units: 0, emitBy: "2026-10-01" }, "NON_POSITIVE"],
    [{ sku: "AAA-1", units: -100, emitBy: "2026-10-01" }, "NON_POSITIVE"],
    [{ sku: "AAA-1", units: 150.5, emitBy: "2026-10-01" }, "NON_POSITIVE"],
    [{ sku: "AAA-1", units: 100, emitBy: "2026-12-30" }, "WINDOW"],
    [{ sku: "AAA-1", units: 100, emitBy: "2026-09-30" }, "WINDOW"],
    [{ sku: "AAA-1", units: 100, emitBy: "30/10/2026" }, "BAD_DATE"],
  ])("%o → %s", (line, expected) => expect(code(validateLine(line, ds, cfg))).toBe(expected));

  test("linha válida", () => {
    expect(validateLine({ sku: "AAA-1", units: 200, emitBy: "2026-10-01" }, ds, cfg)).toEqual([]);
    expect(validateLine({ sku: "BBB-1", units: 240, emitBy: "2026-12-29" }, ds, cfg)).toEqual([]);
  });

  test("mensagem em pt-BR cita o lote", () => expect(validateLine({ sku: "BBB-1", units: 100, emitBy: "2026-10-01" }, ds, cfg)[0].message).toContain("120"));
});

describe("validatePlan", () => {
  const p = buildBasePlan(ds, { ...cfg, budget: 1e12 }, defaultScenario);
  test("acusa BUDGET quando a soma passa", () => {
    expect(validatePlan(p.lines, ds, cfg, p.totalCost - 1).map((e) => e.code)).toContain("BUDGET");
    expect(validatePlan(p.lines, ds, cfg, p.totalCost)).toEqual([]);
  });
  test("acusa linha inválida dentro do plano", () =>
    expect(validatePlan([{ ...p.lines[0], units: 1 }], ds, cfg, 1e12).map((e) => e.code)).toContain("MOQ"));
});

describe("validateDiscount", () => {
  test("acima do teto", () => expect(code(validateDiscount(0.45, cfg))).toBe("DISCOUNT"));
  test("negativo ou NaN", () => {
    expect(code(validateDiscount(-0.1, cfg))).toBe("DISCOUNT");
    expect(code(validateDiscount(Number.NaN, cfg))).toBe("DISCOUNT");
  });
  test("no teto é válido", () => expect(validateDiscount(0.4, cfg)).toEqual([]));
});
