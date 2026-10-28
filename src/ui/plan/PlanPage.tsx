"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BotIcon, DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgentResult } from "@/agent/run";
import type { AgentState } from "@/agent/session";
import { DEFAULT_REQUEST } from "@/agent/prompt";
import { stripForAgent } from "@/core/pipeline";
import { planToCsv } from "@/core/plan/export";
import { campaignStockouts } from "@/core/plan/risk";
import type { PlanLine } from "@/core/plan/allocate";
import { validatePlan } from "@/core/plan/validate";
import type { Config, Dataset, ISODate } from "@/core/types";
import { approvalsKey, applyEdits, loadApprovals, saveApprovals, type Decision, type LineEdit, type StoredApprovals } from "../approvals";
import { downloadCsv } from "../common/download";
import { LoadError, PageHeader } from "../common/PageState";
import { useDataset } from "../DatasetProvider";
import { brl, dateBR, intBR, pct } from "../format";
import { Meter, Stat } from "../kit";
import { firstCampaign } from "../overview";
import { useCompute } from "../useCompute";
import { AgentPanel, type AgentRun } from "./AgentPanel";
import { PlanTable } from "./PlanTable";
import { PromptBar } from "./PromptBar";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** SKUs A que ainda rompem antes da campanha com as linhas ativas. Conta pesada: roda depois do clique, só quando as linhas mudam. */
function useCampaignRisk(ds: Dataset | null, cfg: Config | null, lines: PlanLine[] | null, scope: string) {
  const key = lines ? `${scope}|${lines.map((l) => `${l.id}:${l.lots}:${l.emitBy}`).join(",")}` : null;
  const [result, setResult] = useState<{ key: string; skus: { sku: string; date: ISODate }[] } | null>(null);
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  });
  useEffect(() => {
    if (!key || !ds || !cfg) return;
    const t = setTimeout(() => {
      const current = linesRef.current;
      if (current) setResult({ key, skus: campaignStockouts(ds, cfg, current, "A") });
    }, 50);
    return () => clearTimeout(t);
  }, [key, ds, cfg]);
  return result && result.key === key ? result.skus : null;
}

export function PlanPage() {
  const { dataset: ds, config: cfg, error } = useDataset();
  const base = useCompute("basePlan", ds, cfg);
  const auto = useSearchParams().get("auto") === "1";
  const key = ds && cfg ? approvalsKey(ds.id, cfg) : null;

  const [store, setStore] = useState<StoredApprovals | null>(null);
  const [run, setRun] = useState<AgentRun>({ status: "idle" });
  const [onlyChanged, setOnlyChanged] = useState(false);
  const autoStarted = useRef(false);
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
  const lines = agentState && current ? applyEdits(agentState.plan.lines, current.edits, (sku) => bySku.get(sku)!) : null;
  const activeLines = lines && current ? lines.filter((l) => current.decisions[l.id] !== "rejected") : null;
  const risk = useCampaignRisk(ds, cfg, activeLines, key ?? "");

  const askAgent = async (text: string) => {
    if (!ds || !agentState || run.status === "running") return;
    setRun({ status: "running", started: Date.now() });
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataset: ds.source === "upload" ? stripForAgent(ds) : undefined, state: agentState, message: text || DEFAULT_REQUEST }),
      });
      const r = (await res.json()) as AgentResult;
      if (!r.ok) {
        setRun({ status: "error", message: r.error ?? "Agente indisponível. O plano atual continua valendo." });
        return;
      }
      update((a) => {
        // Linhas que o agente mexeu voltam a ficar pendentes, sem a edição manual antiga.
        const touched = new Set(r.state.changes.slice(agentState.changes.length).map((c) => c.lineId).filter((x): x is string => !!x));
        const edits = Object.fromEntries(Object.entries(a.edits).filter(([id]) => !touched.has(id)));
        const decisions = Object.fromEntries(Object.entries(a.decisions).filter(([id]) => !touched.has(id)));
        return { ...a, agentState: r.state, edits, decisions, agentRun: { message: r.message, unverified: r.unverified, steps: r.steps.map((s) => ({ tool: s.tool, ok: s.ok })) } };
      });
      setRun({ status: "idle" });
    } catch {
      setRun({ status: "error", message: "Não foi possível falar com o agente. O plano atual continua valendo." });
    }
  };

  // ?auto=1 (botão da Visão geral): revisa uma vez se ainda não há revisão salva.
  const canAuto = auto && !!agentState && !!current && !current.agentState;
  useEffect(() => {
    if (!canAuto || autoStarted.current) return;
    // Marca dentro do timeout: no modo estrito o efeito roda duas vezes e o primeiro timeout é cancelado.
    const t = setTimeout(() => {
      autoStarted.current = true;
      void askAgent("");
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAuto]);

  if (error) return <LoadError message={error} />;
  if (base.status === "error") return <LoadError title="Não foi possível montar o plano base" message={base.error} />;
  if (!ds || !cfg || !current || !agentState || !lines) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-12 w-80" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
        <p className="text-sm text-muted-foreground">Montando o plano base…</p>
      </div>
    );
  }

  const plan = agentState.plan;
  const decisions = current.decisions;
  const used = (activeLines ?? []).reduce((a, l) => a + l.cost, 0);
  const approved = lines.filter((l) => decisions[l.id] === "approved");
  const rejected = lines.filter((l) => decisions[l.id] === "rejected").length;
  const exportErrors = approved.length ? validatePlan(approved, ds, cfg, plan.budget) : [];
  const userTouched = Object.keys(current.edits).length > 0 || rejected > 0;
  const over = used > plan.budget + 0.005;
  const campaign = firstCampaign(cfg);

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
  const resetAgent = () => {
    setOnlyChanged(false);
    update((a) => ({ datasetId: a.datasetId, decisions: a.decisions, edits: a.edits }));
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Plano de compras" subtitle={`Emissões de ${dateBR(cfg.windowStart).slice(0, 5)} a ${dateBR(cfg.windowEnd)}. Aprove, edite ou recuse cada linha.`}>
        <Button variant="outline" size="lg" disabled={run.status === "running"} onClick={() => void askAgent("")}>
          <BotIcon data-icon="inline-start" /> {current.agentState ? "Refazer com o agente" : "Revisar com o agente"}
        </Button>
        <Button size="lg" disabled={approved.length === 0 || exportErrors.length > 0} onClick={() => downloadCsv(`pedidos-gostock-${cfg.referenceDate}.csv`, planToCsv(approved, ds))}>
          <DownloadIcon data-icon="inline-start" /> Exportar aprovados ({approved.length})
        </Button>
      </PageHeader>
      {exportErrors.length > 0 && <p className="-mt-3 text-sm text-danger-ink sm:text-right">Exportação bloqueada: {exportErrors[0].message}</p>}

      <section aria-label="Resumo do plano" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <Stat
          label="Orçamento usado"
          info="Soma dos pedidos não recusados. Recusar libera orçamento; editar muda o valor."
          value={
            <span>
              {brl(Math.round(used)).replace(/,00$/, "")} <span className="text-[15px] font-medium text-muted-foreground">de {brl(plan.budget, true)}</span>
            </span>
          }
          tone={over ? "danger" : "neutral"}
          note={over ? "Acima do orçamento: recuse ou reduza linhas." : `Restam ${brl(Math.max(0, plan.budget - used))}`}
        >
          <Meter value={used} max={plan.budget} tone={over ? "danger" : "ink"} className="my-1" label={`${pct(used / plan.budget, 0)} do orçamento usado`} />
        </Stat>
        <Stat label="Pedidos" value={intBR(lines.length)} note={`${intBR(approved.length)} aprovados · ${intBR(rejected)} recusados`} />
        <Stat
          label="Fill esperado"
          info={`Fração da demanda atendida até ${dateBR(cfg.windowEnd)} com este plano. É diferente do nível de serviço histórico da Visão geral.`}
          value={pct(plan.expectedFillRate)}
          note={
            userTouched ? (
              "calculado antes das suas edições e recusas"
            ) : (
              <>
                meta {pct(cfg.serviceTarget, 0)} ·{" "}
                <Link href="/" className="font-medium text-primary underline">
                  ver curva
                </Link>
              </>
            )
          }
        />
        <Stat
          label={`Rompem antes da ${campaign.id === "bf" ? "BF" : campaign.name}`}
          info={`SKUs da curva A que ainda zeram antes de ${dateBR(campaign.start)} com os pedidos não recusados deste plano (POs em aberto contam).`}
          value={risk === null ? "…" : `${intBR(risk.length)} SKU${risk.length === 1 ? "" : "s"} A`}
          tone={risk && risk.length > 0 ? "danger" : "neutral"}
          note={risk === null ? "calculando" : risk.length > 0 ? risk.map((r) => r.sku).join(", ") : "nenhum SKU A rompe antes"}
        />
      </section>

      <AgentPanel
        state={agentState}
        revised={!!current.agentState}
        run={run}
        lastRun={current.agentRun ?? null}
        onlyChanged={onlyChanged}
        onToggleOnlyChanged={() => setOnlyChanged((v) => !v)}
        onRun={() => void askAgent("")}
        onReset={resetAgent}
        onDismissError={() => setRun({ status: "idle" })}
      />

      <PlanTable
        lines={lines}
        dataset={ds}
        config={cfg}
        basePlan={agentState.basePlan}
        changes={agentState.changes}
        decisions={decisions}
        edits={current.edits}
        onlyChanged={onlyChanged}
        onOnlyChangedChange={setOnlyChanged}
        onDecide={decide}
        onEdit={edit}
      />

      <PromptBar disabled={run.status === "running"} onSend={(t) => void askAgent(t)} />
    </div>
  );
}
