"use client";

import { useState } from "react";
import Link from "next/link";
import { DownloadIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readStoredApprovals } from "../approvals";
import { downloadCsv } from "../common/download";
import { LoadError, PageHeader, PageSkeleton } from "../common/PageState";
import { useDataset } from "../DatasetProvider";
import { brl, intBR, pct } from "../format";
import { InfoTip, Meter, Notice, Pills, ShowMore, Stat } from "../kit";
import { markdownRows, markdownToCsv } from "../inventory";

const NO_DEMAND = 9999;
const PAGE = 25;
type Tab = "all" | "ativo" | "descontinuado";

export function MarkdownPage() {
  const { dataset: ds, config: cfg, error } = useDataset();
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<Tab>("all");
  const [limit, setLimit] = useState(PAGE);
  if (error) return <LoadError message={error} />;
  if (!ds || !cfg) return <PageSkeleton />;

  const agent = readStoredApprovals(ds.id, cfg)?.agentState?.markdowns ?? [];
  const { rows, totalFreed } = markdownRows(ds, cfg, choices, agent);
  const totalHolding = rows.reduce((a, r) => a + r.holdingAvoided, 0);
  const discontinued = rows.filter((r) => r.summary.status === "descontinuado").length;
  const visible = tab === "all" ? rows : rows.filter((r) => r.summary.status === tab);
  const maxFreed = Math.max(1, ...rows.map((r) => r.option.capitalFreed));

  return (
    <div className="space-y-6">
      <PageHeader title="Liquidação" subtitle="Estoque parado que vale mais vendido com desconto do que guardado.">
        <Button size="lg" disabled={rows.length === 0} onClick={() => downloadCsv(`liquidacao-gostock-${cfg.referenceDate}.csv`, markdownToCsv(rows))}>
          <DownloadIcon data-icon="inline-start" /> Exportar CSV
        </Button>
      </PageHeader>

      <section aria-label="Totais" className="grid gap-3 md:grid-cols-[1.3fr_1fr_1fr]">
        <div className="flex flex-col gap-1 rounded-2xl bg-foreground p-5 text-background">
          <div className="flex items-center gap-1 text-sm text-background/75">Capital liberado em 90 dias</div>
          <div className="text-[36px] leading-tight font-bold tracking-tight tabular-nums">{brl(totalFreed, true)}</div>
          <div className="text-[13px] text-background/75">de {brl(ds.kpis.idleValue, true)} parados · custo das unidades vendidas com desconto</div>
        </div>
        <Stat label="SKUs sugeridos" value={intBR(rows.length)} note={`${intBR(discontinued)} descontinuados, que não serão recomprados`} />
        <Stat
          label="Custo de manter evitado"
          value={brl(totalHolding, true)}
          note={`capital ${pct(cfg.capitalCostYear, 0)} a.a. + armazenagem ${pct(cfg.storageCostMonth)} a.m.`}
          info="Quanto deixa de custar manter, em 90 dias, o estoque que sai com o desconto escolhido."
        />
      </section>

      <Notice tone="warn">
        <strong className="font-semibold">Premissa:</strong> o único desconto do histórico é o da Black Friday 2025; {pct(cfg.markdownPriceShare, 0)} do ganho foi atribuído ao preço. Desconto
        máximo de {pct(cfg.maxDiscount, 0)}.{" "}
        <Link href="/dados" className="font-medium underline">
          Ajustar em Dados
        </Link>
      </Notice>

      <section aria-label="Sugestões" className="rounded-2xl bg-card ring-1 ring-foreground/8">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <Pills<Tab>
            label="Tipo de SKU"
            value={tab}
            onChange={setTab}
            items={[
              { value: "all", label: `Todos ${rows.length}` },
              { value: "ativo", label: `Ativos ${rows.length - discontinued}` },
              { value: "descontinuado", label: `Descontinuados ${discontinued}` },
            ]}
          />
          <span className="text-[13px] text-muted-foreground">Ordenado por capital liberado. Ativos só entram quando liquidar vale mais do que manter.</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="text-xs tracking-wide text-muted-foreground uppercase hover:bg-transparent">
              <TableHead className="pl-4">SKU</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Cobertura</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">
                  Desconto <InfoTip label="Sobre o desconto">Opções até o desconto máximo configurado. A escolha recalcula vendas, capital e custo evitado na hora.</InfoTip>
                </span>
              </TableHead>
              <TableHead className="text-right">Vende em 90 d</TableHead>
              <TableHead className="min-w-48">Capital liberado</TableHead>
              <TableHead className="pr-4 text-right">Manter evitado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Nenhum SKU com excesso que valha liquidar.
                </TableCell>
              </TableRow>
            )}
            {visible.slice(0, limit).map((r) => (
              <TableRow key={r.sku} className={r.fromAgent ? "bg-accent/35" : undefined}>
                <TableCell className="pl-4">
                  <Link href={`/estoque/${r.sku}`} className="font-semibold hover:underline">
                    {r.sku}
                  </Link>
                  {r.fromAgent && (
                    <Badge variant="agent" className="ml-1.5">
                      agente
                    </Badge>
                  )}
                  <div className="max-w-56 truncate text-xs text-muted-foreground" title={r.summary.description}>
                    {r.summary.description}
                  </div>
                  {r.fromAgent && <div className="max-w-72 text-xs whitespace-normal text-foreground/80">{r.reason}</div>}
                </TableCell>
                <TableCell>{r.summary.status === "descontinuado" ? <Badge variant="outline">descontinuado</Badge> : <Badge variant="secondary">ativo</Badge>}</TableCell>
                <TableCell className="tabular-nums">
                  <div className="font-medium">{r.coverageDays >= NO_DEMAND ? "sem demanda" : `${intBR(r.coverageDays)} d`}</div>
                  <div className="text-xs text-warn-ink">{intBR(r.excessUnits)} un em excesso</div>
                </TableCell>
                <TableCell>
                  <div role="radiogroup" aria-label={`Desconto de ${r.sku}`} className="flex gap-1">
                    {r.options.map((o) => {
                      const on = o.discount === r.option.discount;
                      return (
                        <button
                          key={o.discount}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setChoices((c) => ({ ...c, [r.sku]: o.discount }))}
                          className={
                            on
                              ? "h-8 min-w-11 rounded-lg bg-primary px-2 text-[13px] font-semibold text-primary-foreground"
                              : "h-8 min-w-11 rounded-lg bg-secondary px-2 text-[13px] font-medium text-foreground/80 hover:bg-[#e8e2d9]"
                          }
                        >
                          {pct(o.discount, 0)}
                        </button>
                      );
                    })}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{intBR(r.option.unitsSold90d)} un</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Meter value={r.option.capitalFreed} max={maxFreed} className="w-20 shrink-0" />
                    <span className="font-semibold tabular-nums">{brl(r.option.capitalFreed)}</span>
                  </div>
                </TableCell>
                <TableCell className="pr-4 text-right text-muted-foreground tabular-nums">{brl(r.holdingAvoided)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ShowMore shown={Math.min(limit, visible.length)} total={visible.length} step={PAGE} noun="SKUs" onMore={() => setLimit((n) => n + PAGE)} />
      </section>
    </div>
  );
}
