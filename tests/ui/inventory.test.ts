import { describe, expect, test } from "vitest";
import { defaultConfig } from "@/core/config";
import { suggestMarkdowns } from "@/core/plan/curve";
import { runPipeline } from "@/core/pipeline";
import type { LeadTimeStats } from "@/core/types";
import { isUnstable, markdownRows, skuSituation } from "@/ui/inventory";
import { computeStockouts } from "@/ui/overview";
import { rawMini } from "../fixtures/mini";

const ds = runPipeline(rawMini(), defaultConfig);
const bf = defaultConfig.campaigns[0].start;

describe("skuSituation", () => {
  const s = ds.skus.find((x) => x.status === "ativo")!;
  test("ruptura antes da primeira campanha", () => expect(skuSituation({ ...s, metrics: { ...s.metrics, coverageDays: 30 } }, "2026-10-15", defaultConfig)).toBe("ruptura"));
  test("ruptura depois da campanha não conta", () => expect(skuSituation({ ...s, metrics: { ...s.metrics, coverageDays: 90 } }, bf, defaultConfig)).toBe("ok"));
  test("cobertura acima de 365 dias é excesso", () => expect(skuSituation({ ...s, metrics: { ...s.metrics, coverageDays: 400 } }, null, defaultConfig)).toBe("excesso"));
});

describe("markdownRows", () => {
  const sug = suggestMarkdowns(ds, defaultConfig);
  test("sem escolhas, usa a sugestão do código", () => {
    const { rows, totalFreed } = markdownRows(ds, defaultConfig, {}, []);
    expect(rows.map((r) => r.sku)).toEqual(sug.map((x) => x.sku));
    expect(totalFreed).toBeCloseTo(sug.reduce((a, x) => a + x.option.capitalFreed, 0));
    for (const r of rows) {
      const none = ds.skus.find((x) => x.sku === r.sku)!.markdown.find((o) => o.discount === 0)!;
      expect(r.holdingAvoided).toBeCloseTo(none.holdingCost - r.option.holdingCost);
    }
  });
  test("escolha do usuário troca a opção e o total", () => {
    const first = sug[0];
    const other = ds.skus.find((x) => x.sku === first.sku)!.markdown.find((o) => o.discount > 0 && o.discount !== first.option.discount)!;
    const { rows } = markdownRows(ds, defaultConfig, { [first.sku]: other.discount }, []);
    expect(rows.find((r) => r.sku === first.sku)!.option).toEqual(other);
  });
  test("sugestão do agente aparece marcada, com motivo", () => {
    const first = sug[0];
    const { rows } = markdownRows(ds, defaultConfig, {}, [{ ...first, reason: "agente decidiu" }]);
    expect(rows.find((r) => r.sku === first.sku)).toMatchObject({ fromAgent: true, reason: "agente decidiu" });
  });
});

describe("fornecedores e rupturas", () => {
  const lt = (median: number, p90: number) => ({ median, p90 }) as LeadTimeStats;
  test("instável quando P90/mediana > 1,8", () => {
    expect(isUnstable(lt(32, 75))).toBe(true);
    expect(isUnstable(lt(27, 34))).toBe(false);
  });
  test("computeStockouts cobre só os ativos", () => {
    const st = computeStockouts(ds, defaultConfig);
    expect(Object.keys(st).sort()).toEqual(ds.skus.filter((s) => s.status === "ativo").map((s) => s.sku).sort());
  });
});

describe("markdownToCsv", () => {
  test("uma linha por sugestão, desconto em %", async () => {
    const { markdownToCsv } = await import("@/ui/inventory");
    const { rows } = markdownRows(ds, defaultConfig, {}, []);
    const csv = markdownToCsv(rows).split("\n");
    expect(csv).toHaveLength(rows.length + 1);
    expect(csv[0]).toContain("capital_liberado");
    if (rows.length) expect(csv[1]).toContain(`${Math.round(rows[0].option.discount * 100)}%`);
  });
});
