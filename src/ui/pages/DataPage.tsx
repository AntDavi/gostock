"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2Icon, CircleIcon, Loader2Icon, LockIcon, RotateCcwIcon, UploadIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { defaultConfig, validateConfig } from "@/core/config";
import type { Config, CsvFiles } from "@/core/types";
import type { PipelineMessage } from "@/workers/pipeline.worker";
import { LoadError, PageHeader, PageSkeleton } from "../common/PageState";
import { ConfigForm, planPart } from "../ConfigForm";
import { useDataset } from "../DatasetProvider";
import { brl, dateBR, intBR } from "../format";

const FILES: { key: keyof CsvFiles; name: string }[] = [
  { key: "skus", name: "skus.csv" },
  { key: "vendas", name: "vendas_diarias.csv" },
  { key: "estoque", name: "estoque_diario.csv" },
  { key: "compras", name: "compras.csv" },
  { key: "fornecedores", name: "fornecedores.csv" },
];

type Run = { status: "idle" } | { status: "running"; step: string; started: number } | { status: "error"; errors: string[] } | { status: "done"; warnings: string[]; seconds: number };

export function DataPage() {
  const { dataset: ds, config: cfg, error, setConfig } = useDataset();
  // Fica fora do formulário, que remonta quando o dataset muda: o aviso de sucesso sobrevive ao upload.
  const [run, setRun] = useState<Run>({ status: "idle" });
  if (error) return <LoadError message={error} />;
  if (!ds || !cfg) return <PageSkeleton />;
  // Remonta o formulário quando muda o dataset ou a configuração aplicada.
  return <DataPageInner key={`${ds.id}:${JSON.stringify(cfg)}`} initial={cfg} onApply={setConfig} run={run} setRun={setRun} />;
}

function DataPageInner({ initial, onApply, run, setRun }: { initial: Config; onApply(c: Config): void; run: Run; setRun(r: Run): void }) {
  const { dataset: ds, config: cfg, setUploaded, resetToDefault } = useDataset();
  const [files, setFiles] = useState<Partial<Record<keyof CsvFiles, File>>>({});
  const [draft, setDraft] = useState<Config>(initial);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const workerRef = useRef<Worker | null>(null);
  if (!ds || !cfg) return null;

  const allFiles = FILES.every((f) => files[f.key]);
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
    setRun({ status: "running", step: "Lendo os arquivos", started: t0 });
    const texts = Object.fromEntries(await Promise.all(FILES.map(async (f) => [f.key, await files[f.key]!.text()] as const))) as unknown as CsvFiles;
    workerRef.current?.terminate();
    const worker = new Worker(new URL("../../workers/pipeline.worker.ts", import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<PipelineMessage>) => {
      const m = e.data;
      if (m.type === "progress") setRun({ status: "running", step: m.step, started: t0 });
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

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Dados em uso <Badge variant="outline">{ds.source === "upload" ? "upload" : "padrão"}</Badge>
          </CardTitle>
          <CardDescription>
            Referência {dateBR(cfg.referenceDate)} · {intBR(k.skuCount)} SKUs ({intBR(k.activeCount)} ativos) · estoque a custo {brl(k.stockValue, true)} · {intBR(k.openPoCount)} POs em aberto ·{" "}
            {intBR(k.duplicatesRemoved)} linhas de venda duplicadas removidas
          </CardDescription>
          {ds.source === "upload" && (
            <CardAction>
              <Button variant="outline" size="sm" onClick={resetToDefault}>
                <RotateCcwIcon data-icon="inline-start" /> Voltar aos dados padrão
              </Button>
            </CardAction>
          )}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enviar CSVs</CardTitle>
          <CardDescription>Os arquivos são processados no seu navegador e não são enviados a nenhum servidor. O agente recebe só o resumo por SKU.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="csv-all">Selecionar os cinco arquivos de uma vez</Label>
            <Input id="csv-all" type="file" accept=".csv,text/csv" multiple onChange={(e) => addFiles(e.target.files)} />
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {FILES.map((f) => {
              const file = files[f.key];
              return (
                <li key={f.key} className="grid gap-1.5 rounded-lg p-3 ring-1 ring-foreground/10">
                  <Label htmlFor={`csv-${f.key}`} className="flex items-center gap-1.5">
                    {file ? <CheckCircle2Icon className="size-4 text-foreground" /> : <CircleIcon className="size-4 text-muted-foreground" />}
                    {f.name}
                  </Label>
                  <Input id={`csv-${f.key}`} type="file" accept=".csv,text/csv" className="text-xs" onChange={(e) => e.target.files?.[0] && setFiles({ ...files, [f.key]: e.target.files[0] })} />
                  {file && <span className="text-xs text-muted-foreground">{(file.size / 1e6).toFixed(1)} MB</span>}
                </li>
              );
            })}
          </ul>
          {unmatched.length > 0 && <p className="text-sm text-danger">Arquivos com nome desconhecido, ignorados: {unmatched.join(", ")}. Use os nomes acima.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!allFiles || run.status === "running" || configErrors.length > 0} onClick={() => void process()}>
              {run.status === "running" ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
              Processar
            </Button>
            {!allFiles && <span className="text-sm text-muted-foreground">Faltam {FILES.filter((f) => !files[f.key]).map((f) => f.name).join(", ")}.</span>}
            {run.status === "running" && <span className="text-sm text-muted-foreground">{run.step}…</span>}
          </div>
          {run.status === "error" && (
            <Alert variant="destructive">
              <AlertTitle>Não foi possível processar os arquivos</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {run.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {run.status === "done" && (
            <Alert>
              <CheckCircle2Icon />
              <AlertTitle>Dados carregados em {String(run.seconds).replace(".", ",")} s</AlertTitle>
              <AlertDescription>
                <p>
                  Todas as telas agora usam os seus dados. <Link href="/" className="underline">Ver a visão geral</Link>. Os dados ficam só nesta aba: ao recarregar a página, voltam os dados padrão.
                </p>
                {run.warnings.length > 0 && (
                  <ul className="mt-1 list-disc pl-4">
                    {run.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuração</CardTitle>
          <CardDescription>Padrões dos parâmetros do desafio. Os campos do plano valem na hora; os de processamento valem no próximo envio de CSVs.</CardDescription>
          <CardAction>
            <Button variant="ghost" size="sm" onClick={() => setDraft(defaultConfig)}>
              Restaurar padrão
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <ConfigForm value={draft} onChange={setDraft} dataLocked={!pendingUpload} />
          {configErrors.length > 0 && (
            <ul className="space-y-1 text-sm text-danger" role="alert">
              {configErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!dirty || configErrors.length > 0} onClick={() => onApply(planPart(cfg, draft))}>
              Aplicar ao plano
            </Button>
            {!pendingUpload && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <LockIcon className="size-3" /> Processamento travado: selecione os CSVs para editar.
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
