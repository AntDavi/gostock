"use client";

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
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumberInput({ id, value, onChange, percent, step, disabled }: { id: string; value: number; onChange(v: number): void; percent?: boolean; step?: number; disabled?: boolean }) {
  const shown = percent ? Math.round(value * 1000) / 10 : value;
  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      step={step ?? (percent ? 0.1 : 1)}
      value={Number.isFinite(shown) ? shown : ""}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value === "" ? NaN : Number(e.target.value);
        onChange(percent ? v / 100 : v);
      }}
    />
  );
}

function DateInput({ id, value, onChange, disabled }: { id: string; value: string; onChange(v: string): void; disabled?: boolean }) {
  return <Input id={id} type="date" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
}

interface Props {
  value: Config;
  onChange(c: Config): void;
  /** Campos do pipeline travados (dataset padrão, sem CSVs para reprocessar). */
  dataLocked: boolean;
}

export function ConfigForm({ value: c, onChange, dataLocked }: Props) {
  const set = <K extends keyof Config>(k: K, v: Config[K]) => onChange({ ...c, [k]: v });
  const setCampaign = (id: string, patch: Partial<Campaign>) => onChange({ ...c, campaigns: c.campaigns.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

  return (
    <div className="space-y-6">
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-medium">Plano de compras</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="cfg-budget" label="Orçamento (R$)">
            <NumberInput id="cfg-budget" value={c.budget} step={1000} onChange={(v) => set("budget", v)} />
          </Field>
          <Field id="cfg-ws" label="Emissão a partir de">
            <DateInput id="cfg-ws" value={c.windowStart} onChange={(v) => set("windowStart", v)} />
          </Field>
          <Field id="cfg-we" label="Emissão até">
            <DateInput id="cfg-we" value={c.windowEnd} onChange={(v) => set("windowEnd", v)} />
          </Field>
          <Field id="cfg-review" label="Dias de revisão" hint="O pedido cobre lead time + revisão + segurança.">
            <NumberInput id="cfg-review" value={c.reviewDays} onChange={(v) => set("reviewDays", v)} />
          </Field>
          <Field id="cfg-target" label="Meta de nível de serviço (%)">
            <NumberInput id="cfg-target" percent value={c.serviceTarget} onChange={(v) => set("serviceTarget", v)} />
          </Field>
          <Field id="cfg-a" label="Serviço curva A (%)">
            <NumberInput id="cfg-a" percent value={c.tiers.A} onChange={(v) => set("tiers", { ...c.tiers, A: v })} />
          </Field>
          <Field id="cfg-b" label="Serviço curva B (%)">
            <NumberInput id="cfg-b" percent value={c.tiers.B} onChange={(v) => set("tiers", { ...c.tiers, B: v })} />
          </Field>
          <Field id="cfg-c" label="Serviço curva C (%)">
            <NumberInput id="cfg-c" percent value={c.tiers.C} onChange={(v) => set("tiers", { ...c.tiers, C: v })} />
          </Field>
          <Field id="cfg-disc" label="Desconto máximo (%)">
            <NumberInput id="cfg-disc" percent value={c.maxDiscount} onChange={(v) => set("maxDiscount", v)} />
          </Field>
          {c.campaigns.map((x) => (
            <div key={x.id} className="grid grid-cols-2 gap-2 sm:col-span-2">
              <Field id={`cfg-${x.id}-s`} label={`${x.name}: início`}>
                <DateInput id={`cfg-${x.id}-s`} value={x.start} onChange={(v) => setCampaign(x.id, { start: v })} />
              </Field>
              <Field id={`cfg-${x.id}-e`} label="fim">
                <DateInput id={`cfg-${x.id}-e`} value={x.end} onChange={(v) => setCampaign(x.id, { end: v })} />
              </Field>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4" disabled={dataLocked}>
        <legend className="mb-1 text-sm font-medium">Processamento dos dados</legend>
        <p className="text-xs text-muted-foreground">
          {dataLocked ? "Estes valores mudam como os CSVs são processados. Para alterá-los, envie os arquivos acima." : "Usados ao processar os CSVs enviados."}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="cfg-ref" label="Data de referência">
            <DateInput id="cfg-ref" value={c.referenceDate} disabled={dataLocked} onChange={(v) => set("referenceDate", v)} />
          </Field>
          <Field id="cfg-hist" label="Início do histórico">
            <DateInput id="cfg-hist" value={c.historyStart} disabled={dataLocked} onChange={(v) => set("historyStart", v)} />
          </Field>
          <Field id="cfg-idle" label="Parado acima de (dias de cobertura)">
            <NumberInput id="cfg-idle" value={c.idleCoverageDays} disabled={dataLocked} onChange={(v) => set("idleCoverageDays", v)} />
          </Field>
          <Field id="cfg-share" label="Ganho da BF atribuído ao preço (%)">
            <NumberInput id="cfg-share" percent value={c.markdownPriceShare} disabled={dataLocked} onChange={(v) => set("markdownPriceShare", v)} />
          </Field>
          <Field id="cfg-cap" label="Custo de capital (% a.a.)">
            <NumberInput id="cfg-cap" percent value={c.capitalCostYear} disabled={dataLocked} onChange={(v) => set("capitalCostYear", v)} />
          </Field>
          <Field id="cfg-sto" label="Armazenagem (% a.m.)">
            <NumberInput id="cfg-sto" percent value={c.storageCostMonth} disabled={dataLocked} onChange={(v) => set("storageCostMonth", v)} />
          </Field>
          {c.campaigns.map((x) => (
            <div key={x.id} className="grid grid-cols-2 gap-2 sm:col-span-2">
              <Field id={`cfg-${x.id}-ls`} label={`${x.name} do ano anterior: início`}>
                <DateInput id={`cfg-${x.id}-ls`} value={x.lastYearStart} disabled={dataLocked} onChange={(v) => setCampaign(x.id, { lastYearStart: v })} />
              </Field>
              <Field id={`cfg-${x.id}-le`} label="fim">
                <DateInput id={`cfg-${x.id}-le`} value={x.lastYearEnd} disabled={dataLocked} onChange={(v) => setCampaign(x.id, { lastYearEnd: v })} />
              </Field>
            </div>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
