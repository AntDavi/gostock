import { computeTask, type ComputeRequest } from "@/ui/compute";

const ctx = self as unknown as Worker;
ctx.onmessage = (e: MessageEvent<ComputeRequest & { id: number }>) => {
  const { id, ...req } = e.data;
  try {
    ctx.postMessage({ id, result: computeTask(req) });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
