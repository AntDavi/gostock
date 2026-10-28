"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { diffDays } from "@/core/dates";
import type { ISODate } from "@/core/types";
import { dateBR, intBR } from "../format";

export interface StockoutRow { sku: string; date: ISODate; coverageDays: number; abc: string; beforeCampaign: boolean }

const config = { days: { label: "Dias até a ruptura" } } satisfies ChartConfig;

/** Dias até a ruptura sem pedido novo. Vermelho = rompe antes da primeira campanha. */
export function StockoutChart({ rows, referenceDate }: { rows: StockoutRow[]; referenceDate: ISODate }) {
  const router = useRouter();
  const data = rows.map((r) => ({ ...r, days: Math.max(0, diffDays(referenceDate, r.date)) }));
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: Math.max(160, data.length * 22 + 40) }}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" dataKey="days" tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="sku" width={76} tickLine={false} axisLine={false} interval={0} />
        <ChartTooltip
          cursor={false}
          content={({ active, payload }) => {
            const r = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
            if (!r) return null;
            return (
              <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                <div className="font-medium">{r.sku} · curva {r.abc}</div>
                <div>Ruptura em {dateBR(r.date)} ({intBR(r.days)} dias)</div>
                <div className="text-muted-foreground">Cobertura atual: {intBR(r.coverageDays)} dias</div>
              </div>
            );
          }}
        />
        <Bar dataKey="days" radius={3} className="cursor-pointer" onClick={(d) => router.push(`/estoque/${(d as unknown as { sku: string }).sku}`)}>
          {data.map((r) => (
            <Cell key={r.sku} fill={r.beforeCampaign ? "var(--color-danger)" : "var(--color-muted-foreground)"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
