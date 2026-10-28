import { createSession, stateOf, type AgentState } from "@/agent/session";
import type { Config, Dataset, ISODate } from "@/core/types";
import { computeOverview, computeStockouts, type Overview } from "./overview";

/** Cálculos pesados que rodam no Web Worker. */
export interface ComputeResults { overview: Overview; basePlan: AgentState; stockouts: Record<string, ISODate | null> }
export type ComputeKind = keyof ComputeResults;
export interface ComputeRequest { kind: ComputeKind; dataset: Dataset; config: Config }

export function computeTask(req: ComputeRequest): ComputeResults[ComputeKind] {
  if (req.kind === "overview") return computeOverview(req.dataset, req.config);
  if (req.kind === "stockouts") return computeStockouts(req.dataset, req.config);
  return stateOf(createSession(req.dataset, { config: req.config }));
}
