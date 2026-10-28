"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { leadTimeFor, serviceLevelFor } from "@/core/plan/allocate";
import { simulateSku } from "@/core/plan/simulate";
import { defaultScenario } from "@/core/types";
import { readStoredApprovals } from "../approvals";
import { SkuHistoryChart, type HistoryPoint } from "../charts/SkuHistoryChart";
import { LoadError, PageSkeleton } from "../common/PageState";
import { useDataset } from "../DatasetProvider";
import { brl, dateBR, intBR, pct } from "../format";
import { skuSituation } from "../inventory";
import { useCompute } from "../useCompute";

const NO_DEMAND = 9999;

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function SkuPage() {
  const { sku: raw } = useParams<{ sku: string }>();
  const skuId = decodeURIComponent(raw);
  const { dataset: ds, config: cfg, error } = useDataset();
  const stored = ds && cfg ? readStoredApprovals(ds.id, cfg) : null;
  // Sem revisão salva, usa o plano base (calculado no worker).
  const base = useCompute("basePlan", stored?.agentState ? null : ds, cfg);

  if (error) return <LoadError message={error} />;
  if (!ds || !cfg) return <PageSkeleton />;
  const s = ds.skus.find((x) => x.sku === skuId);
  if (!s) return <LoadError title="SKU não encontrado" message={`O SKU ${skuId} não existe nos dados carregados.`} />;

  const plan = stored?.agentState?.plan ?? (base.status === "done" ? base.result.plan : null);
  const lines = plan ? plan.lines.filter((l) => l.sku === s.sku) : [];
  const supplier = ds.suppliers.find((x) => x.supplier === s.supplier);
  const lt = leadTimeFor(ds, s.supplier);
  const active = s.status === "ativo";
  const level = serviceLevelFor(s, cfg, defaultScenario);
  const sim = active && plan ? simulateSku(s, lt, level, cfg, defaultScenario, lines) : null;
  const noOrder = active ? simulateSku(s, lt, level, cfg, defaultScenario, []) : null;
  const situation = skuSituation(s, noOrder?.stockoutDate ?? null, cfg);
  const daily = ds.daily?.[s.sku];
  const history: HistoryPoint[] = daily ? daily.map((d) => ({ date: d.date, units: d.units, onHand: d.onHand })) : s.weekly.map((w) => ({ date: w.week, units: w.units, onHand: w.onHand }));
  const projection = sim ? sim.projected.filter((p) => p.date <= cfg.windowEnd) : [];
  const unit = s.purchaseUnit === "cx12" ? "cx" : "un";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" render={<Link href="/estoque" />} nativeButton={false} className="-ml-2">
          <ArrowLeftIcon data-icon="inline-start" /> Estoque
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{s.sku}</h1>
          <Badge variant={active ? "secondary" : "outline"}>{s.status}</Badge>
          <Badge variant="outline">curva {s.abc}</Badge>
          {situation === "ruptura" && <Badge variant="destructive">ruptura antes da campanha</Badge>}
          {situation === "excesso" && <Badge className="bg-warn/15 text-warn">excesso</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {s.brand} · {s.description} · {s.category}
        </p>
      </div>

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Fact label="Estoque" value={`${intBR(s.onHand)} un`} />
            <Fact label="Cobertura" value={s.metrics.coverageDays >= NO_DEMAND ? "sem demanda" : `${intBR(s.metrics.coverageDays)} dias`} />
            <Fact label="Ruptura sem pedido novo" value={noOrder?.stockoutDate ? dateBR(noOrder.stockoutDate) : "—"} />
            <Fact label="Demanda base" value={`${intBR(s.demand.baseDaily)} un/dia`} />
            <Fact label="Lote de compra" value={`${intBR(s.moq)} ${unit} = ${intBR(s.lotUnits)} un · ${brl(s.lotCost)}`} />
            <Fact label="Fornecedor" value={`${s.supplier}${supplier ? ` · ${supplier.name}` : ""}`} />
            <Fact label="Lead time" value={`${intBR(lt.median)} d (P90 ${intBR(lt.p90)} d)`} />
            <Fact label="Nível de serviço alvo" value={active ? pct(level, 0) : "—"} />
            <Fact label="Valor em estoque" value={brl(s.metrics.stockValue)} />
            <Fact label="Parado" value={brl(s.metrics.idleValue)} />
            <Fact label="Venda perdida 12m" value={brl(s.metrics.lostRevenue12m)} />
            <Fact label="Fill 12m" value={pct(s.metrics.fillRate12m)} />
          </dl>
          {s.demand.source === "category" && (
            <p className="mt-4 text-xs text-muted-foreground">Histórico curto ({intBR(s.demand.historyDays)} dias): a demanda usa o padrão da categoria.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vendas e estoque</CardTitle>
          <CardDescription>
            Barras: vendas por {daily ? "dia" : "semana"}. Linha cheia: estoque {daily ? "diário" : "no fim da semana"}. Tracejada: estoque projetado com {stored?.agentState ? "o plano revisado" : "o plano base"} até {dateBR(cfg.windowEnd)}. Faixas: campanhas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SkuHistoryChart
            history={history}
            period={daily ? "dia" : "semana"}
            projection={projection}
            start={history[0]?.date ?? cfg.historyStart}
            referenceDate={cfg.referenceDate}
            campaigns={cfg.campaigns}
            stockoutDate={sim?.stockoutDate ?? null}
          />
          {active && !plan && <p className="mt-2 text-xs text-muted-foreground">Calculando o plano para a projeção…</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>POs em aberto</CardTitle>
            <CardDescription>Estoque a caminho. Chegada esperada = pedido + lead time mediano.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">PO</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Chegada esperada</TableHead>
                  <TableHead className="pr-4 text-right">Unidades</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.onOrder.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      Nenhum PO em aberto.
                    </TableCell>
                  </TableRow>
                )}
                {s.onOrder.map((o) => (
                  <TableRow key={o.poId}>
                    <TableCell className="pl-4 font-medium">{o.poId}</TableCell>
                    <TableCell>{dateBR(o.orderDate)}</TableCell>
                    <TableCell>
                      {dateBR(o.expectedDate)} {o.late && <Badge variant="destructive">atrasado</Badge>}
                    </TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{intBR(o.units)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linhas no plano de compras</CardTitle>
            <CardDescription>{stored?.agentState ? "Plano revisado pelo agente." : "Plano base."}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Emitir até</TableHead>
                  <TableHead>Chegada</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="pr-4 text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      {plan ? (active ? "Sem pedido no plano." : "Descontinuado: não é recomprado.") : "Calculando…"}
                    </TableCell>
                  </TableRow>
                )}
                {lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="pl-4">
                      {dateBR(l.emitBy)} {l.origin === "agent" && <Badge>agente</Badge>}
                    </TableCell>
                    <TableCell>{dateBR(l.arrival)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {intBR(l.lots * s.moq)} {unit}
                    </TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{brl(l.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {s.markdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Opções de liquidação (90 dias)</CardTitle>
            <CardDescription>Excesso de {intBR(s.metrics.idleUnits)} un. Vendas, receita e capital liberado em 90 dias para cada desconto.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Desconto</TableHead>
                  <TableHead className="text-right">Vendidas</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Capital liberado</TableHead>
                  <TableHead className="pr-4 text-right">Custo de manter</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.markdown.map((o) => (
                  <TableRow key={o.discount} className={o.discount > cfg.maxDiscount + 1e-9 ? "text-muted-foreground" : undefined}>
                    <TableCell className="pl-4">{o.discount === 0 ? "Sem desconto" : pct(o.discount, 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{intBR(o.unitsSold90d)} un</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(o.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(o.capitalFreed)}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{brl(o.holdingCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
