import { describe, expect, test } from "vitest";
import { defaultConfig } from "@/core/config";
import { planPart } from "@/ui/ConfigForm";

describe("planPart", () => {
  test("leva orçamento, janela, serviço e datas das campanhas deste ano; ignora campos do pipeline", () => {
    const draft = {
      ...defaultConfig,
      budget: 2_500_000,
      windowEnd: "2026-12-20",
      tiers: { A: 0.99, B: 0.95, C: 0.9 },
      referenceDate: "2026-08-31",
      idleCoverageDays: 90,
      campaigns: defaultConfig.campaigns.map((c) => (c.id === "bf" ? { ...c, start: "2026-11-21", lastYearStart: "2025-11-01" } : c)),
    };
    const next = planPart(defaultConfig, draft);
    expect(next).toMatchObject({ budget: 2_500_000, windowEnd: "2026-12-20", tiers: { A: 0.99 }, referenceDate: defaultConfig.referenceDate, idleCoverageDays: 180 });
    const bf = next.campaigns.find((c) => c.id === "bf")!;
    expect(bf.start).toBe("2026-11-21");
    expect(bf.lastYearStart).toBe(defaultConfig.campaigns[0].lastYearStart);
  });
});
