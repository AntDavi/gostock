"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { suggestMarkdowns } from "@/core/plan/curve";
import { readStoredApprovals } from "./approvals";
import { useDataset } from "./DatasetProvider";
import { dateBR, intBR } from "./format";
import { isUnstable } from "./inventory";
import { useCompute } from "./useCompute";

interface Badge { value: number; tone: "neutral" | "warn"; label: string }

const LINKS = [
  { href: "/", label: "Visão geral" },
  { href: "/plano", label: "Plano de compras" },
  { href: "/liquidacao", label: "Liquidação" },
  { href: "/estoque", label: "Estoque" },
  { href: "/fornecedores", label: "Fornecedores" },
  { href: "/dados", label: "Dados" },
] as const;

function isActive(pathname: string | null, href: string) {
  if (pathname === null) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

/** Contadores do menu: linhas do plano, sugestões de liquidação e fornecedores instáveis. */
function useBadges(): Partial<Record<(typeof LINKS)[number]["href"], Badge>> {
  const { dataset: ds, config: cfg } = useDataset();
  const stored = ds && cfg ? readStoredApprovals(ds.id, cfg) : null;
  const base = useCompute("basePlan", stored?.agentState ? null : ds, cfg);
  if (!ds || !cfg) return {};
  const lines = stored?.agentState?.plan.lines.length ?? (base.status === "done" ? base.result.plan.lines.length : null);
  const markdowns = suggestMarkdowns(ds, cfg).length;
  const unstable = ds.suppliers.filter((s) => isUnstable(s.leadTime)).length;
  return {
    ...(lines !== null ? { "/plano": { value: lines, tone: "neutral" as const, label: `${lines} pedidos no plano` } } : {}),
    "/liquidacao": { value: markdowns, tone: "neutral", label: `${markdowns} sugestões de liquidação` },
    ...(unstable > 0 ? { "/fornecedores": { value: unstable, tone: "warn" as const, label: `${unstable} fornecedor${unstable > 1 ? "es" : ""} com lead time instável` } } : {}),
  };
}

function NavLinks({ pathname, onNavigate }: { pathname: string | null; onNavigate?: boolean }) {
  const badges = useBadges();
  return (
    <ul className="flex flex-col gap-0.5">
      {LINKS.map((l) => {
        const active = isActive(pathname, l.href);
        const b = badges[l.href];
        const link = (
          <Link
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center justify-between gap-2 rounded-[10px] px-3 text-[15px] text-foreground/80 transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-accent font-semibold text-accent-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {l.label}
            {b && (
              <span
                title={b.label}
                aria-label={b.label}
                className={cn(
                  "min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-medium tabular-nums",
                  b.tone === "warn" ? "bg-warn-soft text-warn-ink" : "bg-secondary text-muted-foreground",
                )}
              >
                {intBR(b.value)}
              </span>
            )}
          </Link>
        );
        return <li key={l.href}>{onNavigate ? <SheetClose render={link} /> : link}</li>;
      })}
    </ul>
  );
}

function DataCard() {
  const { dataset: ds } = useDataset();
  if (!ds) return null;
  return (
    <div className="rounded-xl bg-secondary/70 p-3.5 text-sm">
      <div className="font-semibold">{ds.source === "upload" ? "Dados enviados" : "Dados padrão"}</div>
      <div className="text-muted-foreground">Referência {dateBR(ds.config.referenceDate)}</div>
      <Link href="/dados" className="mt-1 inline-block font-medium text-primary underline">
        {ds.source === "upload" ? "Trocar ou voltar ao padrão" : "Enviar meus CSVs"}
      </Link>
    </div>
  );
}

function Shell({ pathname, children }: { pathname: string | null; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-58 shrink-0 flex-col border-r bg-sidebar px-4 py-6 md:flex">
        <Link href="/" className="px-3 text-lg font-bold tracking-tight">
          GoStock
        </Link>
        <nav aria-label="Principal" className="mt-6 flex-1">
          <NavLinks pathname={pathname} />
        </nav>
        <DataCard />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-sidebar/95 px-4 backdrop-blur md:hidden">
          <Link href="/" className="font-bold tracking-tight">
            GoStock
          </Link>
          <Sheet>
            <SheetTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Abrir menu" />}>
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 p-4">
              <SheetHeader className="p-0 pb-4">
                <SheetTitle className="px-3 text-lg font-bold">GoStock</SheetTitle>
              </SheetHeader>
              <nav aria-label="Principal" className="flex-1">
                <NavLinks pathname={pathname} onNavigate />
              </nav>
              <DataCard />
            </SheetContent>
          </Sheet>
        </header>
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}

function ShellWithPath({ children }: { children: ReactNode }) {
  return <Shell pathname={usePathname()}>{children}</Shell>;
}

/** O destaque do item ativo lê a URL; em rotas dinâmicas isso precisa de Suspense. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Shell pathname={null}>{children}</Shell>}>
      <ShellWithPath>{children}</ShellWithPath>
    </Suspense>
  );
}
