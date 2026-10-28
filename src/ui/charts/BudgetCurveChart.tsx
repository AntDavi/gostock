"use client";

import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { BudgetPoint } from "@/core/plan/curve";
import { brl, pct } from "../format";

const config = { expectedFillRate: { label: "Fill esperado", color: "var(--color-foreground)" } } satisfies ChartConfig;

/** Quanto serviço cada orçamento compra (pergunta 5 do desafio). */
export function BudgetCurveChart({ points, budget, target }: { points: BudgetPoint[]; budget: number; target: number }) {
  const plan = points.reduce((best, p) => (Math.abs(p.budget - budget) < Math.abs(best.budget - budget) ? p : best), points[0]);
  const minY = Math.floor(Math.min(...points.map((p) => p.expectedFillRate)) * 10) / 10;
  const yTicks = Array.from({ length: Math.round((1 - minY) * 10) + 1 }, (_, i) => Math.round((minY + i * 0.1) * 10) / 10);
  const maxX = Math.max(...points.map((p) => p.budget));
  const xTicks = Array.from({ length: Math.floor(maxX / 1e6) + 1 }, (_, i) => i * 1e6);
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <LineChart data={points} margin={{ left: 4, right: 24, top: 16 }}>
        <CartesianGrid vertical={false} />
        <XAxis type="number" dataKey="budget" domain={[0, "dataMax"]} ticks={xTicks} tickLine={false} axisLine={false} tickFormatter={(v: number) => brl(v, true)} />
        <YAxis domain={[minY, 1]} ticks={yTicks} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => pct(v, 0)} />
        <ReferenceLine y={target} strokeDasharray="4 4" stroke="var(--color-muted-foreground)" label={{ value: `meta ${pct(target, 0)}`, position: "insideTopLeft", fontSize: 11, fill: "var(--color-muted-foreground)" }} />
        <ReferenceLine x={budget} strokeDasharray="4 4" stroke="var(--color-muted-foreground)" />
        <ChartTooltip
          cursor={false}
          content={({ active, payload }) => {
            const p = active ? (payload?.[0]?.payload as BudgetPoint | undefined) : undefined;
            if (!p) return null;
            return (
              <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                <div className="font-medium">Orçamento {brl(p.budget, true)}</div>
                <div>Fill esperado: {pct(p.expectedFillRate)}</div>
              </div>
            );
          }}
        />
        <Line dataKey="expectedFillRate" type="linear" isAnimationActive={false} stroke="var(--color-expectedFillRate)" strokeWidth={2} dot={{ r: 3 }} />
        <ReferenceDot x={plan.budget} y={plan.expectedFillRate} r={5} fill="var(--color-foreground)" stroke="var(--color-background)" strokeWidth={2} />
      </LineChart>
    </ChartContainer>
  );
}
