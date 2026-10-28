import { describe, expect, test } from "vitest";
import { expectedFillRate, sigmaLeadTime, zForFillRate } from "@/core/plan/safety";
import { lt } from "../../helpers";

describe("safety", () => {
  test("zForFillRate resolve G(z) = (1 − fr)·Q/σL", () => expect(zForFillRate(0.98, 100, 50)).toBeCloseTo(1.36, 1));
  test("fill esperado no z encontrado atinge a meta", () =>
    expect(expectedFillRate(zForFillRate(0.95, 100, 50), 100, 50)).toBeGreaterThanOrEqual(0.95));
  test("meta já atendida com z = 0 → 0", () => expect(zForFillRate(0.5, 1000, 10)).toBe(0));
  test("meta inalcançável → limite 4", () => expect(zForFillRate(0.9999, 1, 1000)).toBe(4));
  test("σL = 0 → zForFillRate retorna 0 (sem divisão por zero)", () => expect(zForFillRate(0.98, 100, 0)).toBe(0));
  test("sigmaLeadTime sem variabilidade → 0", () => expect(sigmaLeadTime(10, 0, lt(10, 0))).toBe(0));
  test("sigmaLeadTime combina demanda e lead time", () => expect(sigmaLeadTime(10, 2, lt(9, 3))).toBeCloseTo(Math.sqrt(9 * 4 + 100 * 9)));
  test("expectedFillRate limitado a [0, 1] e Q = 0 → 1", () => {
    expect(expectedFillRate(0, 1, 1e6)).toBe(0);
    expect(expectedFillRate(0, 0, 10)).toBe(1);
  });
});
