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

export const DEFAULT_MODEL = "llama-3.3-70b-versatile";
export const MSG_RATE_LIMIT = "Agente atingiu o limite de uso do Groq. Exibindo o plano base.";
export const MSG_UNAVAILABLE = "Agente indisponível. Exibindo o plano base.";

export function groqClient(apiKey: string, model: string = DEFAULT_MODEL): ChatClient {
  const groq = new Groq({ apiKey, maxRetries: 2, timeout: 30_000 });
  return {
    async complete({ messages, tools }) {
      const res = await groq.chat.completions.create({
        model,
        temperature: 0.2,
        tool_choice: "auto",
        messages: messages as Groq.Chat.ChatCompletionMessageParam[],
        tools: tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters as Record<string, unknown> } })),
      });
      const m = res.choices[0]?.message;
      return { role: "assistant", content: m?.content ?? null, tool_calls: m?.tool_calls as ToolCall[] | undefined };
    },
  };
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
export async function runAgent(session: AgentSession, userMessage: string, client: ChatClient, opts: { maxSteps?: number } = {}): Promise<AgentResult> {
  const maxSteps = opts.maxSteps ?? 15;
  const entry = { ...stateOf(session), changes: [...session.changes], markdowns: [...session.markdowns] };
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(session) },
    { role: "user", content: `Pedido do chefe de estoque: ${userMessage}` },
  ];
  const steps: AgentStep[] = [];
  let final: string | null = null;

  try {
    for (let i = 0; i < maxSteps && final === null; i++) {
      const reply = await client.complete({ messages, tools: toolDefs });
      messages.push({ role: "assistant", content: reply.content, ...(reply.tool_calls?.length ? { tool_calls: reply.tool_calls } : {}) });
      if (!reply.tool_calls?.length) {
        final = reply.content?.trim() || "Revisão concluída.";
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
    return { ok: false, state: entry, message: "", unverified: [], steps, error: status === 429 ? MSG_RATE_LIMIT : MSG_UNAVAILABLE };
  }

  const message = final ?? `Revisão interrompida após ${maxSteps} passos; as mudanças feitas até aqui foram mantidas.`;
  const { unverified } = numberGuard(message, session.toolLog);
  return { ok: true, state: stateOf(session), message, unverified, steps };
}
