"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon, PencilIcon, SearchIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Change } from "@/agent/session";
import type { Plan, PlanLine } from "@/core/plan/allocate";
import { compareToBase, LINE_TAG_LABEL } from "@/core/plan/risk";
import type { Config, Dataset, SkuSummary } from "@/core/types";
import type { Decision, LineEdit } from "../approvals";
import { brl, dateBR, intBR } from "../format";
import { Pills, ShowMore } from "../kit";
import { EditLineDialog } from "./EditLineDialog";

export function purchaseQty(lots: number, s: Pick<SkuSummary, "moq" | "purchaseUnit">): string {
  return `${intBR(lots * s.moq)} ${s.purchaseUnit === "cx12" ? "cx" : "un"}`;
}

const PAGE = 25;

type View = "all" | "changed" | "pending" | "approved" | "rejected";

interface Props {
  lines: PlanLine[];
  dataset: Dataset;
  config: Config;
  basePlan: Plan;
  changes: Change[];
  decisions: Record<string, Decision>;
  edits: Record<string, LineEdit>;
  onlyChanged: boolean;
  onOnlyChangedChange(v: boolean): void;
  onDecide(ids: string[], d: Decision | null): void;
  onEdit(id: string, e: LineEdit): void;
}

export function PlanTable({ lines, dataset, config, basePlan, changes, decisions, edits, onlyChanged, onOnlyChangedChange, onDecide, onEdit }: Props) {
  const [viewState, setView] = useState<Exclude<View, "changed">>("all");
  const [supplier, setSupplier] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<PlanLine | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const view: View = onlyChanged ? "changed" : viewState;

  const bySku = new Map(dataset.skus.map((s) => [s.sku, s]));
  const baseById = new Map(basePlan.lines.map((l) => [l.id, l]));
  const lastChange = new Map<string, Change>();
  for (const c of changes) if (c.lineId) lastChange.set(c.lineId, c);
  // Diferença contra o plano base: só vale para linhas que o agente mexeu (edição manual aparece como "editada").
  const diffOf = (l: PlanLine) => (lastChange.has(l.id) || l.origin === "agent" ? compareToBase(edits[l.id] ? { ...l, ...edits[l.id] } : l, baseById.get(l.id)) : null);

  const changedIds = new Set(lines.filter((l) => lastChange.has(l.id) || l.origin === "agent").map((l) => l.id));
  const count = {
    all: lines.length,
    changed: changedIds.size,
    pending: lines.filter((l) => !decisions[l.id]).length,
    approved: lines.filter((l) => decisions[l.id] === "approved").length,
    rejected: lines.filter((l) => decisions[l.id] === "rejected").length,
  };
  const term = q.trim().toLowerCase();
  const visible = lines.filter((l) => {
    const d = decisions[l.id];
    if (view === "changed" && !changedIds.has(l.id)) return false;
    if (view === "pending" && d) return false;
    if ((view === "approved" || view === "rejected") && d !== view) return false;
    if (supplier !== "all" && l.supplier !== supplier) return false;
    if (term) {
      const s = bySku.get(l.sku);
      if (!(l.sku.toLowerCase().includes(term) || l.supplier.toLowerCase().includes(term) || s?.description.toLowerCase().includes(term))) return false;
    }
    return true;
  });
  const shown = visible.slice(0, limit);
  const visibleIds = shown.map((l) => l.id);
  const sel = visibleIds.filter((id) => selected.has(id));
  const allSelected = visibleIds.length > 0 && sel.length === visibleIds.length;
  const pendingVisible = visible.filter((l) => !decisions[l.id]).map((l) => l.id);
  const supplierItems = { all: "Todos os fornecedores", ...Object.fromEntries(dataset.suppliers.map((s) => [s.supplier, `${s.supplier} · ${s.name}`])) };

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const bulk = (d: Decision | null) => {
    onDecide(sel, d);
    setSelected(new Set());
  };

  return (
    <section aria-label="Linhas do plano" className="rounded-2xl bg-card ring-1 ring-foreground/8">
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <Pills<View>
          label="Situação das linhas"
          value={view}
          onChange={(v) => {
            if (v === "changed") onOnlyChangedChange(true);
            else {
              onOnlyChangedChange(false);
              setView(v);
            }
          }}
          items={[
            { value: "all", label: `Todos ${count.all}` },
            ...(count.changed > 0 ? [{ value: "changed" as const, label: `Alterados pelo agente ${count.changed}` }] : []),
            { value: "pending", label: `Pendentes ${count.pending}` },
            { value: "approved", label: `Aprovados ${count.approved}` },
            { value: "rejected", label: `Recusados ${count.rejected}` },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select items={supplierItems} value={supplier} onValueChange={(v) => setSupplier(v ?? "all")}>
            <SelectTrigger className="h-9 sm:w-52" aria-label="Fornecedor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(supplierItems).map(([v, label]) => (
                <SelectItem key={v} value={v}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar SKU ou fornecedor" aria-label="Buscar SKU ou fornecedor" className="h-9 pl-8 sm:w-56" />
          </div>
        </div>
      </div>

      <div className="flex min-h-12 flex-wrap items-center gap-2 border-y border-hairline bg-surface px-4 py-2 text-sm">
        {sel.length > 0 ? (
          <>
            <span className="font-medium">
              {sel.length} selecionada{sel.length === 1 ? "" : "s"}
            </span>
            <Button size="sm" onClick={() => bulk("approved")}>
              <CheckIcon data-icon="inline-start" /> Aprovar
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk("rejected")}>
              <XIcon data-icon="inline-start" /> Recusar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => bulk(null)}>
              Voltar a pendente
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto">
              Limpar seleção
            </Button>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">
              {intBR(visible.length)} de {intBR(lines.length)} pedidos
            </span>
            <Button size="sm" variant="outline" className="ml-auto" disabled={pendingVisible.length === 0} onClick={() => onDecide(pendingVisible, "approved")}>
              <CheckIcon data-icon="inline-start" /> Aprovar {intBR(pendingVisible.length)} pendente{pendingVisible.length === 1 ? "" : "s"}{visible.length < lines.length ? " do filtro" : ""}
            </Button>
          </>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow className="text-xs tracking-wide text-muted-foreground uppercase hover:bg-transparent">
            <TableHead className="w-10 pl-4">
              <Checkbox
                aria-label="Selecionar as linhas mostradas"
                checked={allSelected}
                indeterminate={sel.length > 0 && !allSelected}
                onCheckedChange={(on) => setSelected(on ? new Set(visibleIds) : new Set())}
              />
            </TableHead>
            <TableHead>Emitir até</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Forn.</TableHead>
            <TableHead className="text-right">Qtd.</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="min-w-72">Por quê</TableHead>
            <TableHead className="pr-4 text-right">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                Nenhuma linha com esses filtros.
              </TableCell>
            </TableRow>
          )}
          {shown.map((l) => {
            const s = bySku.get(l.sku)!;
            const d = decisions[l.id];
            const change = lastChange.get(l.id);
            const diff = diffOf(l);
            const rejected = d === "rejected";
            return (
              <TableRow key={l.id} data-state={selected.has(l.id) ? "selected" : undefined} className={cn("align-top", changedIds.has(l.id) && "bg-accent/35", rejected && "text-muted-foreground")}>
                <TableCell className="pt-4 pl-4">
                  <Checkbox aria-label={`Selecionar ${l.sku}`} checked={selected.has(l.id)} onCheckedChange={(on) => toggle(l.id, on)} />
                </TableCell>
                <TableCell className="pt-3.5 tabular-nums">
                  <div className={cn("font-medium", rejected && "line-through")}>{dateBR(l.emitBy)}</div>
                  {diff?.emitBy && <div className="text-xs text-muted-foreground line-through">{dateBR(diff.emitBy)}</div>}
                </TableCell>
                <TableCell className="pt-3.5">
                  <Link href={`/estoque/${l.sku}`} className="font-semibold hover:underline">
                    {l.sku}
                  </Link>
                  <div className="max-w-52 truncate text-xs text-muted-foreground" title={s.description}>
                    {s.description}
                  </div>
                </TableCell>
                <TableCell className="pt-3.5">{l.supplier}</TableCell>
                <TableCell className="pt-3.5 text-right tabular-nums">
                  <div className={cn(rejected && "line-through")}>{purchaseQty(l.lots, s)}</div>
                  {diff?.lots !== undefined && <div className="text-xs text-muted-foreground line-through">{purchaseQty(diff.lots, s)}</div>}
                  {edits[l.id] && <div className="text-xs text-muted-foreground">editada por você</div>}
                </TableCell>
                <TableCell className={cn("pt-3.5 text-right font-medium tabular-nums", rejected && "line-through")}>{brl(l.cost)}</TableCell>
                <TableCell className="max-w-md pt-3 text-[13px] leading-snug whitespace-normal">
                  {diff && (
                    <Badge variant="agent" className="mr-1.5 align-[1px]">
                      {LINE_TAG_LABEL[diff.tag]}
                    </Badge>
                  )}
                  <span className={cn(!change && "text-muted-foreground")}>{change ? change.reason : l.reason}</span>
                </TableCell>
                <TableCell className="pt-2.5 pr-4">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant={d === "approved" ? "default" : "outline"}
                      aria-label={d === "approved" ? `Desfazer aprovação de ${l.sku}` : `Aprovar ${l.sku}`}
                      aria-pressed={d === "approved"}
                      onClick={() => onDecide([l.id], d === "approved" ? null : "approved")}
                    >
                      <CheckIcon />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={`Editar ${l.sku}`} onClick={() => setEditing(l)} disabled={rejected}>
                      <PencilIcon />
                    </Button>
                    <Button
                      size="icon"
                      variant={rejected ? "destructive" : "ghost"}
                      aria-label={rejected ? `Desfazer recusa de ${l.sku}` : `Recusar ${l.sku}`}
                      aria-pressed={rejected}
                      onClick={() => onDecide([l.id], rejected ? null : "rejected")}
                    >
                      <XIcon />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <ShowMore shown={shown.length} total={visible.length} step={PAGE} noun="pedidos" onMore={() => setLimit((n) => n + PAGE)} />
      {editing && (
        <EditLineDialog
          line={editing}
          sku={bySku.get(editing.sku)!}
          dataset={dataset}
          config={config}
          onClose={() => setEditing(null)}
          onSave={(e) => {
            onEdit(editing.id, e);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
