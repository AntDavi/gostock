"use client";

import Link from "next/link";
import { ArrowRightIcon, ChevronRightIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { BudgetPoint } from "@/core/plan/curve";
import { BudgetCurveChart } from "./charts/BudgetCurveChart";
import { IdleChart } from "./charts/IdleChart";
import { StockoutChart } from "./charts/StockoutChart";
import { useDataset } from "./DatasetProvider";
import { brl, dateBR, intBR, pct } from "./format";
import { Kpi } from "./Kpi";
import { lowCoverage, overviewAlerts, topIdle } from "./overview";
import { useOverview } from "./useOverview";

const CHART_ROWS = 25;

function BudgetSummary({ points, budget, target, uniform98Cost }: { points: BudgetPoint[]; budget: number; target: number; uniform98Cost: number }) {
  const plan = points.reduce((best, p) => (Math.abs(p.budget - budget) < Math.abs(best.budget - budget) ? p : best), points[0]);
  const reach = points.find((p) => p.expectedFillRate >= target);
  return (
    <ul className="space-y-1 text-sm text-muted-foreground">
      <li>
        Com o orçamento de <span className="font-medium text-foreground">{brl(budget, true)}</span>, o plano atinge{" "}
        <span className="font-medium text-foreground">{pct(plan.expectedFillRate)}</span> de fill esperado até o fim da janela.
      </li>
      {reach ? (
        <li>
          A meta de {pct(target, 0)} é alcançada com cerca de <span className="font-medium text-foreground">{brl(reach.budget, true)}</span> ({pct(reach.expectedFillRate)}).
        </li>
      ) : (
        <li>Nenhum orçamento da curva alcança a meta de {pct(target, 0)}.</li>
      )}
      <li>
        Exigir 98% de todos os SKUs, sem diferenciar por curva ABC, custaria <span className="font-medium text-foreground">{brl(uniform98Cost, true)}</span>.
      </li>
    </ul>
  );
}

export function Overview() {
  const { dataset: ds, config: cfg, error } = useDataset();
  const ov = useOverview(ds, cfg);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Erro ao carregar os dados</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!ds || !cfg) return <OverviewSkeleton />;

  const k = ds.kpis;
  const alerts = ov.status === "done" ? overviewAlerts(ds, ov.overview, cfg) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
          <p className="text-sm text-muted-foreground">
            Situação em {dateBR(cfg.referenceDate)} · janela de compra de {dateBR(cfg.windowStart)} a {dateBR(cfg.windowEnd)} · orçamento {brl(cfg.budget, true)}
          </p>
        </div>
        <Button render={<Link href="/plano?auto=1" />} nativeButton={false} size="lg">
          Gerar plano de compras com o agente <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </div>

      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Capital em estoque" value={brl(k.stockValue, true)} note={`A custo, em ${dateBR(cfg.referenceDate)} · ${intBR(k.skuCount)} SKUs (${intBR(k.activeCount)} ativos)`} />
        <Kpi label="Estoque parado" value={brl(k.idleValue, true)} note={`Excedente acima de ${intBR(cfg.idleCoverageDays)} dias de cobertura + descontinuados, a custo`} />
        <Kpi label="Venda perdida em 12 meses" value={brl(k.lostRevenue12m, true)} note="Receita estimada da demanda não atendida nos dias sem estoque" />
        <Kpi label="Nível de serviço em 12 meses" value={pct(k.fillRate12m)} note={`Fill rate (demanda atendida) · meta ${pct(cfg.serviceTarget)}`} />
      </section>

      <section aria-label="Alertas" className="grid gap-3 sm:grid-cols-3">
        {alerts ? (
          <>
            <AlertLink href="/estoque?situacao=ruptura" tone="danger" count={alerts.stockoutBeforeCampaign} text={`SKUs rompem antes da ${alerts.campaign.name} (${dateBR(alerts.campaign.start)}) sem pedido novo`} />
            <AlertLink href="/estoque?situacao=excesso" tone="warn" count={alerts.overstock} text="SKUs com mais de 1 ano de cobertura" />
            <AlertLink href="/fornecedores" tone="neutral" count={alerts.latePos} text={`POs atrasados de ${intBR(k.openPoCount)} em aberto`} />
          </>
        ) : (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Próximas rupturas</CardTitle>
            <CardDescription>
              Dias até zerar o estoque se nada novo for comprado (POs em aberto contam). Vermelho: rompe antes da primeira campanha. Clique para ver o SKU.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ov.status === "done" ? <StockoutChart rows={lowCoverage(ds, ov.overview, cfg, CHART_ROWS)} referenceDate={cfg.referenceDate} /> : <ChartState state={ov} height={560} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Maior capital parado</CardTitle>
            <CardDescription>Excedente acima de {intBR(cfg.idleCoverageDays)} dias de cobertura, a custo. São os candidatos à liquidação. Clique para ver o SKU.</CardDescription>
          </CardHeader>
          <CardContent>
            <IdleChart rows={topIdle(ds, CHART_ROWS)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Orçamento × nível de serviço</CardTitle>
          <CardDescription>Fill esperado até {dateBR(cfg.windowEnd)} para cada orçamento, com o serviço diferenciado por curva ABC. O ponto marca o orçamento atual.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ov.status === "done" ? (
            <>
              <BudgetCurveChart points={ov.overview.budgetCurve} budget={cfg.budget} target={cfg.serviceTarget} />
              <BudgetSummary points={ov.overview.budgetCurve} budget={cfg.budget} target={cfg.serviceTarget} uniform98Cost={ov.overview.uniform98Cost} />
            </>
          ) : (
            <ChartState state={ov} height={256} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AlertLink({ href, tone, count, text }: { href: string; tone: "danger" | "warn" | "neutral"; count: number; text: string }) {
  const color = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-foreground";
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-xl px-4 py-3 ring-1 ring-foreground/10 transition-colors hover:bg-muted">
      <span className={`text-2xl font-semibold tabular-nums ${count > 0 ? color : "text-muted-foreground"}`}>{intBR(count)}</span>
      <span className="flex-1 text-sm text-muted-foreground">{text}</span>
      <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function ChartState({ state, height }: { state: { status: "loading" } | { status: "error"; error: string } | { status: "done" }; height: number }) {
  if (state.status === "error") return <p className="text-sm text-danger">Não foi possível calcular: {state.error}</p>;
  return (
    <div className="space-y-2">
      <Skeleton className="w-full" style={{ height }} />
      <p className="text-xs text-muted-foreground">Calculando simulações…</p>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
