import { loadDataset } from "@/core/load";
import { runPipeline } from "@/core/pipeline";
import type { Config, CsvFiles, Dataset } from "@/core/types";

export interface PipelineRequest { files: CsvFiles; config: Config }
export type PipelineMessage =
  | { type: "progress"; step: string }
  | { type: "done"; dataset: Dataset; warnings: string[] }
  | { type: "error"; errors: string[] };

const ctx = self as unknown as Worker;
const send = (m: PipelineMessage) => ctx.postMessage(m);

ctx.onmessage = (e: MessageEvent<PipelineRequest>) => {
  try {
    send({ type: "progress", step: "Lendo e validando os CSVs" });
    const loaded = loadDataset(e.data.files);
    if (!loaded.data) return send({ type: "error", errors: loaded.errors });
    send({ type: "progress", step: "Limpando dados, estimando demanda e calculando indicadores" });
    const dataset = runPipeline(loaded.data, e.data.config, { includeDaily: true });
    send({ type: "done", dataset, warnings: loaded.warnings });
  } catch (err) {
    send({ type: "error", errors: [`Falha ao processar: ${err instanceof Error ? err.message : String(err)}`] });
  }
};
