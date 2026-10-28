import type { ISODate } from "@/core/types";

// Intl usa espaço não separável entre "R$" e o número; normaliza para espaço comum.
const clean = (s: string) => s.replace(/[  ]/g, " ");

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dec = (digits: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** "R$ 1.234,56". Com `compact`, valores grandes viram "R$ 6,79 mi" ou "R$ 228 mil". */
export function brl(v: number, compact = false): string {
  if (compact) {
    const sign = v < 0 ? "-" : "";
    const a = Math.abs(v);
    if (a >= 1e6) return `${sign}R$ ${dec(2).format(a / 1e6)} mi`;
    if (a >= 1e3) return `${sign}R$ ${dec(0).format(a / 1e3)} mil`;
    return `${sign}R$ ${dec(0).format(a)}`;
  }
  return clean(money.format(v));
}

/** Fração como percentual: 0.968 → "96,8%". */
export function pct(v: number, digits = 1): string {
  return `${dec(digits).format(v * 100)}%`;
}

/** "2026-10-02" → "02/10/2026", sem passar por Date (sem fuso). */
export function dateBR(d: ISODate): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function intBR(v: number): string {
  return dec(0).format(Math.round(v));
}
