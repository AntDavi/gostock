"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { diffDays } from "@/core/dates";
import type { BudgetPoint } from "@/core/plan/curve";
import { BudgetCurveChart } from "./charts/BudgetCurveChart";
import { LoadError, PageHeader } from "./common/PageState";
import { useDataset } from "./DatasetProvider";
import { brl, dateBR, intBR, pct } from "./format";
import { Meter, Section, Stat } from "./kit";
import { firstCampaign, lowCoverage, overviewAlerts, topIdle } from "./overview";
import { useCompute } from "./useCompute";

const STOCKOUT_ROWS = 12;
const IDLE_ROWS = 8;

export function Overview() {
  const { dataset: ds, config: cfg, error } = useDataset();
  const ov = useCompute("overview", ds, cfg);

  if (error) return <LoadError message={error} />;
  if (!ds || !cfg) return <OverviewSkeleton />;

  const k = ds.kpis;
  const campaign = firstCampaign(cfg);
  const daysToCampaign = diffDays(cfg.referenceDate, campaign.start);
  const alerts = ov.status === "done" ? overviewAlerts(ds, ov.result, cfg) : null;
  const idle = topIdle(ds, IDLE_ROWS);

  return (
    <div className="space-y-8">
      <PageHeader title="Visão geral" subtitle={`${dateBR(cfg.referenceDate)} · janela de compra ${dateBR(cfg.windowStart).slice(0, 5)} a ${dateBR(cfg.windowEnd)} · orçamento ${brl(cfg.budget, true)}`}>
        <Button size="lg" render={<Link href="/plano?auto=1" />} nativeButton={false}>
          Gerar plano com o agente <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </PageHeader>

      <section aria-label="O que precisa de atenção" className="grid gap-3 md:grid-cols-3">
        {alerts ? (
          <>
            <AlertTile href="/estoque?situacao=ruptura" tone="danger" count={alerts.stockoutBeforeCampaign} text={`SKUs rompem antes da ${campaign.name} (${dateBR(campaign.start).slice(0, 5)}) sem pedido novo`} />
            <AlertTile href="/estoque?situacao=excesso" tone="warn" count={alerts.overstock} text="SKUs com mais de 1 ano de cobertura" />
            <AlertTile href="/fornecedores" tone="neutral" count={alerts.latePos} text={`POs atrasados, de ${intBR(k.openPoCount)} em aberto`} />
          </>
        ) : (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
        )}
      </section>

      <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Capital em estoque" value={brl(k.stockValue, true)} note={`A custo · ${intBR(k.skuCount)} SKUs (${intBR(k.activeCount)} ativos)`} info={`Saldo em ${dateBR(cfg.referenceDate)} valorizado pelo custo unitário.`} />
        <Stat
          label="Estoque parado"
          value={brl(k.idleValue, true)}
          note={`${pct(k.idleValue / k.stockValue, 0)} do capital · acima de ${intBR(cfg.idleCoverageDays)} d + descontinuados`}
          info={`Excedente acima de ${intBR(cfg.idleCoverageDays)} dias de cobertura mais todo o saldo de descontinuados, a custo.`}
        />
        <Stat label="Venda perdida em 12 meses" value={brl(k.lostRevenue12m, true)} note="Demanda estimada nos dias sem estoque" info="Nos dias com estoque zerado, a venda observada não é a demanda. A perda é a demanda estimada desses dias, ao preço médio." />
        <Stat
          label="Nível de serviço em 12 meses"
          value={pct(k.fillRate12m)}
          note={`Histórico · meta ${pct(cfg.serviceTarget)}, ${k.fillRate12m >= cfg.serviceTarget ? "atingida" : "não atingida"}`}
          info="Fill rate: fração da demanda atendida nos últimos 12 meses. O fill esperado do plano de compras é outra medida, até o fim da janela."
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Section title="Próximas rupturas" description={`Dias até zerar sem nova compra (POs em aberto contam). Vermelho: rompe antes da ${campaign.name}.`}>
          {ov.status === "done" ? (
            <StockoutList rows={lowCoverage(ds, ov.result, cfg, STOCKOUT_ROWS)} referenceDate={cfg.referenceDate} campaignDays={daysToCampaign} />
          ) : ov.status === "error" ? (
            <p className="text-sm text-danger-ink">Não foi possível calcular: {ov.error}</p>
          ) : (
            <ListSkeleton rows={STOCKOUT_ROWS} />
          )}
          <p className="mt-4 text-[13px] text-muted-foreground">
            Linha tracejada: {campaign.name} ({dateBR(campaign.start).slice(0, 5)}, em {intBR(daysToCampaign)} d)
            {alerts && ` · mostrando ${Math.min(STOCKOUT_ROWS, alerts.stockoutBeforeCampaign)} de ${intBR(alerts.stockoutBeforeCampaign)} que rompem antes`} ·{" "}
            <Link href="/estoque?situacao=ruptura" className="font-medium text-primary underline">
              ver todos
            </Link>
          </p>
        </Section>

        <Section title="Maior capital parado" description={`Excedente acima de ${intBR(cfg.idleCoverageDays)} dias de cobertura, a custo. Candidatos à liquidação.`}>
          <ul className="space-y-1">
            {idle.map((r) => (
              <li key={r.sku}>
                <Link href={`/estoque/${r.sku}`} className="grid grid-cols-[5.5rem_1fr_4.75rem] items-center gap-3 rounded-md py-1 text-sm hover:bg-muted/60">
                  <span className="font-semibold">{r.sku}</span>
                  <Meter value={r.idleValue} max={idle[0]?.idleValue ?? 1} tone="warn" />
                  <span className="text-right text-[13px] tabular-nums">{brl(r.idleValue, true)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] text-muted-foreground">
            {brl(k.idleValue, true)} no total ·{" "}
            <Link href="/liquidacao" className="font-medium text-primary underline">
              ver liquidação
            </Link>
          </p>
        </Section>
      </div>

      <Section title="Orçamento × nível de serviço" description={`Fill esperado até ${dateBR(cfg.windowEnd)} para cada orçamento, com serviço diferenciado por curva ABC. O ponto cheio marca o orçamento atual.`}>
        {ov.status === "done" ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_17rem]">
            <BudgetCurveChart points={ov.result.budgetCurve} budget={cfg.budget} target={cfg.serviceTarget} />
            <CurveReadings points={ov.result.budgetCurve} budget={cfg.budget} target={cfg.serviceTarget} uniform98Cost={ov.result.uniform98Cost} />
          </div>
        ) : (
          <Skeleton className="h-64" />
        )}
      </Section>
    </div>
  );
}

function AlertTile({ href, tone, count, text }: { href: string; tone: "danger" | "warn" | "neutral"; count: number; text: string }) {
  const active = count > 0;
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-4 rounded-2xl px-5 py-4 transition-colors",
        tone === "danger" && active && "bg-danger-soft hover:bg-[#fbdcd8]",
        tone === "warn" && active && "bg-warn-soft hover:bg-[#fde6c2]",
        (tone === "neutral" || !active) && "bg-secondary hover:bg-[#e8e2d9]",
      )}
    >
      <span className={cn("text-[40px] leading-none font-bold tabular-nums", active && tone === "danger" && "text-danger-ink", active && tone === "warn" && "text-warn-ink")}>{intBR(count)}</span>
      <span className="flex-1 text-sm leading-snug text-foreground/85">{text}</span>
      <ArrowRightIcon className={cn("size-4 shrink-0 transition-transform group-hover:translate-x-0.5", active && tone === "danger" ? "text-danger-ink" : active && tone === "warn" ? "text-warn-ink" : "text-foreground/60")} />
    </Link>
  );
}

function StockoutList({ rows, referenceDate, campaignDays }: { rows: ReturnType<typeof lowCoverage>; referenceDate: string; campaignDays: number }) {
  const data = rows.map((r) => ({ ...r, days: Math.max(0, diffDays(referenceDate, r.date)) }));
  const max = Math.max(campaignDays * 1.15, ...data.map((d) => d.days));
  return (
    <ul className="space-y-1">
      {data.map((r) => (
        <li key={r.sku}>
          <Link
            href={`/estoque/${r.sku}`}
            className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-3 rounded-md py-1 text-sm hover:bg-muted/60"
            aria-label={`${r.sku}: rompe em ${dateBR(r.date)}, ${r.days} dias${r.beforeCampaign ? ", antes da campanha" : ""}`}
          >
            <span className="font-semibold">{r.sku}</span>
            <Meter value={r.days} max={max} tone={r.beforeCampaign ? "danger" : "muted"} marker={campaignDays} />
            <span className="text-right text-[13px] tabular-nums">{intBR(r.days)} d</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CurveReadings({ points, budget, target, uniform98Cost }: { points: BudgetPoint[]; budget: number; target: number; uniform98Cost: number }) {
  const plan = points.reduce((best, p) => (Math.abs(p.budget - budget) < Math.abs(best.budget - budget) ? p : best), points[0]);
  const reach = points.find((p) => p.expectedFillRate >= target);
  const ratio = uniform98Cost / budget;
  return (
    <div className="flex flex-col gap-2.5">
      <Reading label={`Com o orçamento de ${brl(budget, true)}`} value={`${pct(plan.expectedFillRate)} de fill`} note={plan.expectedFillRate >= target ? `atinge a meta de ${pct(target, 0)}` : `abaixo da meta de ${pct(target, 0)}`} strong />
      <Reading
        label={`Meta de ${pct(target, 0)} alcançada com`}
        value={reach ? brl(reach.budget, true) : "fora da curva"}
        note={reach ? `fill de ${pct(reach.expectedFillRate)}` : `nenhum orçamento até ${brl(points[points.length - 1].budget, true)} chega lá`}
      />
      <Reading label="98% para todos, sem diferenciar ABC" value={brl(uniform98Cost, true)} note={`${String(Math.round(ratio * 10) / 10).replace(".", ",")}× o orçamento`} />
    </div>
  );
}

function Reading({ label, value, note, strong }: { label: string; value: string; note: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-xl px-4 py-3", strong ? "bg-accent" : "bg-secondary/70")}>
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className={cn("text-[22px] leading-tight font-bold tabular-nums", strong && "text-accent-foreground")}>{value}</div>
      <div className="text-[13px] text-muted-foreground">{note}</div>
    </div>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-5" />
      ))}
      <p className="text-xs text-muted-foreground">Calculando simulações…</p>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      <Skeleton className="h-12 w-72" />
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}
