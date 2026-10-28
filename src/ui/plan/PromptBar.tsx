"use client";

import { useState } from "react";
import { BotIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Pedido livre ao agente, fixo no rodapé, perto da tabela que ele altera. */
export function PromptBar({ disabled, onSend }: { disabled: boolean; onSend(text: string): void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="sticky bottom-4 z-30 flex items-center gap-2 rounded-2xl bg-card p-2 pl-3 shadow-[0_8px_24px_-12px_rgb(28_25_23/0.35)] ring-1 ring-foreground/10"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t || disabled) return;
        onSend(t);
        setText("");
      }}
    >
      <BotIcon className="size-5 shrink-0 text-primary" aria-hidden />
      <label htmlFor="agent-prompt" className="sr-only">
        Pedido ao agente
      </label>
      <input
        id="agent-prompt"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        disabled={disabled}
        placeholder={'Peça um ajuste ao agente, por exemplo: "BF 20% maior" ou "não corte nada da Kokeshi"'}
        className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
      />
      <Button type="submit" size="lg" disabled={disabled || !text.trim()}>
        <SendIcon data-icon="inline-start" /> Enviar
      </Button>
    </form>
  );
}
