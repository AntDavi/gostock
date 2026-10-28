import { addDays, diffDays } from "@/core/dates";
import type { PlanLine } from "@/core/plan/allocate";
import type { ISODate } from "@/core/types";
import type { AgentState } from "@/agent/session";

export type Decision = "approved" | "rejected";
export interface LineEdit { lots: number; emitBy: ISODate }
export interface StoredApprovals {
  datasetId: string;
  decisions: Record<string, Decision>;
  edits: Record<string, LineEdit>;
  agentState?: AgentState;
  /** Última resposta do agente, para reexibir depois de recarregar a página. */
  agentRun?: { message: string; unverified: string[]; steps: { tool: string; ok: boolean }[] };
}

const KEY = "gostock:approvals";
const empty = (datasetId: string): StoredApprovals => ({ datasetId, decisions: {}, edits: {} });
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Vazio se ausente, corrompido, de outro dataset ou se o storage estiver bloqueado. */
export function loadApprovals(storage: Pick<Storage, "getItem">, datasetId: string): StoredApprovals {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return empty(datasetId);
    const v = JSON.parse(raw) as unknown;
    if (!isRecord(v) || v.datasetId !== datasetId || !isRecord(v.decisions) || !isRecord(v.edits)) return empty(datasetId);
    return v as unknown as StoredApprovals;
  } catch {
    return empty(datasetId);
  }
}

export function saveApprovals(storage: Pick<Storage, "setItem">, a: StoredApprovals): void {
  try {
    storage.setItem(KEY, JSON.stringify(a));
  } catch {
    // storage cheio ou bloqueado: as decisões valem só nesta sessão
  }
}

/** Aplica as edições do usuário; a chegada acompanha a mudança de data (mesmo lead time da linha). */
export function applyEdits(lines: PlanLine[], edits: Record<string, LineEdit>, lot: (sku: string) => { lotUnits: number; lotCost: number }): PlanLine[] {
  return lines.map((l) => {
    const e = edits[l.id];
    if (!e) return l;
    const { lotUnits, lotCost } = lot(l.sku);
    return { ...l, lots: e.lots, units: e.lots * lotUnits, cost: e.lots * lotCost, emitBy: e.emitBy, arrival: addDays(e.emitBy, diffDays(l.emitBy, l.arrival)) };
  });
}

/** Identifica dataset + configuração: aprovações de outra configuração não valem. */
export function approvalsKey(datasetId: string, config: unknown): string {
  const text = JSON.stringify(config);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${datasetId}:${(h >>> 0).toString(36)}`;
}

/** Aprovações e estado do agente salvos para este dataset + configuração (null fora do navegador). */
export function readStoredApprovals(datasetId: string, config: unknown): StoredApprovals | null {
  try {
    if (typeof window === "undefined") return null;
    return loadApprovals(window.localStorage, approvalsKey(datasetId, config));
  } catch {
    return null;
  }
}
