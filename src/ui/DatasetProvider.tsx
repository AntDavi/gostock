"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultConfig } from "@/core/config";
import type { Config, Dataset } from "@/core/types";
import { clearStoredDataset, loadStoredDataset, saveStoredDataset } from "./storedDataset";

interface DatasetContext {
  /** Só existe depois do upload. O app não traz dados embutidos. */
  dataset: Dataset | null;
  /** Sem dataset, vale a configuração padrão (usada no formulário de Dados). */
  config: Config;
  /** Lendo o que ficou salvo no navegador. */
  loading: boolean;
  /** false quando o navegador recusou guardar os dados (aba privada, armazenamento cheio). */
  persisted: boolean;
  error: string | null;
  setConfig(c: Config): void;
  setUploaded(ds: Dataset): void;
  clearData(): void;
}

const Ctx = createContext<DatasetContext | null>(null);

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [config, setConfigState] = useState<Config>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [persisted, setPersisted] = useState(true);

  useEffect(() => {
    let alive = true;
    void loadStoredDataset().then((v) => {
      if (!alive) return;
      if (v) {
        setDataset(v.dataset);
        setConfigState(v.config);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const setUploaded = useCallback((ds: Dataset) => {
    setDataset(ds);
    setConfigState(ds.config);
    void saveStoredDataset({ dataset: ds, config: ds.config }).then(setPersisted);
  }, []);
  const setConfig = useCallback(
    (c: Config) => {
      setConfigState(c);
      if (dataset) void saveStoredDataset({ dataset, config: c }).then(setPersisted);
    },
    [dataset],
  );
  const clearData = useCallback(() => {
    setDataset(null);
    setConfigState(defaultConfig);
    void clearStoredDataset();
  }, []);

  const value = useMemo<DatasetContext>(
    () => ({ dataset, config, loading, persisted, error: null, setConfig, setUploaded, clearData }),
    [dataset, config, loading, persisted, setConfig, setUploaded, clearData],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDataset(): DatasetContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDataset fora do DatasetProvider");
  return ctx;
}
