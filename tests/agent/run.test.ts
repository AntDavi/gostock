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
    expect(r.steps.map((x) => x.tool)).toEqual(["resumo_plano", "alterar_quantidade", "finalizar"]);
  });

  test("system prompt e pedido do usuário vão na primeira chamada", async () => {
    const { client, requests } = scripted([call("finalizar", { resumo: "ok" })]);
    await runAgent(createSession(ds), "BF 20% maior", client);
    expect(requests[0][0].role).toBe("system");
    expect(requests[0].at(-1)).toMatchObject({ role: "user" });
    expect(requests[0].at(-1)!.content).toContain("BF 20% maior");
  });

  test("erro de ferramenta volta ao modelo como mensagem tool e o loop segue", async () => {
    const { client, requests } = scripted([call("remover_linha", { linha_id: "nao-existe", motivo: "x" }), call("finalizar", { resumo: "ok" })]);
    const r = await runAgent(createSession(ds), "x", client);
    expect(r.ok).toBe(true);
    expect(r.steps[0]).toMatchObject({ tool: "remover_linha", ok: false });
    const toolMsg = requests[1].find((m) => m.role === "tool")!;
    expect(toolMsg.content).toContain("erro");
    expect(toolMsg.tool_call_id).toBeDefined();
  });

  test("argumentos com JSON inválido viram erro de ferramenta", async () => {
    const { client } = scripted([call("remover_linha", "{quebrado"), call("finalizar", { resumo: "ok" })]);
    const r = await runAgent(createSession(ds), "x", client);
    expect(r.steps[0].ok).toBe(false);
  });

  test("Groq 429 → ok:false, estado igual ao de entrada", async () => {
    const s = createSession(ds);
    const plan = s.plan;
    const r = await runAgent(s, "x", throwing(Object.assign(new Error("rate limit"), { status: 429 })));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("limite");
    expect(r.state.plan).toEqual(plan);
  });

  test("falha no meio descarta mudanças parciais", async () => {
    const s = createSession(ds);
    const plan = s.plan;
    const msgs = [call("remover_linha", { linha_id: s.plan.lines[0].id, motivo: "x" })];
    let i = 0;
    const client: ChatClient = { complete: async () => { if (i++ === 0) return msgs[0]; throw new Error("timeout"); } };
    const r = await runAgent(s, "x", client);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("indisponível");
    expect(r.state.plan).toEqual(plan);
    expect(r.state.changes).toEqual([]);
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

  test("resumo com número não verificado → unverified preenchido", async () => {
    const { client } = scripted([call("resumo_plano", {}), call("finalizar", { resumo: "Economizei R$ 987.654,32." })]);
    const r = await runAgent(createSession(ds), "x", client);
    expect(r.unverified).toEqual(["R$ 987.654,32"]);
  });
});
