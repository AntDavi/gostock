import { addDays, diffDays, inRange } from "./dates";
import { mean, median, std } from "./stats";
import type { Config, DayPoint, DemandModel, ISODate, Scenario } from "./types";

const CENSOR_WINDOW = 14;
const BASE_DAYS = 56;
const MIN_BASE_DAYS = 14;
const PRE_CAMPAIGN_DAYS = 28;
const TREND_WEEKS = 26;
const MIN_TREND_WEEKS = 8;
const MAX_TREND = 0.05;
const LIFT_MIN = 1;
const LIFT_MAX = 6;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function inAnyCampaign(d: ISODate, cfg: Config): boolean {
  return cfg.campaigns.some((c) => inRange(d, c.lastYearStart, c.lastYearEnd) || inRange(d, c.start, c.end));
}

/**
 * Demanda estimada por dia. Em dia censurado (estoque zerado), a venda observada não é demanda:
 * usa a média dos dias não censurados em ±14 dias (ou de toda a série), nunca abaixo do observado.
 */
export function uncensoredDemand(series: DayPoint[]): number[] {
  const clean = series.filter((p) => !p.censored).map((p) => p.units);
  const overall = mean(clean);
  return series.map((p, i) => {
    if (!p.censored) return p.units;
    const near: number[] = [];
    for (let j = Math.max(0, i - CENSOR_WINDOW); j <= Math.min(series.length - 1, i + CENSOR_WINDOW); j++) {
      if (!series[j].censored) near.push(series[j].units);
    }
    return Math.max(p.units, near.length ? mean(near) : overall);
  });
}

function linearSlope(ys: number[]): number {
  const xs = ys.map((_, i) => i);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < ys.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? num / den : 0;
}

function trendMonthly(series: DayPoint[], demand: number[], cfg: Config): number {
  const weeks: number[] = [];
  // blocos de 7 dias contados para trás a partir da referência
  for (let w = 0; w < TREND_WEEKS; w++) {
    const end = addDays(cfg.referenceDate, -7 * w);
    const start = addDays(end, -6);
    const idx = series.map((p, i) => (inRange(p.date, start, end) ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 7) break;
    if (idx.some((i) => inAnyCampaign(series[i].date, cfg))) continue;
    weeks.unshift(idx.reduce((s, i) => s + demand[i], 0));
  }
  if (weeks.length < MIN_TREND_WEEKS) return 0;
  const m = mean(weeks);
  if (m <= 0) return 0;
  return clamp((linearSlope(weeks) / m) * (30 / 7), -MAX_TREND, MAX_TREND);
}

function campaignLifts(series: DayPoint[], demand: number[], cfg: Config): Record<string, number> {
  const byDate = new Map<ISODate, number>();
  series.forEach((p, i) => byDate.set(p.date, demand[i]));
  const lifts: Record<string, number> = {};
  for (const c of cfg.campaigns) {
    const len = diffDays(c.lastYearStart, c.lastYearEnd) + 1;
    const during: number[] = [];
    for (let k = 0; k < len; k++) {
      const v = byDate.get(addDays(c.lastYearStart, k));
      if (v !== undefined) during.push(v);
    }
    if (during.length < len) continue;
    const pre: number[] = [];
    for (let k = 1; k <= PRE_CAMPAIGN_DAYS; k++) {
      const d = addDays(c.lastYearStart, -k);
      const v = byDate.get(d);
      if (v !== undefined && !inAnyCampaign(d, cfg)) pre.push(v);
    }
    const preMean = mean(pre);
    if (pre.length < MIN_BASE_DAYS || preMean <= 0) continue;
    lifts[c.id] = clamp(mean(during) / preMean, LIFT_MIN, LIFT_MAX);
  }
  return lifts;
}

export function fitDemand(series: DayPoint[], cfg: Config): DemandModel {
  const demand = uncensoredDemand(series);
  const from = addDays(cfg.referenceDate, -(BASE_DAYS - 1));
  const recent: number[] = [];
  const allDays: number[] = [];
  let recentClean = 0;
  series.forEach((p, i) => {
    if (p.date > cfg.referenceDate || inAnyCampaign(p.date, cfg)) return;
    allDays.push(demand[i]);
    if (p.date < from) return;
    recent.push(demand[i]);
    if (!p.censored) recentClean++;
  });
  const baseDays = recentClean >= MIN_BASE_DAYS ? recent : allDays;
  return {
    baseDaily: mean(baseDays),
    sigmaDaily: std(baseDays),
    trendMonthly: trendMonthly(series, demand, cfg),
    campaignLift: campaignLifts(series, demand, cfg),
    historyDays: series.length,
    source: "sku",
  };
}

/** Mediana por campanha dos lifts disponíveis e da tendência, para SKUs com histórico insuficiente. */
export function categoryFallback(models: DemandModel[]): Pick<DemandModel, "campaignLift" | "trendMonthly"> {
  const ids = new Set(models.flatMap((m) => Object.keys(m.campaignLift)));
  const campaignLift: Record<string, number> = {};
  for (const id of ids) {
    campaignLift[id] = median(models.filter((m) => id in m.campaignLift).map((m) => m.campaignLift[id]));
  }
  return { campaignLift, trendMonthly: median(models.map((m) => m.trendMonthly)) };
}

export function forecastDaily(m: DemandModel, date: ISODate, cfg: Config, sc: Scenario): number {
  let f = m.baseDaily * (1 + m.trendMonthly) ** (diffDays(cfg.referenceDate, date) / 30);
  const c = cfg.campaigns.find((x) => inRange(date, x.start, x.end));
  if (c && c.id in m.campaignLift) f *= 1 + (m.campaignLift[c.id] - 1) * (sc.campaignMultiplier[c.id] ?? 1);
  return f;
}
