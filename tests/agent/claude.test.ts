import { describe, expect, test } from "vitest";
import { fromAnthropic, toAnthropic } from "@/agent/claude";
import type { ChatMessage } from "@/agent/run";

describe("adaptador Claude", () => {
  test("system vai para o campo system; tool_calls viram tool_use; tools seguidas viram um turno de tool_result", () => {
    const msgs: ChatMessage[] = [
      { role: "system", content: "regras" },
      { role: "user", content: "revise" },
      {
        role: "assistant", content: "Vou consultar.",
        tool_calls: [
          { id: "a", type: "function", function: { name: "consultar_sku", arguments: '{"sku":"X-1"}' } },
          { id: "b", type: "function", function: { name: "resumo_plano", arguments: "" } },
        ],
      },
      { role: "tool", tool_call_id: "a", content: '{"ok":1}' },
      { role: "tool", tool_call_id: "b", content: '{"ok":2}' },
    ];
    const r = toAnthropic(msgs);
    expect(r.system).toBe("regras");
    expect(r.messages).toEqual([
      { role: "user", content: "revise" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Vou consultar." },
          { type: "tool_use", id: "a", name: "consultar_sku", input: { sku: "X-1" } },
          { type: "tool_use", id: "b", name: "resumo_plano", input: {} },
        ],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: '{"ok":1}' }, { type: "tool_result", tool_use_id: "b", content: '{"ok":2}' }] },
    ]);
  });

  test("resposta com thinking e tool_use: raw preserva os blocos e volta intacto", () => {
    const content = [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "Ajustando.", citations: null },
      { type: "tool_use", id: "t1", name: "finalizar", input: { resumo: "ok" }, caller: { type: "direct" } },
    ] as unknown as Parameters<typeof fromAnthropic>[0];
    const m = fromAnthropic(content);
    expect(m.content).toBe("Ajustando.");
    expect(m.tool_calls).toEqual([{ id: "t1", type: "function", function: { name: "finalizar", arguments: '{"resumo":"ok"}' } }]);
    const back = toAnthropic([{ role: "user", content: "x" }, m]);
    expect(back.messages[1]).toEqual({ role: "assistant", content });
  });

  test("resposta só com texto não tem tool_calls", () => {
    const m = fromAnthropic([{ type: "text", text: "Pronto.", citations: null }] as unknown as Parameters<typeof fromAnthropic>[0]);
    expect(m.tool_calls).toBeUndefined();
    expect(m.content).toBe("Pronto.");
  });
});
