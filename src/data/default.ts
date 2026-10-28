import type { Dataset } from "@/core/types";
import raw from "./dataset.json";

/** Dataset agregado padrão (gerado por `npm run data`). */
export const defaultDataset = raw as unknown as Dataset;
