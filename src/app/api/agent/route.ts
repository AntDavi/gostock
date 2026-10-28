import { DEFAULT_REQUEST } from "@/agent/prompt";
import { DEFAULT_MODEL, groqClient, runAgent, type AgentResult } from "@/agent/run";
import { createSession, stateOf, type AgentState } from "@/agent/session";
import type { Dataset } from "@/core/types";
import { defaultDataset } from "@/data/default";

export const maxDuration = 120;

interface Body { dataset?: Dataset; state?: Partial<AgentState>; message?: string }

const MAX_MESSAGE = 2000;

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: "Requisição inválida: corpo não é JSON." }, { status: 400 });
  }
  const message = typeof body.message === "string" && body.message.trim() ? body.message.trim().slice(0, MAX_MESSAGE) : DEFAULT_REQUEST;
  const ds = body.dataset && Array.isArray(body.dataset.skus) ? body.dataset : defaultDataset;
  const session = createSession(ds, body.state ?? {});

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    const result: AgentResult = { ok: false, state: stateOf(session), message: "", unverified: [], steps: [], error: "Agente indisponível: GROQ_API_KEY não configurada." };
    return Response.json(result);
  }
  const result = await runAgent(session, message, groqClient(apiKey, process.env.GROQ_MODEL || DEFAULT_MODEL));
  return Response.json(result);
}
