// Confere se cada número do texto do agente veio de alguma saída de ferramenta.

const TOKEN =
  /(R\$\s*)?(\d{1,3}(?:[. ]\d{3})+(?:,\d+)?|\d+,\d+|\d+\.\d+|\d+)(\s*(?:milhões|milhão|mi\b|mil\b|%))?/gi;
const DATE = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b/g;
const REL_TOLERANCE = 0.005;

interface Found { text: string; value: number; ignorable: boolean }

/** Hífens tipográficos viram "-" e espaços especiais viram espaço comum. */
function normalize(text: string): string {
  return text.replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[\u00a0\u202f\u2009\u2007]/g, " ");
}

function parseBR(raw: string): number {
  if (/^\d{1,3}([. ]\d{3})+(,\d+)?$/.test(raw)) return Number(raw.replace(/[. ]/g, "").replace(",", "."));
  return Number(raw.replace(",", "."));
}

function extract(raw: string): Found[] {
  const text = normalize(raw);
  const masked = text.replace(DATE, (m) => " ".repeat(m.length));
  const out: Found[] = [];
  for (const m of masked.matchAll(TOKEN)) {
    const start = m.index!;
    const end = start + m[0].length;
    const before = masked[start - 1] ?? " ";
    const after = masked[end] ?? " ";
    // colado a letra ou hífen: código de SKU, PO, fornecedor
    if (!m[1] && (/[\p{L}\-_]/u.test(before) || /[\p{L}\-_]/u.test(after))) continue;
    let value = parseBR(m[2]);
    const suffix = (m[3] ?? "").trim().toLowerCase();
    if (suffix.startsWith("mi")) value *= suffix === "mil" ? 1e3 : 1e6;
    const plainInt = !m[1] && !suffix && /^\d+$/.test(m[2]);
    const ignorable = plainInt && (value <= 10 || (value >= 2000 && value <= 2099));
    out.push({ text: m[0].trim(), value, ignorable });
  }
  return out;
}

function collect(node: unknown, refs: number[]): void {
  if (typeof node === "number" && Number.isFinite(node)) {
    refs.push(node, node * 100);
  } else if (typeof node === "string") {
    for (const f of extract(node)) refs.push(f.value);
  } else if (Array.isArray(node)) {
    for (const x of node) collect(x, refs);
  } else if (node && typeof node === "object") {
    for (const x of Object.values(node)) collect(x, refs);
  }
}

export function numberGuard(text: string, toolLog: string[]): { ok: boolean; unverified: string[] } {
  const refs: number[] = [];
  for (const entry of toolLog) {
    try {
      collect(JSON.parse(entry), refs);
    } catch {
      collect(entry, refs);
    }
  }
  const unverified = extract(text)
    .filter((f) => !f.ignorable)
    .filter((f) => !refs.some((r) => Math.abs(r - f.value) <= Math.max(REL_TOLERANCE * Math.abs(f.value), 1e-9)))
    .map((f) => f.text);
  return { ok: unverified.length === 0, unverified };
}
