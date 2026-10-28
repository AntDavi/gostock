"use client";

import { ChevronDownIcon, LockIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Campaign, Config } from "@/core/types";

/** Campos que só o plano usa: dá para mudar sem reprocessar os CSVs. */
export const PLAN_FIELDS = ["budget", "windowStart", "windowEnd", "serviceTarget", "tiers", "reviewDays", "maxDiscount"] as const;

/** Aplica ao `base` só os campos do plano (e as datas das campanhas deste ano) de `draft`. */
export function planPart(base: Config, draft: Config): Config {
  const next: Config = { ...base };
  for (const k of PLAN_FIELDS) (next as unknown as Record<string, unknown>)[k] = draft[k];
  next.campaigns = base.campaigns.map((c) => {
    const d = draft.campaigns.find((x) => x.id === c.id);
    return d ? { ...c, start: d.start, end: d.end } : c;
  });
  return next;
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumberInput({ id, value, onChange, percent, step, disabled, suffix }: { id: string; value: number; onChange(v: number): void; percent?: boolean; step?: number; disabled?: boolean; suffix?: string }) {
  const shown = percent ? Math.round(value * 1000) / 10 : value;
  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step ?? (percent ? 0.1 : 1)}
        value={Number.isFinite(shown) ? shown : ""}
        disabled={disabled}
        className="h-10 bg-card pr-12 tabular-nums"
        onChange={(e) => {
          const v = e.target.value === "" ? NaN : Number(e.target.value);
          onChange(percent ? v / 100 : v);
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{suffix ?? (percent ? "%" : "")}</span>
    </div>
  );
}

function DateInput({ id, value, onChange, disabled }: { id: string; value: string; onChange(v: string): void; disabled?: boolean }) {
  return <Input id={id} type="date" value={value} disabled={disabled} className="h-10 bg-card tabular-nums" onChange={(e) => onChange(e.target.value)} />;
}

function Group({ title, when, children }: { title: string; when: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-hairline pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        <legend className="text-[15px] font-semibold">{title}</legend>
        <span className="text-xs text-muted-foreground">{when}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

interface Props {
  value: Config;
  onChange(c: Config): void;
  /** Campos do pipeline travados (sem CSVs selecionados para reprocessar). */
  dataLocked: boolean;
}

export function ConfigForm({ value: c, onChange, dataLocked }: Props) {
  const set = <K extends keyof Config>(k: K, v: Config[K]) => onChange({ ...c, [k]: v });
  const setCampaign = (id: string, patch: Partial<Campaign>) => onChange({ ...c, campaigns: c.campaigns.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

  return (
    <div className="space-y-5">
      <Group title="Plano de compras" when="vale na hora">
        <Field id="cfg-budget" label="Orçamento">
          <NumberInput id="cfg-budget" value={c.budget} step={1000} suffix="R$" onChange={(v) => set("budget", v)} />
        </Field>
        <Field id="cfg-review" label="Dias de revisão" hint="O pedido cobre lead time + revisão + segurança.">
          <NumberInput id="cfg-review" value={c.reviewDays} suffix="dias" onChange={(v) => set("reviewDays", v)} />
        </Field>
        <Field id="cfg-ws" label="Emissão a partir de">
          <DateInput id="cfg-ws" value={c.windowStart} onChange={(v) => set("windowStart", v)} />
        </Field>
        <Field id="cfg-we" label="Emissão até">
          <DateInput id="cfg-we" value={c.windowEnd} onChange={(v) => set("windowEnd", v)} />
        </Field>
      </Group>

      <Group title="Metas de serviço" when="vale na hora">
        <Field id="cfg-target" label="Meta geral">
          <NumberInput id="cfg-target" percent value={c.serviceTarget} onChange={(v) => set("serviceTarget", v)} />
        </Field>
        <Field id="cfg-a" label="Curva A">
          <NumberInput id="cfg-a" percent value={c.tiers.A} onChange={(v) => set("tiers", { ...c.tiers, A: v })} />
        </Field>
        <Field id="cfg-b" label="Curva B">
          <NumberInput id="cfg-b" percent value={c.tiers.B} onChange={(v) => set("tiers", { ...c.tiers, B: v })} />
        </Field>
        <Field id="cfg-c" label="Curva C">
          <NumberInput id="cfg-c" percent value={c.tiers.C} onChange={(v) => set("tiers", { ...c.tiers, C: v })} />
        </Field>
        <Field id="cfg-disc" label="Desconto máximo">
          <NumberInput id="cfg-disc" percent value={c.maxDiscount} onChange={(v) => set("maxDiscount", v)} />
        </Field>
      </Group>

      <Group title="Campanhas" when="vale na hora">
        {c.campaigns.map((x) => [
          <Field key={`${x.id}-s`} id={`cfg-${x.id}-s`} label={`${x.name}: início`}>
            <DateInput id={`cfg-${x.id}-s`} value={x.start} onChange={(v) => setCampaign(x.id, { start: v })} />
          </Field>,
          <Field key={`${x.id}-e`} id={`cfg-${x.id}-e`} label={`${x.name}: fim`}>
            <DateInput id={`cfg-${x.id}-e`} value={x.end} onChange={(v) => setCampaign(x.id, { end: v })} />
          </Field>,
        ])}
      </Group>

      <details className="group border-t border-hairline pt-5" open={!dataLocked}>
        <summary className="flex cursor-pointer list-none items-baseline justify-between gap-2 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-1.5 text-[15px] font-semibold">
            {dataLocked && <LockIcon className="size-3.5 text-muted-foreground" />}
            Processamento dos dados{dataLocked ? " · travado" : ""}
            <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </span>
          <span className="text-xs text-muted-foreground">{dataLocked ? "envie os CSVs para editar" : "vale no processamento"}</span>
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">Estes valores mudam como os CSVs são processados (demanda, parado, liquidação).</p>
        <fieldset disabled={dataLocked} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field id="cfg-ref" label="Data de referência">
            <DateInput id="cfg-ref" value={c.referenceDate} disabled={dataLocked} onChange={(v) => set("referenceDate", v)} />
          </Field>
          <Field id="cfg-hist" label="Início do histórico">
            <DateInput id="cfg-hist" value={c.historyStart} disabled={dataLocked} onChange={(v) => set("historyStart", v)} />
          </Field>
          <Field id="cfg-idle" label="Parado acima de">
            <NumberInput id="cfg-idle" value={c.idleCoverageDays} suffix="dias" disabled={dataLocked} onChange={(v) => set("idleCoverageDays", v)} />
          </Field>
          <Field id="cfg-share" label="Ganho da BF atribuído ao preço">
            <NumberInput id="cfg-share" percent value={c.markdownPriceShare} disabled={dataLocked} onChange={(v) => set("markdownPriceShare", v)} />
          </Field>
          <Field id="cfg-cap" label="Custo de capital (a.a.)">
            <NumberInput id="cfg-cap" percent value={c.capitalCostYear} disabled={dataLocked} onChange={(v) => set("capitalCostYear", v)} />
          </Field>
          <Field id="cfg-sto" label="Armazenagem (a.m.)">
            <NumberInput id="cfg-sto" percent value={c.storageCostMonth} disabled={dataLocked} onChange={(v) => set("storageCostMonth", v)} />
          </Field>
          {c.campaigns.map((x) => [
            <Field key={`${x.id}-ls`} id={`cfg-${x.id}-ls`} label={`${x.name} do ano anterior: início`}>
              <DateInput id={`cfg-${x.id}-ls`} value={x.lastYearStart} disabled={dataLocked} onChange={(v) => setCampaign(x.id, { lastYearStart: v })} />
            </Field>,
            <Field key={`${x.id}-le`} id={`cfg-${x.id}-le`} label="fim">
              <DateInput id={`cfg-${x.id}-le`} value={x.lastYearEnd} disabled={dataLocked} onChange={(v) => setCampaign(x.id, { lastYearEnd: v })} />
            </Field>,
          ])}
        </fieldset>
      </details>
    </div>
  );
}
