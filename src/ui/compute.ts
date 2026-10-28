import { createSession, stateOf, type AgentState } from "@/agent/session";
import type { Config, Dataset } from "@/core/types";
import { computeOverview, type Overview } from "./overview";

/** Cálculos pesados que rodam no Web Worker. */
export interface ComputeResults { overview: Overview; basePlan: AgentState }
export type ComputeKind = keyof ComputeResults;
export interface ComputeRequest { kind: ComputeKind; dataset: Dataset; config: Config }

export function computeTask(req: ComputeRequest): ComputeResults[ComputeKind] {
  if (req.kind === "overview") return computeOverview(req.dataset, req.config);
  return stateOf(createSession(req.dataset, { config: req.config }));
}
