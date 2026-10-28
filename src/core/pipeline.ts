import { buildDailySeries, dedupeSales, openOrders, unitsPer } from "./clean";
import { diffDays, inRange, weekStart } from "./dates";
import { categoryFallback, fitDemand } from "./demand";
import { leadTimeStats, supplierLeadTimes } from "./leadtime";
import { markdownOptions, priceResponse } from "./markdown";
import { abcClasses, skuMetrics } from "./metrics";
import { median } from "./stats";
import type {
  Config, Dataset, DayPoint, DemandModel, LeadTimeStats, PurchaseRow, RawDataset, SaleRow, SkuMetrics, SkuRow,
  SkuSummary, StockRow, SupplierSummary, WeekPoint,
} from "./types";

const MIN_OWN_HISTORY_DAYS = 56;

function groupBy<T extends { sku: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.sku);
    if (list) list.push(r);
    else m.set(r.sku, [r]);
  }
  return m;
}

function weekly(series: DayPoint[]): WeekPoint[] {
  const out: WeekPoint[] = [];
  for (const p of series) {
    const week = weekStart(p.date);
    let w = out[out.length - 1];
    if (!w || w.week !== week) {
      w = { week, units: 0, onHand: 0, censoredDays: 0 };
      out.push(w);
    }
    w.units += p.units;
    w.onHand = p.onHand;
    if (p.censored) w.censoredDays++;
  }
  return out;
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Desconto médio (ponderado por unidades) praticado na janela da BF do ano anterior. */
function bfDiscount(sales: SaleRow[], sku: SkuRow, cfg: Config): { units: number; discountUnits: number } {
  const bf = cfg.campaigns.find((c) => c.id === "bf");
  if (!bf || sku.price <= 0) return { units: 0, discountUnits: 0 };
  let units = 0;
  let discountUnits = 0;
  for (const s of sales) {
    if (s.units <= 0 || !inRange(s.date, bf.lastYearStart, bf.lastYearEnd)) continue;
    units += s.units;
    discountUnits += s.units * Math.max(0, 1 - s.revenue / s.units / sku.price);
  }
  return { units, discountUnits };
}

interface Work {
  row: SkuRow;
  series: DayPoint[];
  sales: SaleRow[];
  model: DemandModel;
  lt: LeadTimeStats;
}

export function runPipeline(raw: RawDataset, cfg: Config, opts: { includeDaily?: boolean } = {}): Dataset {
  const { sales, removed } = dedupeSales(raw.sales);
  const salesBy = groupBy(sales.filter((s) => s.date <= cfg.referenceDate));
  const stockBy = groupBy<StockRow>(raw.stock.filter((s) => s.date <= cfg.referenceDate));
  const purchBy = groupBy<PurchaseRow>(raw.purchases);
  const lts = supplierLeadTimes(raw.purchases);
  // Fornecedor sem PO recebido usa o lead time de todos os POs.
  const globalLt = leadTimeStats(raw.purchases.filter((p) => p.receivedDate).map((p) => diffDays(p.orderDate, p.receivedDate!)));

  const work: Work[] = raw.skus.map((row) => {
    const skuSales = salesBy.get(row.sku) ?? [];
    const series = buildDailySeries(row.sku, stockBy.get(row.sku) ?? [], skuSales, purchBy.get(row.sku) ?? [], cfg.referenceDate);
    return { row, series, sales: skuSales, model: fitDemand(series, cfg), lt: lts[row.supplier] ?? globalLt };
  });

  // Fallback de categoria para quem não tem histórico próprio suficiente.
  const reliable = work.filter((w) => w.model.historyDays >= MIN_OWN_HISTORY_DAYS);
  const globalFb = categoryFallback(reliable.map((w) => w.model));
  const fbByCategory = new Map<string, ReturnType<typeof categoryFallback>>();
  for (const cat of new Set(work.map((w) => w.row.category))) {
    const models = reliable.filter((w) => w.row.category === cat).map((w) => w.model);
    fbByCategory.set(cat, models.length ? categoryFallback(models) : globalFb);
  }
  for (const w of work) {
    const fb = fbByCategory.get(w.row.category)!;
    const lift = { ...globalFb.campaignLift, ...fb.campaignLift };
    if (w.model.historyDays < MIN_OWN_HISTORY_DAYS) {
      w.model = { ...w.model, campaignLift: lift, trendMonthly: fb.trendMonthly, source: "category" };
    } else if (cfg.campaigns.some((c) => !(c.id in w.model.campaignLift) && c.id in lift)) {
      w.model = { ...w.model, campaignLift: { ...lift, ...w.model.campaignLift }, source: "category" };
    }
  }

  // Resposta a desconto por categoria (ver markdown.ts).
  const responseByCategory = new Map<string, number>();
  for (const cat of new Set(work.map((w) => w.row.category))) {
    const ws = work.filter((w) => w.row.category === cat);
    const lifts = ws.filter((w) => w.model.source === "sku" && "bf" in w.model.campaignLift).map((w) => w.model.campaignLift.bf);
    let units = 0;
    let discountUnits = 0;
    for (const w of ws) {
      const d = bfDiscount(w.sales, w.row, cfg);
      units += d.units;
      discountUnits += d.discountUnits;
    }
    const lift = lifts.length ? median(lifts) : (globalFb.campaignLift.bf ?? 1);
    responseByCategory.set(cat, priceResponse(lift, units ? discountUnits / units : 0, cfg));
  }

  const metricsBy = new Map<string, SkuMetrics>(work.map((w) => [w.row.sku, skuMetrics(w.series, w.model, w.row, cfg)]));
  const abc = abcClasses(Object.fromEntries(work.map((w) => [w.row.sku, metricsBy.get(w.row.sku)!.revenue12m])));

  const skus: SkuSummary[] = work.map((w) => {
    const { avgPrice12m, ...metrics } = metricsBy.get(w.row.sku)!;
    const lotUnits = w.row.moq * unitsPer(w.row.purchaseUnit);
    return {
      sku: w.row.sku,
      brand: w.row.brand,
      description: w.row.description,
      category: w.row.category,
      status: w.row.status,
      supplier: w.row.supplier,
      purchaseUnit: w.row.purchaseUnit,
      moq: w.row.moq,
      lotUnits,
      lotCost: lotUnits * w.row.unitCost,
      unitMargin: avgPrice12m - w.row.unitCost,
      onHand: metrics.onHand,
      onOrder: openOrders(w.row.sku, purchBy.get(w.row.sku) ?? [], w.lt, cfg.referenceDate),
      demand: w.model,
      abc: abc[w.row.sku],
      metrics,
      markdown:
        metrics.idleUnits > 0
          ? markdownOptions(
              {
                excessUnits: metrics.idleUnits,
                baseDaily: w.model.baseDaily,
                unitCost: w.row.unitCost,
                price: w.row.price,
                priceResponse: responseByCategory.get(w.row.category) ?? 0,
                discontinued: w.row.status === "descontinuado",
              },
              cfg,
            )
          : [],
      weekly: weekly(w.series),
    };
  });

  const names = new Map(raw.suppliers.map((s) => [s.supplier, s.name]));
  const supplierIds = [...new Set([...raw.suppliers.map((s) => s.supplier), ...skus.map((s) => s.supplier)])].sort();
  const suppliers: SupplierSummary[] = supplierIds.map((id) => {
    const mine = skus.filter((s) => s.supplier === id);
    const orders = mine.flatMap((s) => s.onOrder);
    return {
      supplier: id,
      name: names.get(id) ?? id,
      leadTime: lts[id] ?? globalLt,
      skuCount: mine.length,
      openOrders: orders.length,
      lateOrders: orders.filter((o) => o.late).length,
    };
  });

  const sum = (f: (s: SkuSummary) => number) => skus.reduce((acc, s) => acc + f(s), 0);
  const demand12m = sum((s) => s.metrics.demandUnits12m);
  const allOrders = skus.flatMap((s) => s.onOrder);
  const generatedAt = new Date().toISOString();
  const kpis = {
    stockValue: sum((s) => s.metrics.stockValue),
    idleValue: sum((s) => s.metrics.idleValue),
    lostRevenue12m: sum((s) => s.metrics.lostRevenue12m),
    fillRate12m: demand12m > 0 ? sum((s) => s.metrics.unitsSold12m) / demand12m : 1,
    skuCount: skus.length,
    activeCount: skus.filter((s) => s.status === "ativo").length,
    openPoCount: allOrders.length,
    latePoCount: allOrders.filter((o) => o.late).length,
    duplicatesRemoved: removed,
  };

  return {
    id: fnv1a(`${generatedAt}|${skus.length}|${sales.length}|${raw.stock.length}|${raw.purchases.length}`),
    generatedAt,
    config: cfg,
    skus,
    suppliers,
    kpis,
    ...(opts.includeDaily ? { daily: Object.fromEntries(work.map((w) => [w.row.sku, w.series])) } : {}),
  };
}

/** Versão enxuta para enviar ao agente: sem histórico semanal nem diário. */
export function stripForAgent(ds: Dataset): Dataset {
  const rest = { ...ds, skus: ds.skus.map((s) => ({ ...s, weekly: [] })) };
  delete rest.daily;
  return rest;
}
