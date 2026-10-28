import { buildBasePlan, fillFromLosses, leadTimeFor, skuLoss, type Plan, type PlanLine } from "@/core/plan/allocate";
import { effectiveBudget, type MarkdownSuggestion } from "@/core/plan/curve";
import { defaultScenario, type Config, type Dataset, type Scenario } from "@/core/types";

export interface Change {
  id: string;
  kind: "quantity" | "emission" | "remove" | "add" | "service_level" | "markdown" | "scenario";
  sku: string;
  lineId?: string;
  before: string;
  after: string;
  reason: string;
}

export interface AgentState {
  config: Config;
  scenario: Scenario;
  plan: Plan;
  basePlan: Plan;
  changes: Change[];
  markdowns: MarkdownSuggestion[];
}

/** Estado do agente + o dataset e o registro das saídas de ferramenta (usado pela guarda de números). */
export interface AgentSession extends AgentState {
  ds: Dataset;
  toolLog: string[];
}

export function basePlanFor(ds: Dataset, config: Config, scenario: Scenario): Plan {
  return buildBasePlan(ds, config, { ...scenario, budget: effectiveBudget(ds, config, scenario) });
}

export function createSession(ds: Dataset, state: Partial<AgentState> = {}): AgentSession {
  const config = state.config ?? ds.config;
  const scenario = state.scenario ?? defaultScenario;
  const basePlan = state.basePlan ?? basePlanFor(ds, config, scenario);
  return {
    ds,
    config,
    scenario,
    basePlan,
    plan: state.plan ?? basePlan,
    changes: state.changes ?? [],
    markdowns: state.markdowns ?? [],
    toolLog: [],
  };
}

export function stateOf(s: AgentSession): AgentState {
  return { config: s.config, scenario: s.scenario, plan: s.plan, basePlan: s.basePlan, changes: s.changes, markdowns: s.markdowns };
}

const byDate = (a: PlanLine, b: PlanLine) => (a.emitBy === b.emitBy ? a.sku.localeCompare(b.sku) || a.seq - b.seq : a.emitBy < b.emitBy ? -1 : 1);

/**
 * Substitui as linhas de um SKU no plano e atualiza custo e fill só com a diferença desse SKU.
 */
export function replaceSkuLines(s: AgentSession, sku: string, lines: PlanLine[], level?: number): Plan {
  const summary = s.ds.skus.find((x) => x.sku === sku)!;
  const oldLines = s.plan.lines.filter((l) => l.sku === sku);
  const before = skuLoss(s.ds, summary, oldLines, s.config, s.scenario);
  const after = skuLoss(s.ds, summary, lines, s.config, s.scenario);
  const rawLost = s.plan.lostUnits - before.lost + after.lost;
  const all = [...s.plan.lines.filter((l) => l.sku !== sku), ...lines].sort(byDate);
  return {
    ...s.plan,
    lines: all,
    totalCost: all.reduce((a, l) => a + l.cost, 0),
    ...fillFromLosses(s.plan.demandUnits, Math.max(0, rawLost)),
    levels: level === undefined ? s.plan.levels : { ...s.plan.levels, [sku]: level },
  };
}

export { leadTimeFor };
