import Papa from "papaparse";
import { isISODate } from "./dates";
import type {
  CsvFiles, LoadResult, PurchaseRow, PurchaseUnit, SaleRow, SkuRow, SkuStatus, StockRow, SupplierRow,
} from "./types";

type Row = Record<string, string>;

const FILES = {
  skus: { name: "skus", cols: ["sku", "marca", "descricao", "categoria", "status", "custo_unitario", "preco_venda", "fornecedor", "unidade_compra", "moq"] },
  vendas: { name: "vendas_diarias", cols: ["sku", "data", "unidades_vendidas", "receita"] },
  estoque: { name: "estoque_diario", cols: ["sku", "data", "estoque_disponivel"] },
  compras: { name: "compras", cols: ["po_id", "fornecedor", "sku", "data_pedido", "data_recebimento", "quantidade", "unidade"] },
  fornecedores: { name: "fornecedores", cols: ["fornecedor", "nome_fornecedor"] },
} as const;

class BadValue extends Error {}

function num(v: string | undefined): number {
  const s = (v ?? "").trim();
  if (!s) throw new BadValue();
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  if (!Number.isFinite(n)) throw new BadValue();
  return n;
}

function date(v: string | undefined): string {
  const s = (v ?? "").trim();
  if (!isISODate(s)) throw new BadValue();
  return s;
}

function text(v: string | undefined): string {
  const s = (v ?? "").trim();
  if (!s) throw new BadValue();
  return s;
}

function unit(v: string | undefined): PurchaseUnit {
  const s = (v ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (s === "un") return "un";
  if (s === "cx12un" || s === "cx12") return "cx12";
  throw new BadValue();
}

function status(v: string | undefined): SkuStatus {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "ativo" || s === "descontinuado") return s;
  throw new BadValue();
}

function parse(textIn: string): { fields: string[]; rows: Row[] } {
  const res = Papa.parse<Row>(textIn.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
    delimiter: "",
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
  });
  return { fields: res.meta.fields ?? [], rows: res.data };
}

function readFile<T>(
  key: keyof typeof FILES,
  files: CsvFiles,
  errors: string[],
  warnings: string[],
  map: (r: Row) => T,
): T[] {
  const spec = FILES[key];
  const label = `Arquivo ${spec.name}.csv`;
  const { fields, rows } = parse(files[key] ?? "");
  if (!fields.length) {
    errors.push(`${label}: vazio ou sem cabeçalho.`);
    return [];
  }
  const missing = spec.cols.filter((c) => !fields.includes(c));
  for (const c of missing) errors.push(`${label}: coluna obrigatória "${c}" não encontrada.`);
  if (missing.length) return [];
  const out: T[] = [];
  let bad = 0;
  for (const r of rows) {
    try {
      out.push(map(r));
    } catch (e) {
      if (!(e instanceof BadValue)) throw e;
      bad++;
    }
  }
  if (bad) warnings.push(`${label}: ${bad} linha(s) com valor inválido descartada(s).`);
  return out;
}

export function loadDataset(files: CsvFiles): LoadResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const skus = readFile<SkuRow>("skus", files, errors, warnings, (r) => ({
    sku: text(r.sku),
    brand: text(r.marca),
    description: text(r.descricao),
    category: text(r.categoria),
    status: status(r.status),
    unitCost: num(r.custo_unitario),
    price: num(r.preco_venda),
    supplier: text(r.fornecedor),
    purchaseUnit: unit(r.unidade_compra),
    moq: num(r.moq),
  }));
  const sales = readFile<SaleRow>("vendas", files, errors, warnings, (r) => ({
    sku: text(r.sku), date: date(r.data), units: num(r.unidades_vendidas), revenue: num(r.receita),
  }));
  const stock = readFile<StockRow>("estoque", files, errors, warnings, (r) => ({
    sku: text(r.sku), date: date(r.data), onHand: num(r.estoque_disponivel),
  }));
  const purchases = readFile<PurchaseRow>("compras", files, errors, warnings, (r) => ({
    poId: text(r.po_id),
    supplier: text(r.fornecedor),
    sku: text(r.sku),
    orderDate: date(r.data_pedido),
    receivedDate: (r.data_recebimento ?? "").trim() ? date(r.data_recebimento) : null,
    quantity: num(r.quantidade),
    unit: unit(r.unidade),
  }));
  const suppliers = readFile<SupplierRow>("fornecedores", files, errors, warnings, (r) => ({
    supplier: text(r.fornecedor), name: text(r.nome_fornecedor),
  }));

  if (errors.length) return { data: null, errors, warnings };
  return { data: { skus, sales, stock, purchases, suppliers }, errors, warnings };
}
