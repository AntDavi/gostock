"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgentState } from "@/agent/session";
import type { AgentResult } from "@/agent/run";
import { planToCsv } from "@/core/plan/export";
import { validatePlan } from "@/core/plan/validate";
import { approvalsKey, applyEdits, loadApprovals, saveApprovals, type Decision, type LineEdit, type StoredApprovals } from "../approvals";
import { useDataset } from "../DatasetProvider";
import { brl, dateBR, pct } from "../format";
import { downloadCsv } from "../common/download";
import { useCompute } from "../useCompute";
import { AgentPanel } from "./AgentPanel";
import { PlanTable } from "./PlanTable";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function PlanPage() {
  const { dataset: ds, config: cfg, error } = useDataset();
  const base = useCompute("basePlan", ds, cfg);
  const auto = useSearchParams().get("auto") === "1";
  const key = ds && cfg ? approvalsKey(ds.id, cfg) : null;

  const [store, setStore] = useState<StoredApprovals | null>(null);
  const st = storage();
  const current: StoredApprovals | null = key ? (store?.datasetId === key ? store : st ? loadApprovals(st, key) : { datasetId: key, decisions: {}, edits: {} }) : null;

  const update = (fn: (a: StoredApprovals) => StoredApprovals) => {
    if (!current) return;
    const next = fn(current);
    setStore(next);
    const s = storage();
    if (s) saveApprovals(s, next);
  };

  const agentState: AgentState | null = current?.agentState ?? (base.status === "done" ? base.result : null);
  const bySku = new Map((ds?.skus ?? []).map((s) => [s.sku, s]));
  const lines = agentState && current ? applyEdits(agentState.plan.lines, current.edits, (sku) => bySku.get(sku)!) : [];

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Erro ao carregar os dados</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (base.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Não foi possível montar o plano base</AlertTitle>
        <AlertDescription>{base.error}</AlertDescription>
      </Alert>
    );
  }
  if (!ds || !cfg || !current || !agentState) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
        <p className="text-xs text-muted-foreground">Montando o plano base…</p>
      </div>
    );
  }

  const plan = agentState.plan;
  const decisions = current.decisions;
  const active = lines.filter((l) => decisions[l.id] !== "rejected");
  const used = active.reduce((a, l) => a + l.cost, 0);
  const approved = lines.filter((l) => decisions[l.id] === "approved");
  const approvedCost = approved.reduce((a, l) => a + l.cost, 0);
  const exportErrors = approved.length ? validatePlan(approved, ds, cfg, plan.budget) : [];
  const userTouched = Object.keys(current.edits).length > 0 || lines.some((l) => decisions[l.id] === "rejected");
  const pending = lines.filter((l) => !decisions[l.id]).length;

  const decide = (ids: string[], d: Decision | null) =>
    update((a) => {
      const next = { ...a.decisions };
      for (const id of ids) {
        if (d) next[id] = d;
        else delete next[id];
      }
      return { ...a, decisions: next };
    });
  const edit = (id: string, e: LineEdit) => update((a) => ({ ...a, edits: { ...a.edits, [id]: e } }));

  const onAgentResult = (r: AgentResult) =>
    update((a) => {
      if (!r.ok) return { ...a, agentRun: undefined };
      // Linhas que o agente mexeu voltam a ficar pendentes, sem a edição manual antiga.
      const touched = new Set(r.state.changes.slice(agentState.changes.length).map((c) => c.lineId).filter((x): x is string => !!x));
      const edits = Object.fromEntries(Object.entries(a.edits).filter(([id]) => !touched.has(id)));
      const dec = Object.fromEntries(Object.entries(a.decisions).filter(([id]) => !touched.has(id)));
      return { ...a, agentState: r.state, edits, decisions: dec, agentRun: { message: r.message, unverified: r.unverified, steps: r.steps.map((s) => ({ tool: s.tool, ok: s.ok })) } };
    });
  const resetAgent = () => update((a) => ({ datasetId: a.datasetId, decisions: a.decisions, edits: a.edits }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plano de compras</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos para emitir de {dateBR(cfg.windowStart)} a {dateBR(cfg.windowEnd)}. Aprove, edite ou recuse cada linha e exporte as aprovadas.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Button
            disabled={approved.length === 0 || exportErrors.length > 0}
            onClick={() => downloadCsv(`pedidos-gostock-${cfg.referenceDate}.csv`, planToCsv(approved, ds))}
          >
            <DownloadIcon data-icon="inline-start" /> Exportar {approved.length} aprovada{approved.length === 1 ? "" : "s"} (CSV)
          </Button>
          {exportErrors.length > 0 && <p className="max-w-xs text-xs text-danger">{exportErrors[0].message}</p>}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Orçamento usado</span>
              <span className="tabular-nums">
                <span className="font-medium">{brl(used)}</span> <span className="text-muted-foreground">de {brl(plan.budget)}</span>
              </span>
            </div>
            <Progress value={Math.min(100, (used / plan.budget) * 100)} aria-label="Orçamento usado" />
            <p className="text-xs text-muted-foreground">
              {lines.length} linhas · {approved.length} aprovadas ({brl(approvedCost, true)}) · {pending} pendentes
              {used > plan.budget + 0.005 && <span className="text-danger"> · acima do orçamento</span>}
            </p>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Fill esperado até {dateBR(cfg.windowEnd)}</div>
            <div className="text-2xl font-semibold tabular-nums">{pct(plan.expectedFillRate)}</div>
            <p className="text-xs text-muted-foreground">
              {userTouched ? "Calculado antes das suas edições e recusas." : current.agentState ? "Plano revisado pelo agente." : "Plano base, calculado pelo código."}
            </p>
          </div>
        </CardContent>
      </Card>

      <AgentPanel
        dataset={ds}
        state={agentState}
        lastRun={current.agentRun ?? null}
        revised={!!current.agentState}
        autoStart={auto && !current.agentState}
        onResult={onAgentResult}
        onReset={resetAgent}
      />

      <PlanTable lines={lines} dataset={ds} config={cfg} changes={agentState.changes} decisions={decisions} edits={current.edits} onDecide={decide} onEdit={edit} />
    </div>
  );
}
