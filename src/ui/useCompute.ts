"use client";

import { useEffect, useState } from "react";
import type { Config, Dataset } from "@/core/types";
import { computeTask, type ComputeKind, type ComputeResults } from "./compute";

export type ComputeState<T> = { status: "loading" } | { status: "done"; result: T } | { status: "error"; error: string };
type Stamped<T> = ({ status: "done"; result: T } | { status: "error"; error: string }) & { dataset: Dataset; config: Config };

let seq = 0;

/** Executa um cálculo pesado fora da thread da tela (Web Worker) e refaz quando dataset ou config mudam. */
export function useCompute<K extends ComputeKind>(kind: K, dataset: Dataset | null, config: Config | null): ComputeState<ComputeResults[K]> {
  const [stamped, setStamped] = useState<Stamped<ComputeResults[K]> | null>(null);

  useEffect(() => {
    if (!dataset || !config) return;
    const id = ++seq;
    const done = (result: ComputeResults[K]) => setStamped({ status: "done", result, dataset, config });
    const fail = (error: string) => setStamped({ status: "error", error, dataset, config });
    if (typeof Worker === "undefined") {
      const t = setTimeout(() => {
        try {
          done(computeTask({ kind, dataset, config }) as ComputeResults[K]);
        } catch (e) {
          fail(e instanceof Error ? e.message : String(e));
        }
      }, 0);
      return () => clearTimeout(t);
    }
    const worker = new Worker(new URL("../workers/compute.worker.ts", import.meta.url));
    worker.onmessage = (e: MessageEvent<{ id: number; result?: ComputeResults[K]; error?: string }>) => {
      if (e.data.id !== id) return;
      if (e.data.result) done(e.data.result);
      else fail(e.data.error ?? "erro no cálculo");
      worker.terminate();
    };
    worker.onerror = (e) => {
      fail(e.message || "erro no cálculo");
      worker.terminate();
    };
    // O histórico diário (só existe após upload) não entra nas contas e pesa na cópia para o worker.
    const { daily: _daily, ...lean } = dataset;
    void _daily;
    worker.postMessage({ id, kind, dataset: lean, config });
    return () => worker.terminate();
  }, [kind, dataset, config]);

  // Resultado de outro dataset/config ainda não vale: está recalculando.
  if (!stamped || stamped.dataset !== dataset || stamped.config !== config) return { status: "loading" };
  return stamped;
}
