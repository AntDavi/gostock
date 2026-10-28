"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { leadTimeFor, serviceLevelFor, type Plan } from "@/core/plan/allocate";
import { simulateSku } from "@/core/plan/simulate";
import { defaultScenario, type Config, type Dataset, type SkuSummary } from "@/core/types";
import { SkuHistoryChart, type HistoryPoint } from "../charts/SkuHistoryChart";
import { brl, dateBR, intBR } from "../format";
import { isUnstable, skuSituation } from "../inventory";
import { Notice } from "../kit";

const NO_DEMAND = 9999;

function Tile({ label, value, tone }: { label: string; value: string; tone?: "danger" | "warn" }) {
  return (
    <div className={cn("rounded-xl px-3.5 py-3", tone === "danger" ? "bg-danger-soft" : tone === "warn" ? "bg-warn-soft" : "bg-secondary/70")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-lg leading-tight font-bold tabular-nums", tone === "danger" && "text-danger-ink", tone === "warn" && "text-warn-ink")}>{value}</div>
    </div>
  );
}

/** Ficha resumida do SKU no painel lateral do Estoque. A ficha completa continua em /estoque/[sku]. */
export function SkuQuick({ s, ds, cfg, plan }: { s: SkuSummary; ds: Dataset; cfg: Config; plan: Plan | null }) {
  const lt = leadTimeFor(ds, s.supplier);
  const supplier = ds.suppliers.find((x) => x.supplier === s.supplier);
  const unstable = supplier ? isUnstable(supplier.leadTime) : false;
  const active = s.status === "ativo";
  const level = serviceLevelFor(s, cfg, defaultScenario);
  const noOrder = active ? simulateSku(s, lt, level, cfg, defaultScenario, []) : null;
  const lines = plan ? plan.lines.filter((l) => l.sku === s.sku) : [];
  const sim = active && plan ? simulateSku(s, lt, level, cfg, defaultScenario, lines) : null;
  const situation = skuSituation(s, noOrder?.stockoutDate ?? null, cfg);
  const daily = ds.daily?.[s.sku];
  const history: HistoryPoint[] = (daily ? daily.map((d) => ({ date: d.date, units: d.units, onHand: d.onHand })) : s.weekly.map((w) => ({ date: w.week, units: w.units, onHand: w.onHand }))).slice(daily ? -120 : -18);
  const unit = s.purchaseUnit === "cx12" ? "cx" : "un";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {situation === "ruptura" && <Badge variant="danger">rompe antes da campanha</Badge>}
        {situation === "excesso" && <Badge variant="warn">excesso</Badge>}
        {!active && <Badge variant="outline">descontinuado</Badge>}
        <Badge variant="secondary">Curva {s.abc}</Badge>
        <Badge variant={unstable ? "warn" : "secondary"}>
          {s.supplier}
          {unstable ? " instável" : ""}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Cobertura" value={s.metrics.coverageDays >= NO_DEMAND ? "sem demanda" : `${intBR(s.metrics.coverageDays)} d`} tone={situation === "ruptura" ? "danger" : situation === "excesso" ? "warn" : undefined} />
        <Tile label="Ruptura sem pedido novo" value={noOrder?.stockoutDate ? dateBR(noOrder.stockoutDate) : "—"} tone={situation === "ruptura" ? "danger" : undefined} />
        <Tile label="Valor em estoque" value={brl(s.metrics.stockValue)} />
        <Tile label={`Lead time ${s.supplier}`} value={`${intBR(lt.median)} d · P90 ${intBR(lt.p90)} d`} />
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold">Estoque e projeção com o plano</h3>
        <SkuHistoryChart
          history={history}
          period={daily ? "dia" : "semana"}
          projection={sim ? sim.projected.filter((p) => p.date <= cfg.windowEnd) : []}
          start={history[0]?.date ?? cfg.referenceDate}
          referenceDate={cfg.referenceDate}
          campaigns={cfg.campaigns}
          stockoutDate={sim?.stockoutDate ?? null}
          compact
        />
      </div>
      {unstable && (
        <Notice tone="warn">
          Fornecedor com cauda longa: a chegada pode passar de {intBR(lt.p90)} dias. Pedido para a campanha precisa sair cedo.
        </Notice>
      )}
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">No plano de compras</h3>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{plan ? (active ? "Sem pedido no plano." : "Descontinuado: não é recomprado.") : "Calculando…"}</p>
        ) : (
          <ul className="divide-y divide-hairline rounded-xl bg-secondary/50 text-sm">
            {lines.map((l) => (
              <li key={l.id} className="flex justify-between gap-2 px-3 py-2 tabular-nums">
                <span>Emitir até {dateBR(l.emitBy)}</span>
                <span className="font-medium">
                  {intBR(l.lots * s.moq)} {unit} · {brl(l.cost, true)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {s.onOrder.length > 0 && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            {s.onOrder.length} PO{s.onOrder.length > 1 ? "s" : ""} em aberto ({intBR(s.onOrder.reduce((a, o) => a + o.units, 0))} un)
            {s.onOrder.some((o) => o.late) && <span className="text-danger-ink">, com atraso</span>}.
          </p>
        )}
      </div>
      <Button variant="outline" size="lg" render={<Link href={`/estoque/${s.sku}`} />} nativeButton={false} className="w-full">
        Abrir ficha completa <ArrowRightIcon data-icon="inline-end" />
      </Button>
    </div>
  );
}
