import { addDays, inRange } from "./dates";
import { forecastDaily, uncensoredDemand } from "./demand";
import { defaultScenario, type Config, type DayPoint, type DemandModel, type SkuMetrics, type SkuRow } from "./types";

export const NO_DEMAND_COVERAGE = 9999;

/** Média da previsão diária nos 30 dias após a referência (cenário padrão). */
export function avgForecast30(model: DemandModel, cfg: Config): number {
  let s = 0;
  for (let k = 1; k <= 30; k++) s += forecastDaily(model, addDays(cfg.referenceDate, k), cfg, defaultScenario);
  return s / 30;
}

export function skuMetrics(series: DayPoint[], model: DemandModel, sku: SkuRow, cfg: Config): SkuMetrics {
  const last = series.length ? series[series.length - 1] : null;
  const onHand = last ? last.onHand : 0;
  const daily = avgForecast30(model, cfg);
  const coverageDays = daily > 0 ? Math.min(NO_DEMAND_COVERAGE, Math.round(onHand / daily)) : NO_DEMAND_COVERAGE;
  const idleUnits = sku.status === "descontinuado" ? onHand : Math.max(0, onHand - cfg.idleCoverageDays * daily);

  const demand = uncensoredDemand(series);
  const from = addDays(cfg.referenceDate, -364);
  let units = 0;
  let revenue = 0;
  let demanded = 0;
  let lost = 0;
  series.forEach((p, i) => {
    if (!inRange(p.date, from, cfg.referenceDate)) return;
    units += p.units;
    revenue += p.revenue;
    demanded += demand[i];
    if (p.censored) lost += demand[i] - p.units;
  });
  const avgPrice12m = units > 0 ? revenue / units : sku.price;

  return {
    onHand,
    stockValue: onHand * sku.unitCost,
    coverageDays,
    idleUnits,
    idleValue: idleUnits * sku.unitCost,
    lostUnits12m: lost,
    lostRevenue12m: lost * avgPrice12m,
    fillRate12m: demanded > 0 ? units / demanded : 1,
    revenue12m: revenue,
    unitsSold12m: units,
    demandUnits12m: demanded,
    avgPrice12m,
  };
}

/** Curva ABC pela receita acumulada: A até 80%, B até 95%, C o resto. */
export function abcClasses(revenueBySku: Record<string, number>): Record<string, "A" | "B" | "C"> {
  const total = Object.values(revenueBySku).reduce((s, v) => s + v, 0);
  const out: Record<string, "A" | "B" | "C"> = {};
  let cum = 0;
  for (const [sku, rev] of Object.entries(revenueBySku).sort((a, b) => b[1] - a[1])) {
    const before = total > 0 ? cum / total : 1;
    out[sku] = before < 0.8 ? "A" : before < 0.95 ? "B" : "C";
    cum += rev;
  }
  return out;
}
