import { describe, expect, test } from "vitest";
import { createSession } from "@/agent/session";
import { callTool, toolDefs } from "@/agent/tools";
import { defaultConfig } from "@/core/config";
import { runPipeline } from "@/core/pipeline";
import { rawMini } from "../fixtures/mini";

const ds = runPipeline(rawMini(), { ...defaultConfig, budget: 1e9 });
const fresh = () => createSession(ds);

describe("createSession", () => {
  test("plano base calculado e plano atual igual a ele", () => {
    const s = fresh();
    expect(s.plan.lines.length).toBeGreaterThan(0);
    expect(s.plan).toEqual(s.basePlan);
    expect(s.changes).toEqual([]);
    expect(s.markdowns).toEqual([]);
  });
  test("aceita estado anterior", () => {
    const a = fresh();
    callTool(a, "remover_linha", { linha_id: a.plan.lines[0].id, motivo: "x" });
    const b = createSession(ds, { plan: a.plan, changes: a.changes, basePlan: a.basePlan });
    expect(b.plan.lines.length).toBe(a.plan.lines.length);
    expect(b.changes).toHaveLength(1);
  });
});

describe("toolDefs", () => {
  test("todas as ferramentas descritas com JSON Schema", () => {
    const names = toolDefs.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining([
      "resumo_plano", "listar_casos_criticos", "consultar_sku", "alterar_quantidade", "alterar_emissao",
      "remover_linha", "adicionar_linha", "definir_nivel_servico", "aplicar_cenario", "propor_liquidacao", "finalizar",
    ]));
    toolDefs.forEach((t) => expect(t.parameters).toMatchObject({ type: "object" }));
  });
});

describe("callTool", () => {
  test("alterar_quantidade válida registra Change antes→depois", () => {
    const s = fresh();
    const id = s.plan.lines[0].id;
    const r = callTool(s, "alterar_quantidade", { linha_id: id, lotes: 1, motivo: "teste" });
    expect(r.ok).toBe(true);
    expect(s.changes[0]).toMatchObject({ kind: "quantity", lineId: id, reason: "teste" });
    const line = s.plan.lines.find((l) => l.id === id)!;
    expect(line.lots).toBe(1);
    expect(line.origin).toBe("agent");
    expect(s.plan.totalCost).toBeCloseTo(s.plan.lines.reduce((a, l) => a + l.cost, 0));
    expect(s.basePlan.lines.find((l) => l.id === id)!.lots).not.toBe(1);
  });

  test("SKU inexistente → erro, sessão intacta", () => {
    const s = fresh();
    const before = JSON.stringify(s.plan);
    const r = callTool(s, "adicionar_linha", { sku: "ZZZ", lotes: 1, data: "2026-10-01", motivo: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("UNKNOWN_SKU");
    expect(JSON.stringify(s.plan)).toBe(before);
    expect(s.changes).toEqual([]);
  });

  test.each([0, -1, 1.5, "2"])("lotes inválidos (%s) → erro", (lotes) => {
    const s = fresh();
    const r = callTool(s, "alterar_quantidade", { linha_id: s.plan.lines[0].id, lotes, motivo: "x" });
    expect(r.ok).toBe(false);
    expect(s.changes).toEqual([]);
  });

  test("estourar orçamento → erro BUDGET", () => {
    const tight = runPipeline(rawMini(), defaultConfig);
    const s = createSession(tight, { config: { ...defaultConfig, budget: 1e9 } });
    const s2 = createSession(tight, { config: { ...defaultConfig, budget: s.plan.totalCost } });
    const r = callTool(s2, "adicionar_linha", { sku: "AAA-1", lotes: 50, data: "2026-10-02", motivo: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("BUDGET");
  });

  test("data inválida ou fora da janela → erro", () => {
    const s = fresh();
    expect(callTool(s, "alterar_emissao", { linha_id: s.plan.lines[0].id, data: "30/10/2026", motivo: "x" }).error).toContain("BAD_DATE");
    expect(callTool(s, "alterar_emissao", { linha_id: s.plan.lines[0].id, data: "2027-01-05", motivo: "x" }).error).toContain("WINDOW");
  });

  test("alterar_emissao recalcula a chegada pelo lead time", () => {
    const s = fresh();
    const l = s.plan.lines[0];
    const gap = Date.parse(l.arrival) - Date.parse(l.emitBy);
    expect(callTool(s, "alterar_emissao", { linha_id: l.id, data: "2026-10-03", motivo: "antecipar" }).ok).toBe(true);
    const n = s.plan.lines.find((x) => x.id === l.id)!;
    expect(Date.parse(n.arrival) - Date.parse(n.emitBy)).toBe(gap);
  });

  test("remover e adicionar linha", () => {
    const s = fresh();
    const n0 = s.plan.lines.length;
    expect(callTool(s, "remover_linha", { linha_id: s.plan.lines[0].id, motivo: "x" }).ok).toBe(true);
    expect(s.plan.lines).toHaveLength(n0 - 1);
    const r = callTool(s, "adicionar_linha", { sku: "AAA-1", lotes: 2, data: "2026-10-05", motivo: "reforço BF" });
    expect(r.ok).toBe(true);
    const added = s.plan.lines.find((l) => l.origin === "agent" && l.emitBy === "2026-10-05")!;
    expect(added.units).toBe(200);
    expect(added.reason).toBe("reforço BF");
    expect(s.changes.map((c) => c.kind)).toEqual(["remove", "add"]);
  });

  test("linha inexistente → erro", () => expect(callTool(fresh(), "remover_linha", { linha_id: "nao-existe", motivo: "x" }).ok).toBe(false));
  test("args que não são objeto → erro, sem exceção", () => expect(callTool(fresh(), "alterar_quantidade", "lixo").ok).toBe(false));
  test("ferramenta desconhecida → erro", () => expect(callTool(fresh(), "apagar_tudo", {}).error).toContain("desconhecida"));
  test("motivo obrigatório", () => expect(callTool(fresh(), "remover_linha", { linha_id: "x" }).ok).toBe(false));

  test("definir_nivel_servico re-simula o SKU e valida faixa", () => {
    const s = fresh();
    expect(callTool(s, "definir_nivel_servico", { sku: "AAA-1", nivel: 1.2, motivo: "x" }).ok).toBe(false);
    expect(callTool(s, "definir_nivel_servico", { sku: "AAA-1", nivel: 0.8, motivo: "cauda" }).ok).toBe(true);
    expect(s.plan.levels["AAA-1"]).toBe(0.8);
    expect(s.plan.lines.filter((l) => l.sku === "AAA-1").every((l) => l.origin === "agent")).toBe(true);
  });

  test("aplicar_cenario BF 1,2 aumenta a demanda do plano", () => {
    const s = fresh();
    const d0 = s.plan.demandUnits;
    expect(callTool(s, "aplicar_cenario", { multiplicadores: { bf: 1.2 }, motivo: "BF maior" }).ok).toBe(true);
    expect(s.plan.demandUnits).toBeGreaterThan(d0);
    expect(s.scenario.campaignMultiplier.bf).toBe(1.2);
    expect(s.changes.at(-1)!.kind).toBe("scenario");
    expect(s.plan).toEqual(s.basePlan);
  });

  test("aplicar_cenario com orçamento muda o teto", () => {
    const s = fresh();
    callTool(s, "aplicar_cenario", { orcamento: 1000, motivo: "corte" });
    expect(s.plan.budget).toBe(1000);
    expect(s.plan.totalCost).toBeLessThanOrEqual(1000);
  });

  test("propor_liquidacao: desconto acima do teto → DISCOUNT; válido entra na lista", () => {
    const s = fresh();
    expect(callTool(s, "propor_liquidacao", { sku: "DDD-1", desconto: 0.5, motivo: "x" }).error).toContain("DISCOUNT");
    expect(callTool(s, "propor_liquidacao", { sku: "DDD-1", desconto: 0.3, motivo: "descontinuado" }).ok).toBe(true);
    expect(s.markdowns).toHaveLength(1);
    expect(s.markdowns[0]).toMatchObject({ sku: "DDD-1", reason: "descontinuado" });
    expect(s.markdowns[0].option.discount).toBe(0.3);
    callTool(s, "propor_liquidacao", { sku: "DDD-1", desconto: 0.2, motivo: "revisto" });
    expect(s.markdowns).toHaveLength(1);
  });

  test("propor_liquidacao para SKU sem excesso → erro", () =>
    expect(callTool(fresh(), "propor_liquidacao", { sku: "BBB-1", desconto: 0.1, motivo: "x" }).ok).toBe(false));

  test("consultar_sku traz linhas, projeção e sem histórico semanal", () => {
    const r = callTool(fresh(), "consultar_sku", { sku: "AAA-1" });
    expect(r.ok).toBe(true);
    const res = r.result as Record<string, unknown>;
    expect(res).toHaveProperty("linhas_plano");
    expect(res).toHaveProperty("projecao");
    expect(res).not.toHaveProperty("weekly");
  });

  test("listar_casos_criticos limita a 40 e ordena por gravidade", () => {
    const s = createSession(ds, { config: { ...defaultConfig, budget: 1 } });
    const r = callTool(s, "listar_casos_criticos", {});
    const res = r.result as { casos: { kind: string }[]; total: number };
    expect(res.casos.length).toBeLessThanOrEqual(40);
    expect(res.total).toBeGreaterThanOrEqual(res.casos.length);
    expect(res.casos[0].kind).toBe("stockout_before_campaign");
  });

  test("finalizar não entra no toolLog (o resumo não pode verificar a si mesmo)", () => {
    const s = fresh();
    callTool(s, "finalizar", { resumo: "R$ 123" });
    expect(s.toolLog).toEqual([]);
  });

  test("toda saída de ferramenta vai para toolLog", () => {
    const s = fresh();
    callTool(s, "resumo_plano", {});
    callTool(s, "remover_linha", { linha_id: "nao-existe", motivo: "x" });
    expect(s.toolLog).toHaveLength(2);
    expect(s.toolLog[0]).toContain("custo_total");
  });
});
