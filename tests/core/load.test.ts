import { describe, expect, test } from "vitest";
import { loadDataset } from "@/core/load";
import { miniFiles, toSemicolon } from "../fixtures/mini";

describe("loadDataset", () => {
  test("carrega o fixture e converte unidade", () => {
    const r = loadDataset(miniFiles);
    expect(r.errors).toEqual([]);
    expect(r.data!.skus.find((s) => s.sku === "BBB-1")!.purchaseUnit).toBe("cx12");
    expect(r.data!.purchases.some((p) => p.receivedDate === null)).toBe(true);
    expect(r.data!.skus.find((s) => s.sku === "DDD-1")!.status).toBe("descontinuado");
  });

  test("coluna faltando gera erro nomeando arquivo e coluna", () => {
    const r = loadDataset({ ...miniFiles, skus: miniFiles.skus.replace("moq", "lote") });
    expect(r.data).toBeNull();
    expect(r.errors[0]).toContain("skus.csv");
    expect(r.errors[0]).toContain("moq");
  });

  test("aceita BOM e separador ponto e vírgula com vírgula decimal", () => {
    const r = loadDataset({
      ...miniFiles,
      skus: "﻿" + toSemicolon(miniFiles.skus),
      vendas: "﻿" + toSemicolon(miniFiles.vendas),
    });
    expect(r.errors).toEqual([]);
    const ref = loadDataset(miniFiles).data!;
    expect(r.data!.sales.slice(0, 5)).toEqual(ref.sales.slice(0, 5));
    expect(r.data!.skus).toEqual(ref.skus);
  });

  test("linha com número inválido vira aviso, não erro", () => {
    const r = loadDataset({ ...miniFiles, vendas: miniFiles.vendas + "\nAAA-1,2026-09-29,abc,0" });
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBe(1);
  });

  test("arquivo vazio gera erro", () => {
    const r = loadDataset({ ...miniFiles, compras: "" });
    expect(r.data).toBeNull();
    expect(r.errors[0]).toContain("compras.csv");
  });
});
