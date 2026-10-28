import type { Config, Dataset } from "@/core/types";
import { computeOverview } from "@/ui/overview";

export interface OverviewRequest { id: number; dataset: Dataset; config: Config }

const ctx = self as unknown as Worker;
ctx.onmessage = (e: MessageEvent<OverviewRequest>) => {
  const { id, dataset, config } = e.data;
  try {
    ctx.postMessage({ id, overview: computeOverview(dataset, config) });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
