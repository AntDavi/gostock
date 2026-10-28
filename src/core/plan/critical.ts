import { addDays } from "../dates";
import type { Config, Dataset, Scenario } from "../types";
import { leadTimeFor, serviceLevelFor, type Plan } from "./allocate";
import { simulateSku } from "./simulate";

export interface CriticalCase {
  kind: "budget_cut" | "leadtime_campaign" | "short_history" | "late_po" | "stockout_before_campaign";
  sku: string;
  detail: Record<string, number | string>;
}

/** Situações que pedem julgamento do agente sobre o plano base. */
export function findCriticalCases(plan: Plan, ds: Dataset, cfg: Config, sc: Scenario): CriticalCase[] {
  const out: CriticalCase[] = [];
  const firstCampaign = [...cfg.campaigns].sort((a, b) => (a.start < b.start ? -1 : 1))[0];

  for (const s of ds.skus) {
    if (s.status !== "ativo") continue;
    const lines = plan.lines.filter((l) => l.sku === s.sku);
    const unfunded = plan.unfunded.filter((l) => l.sku === s.sku);
    const lt = leadTimeFor(ds, s.supplier);

    if ((s.abc === "A" || s.abc === "B") && unfunded.length) {
      out.push({ kind: "budget_cut", sku: s.sku, detail: { abc: s.abc, unfundedLines: unfunded.length, unfundedCost: unfunded.reduce((a, l) => a + l.cost, 0) } });
    }

    for (const l of lines) {
      const c = cfg.campaigns.find((x) => l.arrival < x.start && addDays(l.emitBy, Math.round(lt.p90)) >= x.start);
      if (c) {
        out.push({ kind: "leadtime_campaign", sku: s.sku, detail: { lineId: l.id, emitBy: l.emitBy, arrival: l.arrival, arrivalP90: addDays(l.emitBy, Math.round(lt.p90)), campaign: c.name } });
        break;
      }
    }

    if (s.demand.source === "category" && lines.length) {
      out.push({ kind: "short_history", sku: s.sku, detail: { historyDays: s.demand.historyDays } });
    }

    const late = s.onOrder.filter((o) => o.late);
    if (late.length) out.push({ kind: "late_po", sku: s.sku, detail: { poId: late[0].poId, units: late[0].units, expectedDate: late[0].expectedDate } });

    if (firstCampaign) {
      const r = simulateSku(s, lt, serviceLevelFor(s, cfg, sc), cfg, sc, lines);
      if (r.stockoutDate && r.stockoutDate < firstCampaign.start) {
        out.push({ kind: "stockout_before_campaign", sku: s.sku, detail: { stockoutDate: r.stockoutDate, campaign: firstCampaign.name } });
      }
    }
  }
  return out;
}
