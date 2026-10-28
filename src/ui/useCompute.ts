"use client";

import { useEffect, useState } from "react";
import type { Config, Dataset } from "@/core/types";
import { computeTask, type ComputeKind, type ComputeResults } from "./compute";

export type ComputeState<T> = { status: "loading" } | { status: "done"; result: T } | { status: "error"; error: string };

type Outcome = { status: "done"; result: unknown } | { status: "error"; error: string };

// Um cálculo por (dataset, config, tipo), compartilhado entre telas e menu: o plano base roda uma vez só.
const pending = new WeakMap<Dataset, WeakMap<Config, Map<ComputeKind, Promise<Outcome>>>>();
const settled = new WeakMap<Dataset, WeakMap<Config, Map<ComputeKind, Outcome>>>();

function slot<V>(root: WeakMap<Dataset, WeakMap<Config, Map<ComputeKind, V>>>, ds: Dataset, cfg: Config): Map<ComputeKind, V> {
  let byCfg = root.get(ds);
  if (!byCfg) root.set(ds, (byCfg = new WeakMap()));
  let byKind = byCfg.get(cfg);
  if (!byKind) byCfg.set(cfg, (byKind = new Map()));
  return byKind;
}

function runInWorker(kind: ComputeKind, dataset: Dataset, config: Config): Promise<Outcome> {
  return new Promise((resolve) => {
    if (typeof Worker === "undefined") {
      setTimeout(() => {
        try {
          resolve({ status: "done", result: computeTask({ kind, dataset, config }) });
        } catch (e) {
          resolve({ status: "error", error: e instanceof Error ? e.message : String(e) });
        }
      }, 0);
      return;
    }
    const worker = new Worker(new URL("../workers/compute.worker.ts", import.meta.url));
    worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      worker.terminate();
      resolve(e.data.error === undefined ? { status: "done", result: e.data.result } : { status: "error", error: e.data.error });
    };
    worker.onerror = (e) => {
      worker.terminate();
      resolve({ status: "error", error: e.message || "erro no cálculo" });
    };
    // O histórico diário (só existe após upload) não entra nas contas e pesa na cópia para o worker.
    const { daily: _daily, ...lean } = dataset;
    void _daily;
    worker.postMessage({ id: 0, kind, dataset: lean, config });
  });
}

function compute(kind: ComputeKind, dataset: Dataset, config: Config): Promise<Outcome> {
  const byKind = slot(pending, dataset, config);
  let p = byKind.get(kind);
  if (!p) {
    p = runInWorker(kind, dataset, config).then((o) => {
      slot(settled, dataset, config).set(kind, o);
      return o;
    });
    byKind.set(kind, p);
  }
  return p;
}

/** Executa um cálculo pesado fora da thread da tela (Web Worker) e refaz quando dataset ou config mudam. */
export function useCompute<K extends ComputeKind>(kind: K, dataset: Dataset | null, config: Config | null): ComputeState<ComputeResults[K]> {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!dataset || !config) return;
    let alive = true;
    void compute(kind, dataset, config).then(() => alive && setTick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, [kind, dataset, config]);

  if (!dataset || !config) return { status: "loading" };
  const o = settled.get(dataset)?.get(config)?.get(kind);
  if (!o) return { status: "loading" };
  return o.status === "done" ? { status: "done", result: o.result as ComputeResults[K] } : o;
}
