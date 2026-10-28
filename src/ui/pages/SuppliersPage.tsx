"use client";

import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadError, PageHeader, PageSkeleton } from "../common/PageState";
import { useDataset } from "../DatasetProvider";
import { intBR } from "../format";
import { isUnstable, UNSTABLE_RATIO } from "../inventory";
import { InfoTip, Notice, Section, Stat } from "../kit";

export function SuppliersPage() {
  const { dataset: ds, error } = useDataset();
  if (error) return <LoadError message={error} />;
  if (!ds) return <PageSkeleton />;
  const sup = ds.suppliers;
  const unstable = sup.filter((s) => isUnstable(s.leadTime));
  const open = sup.reduce((a, s) => a + s.openOrders, 0);
  const late = sup.reduce((a, s) => a + s.lateOrders, 0);
  const worst = [...sup].sort((a, b) => b.leadTime.p90 - a.leadTime.p90)[0];
  const scale = Math.max(...sup.map((s) => s.leadTime.max));
  const ratio = String(UNSTABLE_RATIO).replace(".", ",");

  return (
    <div className="space-y-6">
      <PageHeader title="Fornecedores" subtitle="Lead time medido nos pedidos recebidos (recebimento − pedido)." />

      {unstable.length > 0 && (
        <Notice tone="warn">
          <strong className="font-semibold">
            {unstable.map((s) => s.supplier).join(", ")} {unstable.length > 1 ? "são instáveis" : "é instável"}:
          </strong>{" "}
          o P90 passa de {ratio}× a mediana. O plano usa a mediana para a chegada; o agente antecipa emissões quando a chegada pelo P90 cai depois do início da campanha.
        </Notice>
      )}

      <section aria-label="Resumo" className="grid gap-3 sm:grid-cols-3">
        <Stat label="POs em aberto" value={intBR(open)} note="estoque a caminho, fora do orçamento novo" />
        <Stat label="Atrasados" value={intBR(late)} tone={late > 0 ? "danger" : "neutral"} note="chegada esperada (pedido + mediana) já passou" info="Para o plano, a chegada de um PO atrasado passa a ser o maior entre pedido + P90 e o dia seguinte à referência." />
        {worst && <Stat label="Maior P90" value={<span>{intBR(worst.leadTime.p90)} d <span className="text-base font-semibold text-muted-foreground">{worst.supplier}</span></span>} note="9 em cada 10 pedidos chegam até aqui" />}
      </section>

      <Section
        title="Lead time e pedidos em aberto"
        description="Barra escura: tempo típico (mediana). Faixa clara: dias extras até o P90, o pior caso comum. O traço marca o máximo já visto."
        bodyClassName="px-0 pb-2"
      >
        <Table>
          <TableHeader>
            <TableRow className="text-xs tracking-wide text-muted-foreground uppercase hover:bg-transparent">
              <TableHead className="pl-5">Fornecedor</TableHead>
              <TableHead className="min-w-56">
                <span className="inline-flex items-center gap-1">
                  Mediana → P90 · variação
                  <InfoTip label="Sobre a variação">Quanto o P90 passa da mediana. Acima de {ratio}× (+{Math.round((UNSTABLE_RATIO - 1) * 100)}%) o fornecedor é marcado como instável.</InfoTip>
                </span>
              </TableHead>
              <TableHead className="text-right">Mediana</TableHead>
              <TableHead className="text-right">P90</TableHead>
              <TableHead className="text-right">Mín–máx</TableHead>
              <TableHead className="text-right">Pedidos</TableHead>
              <TableHead className="text-right">SKUs</TableHead>
              <TableHead className="text-right">Abertos</TableHead>
              <TableHead className="pr-5 text-right">Atrasados</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sup.map((s) => {
              const lt = s.leadTime;
              const bad = isUnstable(lt);
              const spread = lt.median > 0 ? Math.round((lt.p90 / lt.median - 1) * 100) : 0;
              return (
                <TableRow key={s.supplier} className={bad ? "bg-warn-soft/45" : undefined}>
                  <TableCell className="pl-5">
                    <span className="font-semibold">{s.supplier}</span> · {s.name}
                    {bad && (
                      <Badge variant="warn" className="ml-2">
                        instável
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="relative h-2.5 w-36 shrink-0 rounded-full bg-secondary" role="img" aria-label={`Mediana ${lt.median} dias, P90 ${lt.p90} dias, máximo ${lt.max} dias`}>
                        <div className={cn("absolute inset-y-0 left-0 rounded-full", bad ? "bg-warn/45" : "bg-chart-4")} style={{ width: `${(lt.p90 / scale) * 100}%` }} />
                        <div className="absolute inset-y-0 left-0 rounded-full bg-foreground/80" style={{ width: `${(lt.median / scale) * 100}%` }} />
                        <div className="absolute -inset-y-1 w-px bg-foreground/50" style={{ left: `${(lt.max / scale) * 100}%` }} />
                      </div>
                      <span className={cn("text-[13px] tabular-nums", bad ? "font-semibold text-warn-ink" : "text-muted-foreground")}>+{spread}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{intBR(lt.median)} d</TableCell>
                  <TableCell className="text-right tabular-nums">{intBR(lt.p90)} d</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {intBR(lt.min)}–{intBR(lt.max)} d
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{intBR(lt.n)}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{intBR(s.skuCount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{intBR(s.openOrders)}</TableCell>
                  <TableCell className="pr-5 text-right">
                    {s.lateOrders > 0 ? <Badge variant="danger">{intBR(s.lateOrders)}</Badge> : <span className="text-muted-foreground tabular-nums">0</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}
