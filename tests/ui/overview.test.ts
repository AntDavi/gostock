import { describe, expect, test } from "vitest";
import { defaultConfig } from "@/core/config";
import { runPipeline } from "@/core/pipeline";
import { computeOverview, lowCoverage, overviewAlerts, topIdle } from "@/ui/overview";
import { rawMini } from "../fixtures/mini";

const ds = runPipeline(rawMini(), defaultConfig);
const ov = computeOverview(ds, defaultConfig);
const bf = defaultConfig.campaigns[0].start;

describe("overview", () => {
  test("curva orçamento → fill inclui o orçamento configurado e custo de 98% para todos", () => {
    expect(ov.budgetCurve.some((p) => p.budget === defaultConfig.budget)).toBe(true);
    expect(ov.uniform98Cost).toBeGreaterThan(0);
  });

  test("ruptura sem novos pedidos só para SKUs ativos", () => {
    const ativos = ds.skus.filter((s) => s.status === "ativo").map((s) => s.sku).sort();
    expect(Object.keys(ov.stockouts).sort()).toEqual(ativos);
  });

  test("lowCoverage: só quem rompe, da ruptura mais cedo para a mais tarde, marcando antes da 1ª campanha", () => {
    const low = lowCoverage(ds, ov, defaultConfig, 25);
    const dates = low.map((x) => x.date);
    expect([...dates].sort()).toEqual(dates);
    for (const x of low) {
      expect(x.date).toBe(ov.stockouts[x.sku]);
      expect(x.beforeCampaign).toBe(x.date < bf);
    }
  });

  test("topIdle: maior capital parado primeiro, sem zeros", () => {
    const top = topIdle(ds, 3);
    expect(top.length).toBeLessThanOrEqual(3);
    expect(top.every((x) => x.idleValue > 0)).toBe(true);
    const v = top.map((x) => x.idleValue);
    expect([...v].sort((a, b) => b - a)).toEqual(v);
  });

  test("alertas batem com as listas", () => {
    const a = overviewAlerts(ds, ov, defaultConfig);
    expect(a.campaign.start).toBe(bf);
    expect(a.stockoutBeforeCampaign).toBe(Object.values(ov.stockouts).filter((d) => d !== null && d < bf).length);
    expect(a.overstock).toBe(ds.skus.filter((s) => s.metrics.coverageDays > 365).length);
    expect(a.latePos).toBe(ds.kpis.latePoCount);
  });
});
