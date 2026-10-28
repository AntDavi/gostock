import { defaultDataset } from "@/data/default";

export async function GET() {
  return Response.json(defaultDataset);
}
