import { numberGuard } from "./guard";
import { systemPrompt } from "./prompt";
import { stateOf, type AgentSession, type AgentState } from "./session";
import { callTool, toolDefs, type ToolDef } from "./tools";

export interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** Blocos originais do provedor (ex.: thinking do Claude), devolvidos sem alteração no turno seguinte. */
  raw?: unknown;
}
export interface ChatClient { complete(req: { messages: ChatMessage[]; tools: ToolDef[] }): Promise<ChatMessage> }

export interface AgentStep { tool: string; args: unknown; ok: boolean }
export interface AgentResult { ok: boolean; state: AgentState; message: string; unverified: string[]; steps: AgentStep[]; error?: string }

export const MSG_RATE_LIMIT = "Agente atingiu o limite de uso do modelo. Exibindo o plano base.";
export const MSG_UNAVAILABLE = "Agente indisponível. Exibindo o plano base.";

const INITIAL_PER_KIND = 3;

/** Espera sugerida pelo provedor: cabeçalho retry-after ou "try again in 22.07s" na mensagem. */
function retryAfterMs(e: unknown): number | null {
  const err = e as { message?: string; headers?: Headers | Record<string, string> };
  const h = err.headers;
  const header = Number(h instanceof Headers ? h.get("retry-after") : h?.["retry-after"]);
  if (Number.isFinite(header) && header > 0) return header * 1000;
  const m = /try again in ([\d.]+)\s*s/i.exec(err.message ?? "");
  return m ? Math.ceil(Number(m[1]) * 1000) : null;
}

/** Resumo de uma resposta só em texto; aceita o modelo escrevendo {"resumo": "..."} em vez de chamar finalizar. */
function textSummary(content: string | null): string {
  const text = content?.trim() ?? "";
  if (text.startsWith("{")) {
    try {
      const j = JSON.parse(text) as { resumo?: unknown };
      if (typeof j.resumo === "string" && j.resumo.trim()) return j.resumo.trim();
    } catch {
      // não era JSON: usa o texto como veio
    }
  }
  return text || "Revisão concluída.";
}

function parseArgs(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: raw.trim() ? JSON.parse(raw) : {} };
  } catch {
    return { ok: false };
  }
}

/**
 * Loop de tool calling. O agente só altera o estado por ferramentas; se o modelo falhar,
 * devolve o estado de entrada intacto (o plano base continua valendo).
 */
export interface RunOptions { maxSteps?: number; deadlineMs?: number; sleep?: (ms: number) => Promise<void> }

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runAgent(session: AgentSession, userMessage: string, client: ChatClient, opts: RunOptions = {}): Promise<AgentResult> {
  const maxSteps = opts.maxSteps ?? 12;
  const deadline = Date.now() + (opts.deadlineMs ?? 100_000);
  const sleep = opts.sleep ?? defaultSleep;
  const entry = { ...stateOf(session), changes: [...session.changes], markdowns: [...session.markdowns] };
  const steps: AgentStep[] = [];

  // Contexto inicial calculado pelo código: poupa duas rodadas do modelo.
  const resumo = callTool(session, "resumo_plano", {});
  const casos = callTool(session, "listar_casos_criticos", { por_tipo: INITIAL_PER_KIND });
  steps.push({ tool: "resumo_plano", args: {}, ok: resumo.ok }, { tool: "listar_casos_criticos", args: { por_tipo: INITIAL_PER_KIND }, ok: casos.ok });
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(session) },
    {
      role: "user",
      content:
        `Pedido do chefe de estoque: ${userMessage}\n\n` +
        `resumo_plano: ${JSON.stringify(resumo.result)}\n\n` +
        `listar_casos_criticos (até ${INITIAL_PER_KIND} de cada tipo): ${JSON.stringify(casos.result)}`,
    },
  ];
  let final: string | null = null;

  const complete = async () => {
    for (;;) {
      try {
        // Histórico só cresce (nunca editado): exigência dos blocos de thinking e do cache de prompt.
        return await client.complete({ messages, tools: toolDefs });
      } catch (e) {
        const wait = (e as { status?: number }).status === 429 ? retryAfterMs(e) : null;
        if (wait === null || Date.now() + wait > deadline) throw e;
        await sleep(wait + 250);
      }
    }
  };

  try {
    for (let i = 0; i < maxSteps && final === null; i++) {
      const reply = await complete();
      messages.push({ role: "assistant", content: reply.content, ...(reply.tool_calls?.length ? { tool_calls: reply.tool_calls } : {}), ...(reply.raw ? { raw: reply.raw } : {}) });
      if (!reply.tool_calls?.length) {
        final = textSummary(reply.content);
        break;
      }
      for (const tc of reply.tool_calls) {
        const name = tc.function.name;
        const parsed = parseArgs(tc.function.arguments);
        const r = parsed.ok ? callTool(session, name, parsed.value) : { ok: false, result: null, error: "Argumentos não são JSON válido." };
        steps.push({ tool: name, args: parsed.ok ? parsed.value : tc.function.arguments, ok: r.ok });
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(r.ok ? r.result : { erro: r.error }) });
        if (name === "finalizar" && r.ok) final = (r.result as { resumo: string }).resumo;
      }
    }
  } catch (e) {
    const status = (e as { status?: number }).status;
    const newChanges = session.changes.length - entry.changes.length;
    if (newChanges <= 0) {
      return { ok: false, state: entry, message: "", unverified: [], steps, error: status === 429 ? MSG_RATE_LIMIT : MSG_UNAVAILABLE };
    }
    // Os ajustes já passaram pelo validador: mantém e avisa. Mensagem gerada pelo código, não pelo modelo.
    const done = session.changes.slice(entry.changes.length).map((c) => `• ${c.sku}: ${c.after} (${c.reason})`);
    const message = `Revisão parcial: o agente foi interrompido (${status === 429 ? "limite de uso do modelo" : "falha do modelo"}) depois de ${newChanges} ajuste(s) válido(s):\n${done.join("\n")}`;
    return { ok: true, state: stateOf(session), message, unverified: [], steps };
  }

  const message = final ?? `Revisão interrompida após ${maxSteps} passos; as mudanças feitas até aqui foram mantidas.`;
  const { unverified } = numberGuard(message, session.toolLog);
  return { ok: true, state: stateOf(session), message, unverified, steps };
}
