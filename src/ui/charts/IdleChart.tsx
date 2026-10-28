"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { brl, intBR } from "../format";

export interface IdleRow { sku: string; idleValue: number; coverageDays: number; status: string }

const config = { idleValue: { label: "Capital parado" } } satisfies ChartConfig;
const NO_DEMAND = 9999;

/** Onde está o capital parado (excesso, em âmbar): candidatos à liquidação. */
export function IdleChart({ rows }: { rows: IdleRow[] }) {
  const router = useRouter();
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: Math.max(160, rows.length * 22 + 40) }}>
      <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" dataKey="idleValue" tickLine={false} axisLine={false} tickFormatter={(v: number) => brl(v, true)} />
        <YAxis type="category" dataKey="sku" width={76} tickLine={false} axisLine={false} interval={0} />
        <ChartTooltip
          cursor={false}
          content={({ active, payload }) => {
            const r = active ? (payload?.[0]?.payload as IdleRow | undefined) : undefined;
            if (!r) return null;
            return (
              <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                <div className="font-medium">{r.sku} · {r.status}</div>
                <div>Parado: {brl(r.idleValue)}</div>
                <div className="text-muted-foreground">
                  Cobertura: {r.coverageDays >= NO_DEMAND ? "sem demanda prevista" : `${intBR(r.coverageDays)} dias`}
                </div>
              </div>
            );
          }}
        />
        <Bar
          dataKey="idleValue"
          radius={3}
          fill="var(--color-warn)"
          className="cursor-pointer"
          onClick={(d) => router.push(`/estoque/${(d as unknown as { sku: string }).sku}`)}
        />
      </BarChart>
    </ChartContainer>
  );
}
