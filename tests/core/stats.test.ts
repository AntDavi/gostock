import { describe, expect, test } from "vitest";
import { mean, median, normalLoss, percentile, std } from "@/core/stats";

describe("stats", () => {
  test("median par", () => expect(median([10, 20, 30, 40])).toBe(25));
  test("percentile nearest-rank", () => expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.9)).toBe(90));
  test("normalLoss(0)", () => expect(normalLoss(0)).toBeCloseTo(0.3989, 3));
  test("listas vazias → 0", () => {
    expect(median([])).toBe(0);
    expect(mean([])).toBe(0);
    expect(std([])).toBe(0);
    expect(percentile([], 0.9)).toBe(0);
  });
  test("std populacional", () => expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2));
});
