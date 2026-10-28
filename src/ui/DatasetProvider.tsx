"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Config, Dataset } from "@/core/types";

interface DatasetContext {
  dataset: Dataset | null;
  config: Config | null;
  loading: boolean;
  error: string | null;
  setConfig(c: Config): void;
  setUploaded(ds: Dataset): void;
  resetToDefault(): void;
}

const Ctx = createContext<DatasetContext | null>(null);

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [defaultDs, setDefaultDs] = useState<Dataset | null>(null);
  const [uploaded, setUploadedDs] = useState<Dataset | null>(null);
  const [config, setConfigState] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/dataset")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Dataset>;
      })
      .then((ds) => {
        if (!alive) return;
        setDefaultDs(ds);
        setConfigState((c) => c ?? ds.config);
      })
      .catch((e: unknown) => alive && setError(`Não foi possível carregar os dados padrão (${e instanceof Error ? e.message : String(e)}).`));
    return () => {
      alive = false;
    };
  }, []);

  const setUploaded = useCallback((ds: Dataset) => {
    setUploadedDs(ds);
    setConfigState(ds.config);
  }, []);
  const resetToDefault = useCallback(() => {
    setUploadedDs(null);
    setConfigState(defaultDs?.config ?? null);
  }, [defaultDs]);

  const dataset = uploaded ?? defaultDs;
  const value = useMemo<DatasetContext>(
    () => ({ dataset, config, loading: !dataset && !error, error, setConfig: setConfigState, setUploaded, resetToDefault }),
    [dataset, config, error, setUploaded, resetToDefault],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDataset(): DatasetContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDataset fora do DatasetProvider");
  return ctx;
}
