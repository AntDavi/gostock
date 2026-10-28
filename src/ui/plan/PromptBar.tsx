"use client";

import { useEffect, useState } from "react";
import { BotIcon, Loader2Icon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Pedidos que as ferramentas do agente sabem atender. Clicar envia direto. */
const SUGGESTIONS = [
  "Antecipe as emissões do F05 que chegam depois da Black Friday",
  "Não corte nenhuma linha da curva A",
  "Quais SKUs A ficam sem cobertura antes da campanha?",
  "Considere a Black Friday 20% maior",
];

function Elapsed({ started }: { started: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{Math.max(0, Math.round((now - started) / 1000))} s</>;
}

/** Pedido livre ao agente, fixo no rodapé, perto da tabela que ele altera. */
export function PromptBar({ running, onSend }: { running: { started: number; request: string } | null; onSend(text: string): void }) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const send = (t: string) => {
    const v = t.trim();
    if (!v || running) return;
    onSend(v);
    setText("");
  };

  return (
    <div className="sticky bottom-4 z-30 rounded-2xl bg-card shadow-[0_8px_24px_-12px_rgb(28_25_23/0.35)] ring-1 ring-foreground/10">
      {running ? (
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5 text-sm" role="status">
          <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            <span className="text-muted-foreground">Enviado:</span> “{running.request}”
          </span>
          <span className="shrink-0 text-muted-foreground tabular-nums">
            trabalhando · <Elapsed started={running.started} />
          </span>
        </div>
      ) : (
        (focused || text === "") && (
          <div className="flex gap-1.5 overflow-x-auto border-b border-hairline px-3 py-2" aria-label="Sugestões de pedido">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => send(s)}
                className="h-8 shrink-0 rounded-full border border-input bg-card px-3 text-[13px] whitespace-nowrap text-foreground/85 hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )
      )}
      <form
        className="flex items-center gap-2 p-2 pl-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={2000}
          disabled={!!running}
          placeholder={running ? "Aguarde a resposta do agente…" : "Escreva um pedido ou escolha uma sugestão acima"}
          className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <Button type="submit" size="lg" disabled={!!running || !text.trim()}>
          <SendIcon data-icon="inline-start" /> Enviar
        </Button>
      </form>
    </div>
  );
}
