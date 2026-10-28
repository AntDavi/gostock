import type { ISODate } from "./types";

const DAY = 86_400_000;

function toMs(d: ISODate): number {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
}

function fromMs(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromMs(toMs(d) + n * DAY);
}

/** Dias de a até b (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toMs(b) - toMs(a)) / DAY);
}

export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let ms = toMs(from), end = toMs(to); ms <= end; ms += DAY) out.push(fromMs(ms));
  return out;
}

export function inRange(d: ISODate, from: ISODate, to: ISODate): boolean {
  return d >= from && d <= to;
}

/** Segunda-feira da semana de d. */
export function weekStart(d: ISODate): ISODate {
  const dow = new Date(toMs(d)).getUTCDay(); // 0 = domingo
  return addDays(d, -((dow + 6) % 7));
}

export function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && fromMs(toMs(s)) === s;
}
