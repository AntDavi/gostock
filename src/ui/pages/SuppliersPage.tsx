"use client";

import { TriangleAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadError, PageHeader, PageSkeleton } from "../common/PageState";
import { useDataset } from "../DatasetProvider";
import { intBR } from "../format";
import { isUnstable, UNSTABLE_RATIO } from "../inventory";

export function SuppliersPage() {
  const { dataset: ds, error } = useDataset();
  if (error) return <LoadError message={error} />;
  if (!ds) return <PageSkeleton />;
  const unstable = ds.suppliers.filter((s) => isUnstable(s.leadTime));

  return (
    <div className="space-y-6">
      <PageHeader title="Fornecedores" subtitle="Lead time medido nos pedidos recebidos (data de recebimento − data do pedido)." />
      {unstable.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>
            {unstable.map((s) => s.supplier).join(", ")}: P90 mais de {String(UNSTABLE_RATIO).replace(".", ",")}× a mediana. O plano usa a mediana para a chegada; o agente antecipa emissões
            quando a chegada pelo P90 cai depois do início da campanha.
          </span>
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Lead time e pedidos em aberto</CardTitle>
          <CardDescription>Atrasado: PO em aberto cuja chegada esperada (pedido + mediana) já passou.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Fornecedor</TableHead>
                <TableHead className="text-right">Mediana</TableHead>
                <TableHead className="text-right">P90</TableHead>
                <TableHead className="text-right">Mín–máx</TableHead>
                <TableHead className="text-right">Pedidos medidos</TableHead>
                <TableHead className="text-right">SKUs</TableHead>
                <TableHead className="text-right">POs em aberto</TableHead>
                <TableHead className="pr-4 text-right">Atrasados</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ds.suppliers.map((s) => (
                <TableRow key={s.supplier}>
                  <TableCell className="pl-4">
                    <span className="font-medium">{s.supplier}</span> · {s.name}
                    {isUnstable(s.leadTime) && (
                      <Badge variant="destructive" className="ml-2">
                        instável
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{intBR(s.leadTime.median)} d</TableCell>
                  <TableCell className="text-right tabular-nums">{intBR(s.leadTime.p90)} d</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {intBR(s.leadTime.min)}–{intBR(s.leadTime.max)} d
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{intBR(s.leadTime.n)}</TableCell>
                  <TableCell className="text-right tabular-nums">{intBR(s.skuCount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{intBR(s.openOrders)}</TableCell>
                  <TableCell className={`pr-4 text-right tabular-nums ${s.lateOrders > 0 ? "text-danger" : ""}`}>{intBR(s.lateOrders)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
