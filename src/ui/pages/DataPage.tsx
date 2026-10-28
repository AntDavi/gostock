"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2Icon, CircleIcon, Loader2Icon, RotateCcwIcon, UploadIcon, XCircleIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { defaultConfig, validateConfig } from "@/core/config";
import type { Config, CsvFiles } from "@/core/types";
import type { PipelineMessage } from "@/workers/pipeline.worker";
import { LoadError, PageHeader, PageSkeleton } from "../common/PageState";
import { ConfigForm, planPart } from "../ConfigForm";
import { useDataset } from "../DatasetProvider";
import { brl, dateBR, intBR } from "../format";
import { Notice, Section } from "../kit";

const FILES: { key: keyof CsvFiles; name: string }[] = [
  { key: "skus", name: "skus.csv" },
  { key: "vendas", name: "vendas_diarias.csv" },
  { key: "estoque", name: "estoque_diario.csv" },
  { key: "compras", name: "compras.csv" },
  { key: "fornecedores", name: "fornecedores.csv" },
];

type Run = { status: "idle" } | { status: "running"; step: string } | { status: "error"; errors: string[] } | { status: "done"; warnings: string[]; seconds: number };

export function DataPage() {
  const { dataset: ds, config: cfg, error, setConfig } = useDataset();
  // Fica fora do formulário, que remonta quando o dataset muda: o aviso de sucesso sobrevive ao upload.
  const [run, setRun] = useState<Run>({ status: "idle" });
  if (error) return <LoadError message={error} />;
  if (!ds || !cfg) return <PageSkeleton />;
  // Remonta o formulário quando muda o dataset ou a configuração aplicada.
  return <DataPageInner key={`${ds.id}:${JSON.stringify(cfg)}`} initial={cfg} onApply={setConfig} run={run} setRun={setRun} />;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function DataPageInner({ initial, onApply, run, setRun }: { initial: Config; onApply(c: Config): void; run: Run; setRun(r: Run): void }) {
  const { dataset: ds, config: cfg, setUploaded, resetToDefault } = useDataset();
  const [files, setFiles] = useState<Partial<Record<keyof CsvFiles, File>>>({});
  const [draft, setDraft] = useState<Config>(initial);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  if (!ds || !cfg) return null;

  const missing = FILES.filter((f) => !files[f.key]);
  const pendingUpload = Object.keys(files).length > 0;
  const configErrors = validateConfig(draft);
  const dirty = JSON.stringify(planPart(cfg, draft)) !== JSON.stringify(cfg);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = { ...files };
    const miss: string[] = [];
    for (const f of Array.from(list)) {
      const spec = FILES.find((x) => x.name === f.name.toLowerCase());
      if (spec) next[spec.key] = f;
      else miss.push(f.name);
    }
    setFiles(next);
    setUnmatched(miss);
  };

  const process = async () => {
    const t0 = Date.now();
    setRun({ status: "running", step: "Lendo os arquivos" });
    const texts = Object.fromEntries(await Promise.all(FILES.map(async (f) => [f.key, await files[f.key]!.text()] as const))) as unknown as CsvFiles;
    workerRef.current?.terminate();
    const worker = new Worker(new URL("../../workers/pipeline.worker.ts", import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<PipelineMessage>) => {
      const m = e.data;
      if (m.type === "progress") setRun({ status: "running", step: m.step });
      else {
        worker.terminate();
        if (m.type === "error") setRun({ status: "error", errors: m.errors });
        else {
          setUploaded(m.dataset);
          setRun({ status: "done", warnings: m.warnings, seconds: Math.round((Date.now() - t0) / 100) / 10 });
          setFiles({});
        }
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      setRun({ status: "error", errors: [`Falha no processamento: ${e.message}`] });
    };
    worker.postMessage({ files: texts, config: draft });
  };

  const k = ds.kpis;
  return (
    <div className="space-y-6">
      <PageHeader title="Dados e configuração" subtitle="Envie os CSVs do seu estoque ou ajuste os parâmetros do plano." />

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.15fr]">
        <div className="space-y-4">
          <Section
            title={
              <span className="flex items-center gap-2">
                Dados em uso <Badge variant="secondary">{ds.source === "upload" ? "enviados" : "padrão"}</Badge>
              </span>
            }
            actions={
              ds.source === "upload" ? (
                <Button variant="outline" size="sm" onClick={resetToDefault}>
                  <RotateCcwIcon data-icon="inline-start" /> Voltar ao padrão
                </Button>
              ) : undefined
            }
          >
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Fact label="Referência" value={dateBR(cfg.referenceDate)} />
              <Fact label="SKUs" value={`${intBR(k.skuCount)} (${intBR(k.activeCount)} ativos)`} />
              <Fact label="Estoque a custo" value={brl(k.stockValue, true)} />
              <Fact label="POs em aberto" value={intBR(k.openPoCount)} />
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">{intBR(k.duplicatesRemoved)} linhas de venda duplicadas removidas</p>
          </Section>

          <Section title="Enviar CSVs" description="Processados no navegador, sem envio a servidor. O agente recebe só o resumo por SKU.">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={cn("rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors", dragging ? "border-primary bg-accent/60" : "border-input bg-surface")}
            >
              <UploadIcon className="mx-auto mb-2 size-5 text-muted-foreground" aria-hidden />
              <p className="font-semibold">Arraste os cinco arquivos aqui</p>
              <p className="text-sm text-muted-foreground">
                ou{" "}
                <button type="button" onClick={() => inputRef.current?.click()} className="font-medium text-primary underline">
                  escolha do computador
                </button>
              </p>
              <input ref={inputRef} type="file" accept=".csv,text/csv" multiple className="sr-only" aria-label="Escolher arquivos CSV" onChange={(e) => addFiles(e.target.files)} />
            </div>
            <ul className="mt-3 space-y-1.5">
              {FILES.map((f) => {
                const file = files[f.key];
                return (
                  <li key={f.key} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      {file ? <CheckCircle2Icon className="size-4 text-foreground" /> : <CircleIcon className="size-4 text-muted-foreground" />}
                      {f.name}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{file ? `${(file.size / 1e6).toFixed(1).replace(".", ",")} MB` : "faltando"}</span>
                  </li>
                );
              })}
            </ul>
            {unmatched.length > 0 && <p className="mt-2 text-sm text-danger-ink">Nome desconhecido, ignorado: {unmatched.join(", ")}. Use os nomes da lista.</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="lg" disabled={missing.length > 0 || run.status === "running" || configErrors.length > 0} onClick={() => void process()}>
                {run.status === "running" ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
                Processar
              </Button>
              <span className="text-sm text-muted-foreground" aria-live="polite">
                {run.status === "running" ? `${run.step}…` : missing.length > 0 ? `Envie os ${FILES.length} arquivos para liberar (faltam ${missing.length})` : "Pronto para processar"}
              </span>
            </div>
            {run.status === "error" && (
              <div className="mt-4">
                <Notice tone="danger">
                  <p className="font-semibold">Não foi possível processar os arquivos</p>
                  <ul className="mt-1 list-disc pl-4">
                    {run.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </Notice>
              </div>
            )}
            {run.status === "done" && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-secondary/70 px-4 py-3 text-sm">
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-semibold">Dados carregados em {String(run.seconds).replace(".", ",")} s</p>
                  <p className="text-foreground/80">
                    Todas as telas usam os seus dados.{" "}
                    <Link href="/" className="font-medium text-primary underline">
                      Ver a visão geral
                    </Link>
                    . Os dados ficam só nesta aba: ao recarregar a página, voltam os dados padrão.
                  </p>
                  {run.warnings.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-foreground/80">
                      {run.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </Section>
        </div>

        <Section
          title="Configuração"
          description="Plano e metas valem na hora. Processamento vale no próximo envio de CSVs."
          actions={
            <Button variant="ghost" size="sm" onClick={() => setDraft(defaultConfig)} className="text-primary">
              Restaurar padrão
            </Button>
          }
        >
          <ConfigForm value={draft} onChange={setDraft} dataLocked={!pendingUpload} />
        </Section>
      </div>

      <div className="sticky bottom-0 z-30 -mx-4 -mb-6 flex flex-wrap items-center gap-3 border-t bg-card px-4 py-3 sm:-mx-8 sm:-mb-10 sm:px-8">
        <Button size="lg" disabled={!dirty || configErrors.length > 0} onClick={() => onApply(planPart(cfg, draft))}>
          Aplicar ao plano
        </Button>
        {configErrors.length > 0 ? (
          <span className="flex items-center gap-1.5 text-sm text-danger-ink" role="alert">
            <XCircleIcon className="size-4 shrink-0" /> {configErrors[0]}
            {configErrors.length > 1 && ` (+${configErrors.length - 1})`}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{dirty ? "Há mudanças no plano para aplicar." : pendingUpload ? "Campos de processamento valem ao clicar em Processar." : "Campos de processamento ficam travados até enviar os CSVs."}</span>
        )}
      </div>
    </div>
  );
}
