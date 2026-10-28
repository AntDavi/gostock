"use client";

import { useState } from "react";
import Link from "next/link";
import { DownloadIcon, InfoIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readStoredApprovals } from "../approvals";
import { downloadCsv } from "../common/download";
import { LoadError, PageHeader, PageSkeleton } from "../common/PageState";
import { useDataset } from "../DatasetProvider";
import { brl, intBR, pct } from "../format";
import { markdownRows, markdownToCsv } from "../inventory";

const NO_DEMAND = 9999;

export function MarkdownPage() {
  const { dataset: ds, config: cfg, error } = useDataset();
  const [choices, setChoices] = useState<Record<string, number>>({});
  if (error) return <LoadError message={error} />;
  if (!ds || !cfg) return <PageSkeleton />;

  const agent = readStoredApprovals(ds.id, cfg)?.agentState?.markdowns ?? [];
  const { rows, totalFreed } = markdownRows(ds, cfg, choices, agent);
  const totalHolding = rows.reduce((a, r) => a + r.holdingAvoided, 0);
  const discontinued = rows.filter((r) => r.summary.status === "descontinuado").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Liquidação" subtitle="Estoque parado que vale mais vendido com desconto do que guardado. Ajuste o desconto de cada SKU e exporte.">
        <Button disabled={rows.length === 0} onClick={() => downloadCsv(`liquidacao-gostock-${cfg.referenceDate}.csv`, markdownToCsv(rows))}>
          <DownloadIcon data-icon="inline-start" /> Exportar CSV
        </Button>
      </PageHeader>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Totais">
        <Card>
          <CardHeader>
            <CardDescription>Capital liberado em 90 dias</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{brl(totalFreed, true)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Custo das unidades vendidas com desconto.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>SKUs sugeridos</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{intBR(rows.length)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">{intBR(discontinued)} descontinuados, que não serão recomprados.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Custo de manter evitado</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{brl(totalHolding, true)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Capital ({pct(cfg.capitalCostYear, 0)} a.a.) e armazenagem ({pct(cfg.storageCostMonth)} a.m.) em 90 dias.
          </CardContent>
        </Card>
      </section>

      <Alert>
        <InfoIcon />
        <AlertDescription>
          Premissa: o único desconto do histórico é o da Black Friday 2025. A resposta de vendas ao preço foi estimada a partir dela, atribuindo{" "}
          {pct(cfg.markdownPriceShare, 0)} do ganho da BF ao preço e o resto à campanha. O desconto máximo é {pct(cfg.maxDiscount, 0)}.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Sugestões</CardTitle>
          <CardDescription>Ordenadas pelo capital liberado. Ativos só entram quando liquidar vale mais do que manter.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">SKU</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Cobertura</TableHead>
                <TableHead className="text-right">Excesso</TableHead>
                <TableHead>Desconto</TableHead>
                <TableHead className="text-right">Vendidas em 90d</TableHead>
                <TableHead className="text-right">Capital liberado</TableHead>
                <TableHead className="pr-4 text-right">Manter evitado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Nenhum SKU com excesso que valha liquidar.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const items = Object.fromEntries(r.options.map((o) => [String(o.discount), pct(o.discount, 0)]));
                return (
                  <TableRow key={r.sku}>
                    <TableCell className="pl-4">
                      <Link href={`/estoque/${r.sku}`} className="font-medium hover:underline">
                        {r.sku}
                      </Link>
                      {r.fromAgent && <Badge className="ml-1.5">agente</Badge>}
                      <div className="max-w-56 truncate text-xs text-muted-foreground" title={r.summary.description}>
                        {r.summary.description}
                      </div>
                      {r.fromAgent && <div className="max-w-72 text-xs whitespace-normal text-muted-foreground">{r.reason}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.summary.status === "descontinuado" ? "outline" : "secondary"}>{r.summary.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.coverageDays >= NO_DEMAND ? "sem demanda" : `${intBR(r.coverageDays)} d`}</TableCell>
                    <TableCell className="text-right tabular-nums text-warn">{intBR(r.excessUnits)} un</TableCell>
                    <TableCell>
                      <Select items={items} value={String(r.option.discount)} onValueChange={(v) => v && setChoices((c) => ({ ...c, [r.sku]: Number(v) }))}>
                        <SelectTrigger size="sm" className="w-20" aria-label={`Desconto de ${r.sku}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {r.options.map((o) => (
                            <SelectItem key={o.discount} value={String(o.discount)}>
                              {pct(o.discount, 0)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{intBR(r.option.unitsSold90d)} un</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(r.option.capitalFreed)}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{brl(r.holdingAvoided)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
