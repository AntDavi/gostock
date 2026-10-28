"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Change } from "@/agent/session";
import type { PlanLine } from "@/core/plan/allocate";
import type { Config, Dataset, SkuSummary } from "@/core/types";
import type { Decision, LineEdit } from "../approvals";
import { brl, dateBR, intBR } from "../format";
import { EditLineDialog } from "./EditLineDialog";

export function purchaseQty(lots: number, s: Pick<SkuSummary, "moq" | "purchaseUnit">): string {
  return `${intBR(lots * s.moq)} ${s.purchaseUnit === "cx12" ? "cx" : "un"}`;
}

type StatusFilter = "all" | "pending" | "approved" | "rejected";
type OriginFilter = "all" | "base" | "agent";

const STATUS_ITEMS = { all: "Todas", pending: "Pendentes", approved: "Aprovadas", rejected: "Recusadas" };
const ORIGIN_ITEMS = { all: "Base e agente", base: "Só base", agent: "Só agente" };

interface Props {
  lines: PlanLine[];
  dataset: Dataset;
  config: Config;
  changes: Change[];
  decisions: Record<string, Decision>;
  edits: Record<string, LineEdit>;
  onDecide(ids: string[], d: Decision | null): void;
  onEdit(id: string, e: LineEdit): void;
}

export function PlanTable({ lines, dataset, config, changes, decisions, edits, onDecide, onEdit }: Props) {
  const [supplier, setSupplier] = useState("all");
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<PlanLine | null>(null);

  const bySku = useMemo(() => new Map(dataset.skus.map((s) => [s.sku, s])), [dataset]);
  const supplierItems = useMemo(
    () => ({ all: "Todos os fornecedores", ...Object.fromEntries(dataset.suppliers.map((s) => [s.supplier, `${s.supplier} · ${s.name}`])) }),
    [dataset],
  );
  const lastChange = useMemo(() => {
    const m = new Map<string, Change>();
    for (const c of changes) if (c.lineId) m.set(c.lineId, c);
    return m;
  }, [changes]);

  const visible = lines.filter((l) => {
    const d = decisions[l.id];
    if (supplier !== "all" && l.supplier !== supplier) return false;
    if (origin !== "all" && l.origin !== origin) return false;
    if (status === "pending" && d) return false;
    if ((status === "approved" || status === "rejected") && d !== status) return false;
    return true;
  });
  const visiblePending = visible.filter((l) => !decisions[l.id]).map((l) => l.id);

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle>Linhas do plano</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select items={supplierItems} value={supplier} onValueChange={(v) => setSupplier(v ?? "all")}>
            <SelectTrigger className="w-56" aria-label="Fornecedor">
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
          <Select items={ORIGIN_ITEMS} value={origin} onValueChange={(v) => setOrigin((v ?? "all") as OriginFilter)}>
            <SelectTrigger className="w-40" aria-label="Origem">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ORIGIN_ITEMS).map(([v, label]) => (
                <SelectItem key={v} value={v}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select items={STATUS_ITEMS} value={status} onValueChange={(v) => setStatus((v ?? "all") as StatusFilter)}>
            <SelectTrigger className="w-36" aria-label="Situação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_ITEMS).map(([v, label]) => (
                <SelectItem key={v} value={v}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="sm:ml-auto" disabled={visiblePending.length === 0} onClick={() => onDecide(visiblePending, "approved")}>
            <CheckIcon data-icon="inline-start" /> Aprovar {visiblePending.length} pendente{visiblePending.length === 1 ? "" : "s"} visíve{visiblePending.length === 1 ? "l" : "is"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Emitir até</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead className="text-right">Quantidade</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="min-w-64">Motivo</TableHead>
              <TableHead className="pr-4 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Nenhuma linha com esses filtros.
                </TableCell>
              </TableRow>
            )}
            {visible.map((l) => {
              const s = bySku.get(l.sku)!;
              const d = decisions[l.id];
              const change = lastChange.get(l.id);
              return (
                <TableRow key={l.id} data-state={d} className={cn(d === "rejected" && "text-muted-foreground line-through decoration-muted-foreground/40", l.origin === "agent" && "bg-muted/40")}>
                  <TableCell className="pl-4 tabular-nums">{dateBR(l.emitBy)}</TableCell>
                  <TableCell>
                    <Link href={`/estoque/${l.sku}`} className="font-medium hover:underline">
                      {l.sku}
                    </Link>
                    <div className="max-w-48 truncate text-xs text-muted-foreground" title={s.description}>
                      {s.description}
                    </div>
                  </TableCell>
                  <TableCell>{l.supplier}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {purchaseQty(l.lots, s)}
                    {s.purchaseUnit === "cx12" && <div className="text-xs text-muted-foreground">{intBR(l.units)} un</div>}
                    {edits[l.id] && <div className="text-xs text-muted-foreground">editada</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{brl(l.cost)}</TableCell>
                  <TableCell className="max-w-md text-xs whitespace-normal">
                    {l.origin === "agent" && <Badge className="mr-1 align-middle">agente</Badge>}
                    {change ? (
                      <>
                        <span className="text-muted-foreground">
                          {change.before} → {change.after}.
                        </span>{" "}
                        {change.reason}
                      </>
                    ) : (
                      <span className="text-muted-foreground">{l.reason}</span>
                    )}
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon-sm"
                        variant={d === "approved" ? "default" : "ghost"}
                        aria-label={d === "approved" ? `Desfazer aprovação de ${l.sku}` : `Aprovar ${l.sku}`}
                        aria-pressed={d === "approved"}
                        onClick={() => onDecide([l.id], d === "approved" ? null : "approved")}
                      >
                        <CheckIcon />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Editar ${l.sku}`} onClick={() => setEditing(l)} disabled={d === "rejected"}>
                        <PencilIcon />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant={d === "rejected" ? "destructive" : "ghost"}
                        aria-label={d === "rejected" ? `Desfazer recusa de ${l.sku}` : `Recusar ${l.sku}`}
                        aria-pressed={d === "rejected"}
                        onClick={() => onDecide([l.id], d === "rejected" ? null : "rejected")}
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
      </CardContent>
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
    </Card>
  );
}
