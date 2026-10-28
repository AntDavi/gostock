import { describe, expect, test } from "vitest";
import { runAgent, type ChatClient, type ChatMessage } from "@/agent/run";
import { createSession } from "@/agent/session";
import { defaultConfig } from "@/core/config";
import { runPipeline } from "@/core/pipeline";
import { rawMini } from "../fixtures/mini";

const ds = runPipeline(rawMini(), { ...defaultConfig, budget: 1e9 });
let n = 0;
const call = (name: string, args: unknown): ChatMessage => ({
  role: "assistant", content: null,
  tool_calls: [{ id: `t${n++}`, type: "function", function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } }],
});

function scripted(msgs: ChatMessage[], repeatLast = false) {
  const requests: ChatMessage[][] = [];
  const client: ChatClient = {
    async complete(req) {
      requests.push(structuredClone(req.messages));
      const m = msgs.length > 1 || !repeatLast ? msgs.shift() : msgs[0];
      if (!m) throw new Error("roteiro acabou");
      return structuredClone(m);
    },
  };
  return { client, requests };
}

const throwing = (err: Error): ChatClient => ({ complete: async () => { throw err; } });

describe("runAgent", () => {
  test("executa ferramentas e finaliza", async () => {
    const s = createSession(ds);
    const id = s.plan.lines[0].id;
    const { client } = scripted([call("resumo_plano", {}), call("alterar_quantidade", { linha_id: id, lotes: 1, motivo: "x" }), call("finalizar", { resumo: "Reduzi 1 linha." })]);
    const r = await runAgent(s, "revise", client);
    expect(r.ok).toBe(true);
    expect(r.message).toBe("Reduzi 1 linha.");
    expect(r.state.changes).toHaveLength(1);
    expect(r.steps.map((x) => x.tool)).toEqual(["resumo_plano", "listar_casos_criticos", "listar_risco_p90", "resumo_plano", "alterar_quantidade", "finalizar"]);
  });

  test("system prompt, pedido e contexto inicial (resumo + casos críticos) vão na primeira chamada", async () => {
    const { client, requests } = scripted([call("finalizar", { resumo: "ok" })]);
    const r = await runAgent(createSession(ds), "BF 20% maior", client);
    expect(requests[0][0].role).toBe("system");
    const user = requests[0].at(-1)!;
    expect(user.role).toBe("user");
    expect(user.content).toContain("BF 20% maior");
    expect(user.content).toContain("custo_total");
    expect(user.content).toContain("casos");
    expect(r.steps.slice(0, 3).map((x) => x.tool)).toEqual(["resumo_plano", "listar_casos_criticos", "listar_risco_p90"]);
  });

  test("histórico só cresce: cada chamada repete a anterior sem editar e devolve raw do assistente", async () => {
    const msgs = [...Array(6)].map(() => ({ ...call("consultar_sku", { sku: "AAA-1" }), raw: [{ type: "thinking", thinking: "", signature: "s" }] }));
    const { client, requests } = scripted([...msgs, call("finalizar", { resumo: "ok" })]);
    await runAgent(createSession(ds), "x", client);
    for (let i = 1; i < requests.length; i++) expect(requests[i].slice(0, requests[i - 1].length)).toEqual(requests[i - 1]);
    expect(requests.at(-1)!.find((m) => m.role === "assistant")!.raw).toEqual(msgs[0].raw);
  });

  test("429 com 'try again in Xs' espera e tenta de novo", async () => {
    let i = 0;
    const waits: number[] = [];
    const client: ChatClient = {
      async complete() {
        if (i++ === 0) throw Object.assign(new Error("Rate limit reached. Please try again in 1.5s."), { status: 429 });
        return call("finalizar", { resumo: "ok" });
      },
    };
    const r = await runAgent(createSession(ds), "x", client, { sleep: async (ms) => void waits.push(ms) });
    expect(r.ok).toBe(true);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(1500);
  });

  test("429 com cabeçalho retry-after (Headers) espera e tenta de novo", async () => {
    let i = 0;
    const waits: number[] = [];
    const client: ChatClient = {
      async complete() {
        if (i++ === 0) throw Object.assign(new Error("rate_limit_error"), { status: 429, headers: new Headers({ "retry-after": "2" }) });
        return call("finalizar", { resumo: "ok" });
      },
    };
    const r = await runAgent(createSession(ds), "x", client, { sleep: async (ms) => void waits.push(ms) });
    expect(r.ok).toBe(true);
    expect(waits[0]).toBeGreaterThanOrEqual(2000);
  });

  test("429 cuja espera estoura o prazo → falha com mensagem de limite", async () => {
    const client: ChatClient = { complete: async () => { throw Object.assign(new Error("Please try again in 50s."), { status: 429 }); } };
    const r = await runAgent(createSession(ds), "x", client, { sleep: async () => {}, deadlineMs: 10_000 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("limite");
  });

  test("erro de ferramenta volta ao modelo como mensagem tool e o loop segue", async () => {
    const { client, requests } = scripted([call("remover_linha", { linha_id: "nao-existe", motivo: "x" }), call("finalizar", { resumo: "ok" })]);
    const r = await runAgent(createSession(ds), "x", client);
    expect(r.ok).toBe(true);
    expect(r.steps[3]).toMatchObject({ tool: "remover_linha", ok: false });
    const toolMsg = requests[1].find((m) => m.role === "tool")!;
    expect(toolMsg.content).toContain("erro");
    expect(toolMsg.tool_call_id).toBeDefined();
  });

  test("argumentos com JSON inválido viram erro de ferramenta", async () => {
    const { client } = scripted([call("remover_linha", "{quebrado"), call("finalizar", { resumo: "ok" })]);
    const r = await runAgent(createSession(ds), "x", client);
    expect(r.steps[3].ok).toBe(false);
  });

  test("429 → ok:false, estado igual ao de entrada", async () => {
    const s = createSession(ds);
    const plan = s.plan;
    const r = await runAgent(s, "x", throwing(Object.assign(new Error("rate limit"), { status: 429 })));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("limite");
    expect(r.state.plan).toEqual(plan);
  });

  test("falha no meio mantém ajustes já validados e avisa revisão parcial", async () => {
    const s = createSession(ds);
    const id = s.plan.lines[0].id;
    let i = 0;
    const client: ChatClient = {
      complete: async () => {
        if (i++ === 0) return call("remover_linha", { linha_id: id, motivo: "x" });
        throw Object.assign(new Error("Please try again in 90s."), { status: 429 });
      },
    };
    const r = await runAgent(s, "x", client, { sleep: async () => {}, deadlineMs: 5_000 });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/parcial/i);
    expect(r.state.changes).toHaveLength(1);
    expect(r.unverified).toEqual([]);
  });

  test("falha sem nenhum ajuste → ok:false e estado de entrada", async () => {
    const s = createSession(ds);
    const plan = s.plan;
    const r = await runAgent(s, "x", throwing(new Error("timeout")));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("indisponível");
    expect(r.state.plan).toEqual(plan);
  });

  test("maxSteps atingido → ok:true com mensagem de parada e mudanças preservadas", async () => {
    const s = createSession(ds);
    const id = s.plan.lines[0].id;
    const { client } = scripted([call("alterar_quantidade", { linha_id: id, lotes: 1, motivo: "x" }), call("resumo_plano", {})], true);
    const r = await runAgent(s, "x", client, { maxSteps: 3 });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/interromp/i);
    expect(r.state.changes).toHaveLength(1);
  });

  test("resposta só em texto encerra com o texto como mensagem", async () => {
    const { client } = scripted([{ role: "assistant", content: "Nada a ajustar." }]);
    const r = await runAgent(createSession(ds), "x", client);
    expect(r).toMatchObject({ ok: true, message: "Nada a ajustar." });
  });

  test("resposta em texto com JSON {resumo} vira o resumo", async () => {
    const { client } = scripted([{ role: "assistant", content: '{"resumo":"Antecipei 1 pedido."}' }]);
    const r = await runAgent(createSession(ds), "x", client);
    expect(r.message).toBe("Antecipei 1 pedido.");
  });

  test("resumo com número não verificado → unverified preenchido", async () => {
    const { client } = scripted([call("resumo_plano", {}), call("finalizar", { resumo: "Economizei R$ 987.654,32." })]);
    const r = await runAgent(createSession(ds), "x", client);
    expect(r.unverified).toEqual(["R$ 987.654,32"]);
  });
});
