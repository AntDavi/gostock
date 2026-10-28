"use client";

import Link from "next/link";
import { UploadIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataset } from "../DatasetProvider";

export function LoadError({ title = "Erro ao carregar os dados", message }: { title?: string; message: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function PageSkeleton({ note }: { note?: string }) {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-24" />
      <Skeleton className="h-96" />
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-bold sm:text-[32px]">{title}</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">{subtitle}</p>
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** Tela sem dataset: esqueleto enquanto lê o navegador; depois, o convite para enviar os CSVs. */
export function NoData() {
  const { loading } = useDataset();
  if (loading) return <PageSkeleton />;
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden>
        <UploadIcon className="size-6" />
      </div>
      <h1 className="text-[28px] leading-tight font-bold">Envie os dados do estoque</h1>
      <p className="text-[15px] text-muted-foreground">
        O GoStock analisa os cinco CSVs do seu estoque (SKUs, vendas diárias, estoque diário, compras e fornecedores). O processamento é feito no seu navegador e pode levar alguns
        segundos. Depois disso, o plano de compras, a liquidação e as demais telas ficam disponíveis.
      </p>
      <Button size="lg" render={<Link href="/dados" />} nativeButton={false}>
        <UploadIcon data-icon="inline-start" /> Enviar CSVs
      </Button>
    </div>
  );
}
