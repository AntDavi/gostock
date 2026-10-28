"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlanLine } from "@/core/plan/allocate";
import { validateLine } from "@/core/plan/validate";
import type { Config, Dataset, SkuSummary } from "@/core/types";
import type { LineEdit } from "../approvals";
import { brl, dateBR, intBR } from "../format";

interface Props {
  line: PlanLine;
  sku: SkuSummary;
  dataset: Dataset;
  config: Config;
  onClose(): void;
  onSave(e: LineEdit): void;
}

/** Edição de quantidade (na unidade de compra) e data, validada pelas mesmas regras do agente. */
export function EditLineDialog({ line, sku, dataset, config, onClose, onSave }: Props) {
  const unit = sku.purchaseUnit === "cx12" ? "cx" : "un";
  const [qty, setQty] = useState(String(line.lots * sku.moq));
  const [date, setDate] = useState(line.emitBy);

  const q = Number(qty);
  // Quantidade digitada na unidade de compra; o validador trabalha em unidades.
  const unitsPerPurchase = sku.lotUnits / sku.moq;
  const units = Number.isFinite(q) ? q * unitsPerPurchase : NaN;
  const errors = validateLine({ sku: sku.sku, units, emitBy: date }, dataset, config);
  const lots = units / sku.lotUnits;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar {sku.sku}</DialogTitle>
          <DialogDescription>
            Lote mínimo: {intBR(sku.moq)} {unit}
            {sku.purchaseUnit === "cx12" ? ` (${intBR(sku.lotUnits)} un)` : ""}. Janela de emissão: {dateBR(config.windowStart)} a {dateBR(config.windowEnd)}.
          </DialogDescription>
        </DialogHeader>
        <form
          id="edit-line"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (errors.length === 0) onSave({ lots, emitBy: date });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="edit-qty">Quantidade ({unit})</Label>
            <Input id="edit-qty" type="number" inputMode="numeric" min={sku.moq} step={sku.moq} value={qty} onChange={(e) => setQty(e.target.value)} aria-invalid={errors.some((x) => x.code === "MOQ" || x.code === "NON_POSITIVE")} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-date">Emitir até</Label>
            <Input id="edit-date" type="date" min={config.windowStart} max={config.windowEnd} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={errors.some((x) => x.code === "WINDOW" || x.code === "BAD_DATE")} />
          </div>
          {errors.length > 0 ? (
            <ul className="space-y-1 text-sm text-danger-ink" role="alert">
              {errors.map((e) => (
                <li key={e.code}>{e.message}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {intBR(units)} un · {brl(lots * sku.lotCost)}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-line" disabled={errors.length > 0}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
