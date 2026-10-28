import Anthropic from "@anthropic-ai/sdk";
import type { ChatClient, ChatMessage, ToolCall } from "./run";
import type { ToolDef } from "./tools";

export const DEFAULT_MODEL = "claude-haiku-5-5";

/**
 * Converte o histórico interno (formato de chat com tool_calls) para a Messages API.
 * Mensagens `tool` seguidas viram um único turno de usuário com vários tool_result.
 * Se o assistente trouxe `raw` (blocos originais, incluindo thinking), ele volta sem alteração.
 */
export function toAnthropic(messages: ChatMessage[]): { system: string; messages: Anthropic.MessageParam[] } {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content ?? "").join("\n\n");
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      out.push({ role: "user", content: m.content ?? "" });
    } else if (m.role === "assistant") {
      if (m.raw) {
        out.push({ role: "assistant", content: m.raw as Anthropic.ContentBlockParam[] });
        continue;
      }
      const content: Anthropic.ContentBlockParam[] = [];
      if (m.content?.trim()) content.push({ type: "text", text: m.content });
      for (const tc of m.tool_calls ?? []) content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input: parseInput(tc.function.arguments) });
      out.push({ role: "assistant", content });
    } else {
      const block: Anthropic.ToolResultBlockParam = { type: "tool_result", tool_use_id: m.tool_call_id ?? "", content: m.content ?? "" };
      const prev = out.at(-1);
      if (prev?.role === "user" && Array.isArray(prev.content) && prev.content.every((b) => b.type === "tool_result")) prev.content.push(block);
      else out.push({ role: "user", content: [block] });
    }
  }
  return { system, messages: out };
}

function parseInput(raw: string): unknown {
  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Resposta da Messages API no formato interno. `raw` guarda os blocos para devolver intactos no próximo turno. */
export function fromAnthropic(content: Anthropic.ContentBlock[]): ChatMessage {
  const text = content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  const tool_calls: ToolCall[] = content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    .map((b) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
  return { role: "assistant", content: text || null, ...(tool_calls.length ? { tool_calls } : {}), raw: content };
}

export function claudeClient(apiKey: string, model: string = DEFAULT_MODEL): ChatClient {
  // O SDK já tenta de novo 429/5xx respeitando retry-after.
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  return {
    async complete({ messages, tools }: { messages: ChatMessage[]; tools: ToolDef[] }) {
      const req = toAnthropic(messages);
      const res = await client.messages.create({
        model,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        system: req.system,
        messages: req.messages,
        tool_choice: { type: "auto" },
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Tool.InputSchema })),
      });
      if (res.stop_reason === "refusal") throw Object.assign(new Error("Modelo recusou o pedido."), { status: 200 });
      return fromAnthropic(res.content);
    },
  };
}
