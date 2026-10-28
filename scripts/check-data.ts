// Roda o pipeline sobre os CSVs em case_estoque/ e imprime os números de conferência. Não grava nada:
// o app não traz dados embutidos, eles vêm só do upload no navegador.
import fs from "node:fs";
import path from "node:path";
import { defaultConfig } from "../src/core/config";
import { loadDataset } from "../src/core/load";
import { runPipeline } from "../src/core/pipeline";

const dir = path.resolve(process.argv[2] ?? "case_estoque");
if (!fs.existsSync(dir)) {
  console.error(`Pasta ${dir} não encontrada. Coloque os CSVs do desafio em case_estoque/ (não versionada).`);
  process.exit(1);
}
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");

const t0 = Date.now();
const loaded = loadDataset({
  skus: read("skus.csv"),
  vendas: read("vendas_diarias.csv"),
  estoque: read("estoque_diario.csv"),
  compras: read("compras.csv"),
  fornecedores: read("fornecedores.csv"),
});
for (const w of loaded.warnings) console.warn("aviso:", w);
if (!loaded.data) {
  for (const e of loaded.errors) console.error("erro:", e);
  process.exit(1);
}
const ds = runPipeline(loaded.data, defaultConfig);

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
console.log(`SKUs: ${ds.kpis.skuCount} (ativos ${ds.kpis.activeCount})`);
console.log(`Estoque a custo: ${brl(ds.kpis.stockValue)}`);
console.log(`Parado: ${brl(ds.kpis.idleValue)}`);
console.log(`Venda perdida 12m: ${brl(ds.kpis.lostRevenue12m)}`);
console.log(`Nível de serviço 12m: ${(ds.kpis.fillRate12m * 100).toFixed(1)}%`);
console.log(`POs em aberto: ${ds.kpis.openPoCount} (atrasados ${ds.kpis.latePoCount})`);
console.log(`Duplicatas removidas: ${ds.kpis.duplicatesRemoved}`);
console.log(`Resumo: ${(JSON.stringify(ds).length / 1e6).toFixed(2)} MB em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
