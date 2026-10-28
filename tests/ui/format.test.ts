import { describe, expect, test } from "vitest";
import { brl, dateBR, intBR, pct } from "@/ui/format";

describe("format", () => {
  test("brl com 2 casas e espaço comum", () => {
    expect(brl(1234.56)).toBe("R$ 1.234,56");
    expect(brl(0)).toBe("R$ 0,00");
    expect(brl(-50)).toBe("-R$ 50,00");
  });
  test("brl compacto: mi e mil", () => {
    expect(brl(6785871, true)).toBe("R$ 6,79 mi");
    expect(brl(228400, true)).toBe("R$ 228 mil");
    expect(brl(950, true)).toBe("R$ 950");
  });
  test("pct", () => {
    expect(pct(0.968)).toBe("96,8%");
    expect(pct(0.89469, 2)).toBe("89,47%");
    expect(pct(1)).toBe("100,0%");
  });
  test("dateBR", () => expect(dateBR("2026-10-02")).toBe("02/10/2026"));
  test("intBR", () => {
    expect(intBR(12345)).toBe("12.345");
    expect(intBR(12.6)).toBe("13");
  });
});
