"use client";

import { useEffect, useState } from "react";
import { BotIcon, ChevronDownIcon, Loader2Icon, RotateCcwIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentState } from "@/agent/session";
import { DEFAULT_REQUEST } from "@/agent/prompt";
import { summarizeChanges } from "@/core/plan/risk";
import { Notice } from "../kit";

export type AgentRun = { status: "idle" } | { status: "running"; started: number; request: string } | { status: "error"; message: string };

const TOOL_LABEL: Record<string, string> = {
  resumo_plano: "Leu o resumo do plano",
  listar_casos_criticos: "Listou os casos críticos",
  consultar_sku: "Consultou um SKU",
  aplicar_ajustes: "Aplicou ajustes em lote",
  alterar_quantidade: "Alterou quantidade",
  alterar_emissao: "Alterou data de emissão",
  remover_linha: "Removeu linha",
  adicionar_linha: "Adicionou linha",
  definir_nivel_servico: "Mudou nível de serviço",
  propor_liquidacao: "Propôs liquidação",
  aplicar_cenario: "Aplicou cenário",
  finalizar: "Finalizou a revisão",
};

const KIND_LABEL: Record<string, string> = {
  quantity: "quantidade",
  emission: "data de emissão",
  remove: "linha removida",
  add: "linha adicionada",
  service_level: "nível de serviço",
  markdown: "liquidação",
  scenario: "cenário",
};

interface Props {
  state: AgentState;
  revised: boolean;
  run: AgentRun;
  lastRun: { request?: string; message: string; unverified: string[]; steps: { tool: string; ok: boolean }[] } | null;
  onlyChanged: boolean;
  onToggleOnlyChanged(): void;
  onRun(): void;
  onReset(): void;
  onDismissError(): void;
}

function Elapsed({ started }: { started: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{Math.max(0, Math.round((now - started) / 1000))} s</>;
}

/** Revisão do agente: o que fez (resumo gerado pelo código), antes → depois de cada mudança e os estados da chamada. */
export function AgentPanel({ state, revised, run, lastRun, onlyChanged, onToggleOnlyChanged, onRun, onReset, onDismissError }: Props) {
  const [open, setOpen] = useState(false);
  const changes = state.changes;
  const partial = lastRun?.message.startsWith("Revisão parcial");

  return (
    <section aria-label="Revisão do agente" aria-live="polite" className="rounded-2xl bg-accent/60 ring-1 ring-primary/10">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground" aria-hidden>
          {run.status === "running" ? <Loader2Icon className="size-5 animate-spin" /> : <BotIcon className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          {run.status === "running" ? (
            <>
              <h2 className="font-semibold">
                {run.request === DEFAULT_REQUEST ? "O agente está revisando o plano…" : "O agente está trabalhando no seu pedido…"} <Elapsed started={run.started} />
              </h2>
              <p className="text-sm text-foreground/75">
                {run.request === DEFAULT_REQUEST ? "Revisando os casos críticos." : <>Pedido: “{run.request}”.</>} Ele só altera o plano por ferramentas que validam as regras. Costuma levar de 20 a 60
                segundos; a tabela continua disponível.
              </p>
            </>
          ) : revised ? (
            <>
              <h2 className="font-semibold">
                O agente revisou o plano base e fez {changes.length} {changes.length === 1 ? "mudança" : "mudanças"}
              </h2>
              <p className="text-sm text-foreground/75">{changes.length ? `${summarizeChanges(changes)[0].toUpperCase()}${summarizeChanges(changes).slice(1)}.` : "Nenhuma linha precisou mudar."}</p>
            </>
          ) : (
            <>
              <h2 className="font-semibold">Plano base montado pelo código</h2>
              <p className="text-sm text-foreground/75">
                Clique em revisar e o agente ajusta os casos críticos (lead time instável antes da campanha, POs atrasados, SKUs A sem cobertura). Ou escreva um pedido na barra do rodapé. Toda
                mudança passa pelo validador e aparece aqui com antes → depois.
              </p>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {revised && run.status !== "running" && changes.some((c) => c.lineId) && (
            <Button variant="outline" aria-pressed={onlyChanged} onClick={onToggleOnlyChanged} className="bg-card">
              {onlyChanged ? "Mostrar todas" : "Ver só alteradas"}
            </Button>
          )}
          {revised && run.status !== "running" && (
            <Button variant="outline" onClick={onRun} className="bg-card">
              <BotIcon data-icon="inline-start" /> Refazer revisão
            </Button>
          )}
          {revised && run.status !== "running" && (
            <Button variant="ghost" onClick={onReset}>
              <RotateCcwIcon data-icon="inline-start" /> Voltar ao plano base
            </Button>
          )}
          {!revised && run.status !== "running" && (
            <Button onClick={onRun}>
              <BotIcon data-icon="inline-start" /> Revisar com o agente
            </Button>
          )}
        </div>
      </div>

      {run.status === "error" && (
        <div className="px-5 pb-5">
          <Notice tone="danger">
            <div className="flex items-start justify-between gap-3">
              <span>
                <strong className="font-semibold">Agente indisponível.</strong> {run.message} O plano na tabela continua valendo.
              </span>
              <button type="button" onClick={onDismissError} aria-label="Fechar aviso" className="rounded p-0.5 hover:bg-danger/10">
                <XIcon className="size-4" />
              </button>
            </div>
          </Notice>
        </div>
      )}

      {revised && lastRun && run.status !== "running" && (
        <div className="space-y-3 px-5 pb-5">
          {lastRun.request && lastRun.request !== DEFAULT_REQUEST && (
            <p className="text-sm">
              <span className="text-muted-foreground">Você pediu:</span> “{lastRun.request}”
            </p>
          )}
          {partial && <Notice tone="warn">A revisão foi interrompida no meio. Os ajustes já passaram pelo validador e foram mantidos.</Notice>}
          <div className="rounded-xl bg-card p-4 text-sm whitespace-pre-line">{lastRun.message}</div>
          {lastRun.unverified.length > 0 && (
            <Notice tone="warn">
              <strong className="font-semibold">Números não verificados:</strong> {lastRun.unverified.join(", ")}. Não vieram de nenhuma ferramenta e podem estar errados.
            </Notice>
          )}
        </div>
      )}

      {revised && lastRun && run.status !== "running" && (
        <div className="border-t border-primary/10">
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium hover:bg-accent">
            Mudanças com antes → depois e passos do agente ({changes.length})
            <ChevronDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <div className="space-y-4 px-5 pb-5">
              {changes.length > 0 && (
                <ul className="divide-y divide-hairline overflow-hidden rounded-xl bg-card">
                  {changes.map((c) => (
                    <li key={c.id} className="space-y-1 p-3.5 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{c.sku}</span>
                        <Badge variant="agent">{KIND_LABEL[c.kind] ?? c.kind}</Badge>
                      </div>
                      <div className="text-muted-foreground">
                        <span className="line-through decoration-muted-foreground/60">{c.before}</span> → <span className="text-foreground">{c.after}</span>
                      </div>
                      <div className="text-foreground/80">{c.reason}</div>
                    </li>
                  ))}
                </ul>
              )}
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Passos do agente ({lastRun.steps.length})</summary>
                <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-muted-foreground">
                  {lastRun.steps.map((s, i) => (
                    <li key={i}>
                      {TOOL_LABEL[s.tool] ?? s.tool}
                      {!s.ok && (
                        <span className="text-danger-ink">
                          {" "}
                          <TriangleAlertIcon className="inline size-3.5" /> recusado pela validação
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </details>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
