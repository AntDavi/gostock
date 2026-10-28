import type { Metadata } from "next";
import { Geist_Mono, Hanken_Grotesk } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DatasetProvider } from "@/ui/DatasetProvider";
import { AppShell } from "@/ui/AppShell";
import "./globals.css";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GoStock",
  description: "Pedidos de compra e liquidação de estoque da GoBeauté, com um agente que revisa o plano.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${hanken.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          <DatasetProvider>
            <AppShell>{children}</AppShell>
          </DatasetProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
