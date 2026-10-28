import { describe, expect, test } from "vitest";
import { addDays, dateRange, diffDays, inRange, weekStart } from "@/core/dates";

describe("dates", () => {
  test("addDays atravessa mês", () => expect(addDays("2026-09-29", 3)).toBe("2026-10-02"));
  test("diffDays é b − a", () => expect(diffDays("2026-09-29", "2026-10-01")).toBe(2));
  test("dateRange inclusivo atravessa ano", () =>
    expect(dateRange("2026-12-30", "2027-01-01")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]));
  test("weekStart é segunda-feira", () => expect(weekStart("2026-10-01")).toBe("2026-09-28"));
  test("inRange inclusivo", () => {
    expect(inRange("2026-11-20", "2026-11-20", "2026-11-30")).toBe(true);
    expect(inRange("2026-12-01", "2026-11-20", "2026-11-30")).toBe(false);
  });
});
