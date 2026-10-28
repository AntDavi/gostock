import type { Config, Dataset } from "@/core/types";

// O resumo processado fica no IndexedDB do navegador: recarregar a página não obriga a reprocessar os CSVs.
// Qualquer falha (aba privada, armazenamento bloqueado) só faz o app voltar ao estado vazio.

const DB = "gostock";
const STORE = "dataset";
const KEY = "current";

export interface StoredDataset { dataset: Dataset; config: Config }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function loadStoredDataset(): Promise<StoredDataset | null> {
  try {
    const v = await tx<StoredDataset | undefined>("readonly", (s) => s.get(KEY));
    return v && Array.isArray(v.dataset?.skus) ? v : null;
  } catch {
    return null;
  }
}

export async function saveStoredDataset(v: StoredDataset): Promise<boolean> {
  try {
    await tx("readwrite", (s) => s.put(v, KEY));
    return true;
  } catch {
    return false;
  }
}

export async function clearStoredDataset(): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(KEY));
  } catch {
    // nada a limpar
  }
}
