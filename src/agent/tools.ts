import { addDays } from "@/core/dates";
import { leadTimeFor, serviceLevelFor, type PlanLine } from "@/core/plan/allocate";
import { findCriticalCases, type CriticalCase } from "@/core/plan/critical";
import { simulateSku } from "@/core/plan/simulate";
import { validateDiscount, validateLine, validatePlan, type ValidationError } from "@/core/plan/validate";
import type { Scenario } from "@/core/types";
import { basePlanFor, replaceSkuLines, type AgentSession, type Change } from "./session";

export interface ToolDef { name: string; description: string; parameters: object }
export interface ToolResult { ok: boolean; result: unknown; error?: string }

class ToolError extends Error {}

const str = { type: "string" };
const motivo = { type: "string", description: "Por que, citando números obtidos das ferramentas." };
const schema = (props: Record<string, object>, required: string[]) => ({ type: "object", properties: props, required, additionalProperties: false });

export const toolDefs: ToolDef[] = [
  { name: "resumo_plano", description: "Totais do plano atual: custo, orçamento, orçamento restante, fill esperado, linhas por origem e não financiadas.", parameters: schema({}, []) },
  {
    name: "listar_casos_criticos",
    description: "Casos que pedem julgamento, do mais grave ao menos grave (máx. 40): ruptura antes da BF, lead time arriscado para campanha, corte de orçamento em SKU A/B, PO atrasado, histórico curto.",
    parameters: schema({ tipo: { type: "string", enum: ["stockout_before_campaign", "leadtime_campaign", "budget_cut", "late_po", "short_history"] }, limite: { type: "integer", minimum: 1, maximum: 40 } }, []),
  },
  { name: "consultar_sku", description: "Situação de um SKU: estoque, cobertura, demanda, lead time, POs em aberto, linhas no plano, projeção nas campanhas e opções de liquidação.", parameters: schema({ sku: str }, ["sku"]) },
  { name: "alterar_quantidade", description: "Muda a quantidade de uma linha do plano, em lotes (múltiplos do lote mínimo).", parameters: schema({ linha_id: str, lotes: { type: "integer", minimum: 1 }, motivo }, ["linha_id", "lotes", "motivo"]) },
  { name: "alterar_emissao", description: "Muda a data de emissão de uma linha (AAAA-MM-DD, dentro da janela). A chegada é recalculada pelo lead time.", parameters: schema({ linha_id: str, data: str, motivo }, ["linha_id", "data", "motivo"]) },
  { name: "remover_linha", description: "Remove uma linha do plano.", parameters: schema({ linha_id: str, motivo }, ["linha_id", "motivo"]) },
  { name: "adicionar_linha", description: "Adiciona um pedido de um SKU ativo: lotes e data de emissão (AAAA-MM-DD).", parameters: schema({ sku: str, lotes: { type: "integer", minimum: 1 }, data: str, motivo }, ["sku", "lotes", "data", "motivo"]) },
  { name: "definir_nivel_servico", description: "Define o nível de serviço alvo de um SKU (0,80 a 0,995) e recalcula as linhas dele.", parameters: schema({ sku: str, nivel: { type: "number", minimum: 0.8, maximum: 0.995 }, motivo }, ["sku", "nivel", "motivo"]) },
  {
    name: "aplicar_cenario",
    description: "Recalcula o plano base com um cenário: multiplicadores do ganho de campanha (ex.: {\"bf\": 1.2}), orçamento, marcas protegidas (98%), modo uniforme e reinvestimento do caixa de liquidação. Descarta ajustes de linha anteriores.",
    parameters: schema(
      {
        multiplicadores: { type: "object", additionalProperties: { type: "number" } },
        orcamento: { type: "number", minimum: 0 },
        marcas_protegidas: { type: "array", items: str },
        modo: { type: "string", enum: ["tiered", "uniform"] },
        nivel_uniforme: { type: "number", minimum: 0.8, maximum: 0.995 },
        reinvestir_liquidacao: { type: "boolean" },
        motivo,
      },
      ["motivo"],
    ),
  },
  { name: "propor_liquidacao", description: "Propõe liquidar um SKU com excesso usando um dos descontos calculados (0,1 a 0,4).", parameters: schema({ sku: str, desconto: { type: "number" }, motivo }, ["sku", "desconto", "motivo"]) },
  { name: "finalizar", description: "Encerra a revisão com um resumo curto (até 6 linhas) para o chefe de estoque.", parameters: schema({ resumo: str }, ["resumo"]) },
];

// ---------- validação de argumentos ----------

function obj(args: unknown): Record<string, unknown> {
  if (typeof args !== "object" || args === null || Array.isArray(args)) throw new ToolError("Argumentos devem ser um objeto JSON.");
  return args as Record<string, unknown>;
}
function reqStr(a: Record<string, unknown>, k: string): string {
  const v = a[k];
  if (typeof v !== "string" || !v.trim()) throw new ToolError(`Campo "${k}" obrigatório (texto).`);
  return v.trim();
}
function reqPosInt(a: Record<string, unknown>, k: string): number {
  const v = a[k];
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) throw new ToolError(`NON_POSITIVE: campo "${k}" deve ser inteiro positivo.`);
  return v;
}
function optNum(a: Record<string, unknown>, k: string): number | undefined {
  const v = a[k];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ToolError(`Campo "${k}" deve ser número.`);
  return v;
}
const fail = (errs: ValidationError[]) => {
  if (errs.length) throw new ToolError(errs.map((e) => `${e.code}: ${e.message}`).join(" "));
};

// ---------- auxiliares ----------

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

function findSku(s: AgentSession, sku: string) {
  const x = s.ds.skus.find((k) => k.sku === sku);
  if (!x) throw new ToolError(`UNKNOWN_SKU: SKU ${sku} não existe no cadastro.`);
  return x;
}

function findLine(s: AgentSession, id: string): PlanLine {
  const l = s.plan.lines.find((x) => x.id === id);
  if (!l) throw new ToolError(`Linha ${id} não existe no plano atual. Use resumo_plano ou consultar_sku para ver os ids.`);
  return l;
}

function describeLine(l: PlanLine) {
  return `${l.lots} lote(s) = ${l.units} un, emissão ${l.emitBy}, R$ ${r2(l.cost)}`;
}

function summary(s: AgentSession) {
  const p = s.plan;
  return {
    linhas: p.lines.length,
    custo_total: r2(p.totalCost),
    orcamento: r2(p.budget),
    orcamento_restante: r2(p.budget - p.totalCost),
    fill_esperado: r4(p.expectedFillRate),
    fill_esperado_plano_base: r4(s.basePlan.expectedFillRate),
    linhas_base: p.lines.filter((l) => l.origin === "base").length,
    linhas_agente: p.lines.filter((l) => l.origin === "agent").length,
    linhas_nao_financiadas: p.unfunded.length,
    custo_nao_financiado: r2(p.unfunded.reduce((a, l) => a + l.cost, 0)),
    mudancas: s.changes.length,
  };
}

let changeSeq = 0;
function record(s: AgentSession, c: Omit<Change, "id">) {
  s.changes.push({ id: `c${Date.now().toString(36)}${(changeSeq++).toString(36)}`, ...c });
}

/** Valida o plano inteiro (com o orçamento) antes de aplicar uma troca de linhas de um SKU. */
function commitSku(s: AgentSession, sku: string, lines: PlanLine[], level?: number) {
  const candidate = [...s.plan.lines.filter((l) => l.sku !== sku), ...lines];
  fail(validatePlan(candidate, s.ds, s.config, s.plan.budget).filter((e) => e.code === "BUDGET"));
  s.plan = replaceSkuLines(s, sku, lines, level);
}

const KIND_ORDER: CriticalCase["kind"][] = ["stockout_before_campaign", "leadtime_campaign", "budget_cut", "late_po", "short_history"];
const ABC_ORDER = { A: 0, B: 1, C: 2 };

// ---------- handlers ----------

type Handler = (s: AgentSession, a: Record<string, unknown>) => unknown;

const handlers: Record<string, Handler> = {
  resumo_plano: (s) => summary(s),

  listar_casos_criticos: (s, a) => {
    const tipo = a.tipo === undefined ? undefined : reqStr(a, "tipo");
    const limite = Math.min(40, a.limite === undefined ? 40 : reqPosInt(a, "limite"));
    const abc = new Map(s.ds.skus.map((k) => [k.sku, k.abc]));
    const all = findCriticalCases(s.plan, s.ds, s.config, s.scenario);
    const filtered = all
      .filter((c) => !tipo || c.kind === tipo)
      .sort(
        (x, y) =>
          KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind) ||
          ABC_ORDER[abc.get(x.sku) ?? "C"] - ABC_ORDER[abc.get(y.sku) ?? "C"] ||
          Number(y.detail.unfundedCost ?? 0) - Number(x.detail.unfundedCost ?? 0),
      );
    const porTipo: Record<string, number> = {};
    for (const c of all) porTipo[c.kind] = (porTipo[c.kind] ?? 0) + 1;
    return { total: filtered.length, por_tipo: porTipo, casos: filtered.slice(0, limite).map((c) => ({ ...c, abc: abc.get(c.sku) })) };
  },

  consultar_sku: (s, a) => {
    const k = findSku(s, reqStr(a, "sku"));
    const lt = leadTimeFor(s.ds, k.supplier);
    const lines = s.plan.lines.filter((l) => l.sku === k.sku);
    const sim = simulateSku(k, lt, serviceLevelFor(k, s.config, s.scenario), s.config, s.scenario, lines);
    const at = (d: string) => sim.projected.find((p) => p.date === d)?.onHand;
    const { weekly: _w, markdown, ...rest } = k;
    void _w;
    return {
      ...rest,
      lead_time: { mediana: lt.median, p90: lt.p90, max: lt.max },
      linhas_plano: lines.map((l) => ({ id: l.id, lotes: l.lots, unidades: l.units, emissao: l.emitBy, chegada: l.arrival, custo: r2(l.cost), origem: l.origin })),
      linhas_nao_financiadas: s.plan.unfunded.filter((l) => l.sku === k.sku).map((l) => ({ lotes: l.lots, emissao: l.emitBy, custo: r2(l.cost) })),
      projecao: {
        ...Object.fromEntries(s.config.campaigns.map((c) => [`estoque_em_${c.start}`, at(addDays(c.start, -1)) === undefined ? null : Math.round(at(addDays(c.start, -1))!)])),
        data_ruptura: sim.stockoutDate,
        unidades_perdidas_ate_fim_janela: Math.round(sim.lostUnits),
      },
      opcoes_liquidacao: markdown.map((o) => ({ desconto: o.discount, unidades_vendidas_90d: Math.round(o.unitsSold90d), capital_liberado: r2(o.capitalFreed), custo_manter: r2(o.holdingCost) })),
    };
  },

  alterar_quantidade: (s, a) => {
    const l = findLine(s, reqStr(a, "linha_id"));
    const lots = reqPosInt(a, "lotes");
    const reason = reqStr(a, "motivo");
    const k = findSku(s, l.sku);
    const next: PlanLine = { ...l, lots, units: lots * k.lotUnits, cost: lots * k.lotCost, origin: "agent", reason };
    fail(validateLine(next, s.ds, s.config));
    commitSku(s, l.sku, [...s.plan.lines.filter((x) => x.sku === l.sku && x.id !== l.id), next]);
    record(s, { kind: "quantity", sku: l.sku, lineId: l.id, before: describeLine(l), after: describeLine(next), reason });
    return summary(s);
  },

  alterar_emissao: (s, a) => {
    const l = findLine(s, reqStr(a, "linha_id"));
    const date = reqStr(a, "data");
    const reason = reqStr(a, "motivo");
    fail(validateLine({ ...l, emitBy: date }, s.ds, s.config));
    const lt = leadTimeFor(s.ds, l.supplier);
    const next: PlanLine = { ...l, emitBy: date, arrival: addDays(date, Math.max(1, Math.round(lt.median))), origin: "agent", reason };
    commitSku(s, l.sku, [...s.plan.lines.filter((x) => x.sku === l.sku && x.id !== l.id), next]);
    record(s, { kind: "emission", sku: l.sku, lineId: l.id, before: describeLine(l), after: describeLine(next), reason });
    return summary(s);
  },

  remover_linha: (s, a) => {
    const l = findLine(s, reqStr(a, "linha_id"));
    const reason = reqStr(a, "motivo");
    commitSku(s, l.sku, s.plan.lines.filter((x) => x.sku === l.sku && x.id !== l.id));
    record(s, { kind: "remove", sku: l.sku, lineId: l.id, before: describeLine(l), after: "removida", reason });
    return summary(s);
  },

  adicionar_linha: (s, a) => {
    const k = findSku(s, reqStr(a, "sku"));
    const lots = reqPosInt(a, "lotes");
    const date = reqStr(a, "data");
    const reason = reqStr(a, "motivo");
    const lt = leadTimeFor(s.ds, k.supplier);
    const mine = s.plan.lines.filter((x) => x.sku === k.sku);
    const seq = Math.max(-1, ...mine.map((x) => x.seq)) + 1;
    const line: PlanLine = {
      id: `${k.sku}-a${seq}`, sku: k.sku, supplier: k.supplier, emitBy: date, arrival: addDays(date, Math.max(1, Math.round(lt.median))),
      lots, units: lots * k.lotUnits, cost: lots * k.lotCost, seq, reason, origin: "agent", priority: 0,
    };
    fail(validateLine(line, s.ds, s.config));
    commitSku(s, k.sku, [...mine, line]);
    record(s, { kind: "add", sku: k.sku, lineId: line.id, before: "—", after: describeLine(line), reason });
    return summary(s);
  },

  definir_nivel_servico: (s, a) => {
    const k = findSku(s, reqStr(a, "sku"));
    const level = optNum(a, "nivel");
    const reason = reqStr(a, "motivo");
    if (level === undefined || level < 0.8 || level > 0.995) throw new ToolError('Campo "nivel" deve estar entre 0.80 e 0.995.');
    if (k.status !== "ativo") throw new ToolError(`DISCONTINUED: SKU ${k.sku} é descontinuado.`);
    const drafts = simulateSku(k, leadTimeFor(s.ds, k.supplier), level, s.config, s.scenario).lines;
    const lines: PlanLine[] = drafts.map((d) => ({ ...d, id: `${d.sku}-${d.seq}`, origin: "agent", reason, priority: 0 }));
    const before = s.plan.levels[k.sku];
    commitSku(s, k.sku, lines, level);
    record(s, { kind: "service_level", sku: k.sku, before: `nível ${before ?? "—"}`, after: `nível ${level}, ${lines.length} linha(s)`, reason });
    return summary(s);
  },

  aplicar_cenario: (s, a) => {
    const reason = reqStr(a, "motivo");
    const sc: Scenario = { ...s.scenario };
    if (a.multiplicadores !== undefined) {
      const m = obj(a.multiplicadores);
      const out: Record<string, number> = { ...sc.campaignMultiplier };
      for (const [id, v] of Object.entries(m)) {
        if (!s.config.campaigns.some((c) => c.id === id)) throw new ToolError(`Campanha "${id}" não existe. Use: ${s.config.campaigns.map((c) => c.id).join(", ")}.`);
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 5) throw new ToolError(`Multiplicador de "${id}" deve estar entre 0 e 5.`);
        out[id] = v;
      }
      sc.campaignMultiplier = out;
    }
    const budget = optNum(a, "orcamento");
    if (budget !== undefined) {
      if (budget < 0) throw new ToolError('Campo "orcamento" não pode ser negativo.');
      sc.budget = budget;
    }
    if (a.marcas_protegidas !== undefined) {
      if (!Array.isArray(a.marcas_protegidas) || a.marcas_protegidas.some((b) => typeof b !== "string")) throw new ToolError('"marcas_protegidas" deve ser lista de textos.');
      sc.protectedBrands = a.marcas_protegidas as string[];
    }
    if (a.modo !== undefined) {
      if (a.modo !== "tiered" && a.modo !== "uniform") throw new ToolError('"modo" deve ser "tiered" ou "uniform".');
      sc.serviceMode = a.modo;
    }
    const lvl = optNum(a, "nivel_uniforme");
    if (lvl !== undefined) {
      if (lvl < 0.8 || lvl > 0.995) throw new ToolError('"nivel_uniforme" deve estar entre 0.80 e 0.995.');
      sc.uniformLevel = lvl;
    }
    if (a.reinvestir_liquidacao !== undefined) {
      if (typeof a.reinvestir_liquidacao !== "boolean") throw new ToolError('"reinvestir_liquidacao" deve ser booleano.');
      sc.reinvestMarkdown = a.reinvestir_liquidacao;
    }
    const before = summary(s);
    s.scenario = sc;
    s.basePlan = basePlanFor(s.ds, s.config, sc);
    s.plan = s.basePlan;
    s.changes = s.changes.filter((c) => c.kind === "markdown" || c.kind === "scenario");
    record(s, {
      kind: "scenario", sku: "*",
      before: `custo R$ ${before.custo_total}, fill ${before.fill_esperado}`,
      after: `custo R$ ${r2(s.plan.totalCost)}, fill ${r4(s.plan.expectedFillRate)}`,
      reason,
    });
    return summary(s);
  },

  propor_liquidacao: (s, a) => {
    const k = findSku(s, reqStr(a, "sku"));
    const d = optNum(a, "desconto");
    const reason = reqStr(a, "motivo");
    if (d === undefined) throw new ToolError('Campo "desconto" obrigatório.');
    fail(validateDiscount(d, s.config));
    const option = k.markdown.find((o) => Math.abs(o.discount - d) < 1e-9 && o.discount > 0);
    if (!option) {
      const avail = k.markdown.filter((o) => o.discount > 0).map((o) => o.discount);
      throw new ToolError(avail.length ? `Desconto ${d} não calculado para ${k.sku}. Opções: ${avail.join(", ")}.` : `SKU ${k.sku} não tem excesso para liquidar.`);
    }
    const prev = s.markdowns.find((m) => m.sku === k.sku);
    s.markdowns = [
      ...s.markdowns.filter((m) => m.sku !== k.sku),
      { sku: k.sku, option, excessUnits: k.metrics.idleUnits, coverageDays: k.metrics.coverageDays, reason },
    ];
    record(s, { kind: "markdown", sku: k.sku, before: prev ? `${prev.option.discount}` : "—", after: `${d}`, reason });
    return { sku: k.sku, desconto: d, capital_liberado: r2(option.capitalFreed), unidades_vendidas_90d: Math.round(option.unitsSold90d), liquidacoes_propostas: s.markdowns.length };
  },

  finalizar: (_s, a) => ({ resumo: reqStr(a, "resumo") }),
};

/** Executa uma ferramenta. Nunca lança: erros voltam como { ok: false, error } e a sessão fica intacta. */
export function callTool(session: AgentSession, name: string, args: unknown): ToolResult {
  const handler = handlers[name];
  let out: ToolResult;
  if (!handler) {
    out = { ok: false, result: null, error: `Ferramenta desconhecida: ${name}.` };
  } else {
    const snapshot = { plan: session.plan, basePlan: session.basePlan, scenario: session.scenario, changes: [...session.changes], markdowns: session.markdowns };
    try {
      out = { ok: true, result: handler(session, obj(args)) };
    } catch (e) {
      Object.assign(session, snapshot);
      out = { ok: false, result: null, error: e instanceof ToolError ? e.message : `Erro interno: ${(e as Error).message}` };
    }
  }
  // O resumo final não é fonte de números: senão o texto verificaria a si mesmo.
  if (name !== "finalizar") session.toolLog.push(JSON.stringify(out.ok ? out.result : { erro: out.error }));
  return out;
}
