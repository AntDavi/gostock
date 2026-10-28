"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SkuSummary } from "@/core/types";
import { readStoredApprovals } from "../approvals";
import { LoadError, PageHeader, PageSkeleton } from "../common/PageState";
import { useDataset } from "../DatasetProvider";
import { brl, dateBR, intBR } from "../format";
import { skuSituation, type Situation } from "../inventory";
import { InfoTip, Meter, Pills, ShowMore } from "../kit";
import { firstCampaign } from "../overview";
import { useCompute } from "../useCompute";
import { useMediaQuery } from "../useMediaQuery";
import { SkuQuick } from "./SkuQuick";

const NO_DEMAND = 9999;
const PAGE = 100;
const COVERAGE_SCALE = 180;
type Quick = "all" | "zerado" | "ruptura" | "excesso" | "descontinuado";
type SortKey = "coverage" | "value" | "lost";
const SORT_LABEL: Record<SortKey, string> = { coverage: "Menor cobertura", value: "Maior valor em estoque", lost: "Maior venda perdida" };
const sortValue: Record<SortKey, (s: SkuSummary) => number> = {
  coverage: (s) => (s.status === "descontinuado" ? NO_DEMAND + 1 : s.metrics.coverageDays),
  value: (s) => -s.metrics.stockValue,
  lost: (s) => -s.metrics.lostRevenue12m,
};

function FilterSelect({ label, value, onChange, items }: { label: string; value: string; onChange(v: string): void; items: Record<string, string> }) {
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange(v ?? "all")}>
      <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-32" aria-label={label}>
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
  const stored = ds && cfg ? readStoredApprovals(ds.id, cfg) : null;
  const base = useCompute("basePlan", stored?.agentState ? null : ds, cfg);
  const initial = useSearchParams().get("situacao");
  const [q, setQ] = useState("");
  const [quick, setQuick] = useState<Quick>(initial === "ruptura" || initial === "excesso" ? initial : "all");
  const [category, setCategory] = useState("all");
  const [supplier, setSupplier] = useState("all");
  const [abc, setAbc] = useState("all");
  const [sort, setSort] = useState<SortKey>("coverage");
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const docked = useMediaQuery("(min-width: 1280px)");

  if (error) return <LoadError message={error} />;
  if (!ds || !cfg) return <PageSkeleton />;

  const so = stockouts.status === "done" ? stockouts.result : null;
  const sit = (s: SkuSummary): Situation | null => (so ? skuSituation(s, so[s.sku], cfg) : s.metrics.coverageDays > 365 ? "excesso" : null);
  const matchQuick = (s: SkuSummary) =>
    quick === "all" ||
    (quick === "zerado" && s.status === "ativo" && s.onHand <= 0) ||
    (quick === "ruptura" && sit(s) === "ruptura") ||
    (quick === "excesso" && sit(s) === "excesso") ||
    (quick === "descontinuado" && s.status === "descontinuado");
  const term = q.trim().toLowerCase();
  const filtered = ds.skus
    .filter(
      (s) =>
        matchQuick(s) &&
        (!term || s.sku.toLowerCase().includes(term) || s.description.toLowerCase().includes(term) || s.brand.toLowerCase().includes(term)) &&
        (category === "all" || s.category === category) &&
        (supplier === "all" || s.supplier === supplier) &&
        (abc === "all" || s.abc === abc),
    )
    .sort((a, b) => sortValue[sort](a) - sortValue[sort](b) || a.sku.localeCompare(b.sku));
  const count = (k: Quick) => ds.skus.filter((s) => (k === "all" ? true : k === "zerado" ? s.status === "ativo" && s.onHand <= 0 : k === "descontinuado" ? s.status === "descontinuado" : sit(s) === k)).length;

  const categories = Object.fromEntries([["all", "Categoria"], ...[...new Set(ds.skus.map((s) => s.category))].sort().map((c) => [c, c])]);
  const suppliers = Object.fromEntries([["all", "Fornecedor"], ...ds.suppliers.map((s) => [s.supplier, `${s.supplier} · ${s.name}`])]);
  const campaign = firstCampaign(cfg);
  const openSku = open ? ds.skus.find((s) => s.sku === open) : null;
  const plan = stored?.agentState?.plan ?? (base.status === "done" ? base.result.plan : null);
  // Com a ficha encaixada ao lado, a lista mostra só as colunas essenciais (como no design).
  const narrow = docked && !!openSku;

  return (
    <div className="space-y-6">
      <PageHeader title="Estoque" subtitle={`${intBR(ds.skus.length)} SKUs em ${dateBR(cfg.referenceDate)}. Clique num SKU para ver histórico, projeção e pedidos.`} />

      <div className="space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar SKU, descrição ou marca" aria-label="Buscar SKU, descrição ou marca" className="h-9 bg-card pl-8" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <FilterSelect label="Curva ABC" value={abc} onChange={setAbc} items={{ all: "Curva", A: "Curva A", B: "Curva B", C: "Curva C" }} />
            <FilterSelect label="Categoria" value={category} onChange={setCategory} items={categories} />
            <FilterSelect label="Fornecedor" value={supplier} onChange={setSupplier} items={suppliers} />
            <FilterSelect label="Ordenar por" value={sort} onChange={(v) => setSort(v as SortKey)} items={SORT_LABEL} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Pills<Quick>
            label="Situação"
            value={quick}
            onChange={setQuick}
            size="sm"
            items={[
              { value: "all", label: "Todos" },
              { value: "zerado", label: `Sem estoque ${so ? count("zerado") : ""}`.trim() },
              { value: "ruptura", label: so ? `Rompe antes da ${campaign.id === "bf" ? "BF" : campaign.name} ${count("ruptura")}` : `Rompe antes da ${campaign.id === "bf" ? "BF" : campaign.name}` },
              { value: "excesso", label: `Excesso ${count("excesso")}` },
              { value: "descontinuado", label: `Descontinuados ${count("descontinuado")}` },
            ]}
          />
          <span className="text-[13px] text-muted-foreground" aria-live="polite">
            {intBR(filtered.length)} SKUs · {SORT_LABEL[sort].toLowerCase()}
            {stockouts.status === "loading" && " · calculando rupturas…"}
          </span>
        </div>
      </div>

      <div className={cn("grid items-start gap-4", docked && openSku && "grid-cols-[minmax(0,1fr)_380px]")}>
      <section aria-label="SKUs" className="min-w-0 rounded-2xl bg-card ring-1 ring-foreground/8">
        <Table>
          <TableHeader>
            <TableRow className="text-xs tracking-wide text-muted-foreground uppercase hover:bg-transparent">
              <TableHead className="pl-4">SKU</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="min-w-44">
                <span className="inline-flex items-center gap-1">
                  Cobertura
                  <InfoTip label="Sobre a cobertura">
                    Dias que o estoque atual dura pela demanda prevista, sem contar POs em aberto. A barra fica vermelha quando o SKU rompe antes da campanha e âmbar quando passa de 1 ano.
                  </InfoTip>
                </span>
              </TableHead>
              {!narrow && <TableHead className="text-right">Ruptura sem pedido</TableHead>}
              <TableHead className={cn("text-right", narrow && "pr-4")}>Valor</TableHead>
              {!narrow && <TableHead className="pr-4 text-right">Venda perdida 12m</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={narrow ? 4 : 6} className="py-10 text-center text-muted-foreground">
                  Nenhum SKU com esses filtros.
                </TableCell>
              </TableRow>
            )}
            {filtered.slice(0, limit).map((s) => {
              const st = sit(s);
              const date = so?.[s.sku];
              const cov = s.metrics.coverageDays;
              return (
                <TableRow key={s.sku} className={cn("cursor-pointer", open === s.sku && "bg-accent/50")} onClick={() => setOpen(s.sku)}>
                  <TableCell className="pl-4">
                    <button type="button" onClick={() => setOpen(s.sku)} className="text-left font-semibold hover:underline" aria-label={`Abrir ficha de ${s.sku}`}>
                      {s.sku}
                    </button>
                    <div className="max-w-64 truncate text-xs text-muted-foreground" title={`${s.brand} · ${s.description}`}>
                      Curva {s.abc} · {s.supplier} · {s.description}
                    </div>
                  </TableCell>
                  <TableCell>
                    {s.status === "descontinuado" ? (
                      <Badge variant="outline">descontinuado</Badge>
                    ) : st === "ruptura" ? (
                      <Badge variant="danger">rompe antes</Badge>
                    ) : st === "excesso" ? (
                      <Badge variant="warn">excesso</Badge>
                    ) : (
                      <Badge variant="secondary">ok</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Meter value={Math.min(cov, COVERAGE_SCALE)} max={COVERAGE_SCALE} tone={st === "ruptura" ? "danger" : st === "excesso" ? "warn" : "muted"} className="w-24 shrink-0" />
                      <span className={cn("tabular-nums", st === "ruptura" && "font-semibold text-danger-ink", st === "excesso" && "text-warn-ink")}>{cov >= NO_DEMAND ? "sem demanda" : `${intBR(cov)} d`}</span>
                    </div>
                  </TableCell>
                  {!narrow && <TableCell className={cn("text-right tabular-nums", st === "ruptura" && "font-semibold text-danger-ink")}>{date ? dateBR(date) : "—"}</TableCell>}
                  <TableCell className={cn("text-right tabular-nums", narrow && "pr-4")}>{brl(s.metrics.stockValue)}</TableCell>
                  {!narrow && <TableCell className="pr-4 text-right tabular-nums">{brl(s.metrics.lostRevenue12m)}</TableCell>}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <ShowMore shown={Math.min(limit, filtered.length)} total={filtered.length} step={PAGE} noun="SKUs" onMore={() => setLimit((n) => n + PAGE)} />
      </section>
      {docked && openSku && (
        <aside aria-label={`Ficha de ${openSku.sku}`} className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-2xl bg-card p-5 ring-1 ring-foreground/8">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ficha do SKU</div>
              <h2 className="text-2xl font-bold">{openSku.sku}</h2>
              <p className="text-sm text-muted-foreground">
                {openSku.brand} · {openSku.description}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(null)} aria-label="Fechar ficha" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <XIcon className="size-4" />
            </button>
          </div>
          <SkuQuick s={openSku} ds={ds} cfg={cfg} plan={plan} />
        </aside>
      )}
      </div>

      <Sheet open={!docked && !!openSku} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          {openSku && (
            <>
              <SheetHeader>
                <SheetTitle className="text-xl font-bold">{openSku.sku}</SheetTitle>
                <SheetDescription>
                  {openSku.brand} · {openSku.description}
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <SkuQuick s={openSku} ds={ds} cfg={cfg} plan={plan} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
