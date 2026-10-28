import type { Dataset } from "../types";
import type { PlanLine } from "./allocate";

const HEADER = "emitir_ate,sku,descricao,fornecedor,quantidade,unidade,unidades,valor,motivo,origem";

function cell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV de pedidos, com quantidade na unidade de compra do SKU. */
export function planToCsv(lines: PlanLine[], ds: Dataset): string {
  const bySku = new Map(ds.skus.map((s) => [s.sku, s]));
  const rows = [...lines]
    .sort((a, b) => (a.emitBy < b.emitBy ? -1 : a.emitBy > b.emitBy ? 1 : a.sku.localeCompare(b.sku)))
    .map((l) => {
      const s = bySku.get(l.sku);
      const qty = s ? l.lots * s.moq : l.lots;
      const unit = s?.purchaseUnit === "cx12" ? "cx 12 un" : "un";
      return [l.emitBy, l.sku, s?.description ?? "", l.supplier, qty, unit, l.units, l.cost.toFixed(2), l.reason, l.origin].map(cell).join(",");
    });
  return [HEADER, ...rows].join("\n");
}
