"use client";

import type { ReactNode } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** "i" com explicação; abre no foco do teclado e no toque, não só no hover. */
export function InfoTip({ children, label = "Mais informações" }: { children: ReactNode; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] leading-none font-bold text-muted-foreground hover:bg-[#e3dcd2] hover:text-foreground"
          />
        }
      >
        i
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-pretty">{children}</TooltipContent>
    </Tooltip>
  );
}

/** Indicador: rótulo, valor e uma nota curta. `tone` só para estado. */
export function Stat({
  label,
  value,
  note,
  info,
  tone = "neutral",
  children,
  className,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  info?: ReactNode;
  tone?: "neutral" | "danger" | "warn";
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-2xl bg-card p-5 ring-1 ring-foreground/8", className)}>
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        {label}
        {info && <InfoTip label={`Sobre ${label.toLowerCase()}`}>{info}</InfoTip>}
      </div>
      <div className={cn("text-[28px] leading-tight font-bold tracking-tight tabular-nums", tone === "danger" && "text-danger-ink", tone === "warn" && "text-warn-ink")}>{value}</div>
      {children}
      {note && <div className="text-[13px] leading-snug text-muted-foreground">{note}</div>}
    </div>
  );
}

/** Barra horizontal simples (HTML), para comparar linhas sem ler o número. */
export function Meter({ value, max, tone = "ink", marker, className, label }: { value: number; max: number; tone?: "ink" | "danger" | "warn" | "muted"; marker?: number; className?: string; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const color = { ink: "bg-foreground/80", danger: "bg-danger", warn: "bg-warn", muted: "bg-chart-3" }[tone];
  return (
    <div className={cn("relative h-2 rounded-full bg-secondary", className)} role={label ? "img" : undefined} aria-label={label}>
      <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%` }} />
      {marker !== undefined && max > 0 && (
        <div className="absolute -top-1 -bottom-1 border-l border-dashed border-foreground/50" style={{ left: `${Math.min(100, (marker / max) * 100)}%` }} aria-hidden />
      )}
    </div>
  );
}

/** Grupo de pílulas exclusivas (filtros e seletores curtos), com aria-pressed. */
export function Pills<T extends string>({ value, onChange, items, label, size = "md" }: { value: T; onChange(v: T): void; items: { value: T; label: ReactNode }[]; label: string; size?: "sm" | "md" }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((it) => {
        const on = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(it.value)}
            className={cn(
              "rounded-full border font-medium whitespace-nowrap transition-colors",
              size === "md" ? "h-9 px-3.5 text-sm" : "h-8 px-2.5 text-[13px]",
              on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground hover:bg-muted",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** Aviso de uma linha. Âmbar só quando é um alerta de verdade. */
export function Notice({ tone = "neutral", children, icon = true }: { tone?: "neutral" | "warn" | "danger"; children: ReactNode; icon?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm",
        tone === "warn" && "bg-warn-soft text-[#5c3307]",
        tone === "danger" && "bg-danger-soft text-danger-ink",
        tone === "neutral" && "bg-secondary/70 text-foreground/85",
      )}
    >
      {icon && <TriangleAlertIcon className={cn("mt-0.5 size-4 shrink-0", tone === "warn" ? "text-warn-ink" : tone === "danger" ? "text-danger-ink" : "text-muted-foreground")} />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Rodapé de tabela longa: quantas linhas aparecem e botão para carregar mais. */
export function ShowMore({ shown, total, step, noun, onMore }: { shown: number; total: number; step: number; noun: string; onMore(): void }) {
  if (total === 0) return null;
  const next = Math.min(step, total - shown);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3 text-[13px] text-muted-foreground">
      <span aria-live="polite">
        Mostrando {shown.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} {noun}
      </span>
      {next > 0 && (
        <button type="button" onClick={onMore} className="font-medium text-primary underline underline-offset-2 hover:text-foreground">
          Mostrar mais {next.toLocaleString("pt-BR")}
        </button>
      )}
    </div>
  );
}

/** Contêiner de seção: título, descrição opcional e ações à direita. */
export function Section({ title, description, actions, children, className, bodyClassName }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("min-w-0 rounded-2xl bg-card ring-1 ring-foreground/8", className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          {description && <p className="mt-0.5 max-w-[70ch] text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
      <div className={cn("px-5 pb-5", bodyClassName)}>{children}</div>
    </section>
  );
}
