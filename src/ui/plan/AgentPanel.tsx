"use client";

import { useEffect, useRef, useState } from "react";
import { BotIcon, Loader2Icon, RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { AgentResult } from "@/agent/run";
import type { AgentState } from "@/agent/session";
import { DEFAULT_REQUEST } from "@/agent/prompt";
import { stripForAgent } from "@/core/pipeline";
import type { Dataset } from "@/core/types";

const TOOL_LABEL: Record<string, string> = {
  resumo_plano: "Leu o resumo do plano",
  listar_casos_criticos: "Listou os casos críticos",
  consultar_sku: "Consultou um SKU",
  aplicar_ajustes: "Aplicou ajustes",
  alterar_quantidade: "Alterou quantidade",
  alterar_emissao: "Alterou data de emissão",
  remover_linha: "Removeu linha",
  adicionar_linha: "Adicionou linha",
  definir_nivel_servico: "Mudou nível de serviço",
  propor_liquidacao: "Propôs liquidação",
  aplicar_cenario: "Aplicou cenário",
  finalizar: "Finalizou a revisão",
};

interface Props {
  dataset: Dataset;
  state: AgentState;
  lastRun: { message: string; unverified: string[]; steps: { tool: string; ok: boolean }[] } | null;
  revised: boolean;
  autoStart: boolean;
  onResult(r: AgentResult): void;
  onReset(): void;
}

export function AgentPanel({ dataset, state, lastRun, revised, autoStart, onResult, onReset }: Props) {
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = async (text: string) => {
    setRunning(true);
    setError(null);
    setElapsed(0);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataset: dataset.source === "upload" ? stripForAgent(dataset) : undefined, state, message: text || DEFAULT_REQUEST }),
      });
      const r = (await res.json()) as AgentResult;
      if (!r.ok) setError(r.error ?? "Agente indisponível. Exibindo o plano atual.");
      onResult(r);
    } catch {
      setError("Não foi possível falar com o agente. O plano atual continua valendo.");
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (!autoStart || started.current) return;
    // Marca dentro do timeout: no modo estrito o efeito roda duas vezes e o primeiro timeout é cancelado.
    const t = setTimeout(() => {
      started.current = true;
      void run("");
    }, 0);
    return () => clearTimeout(t);
    // Dispara uma vez ao abrir com ?auto=1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const changes = state.changes;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BotIcon className="size-4" /> Revisão do agente
        </CardTitle>
        <CardDescription>
          O código monta o plano base; o agente julga os casos críticos (orçamento, lead time instável antes da campanha, POs atrasados) e só altera o plano por ferramentas que validam as regras.
        </CardDescription>
        {revised && !running && (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={onReset}>
              <RotateCcwIcon data-icon="inline-start" /> Voltar ao plano base
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            void run(message.trim());
          }}
        >
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`Pedido livre (opcional). Padrão: "${DEFAULT_REQUEST}"`}
            aria-label="Pedido ao agente"
            rows={2}
            maxLength={2000}
            className="min-h-0 flex-1"
            disabled={running}
          />
          <Button type="submit" disabled={running}>
            {running ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : <BotIcon data-icon="inline-start" />}
            {running ? `Revisando… ${elapsed}s` : revised ? "Pedir nova revisão" : "Pedir revisão ao agente"}
          </Button>
        </form>

        {running && <p className="text-sm text-muted-foreground">O agente está lendo o plano e os casos críticos. Costuma levar de 20 a 60 segundos.</p>}

        {error && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Agente indisponível</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {lastRun && !running && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/60 p-3 text-sm whitespace-pre-line">{lastRun.message}</div>
            {lastRun.unverified.length > 0 && (
              <Alert>
                <TriangleAlertIcon />
                <AlertTitle>Números não verificados</AlertTitle>
                <AlertDescription>
                  Estes números do resumo não vieram de nenhuma ferramenta e podem estar errados: {lastRun.unverified.join(", ")}.
                </AlertDescription>
              </Alert>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Passos do agente ({lastRun.steps.length})</summary>
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-muted-foreground">
                {lastRun.steps.map((s, i) => (
                  <li key={i}>
                    {TOOL_LABEL[s.tool] ?? s.tool}
                    {!s.ok && <span className="text-danger"> (recusado pela validação)</span>}
                  </li>
                ))}
              </ol>
            </details>
          </div>
        )}

        {changes.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">O que o agente mudou ({changes.length})</h3>
            <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
              {changes.map((c) => (
                <li key={c.id} className="space-y-1 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.sku}</span>
                    <Badge variant="secondary">{KIND_LABEL[c.kind] ?? c.kind}</Badge>
                  </div>
                  <div className="text-muted-foreground">
                    <span className="line-through decoration-muted-foreground/50">{c.before}</span> → <span className="text-foreground">{c.after}</span>
                  </div>
                  <div className="text-muted-foreground">{c.reason}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const KIND_LABEL: Record<string, string> = {
  quantity: "quantidade",
  emission: "data de emissão",
  remove: "linha removida",
  add: "linha adicionada",
  service_level: "nível de serviço",
  markdown: "liquidação",
  scenario: "cenário",
};
