"use client";

import { useEffect, useState } from "react";
import type { Config, Dataset } from "@/core/types";
import { computeOverview, type Overview } from "./overview";

type State = { status: "loading" } | { status: "done"; overview: Overview } | { status: "error"; error: string };
type Result = ({ status: "done"; overview: Overview } | { status: "error"; error: string }) & { dataset: Dataset; config: Config };

let seq = 0;

/** Curvas e rupturas da Visão geral, calculadas fora da thread da tela. */
export function useOverview(dataset: Dataset | null, config: Config | null): State {
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!dataset || !config) return;
    const id = ++seq;
    const done = (overview: Overview) => setResult({ status: "done", overview, dataset, config });
    const fail = (error: string) => setResult({ status: "error", error, dataset, config });
    if (typeof Worker === "undefined") {
      const t = setTimeout(() => {
        try {
          done(computeOverview(dataset, config));
        } catch (e) {
          fail(e instanceof Error ? e.message : String(e));
        }
      }, 0);
      return () => clearTimeout(t);
    }
    const worker = new Worker(new URL("../workers/overview.worker.ts", import.meta.url));
    worker.onmessage = (e: MessageEvent<{ id: number; overview?: Overview; error?: string }>) => {
      if (e.data.id !== id) return;
      if (e.data.overview) done(e.data.overview);
      else fail(e.data.error ?? "erro no cálculo");
      worker.terminate();
    };
    worker.onerror = (e) => {
      fail(e.message || "erro no cálculo");
      worker.terminate();
    };
    worker.postMessage({ id, dataset, config });
    return () => worker.terminate();
  }, [dataset, config]);

  // Resultado de outro dataset/config ainda não vale: está recalculando.
  if (!result || result.dataset !== dataset || result.config !== config) return { status: "loading" };
  return result;
}
