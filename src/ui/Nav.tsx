"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useDataset } from "./DatasetProvider";
import { dateBR } from "./format";

const LINKS = [
  { href: "/", label: "Visão geral" },
  { href: "/plano", label: "Plano de compras" },
  { href: "/liquidacao", label: "Liquidação" },
  { href: "/estoque", label: "Estoque" },
  { href: "/fornecedores", label: "Fornecedores" },
  { href: "/dados", label: "Dados" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function DataBadge() {
  const { dataset } = useDataset();
  if (!dataset) return null;
  const label = dataset.source === "upload" ? "Dados: upload" : `Dados: padrão (${dateBR(dataset.config.referenceDate)})`;
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      {label}
    </Badge>
  );
}

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="font-semibold tracking-tight">
          GoStock
        </Link>
        <nav aria-label="Principal" className="hidden flex-1 items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(pathname, l.href) ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive(pathname, l.href) && "bg-muted font-medium text-foreground",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <DataBadge />
          </div>
          <Sheet>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu" />}>
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>GoStock</SheetTitle>
                <DataBadge />
              </SheetHeader>
              <nav aria-label="Principal" className="flex flex-col gap-1 px-4">
                {LINKS.map((l) => (
                  <SheetClose
                    key={l.href}
                    render={
                      <Link
                        href={l.href}
                        aria-current={isActive(pathname, l.href) ? "page" : undefined}
                        className={cn("rounded-md px-3 py-2 text-sm hover:bg-muted", isActive(pathname, l.href) && "bg-muted font-medium")}
                      />
                    }
                  >
                    {l.label}
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
