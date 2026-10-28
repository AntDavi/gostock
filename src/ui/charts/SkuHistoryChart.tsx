"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { addDays, diffDays } from "@/core/dates";
import type { Campaign, ISODate } from "@/core/types";
import { dateBR, intBR } from "../format";

export interface HistoryPoint { date: ISODate; units: number; onHand: number }

const config = {
  units: { label: "Vendas (eixo à direita)", color: "var(--color-muted-foreground)" },
  onHand: { label: "Estoque", color: "var(--color-foreground)" },
  projected: { label: "Estoque projetado (plano atual)", color: "var(--color-foreground)" },
} satisfies ChartConfig;

interface Props {
  history: HistoryPoint[];
  /** "semana" ou "dia": a que período as vendas se referem. */
  period: "semana" | "dia";
  projection: { date: ISODate; onHand: number }[];
  start: ISODate;
  referenceDate: ISODate;
  campaigns: Campaign[];
  stockoutDate: ISODate | null;
  /** Versão menor para o painel lateral: sem legenda. */
  compact?: boolean;
}

const short = (c: Campaign) => (c.id === "bf" ? "BF" : c.name);

/** Vendas e estoque com as campanhas do ano passado sombreadas e a projeção até o fim da janela. */
export function SkuHistoryChart({ history, period, projection, start, referenceDate, campaigns, stockoutDate, compact }: Props) {
  const x = (d: ISODate) => diffDays(start, d);
  const data = [
    ...history.map((p) => ({ x: x(p.date), date: p.date, units: p.units, onHand: Math.max(0, p.onHand) })),
    ...projection.map((p) => ({ x: x(p.date), date: p.date, projected: Math.max(0, p.onHand) })),
  ];
  const max = data.length ? data[data.length - 1].x : 0;
  return (
    <ChartContainer config={config} className={compact ? "aspect-auto h-48 w-full" : "aspect-auto h-72 w-full"}>
      <ComposedChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          type="number"
          dataKey="x"
          domain={[0, max]}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => dateBR(addDays(start, v)).slice(3)}
          minTickGap={32}
        />
        <YAxis yAxisId="stock" tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => intBR(v)} />
        <YAxis yAxisId="sales" orientation="right" tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => intBR(v)} />
        {campaigns.flatMap((c) => [
          x(c.lastYearEnd) < 0 ? null : <ReferenceArea key={`${c.id}-ly`} x1={x(c.lastYearStart)} x2={x(c.lastYearEnd)} fill="var(--color-muted-foreground)" fillOpacity={0.12} yAxisId="stock" label={{ value: short(c), position: "insideTop", fontSize: 10, fill: "var(--color-muted-foreground)" }} />,
          <ReferenceArea key={`${c.id}-ty`} x1={x(c.start)} x2={x(c.end)} fill="var(--color-muted-foreground)" fillOpacity={0.12} yAxisId="stock" label={{ value: short(c), position: "insideTop", fontSize: 10, fill: "var(--color-muted-foreground)" }} />,
        ])}
        <ReferenceLine yAxisId="stock" x={x(referenceDate)} stroke="var(--color-muted-foreground)" strokeDasharray="3 3" label={{ value: "hoje", position: "insideTopRight", fontSize: 10, fill: "var(--color-muted-foreground)" }} />
        {stockoutDate && <ReferenceLine yAxisId="stock" x={x(stockoutDate)} stroke="var(--color-danger)" label={{ value: "ruptura", position: "insideBottomLeft", fontSize: 10, fill: "var(--color-danger)" }} />}
        <ChartTooltip
          cursor={false}
          content={({ active, payload }) => {
            const p = active ? (payload?.[0]?.payload as { date: ISODate; units?: number; onHand?: number; projected?: number } | undefined) : undefined;
            if (!p) return null;
            return (
              <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                <div className="font-medium">{period === "semana" && p.units !== undefined ? `Semana de ${dateBR(p.date)}` : dateBR(p.date)}</div>
                {p.units !== undefined && <div>Vendas: {intBR(p.units)} un</div>}
                {p.onHand !== undefined && <div>Estoque: {intBR(p.onHand)} un</div>}
                {p.projected !== undefined && <div>Estoque projetado: {intBR(p.projected)} un</div>}
              </div>
            );
          }}
        />
        <Bar yAxisId="sales" dataKey="units" fill="var(--color-units)" fillOpacity={0.6} barSize={period === "semana" ? 4 : 1} isAnimationActive={false} />
        <Line yAxisId="stock" dataKey="onHand" stroke="var(--color-onHand)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
        <Line yAxisId="stock" dataKey="projected" stroke="var(--color-projected)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        {!compact && <ChartLegend content={<ChartLegendContent />} />}
      </ComposedChart>
    </ChartContainer>
  );
}
