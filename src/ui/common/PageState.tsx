"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

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
