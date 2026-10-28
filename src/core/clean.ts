import { addDays, dateRange } from "./dates";
import type { DayPoint, ISODate, LeadTimeStats, OpenOrder, PurchaseRow, PurchaseUnit, SaleRow, StockRow } from "./types";

export function unitsPer(unit: PurchaseUnit): 1 | 12 {
  return unit === "cx12" ? 12 : 1;
}

/** Remove linhas repetidas por (sku, data); mantém a primeira. */
export function dedupeSales(sales: SaleRow[]): { sales: SaleRow[]; removed: number } {
  const seen = new Set<string>();
  const out: SaleRow[] = [];
  for (const s of sales) {
    const key = `${s.sku}|${s.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return { sales: out, removed: sales.length - out.length };
}

/**
 * Série diária do SKU, do primeiro registro de estoque até `to`.
 * Dia sem registro: anterior − vendas + recebimentos (mínimo 0). Negativo vira 0.
 * Censurado = estoque ≤ 0 ao fim do dia.
 */
export function buildDailySeries(sku: string, stock: StockRow[], sales: SaleRow[], purchases: PurchaseRow[], to: ISODate): DayPoint[] {
  const stockByDate = new Map<ISODate, number>();
  let first: ISODate | null = null;
  for (const r of stock) {
    if (r.sku !== sku) continue;
    stockByDate.set(r.date, r.onHand);
    if (first === null || r.date < first) first = r.date;
  }
  if (first === null) return [];

  const salesByDate = new Map<ISODate, { units: number; revenue: number }>();
  for (const s of sales) {
    if (s.sku !== sku) continue;
    const cur = salesByDate.get(s.date) ?? { units: 0, revenue: 0 };
    salesByDate.set(s.date, { units: cur.units + s.units, revenue: cur.revenue + s.revenue });
  }
  const receivedByDate = new Map<ISODate, number>();
  for (const p of purchases) {
    if (p.sku !== sku || !p.receivedDate) continue;
    receivedByDate.set(p.receivedDate, (receivedByDate.get(p.receivedDate) ?? 0) + p.quantity * unitsPer(p.unit));
  }

  const out: DayPoint[] = [];
  let prev = 0;
  for (const date of dateRange(first, to)) {
    const s = salesByDate.get(date) ?? { units: 0, revenue: 0 };
    const recorded = stockByDate.get(date);
    const raw = recorded ?? prev - s.units + (receivedByDate.get(date) ?? 0);
    const onHand = Math.max(0, raw);
    out.push({ date, units: s.units, revenue: s.revenue, onHand, censored: onHand <= 0 });
    prev = onHand;
  }
  return out;
}

/**
 * POs ainda não recebidos do SKU. Chegada esperada = emissão + lead time mediano;
 * se já passou na referência, o PO está atrasado e a chegada vira max(emissão + p90, referência + 1).
 */
export function openOrders(sku: string, purchases: PurchaseRow[], lt: LeadTimeStats, referenceDate: ISODate): OpenOrder[] {
  const out: OpenOrder[] = [];
  for (const p of purchases) {
    if (p.sku !== sku || p.receivedDate) continue;
    let expectedDate = addDays(p.orderDate, Math.round(lt.median));
    let late = false;
    if (expectedDate <= referenceDate) {
      late = true;
      const byP90 = addDays(p.orderDate, Math.round(lt.p90));
      const tomorrow = addDays(referenceDate, 1);
      expectedDate = byP90 > tomorrow ? byP90 : tomorrow;
    }
    out.push({ poId: p.poId, units: p.quantity * unitsPer(p.unit), orderDate: p.orderDate, expectedDate, late });
  }
  return out;
}
