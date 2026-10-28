import Groq from "groq-sdk";
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
}
export interface ChatClient { complete(req: { messages: ChatMessage[]; tools: ToolDef[] }): Promise<ChatMessage> }

export interface AgentStep { tool: string; args: unknown; ok: boolean }
export interface AgentResult { ok: boolean; state: AgentState; message: string; unverified: string[]; steps: AgentStep[]; error?: string }

export const DEFAULT_MODEL = "openai/gpt-oss-120b";
export const MSG_RATE_LIMIT = "Agente atingiu o limite de uso do Groq. Exibindo o plano base.";
export const MSG_UNAVAILABLE = "Agente indisponível. Exibindo o plano base.";

export function groqClient(apiKey: string, model: string = DEFAULT_MODEL): ChatClient {
  // Sem retries do SDK: runAgent trata o 429 respeitando o prazo total.
  const groq = new Groq({ apiKey, maxRetries: 0, timeout: 30_000 });
  return {
    async complete({ messages, tools }) {
      const res = await groq.chat.completions.create({
        model,
        temperature: 0.2,
        tool_choice: "auto",
        reasoning_effort: "low",
        max_completion_tokens: 1024,
        messages: messages as Groq.Chat.ChatCompletionMessageParam[],
        tools: tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters as Record<string, unknown> } })),
      });
      const m = res.choices[0]?.message;
      return { role: "assistant", content: m?.content ?? null, tool_calls: m?.tool_calls as ToolCall[] | undefined };
    },
  };
}

const KEEP_FULL_TOOL_RESULTS = 4;
const STUB_CHARS = 300;
const INITIAL_PER_KIND = 3;
const MAX_MALFORMED_RETRIES = 2;

/** Encurta resultados de ferramenta antigos para caber no limite de tokens por minuto do Groq. */
function compact(messages: ChatMessage[]): ChatMessage[] {
  const toolIdx = messages.map((m, i) => (m.role === "tool" ? i : -1)).filter((i) => i >= 0);
  const old = new Set(toolIdx.slice(0, Math.max(0, toolIdx.length - KEEP_FULL_TOOL_RESULTS)));
  return messages.map((m, i) =>
    old.has(i) && m.content && m.content.length > STUB_CHARS ? { ...m, content: m.content.slice(0, STUB_CHARS - 15) + "…(resumido)" } : m,
  );
}

/** Segundos sugeridos pelo Groq em "try again in 22.07s" (ou cabeçalho retry-after). */
function retryAfterMs(e: unknown): number | null {
  const err = e as { message?: string; headers?: Record<string, string> };
  const header = Number(err.headers?.["retry-after"]);
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
    let malformed = 0;
    for (;;) {
      try {
        return await client.complete({ messages: compact(messages), tools: toolDefs });
      } catch (e) {
        const err = e as { status?: number; message?: string };
        // O modelo às vezes gera JSON inválido na chamada de ferramenta; é intermitente.
        if (err.status === 400 && /tool_use_failed|parse tool call/i.test(err.message ?? "") && malformed++ < MAX_MALFORMED_RETRIES) continue;
        const wait = err.status === 429 ? retryAfterMs(e) : null;
        if (wait === null || Date.now() + wait > deadline) throw e;
        await sleep(wait + 250);
      }
    }
  };

  try {
    for (let i = 0; i < maxSteps && final === null; i++) {
      const reply = await complete();
      messages.push({ role: "assistant", content: reply.content, ...(reply.tool_calls?.length ? { tool_calls: reply.tool_calls } : {}) });
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
    const message = `Revisão parcial: o agente foi interrompido (${status === 429 ? "limite de uso do Groq" : "falha do modelo"}) depois de ${newChanges} ajuste(s) válido(s):\n${done.join("\n")}`;
    return { ok: true, state: stateOf(session), message, unverified: [], steps };
  }

  const message = final ?? `Revisão interrompida após ${maxSteps} passos; as mudanças feitas até aqui foram mantidas.`;
  const { unverified } = numberGuard(message, session.toolLog);
  return { ok: true, state: stateOf(session), message, unverified, steps };
}
