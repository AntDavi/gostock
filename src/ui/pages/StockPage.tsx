"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDownIcon, SearchIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SkuSummary } from "@/core/types";
import { LoadError, PageHeader, PageSkeleton } from "../common/PageState";
import { useDataset } from "../DatasetProvider";
import { brl, dateBR, intBR } from "../format";
import { SITUATION_LABEL, skuSituation, type Situation } from "../inventory";
import { useCompute } from "../useCompute";

const PAGE = 100;
const NO_DEMAND = 9999;
type SortKey = "coverage" | "value" | "lost";
const SORT_LABEL: Record<SortKey, string> = { coverage: "Cobertura", value: "Valor em estoque", lost: "Venda perdida 12m" };
const sortValue: Record<SortKey, (s: SkuSummary) => number> = {
  coverage: (s) => s.metrics.coverageDays,
  value: (s) => -s.metrics.stockValue,
  lost: (s) => -s.metrics.lostRevenue12m,
};

function FilterSelect({ label, value, onChange, items }: { label: string; value: string; onChange(v: string): void; items: Record<string, string> }) {
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange(v ?? "all")}>
      <SelectTrigger className="w-full sm:w-auto sm:min-w-36" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(items).map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function StockPage() {
  const { dataset: ds, config: cfg, error } = useDataset();
  const stockouts = useCompute("stockouts", ds, cfg);
  const params = useSearchParams();
  const initial = params.get("situacao");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [supplier, setSupplier] = useState("all");
  const [abc, setAbc] = useState("all");
  const [situation, setSituation] = useState(initial === "ruptura" || initial === "excesso" || initial === "ok" ? initial : "all");
  const [sort, setSort] = useState<SortKey>("coverage");
  const [limit, setLimit] = useState(PAGE);

  if (error) return <LoadError message={error} />;
  if (!ds || !cfg) return <PageSkeleton />;

  const so = stockouts.status === "done" ? stockouts.result : null;
  const sit = (s: SkuSummary): Situation | null => (so ? skuSituation(s, so[s.sku], cfg) : s.metrics.coverageDays > 365 ? "excesso" : null);
  const term = q.trim().toLowerCase();
  const filtered = ds.skus
    .filter(
      (s) =>
        (!term || s.sku.toLowerCase().includes(term) || s.description.toLowerCase().includes(term) || s.brand.toLowerCase().includes(term)) &&
        (status === "all" || s.status === status) &&
        (category === "all" || s.category === category) &&
        (supplier === "all" || s.supplier === supplier) &&
        (abc === "all" || s.abc === abc) &&
        (situation === "all" || sit(s) === situation),
    )
    .sort((a, b) => sortValue[sort](a) - sortValue[sort](b) || a.sku.localeCompare(b.sku));

  const categories = Object.fromEntries([["all", "Todas as categorias"], ...[...new Set(ds.skus.map((s) => s.category))].sort().map((c) => [c, c])]);
  const suppliers = Object.fromEntries([["all", "Todos os fornecedores"], ...ds.suppliers.map((s) => [s.supplier, `${s.supplier} · ${s.name}`])]);
  const reset = () => setLimit(PAGE);

  return (
    <div className="space-y-6">
      <PageHeader title="Estoque" subtitle={`${intBR(ds.skus.length)} SKUs em ${dateBR(cfg.referenceDate)}. Clique num SKU para ver histórico, projeção e pedidos.`} />
      <Card>
        <CardContent className="space-y-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => (setQ(e.target.value), reset())} placeholder="Buscar por SKU, descrição ou marca" aria-label="Buscar" className="pl-8" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <FilterSelect label="Situação" value={situation} onChange={(v) => (setSituation(v), reset())} items={{ all: "Todas as situações", ...SITUATION_LABEL }} />
            <FilterSelect label="Status" value={status} onChange={(v) => (setStatus(v), reset())} items={{ all: "Ativos e descontinuados", ativo: "Ativos", descontinuado: "Descontinuados" }} />
            <FilterSelect label="Curva ABC" value={abc} onChange={(v) => (setAbc(v), reset())} items={{ all: "Curva A, B e C", A: "Curva A", B: "Curva B", C: "Curva C" }} />
            <FilterSelect label="Categoria" value={category} onChange={(v) => (setCategory(v), reset())} items={categories} />
            <FilterSelect label="Fornecedor" value={supplier} onChange={(v) => (setSupplier(v), reset())} items={suppliers} />
            <FilterSelect label="Ordenar por" value={sort} onChange={(v) => setSort(v as SortKey)} items={SORT_LABEL} />
          </div>
          <p className="text-xs text-muted-foreground">
            {intBR(filtered.length)} SKUs{stockouts.status === "loading" && " · calculando rupturas…"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">SKU</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>ABC</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">
                  Cobertura {sort === "coverage" && <ArrowDownIcon className="inline size-3" />}
                </TableHead>
                <TableHead className="text-right">Ruptura sem pedido</TableHead>
                <TableHead className="text-right">
                  Valor em estoque {sort === "value" && <ArrowDownIcon className="inline size-3" />}
                </TableHead>
                <TableHead className="pr-4 text-right">
                  Venda perdida 12m {sort === "lost" && <ArrowDownIcon className="inline size-3" />}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Nenhum SKU com esses filtros.
                  </TableCell>
                </TableRow>
              )}
              {filtered.slice(0, limit).map((s) => {
                const st = sit(s);
                const date = so?.[s.sku];
                return (
                  <TableRow key={s.sku}>
                    <TableCell className="pl-4">
                      <Link href={`/estoque/${s.sku}`} className="font-medium hover:underline">
                        {s.sku}
                      </Link>
                      <div className="max-w-64 truncate text-xs text-muted-foreground" title={s.description}>
                        {s.brand} · {s.description}
                      </div>
                    </TableCell>
                    <TableCell>
                      {st === "ruptura" && <Badge variant="destructive">ruptura</Badge>}
                      {st === "excesso" && <Badge className="bg-warn/15 text-warn">excesso</Badge>}
                      {st === "ok" && <span className="text-xs text-muted-foreground">ok</span>}
                      {s.status === "descontinuado" && (
                        <Badge variant="outline" className="ml-1">
                          descontinuado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{s.abc}</TableCell>
                    <TableCell>{s.supplier}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", st === "excesso" && "text-warn")}>
                      {s.metrics.coverageDays >= NO_DEMAND ? "sem demanda" : `${intBR(s.metrics.coverageDays)} d`}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", st === "ruptura" && "text-danger")}>{date ? dateBR(date) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(s.metrics.stockValue)}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{brl(s.metrics.lostRevenue12m)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filtered.length > limit && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
                Mostrar mais {intBR(Math.min(PAGE, filtered.length - limit))}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
