import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DatasetProvider } from "@/ui/DatasetProvider";
import { Nav } from "@/ui/Nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
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
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          <DatasetProvider>
            <Nav />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
          </DatasetProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
