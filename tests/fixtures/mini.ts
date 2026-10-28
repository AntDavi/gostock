// Dataset sintético mínimo, com as mesmas colunas de case_estoque/.
// AAA-1: 10/dia (30/dia na BF 2025, receita com 25% de desconto), duplicata em 2026-03-10,
//        estoque negativo (-4) em 2026-06-01, sem registro de estoque em 2026-07-15,
//        ruptura de 2026-08-01 a 2026-08-05, PO aberto emitido 2026-09-01 (300 un).
// BBB-1: 24/dia, compra em cx 12 un, lead time 25, PO aberto emitido 2026-09-20 (20 cx).
// DDD-1: descontinuado, 1/dia, saldo de abertura 2000, sem compras.
import { addDays, dateRange, inRange } from "@/core/dates";
import { loadDataset } from "@/core/load";
import type { CsvFiles, RawDataset } from "@/core/types";

export const MINI_START = "2025-04-01";
export const MINI_END = "2026-09-29";

const skus = [
  "sku,marca,descricao,categoria,status,custo_unitario,preco_venda,fornecedor,unidade_compra,moq",
  "AAA-1,X,Shampoo A,Shampoo,ativo,10,40,F01,un,100",
  "BBB-1,Y,Shampoo B,Shampoo,ativo,5,20,F02,cx 12 un,10",
  "DDD-1,X,Oleo D,Óleo,descontinuado,8,30,F01,un,50",
].join("\n");

const fornecedores = ["fornecedor,nome_fornecedor", "F01,Alfa", "F02,Beta"].join("\n");

interface SimSpec {
  sku: string;
  supplier: string;
  price: number;
  opening: number;
  demand: (d: string) => { units: number; discount: number };
  reorderBelow: number;
  orderQty: number; // na unidade de compra
  unitsPer: 1 | 12;
  unit: string;
  leadTimes: number[]; // ciclo
}

function simulate(spec: SimSpec, po: { n: number }) {
  const sales: string[] = [];
  const stock: string[] = [];
  const buys: string[] = [];
  const arrivals = new Map<string, number>();
  let onHand = spec.opening;
  let pipeline = 0;
  let ltIdx = 0;
  for (const d of dateRange(MINI_START, MINI_END)) {
    const arrived = arrivals.get(d) ?? 0;
    onHand += arrived;
    pipeline -= arrived;
    const forcedOut = spec.sku === "AAA-1" && inRange(d, "2026-08-01", "2026-08-05");
    if (d !== MINI_START) {
      const { units, discount } = spec.demand(d);
      const sold = forcedOut ? 0 : Math.min(units, onHand);
      onHand = forcedOut ? 0 : onHand - sold;
      if (sold > 0) sales.push(`${spec.sku},${d},${sold},${(sold * spec.price * (1 - discount)).toFixed(1)}`);
      if (spec.sku === "AAA-1" && d === "2026-03-10") sales.push(sales[sales.length - 1]);
    }
    const suppress = spec.sku === "AAA-1" && inRange(d, "2026-07-20", "2026-08-05");
    if (spec.leadTimes.length && !suppress && onHand + pipeline < spec.reorderBelow) {
      const lt = spec.leadTimes[ltIdx % spec.leadTimes.length];
      const arrival = addDays(d, lt);
      if (arrival <= MINI_END) {
        ltIdx++;
        const units = spec.orderQty * spec.unitsPer;
        arrivals.set(arrival, (arrivals.get(arrival) ?? 0) + units);
        pipeline += units;
        buys.push(`PO-${++po.n},${spec.supplier},${spec.sku},${d},${arrival},${spec.orderQty},${spec.unit}`);
      }
    }
    if (spec.sku === "AAA-1" && d === "2026-07-27") {
      arrivals.set("2026-08-06", (arrivals.get("2026-08-06") ?? 0) + 1000);
      pipeline += 1000;
      buys.push(`PO-${++po.n},F01,AAA-1,2026-07-27,2026-08-06,1000,un`);
    }
    if (spec.sku === "AAA-1" && d === "2026-07-15") continue; // dia sem registro de estoque
    const recorded = spec.sku === "AAA-1" && d === "2026-06-01" ? -4 : onHand;
    stock.push(`${spec.sku},${d},${recorded}`);
  }
  return { sales, stock, buys };
}

function makeMini(): CsvFiles {
  const po = { n: 0 };
  const a = simulate(
    {
      sku: "AAA-1", supplier: "F01", price: 40, opening: 1000,
      demand: (d) => (inRange(d, "2025-11-20", "2025-11-30") ? { units: 30, discount: 0.25 } : { units: 10, discount: 0 }),
      reorderBelow: 300, orderQty: 1000, unitsPer: 1, unit: "un", leadTimes: [10, 20, 30, 40],
    },
    po,
  );
  const b = simulate(
    {
      sku: "BBB-1", supplier: "F02", price: 20, opening: 2000,
      demand: () => ({ units: 24, discount: 0 }),
      reorderBelow: 720, orderQty: 240, unitsPer: 12, unit: "cx 12 un", leadTimes: [25],
    },
    po,
  );
  const dd = simulate(
    {
      sku: "DDD-1", supplier: "F01", price: 30, opening: 2000,
      demand: () => ({ units: 1, discount: 0 }),
      reorderBelow: 0, orderQty: 0, unitsPer: 1, unit: "un", leadTimes: [],
    },
    po,
  );
  const open = [
    `PO-${++po.n},F01,AAA-1,2026-09-01,,300,un`,
    `PO-${++po.n},F02,BBB-1,2026-09-20,,20,cx 12 un`,
  ];
  return {
    skus,
    fornecedores,
    vendas: ["sku,data,unidades_vendidas,receita", ...a.sales, ...b.sales, ...dd.sales].join("\n"),
    estoque: ["sku,data,estoque_disponivel", ...a.stock, ...b.stock, ...dd.stock].join("\n"),
    compras: ["po_id,fornecedor,sku,data_pedido,data_recebimento,quantidade,unidade", ...a.buys, ...b.buys, ...open].join("\n"),
  };
}

export const miniFiles: CsvFiles = makeMini();

export function rawMini(): RawDataset {
  return loadDataset(miniFiles).data!;
}

/** Converte um CSV do fixture para separador ';' com vírgula decimal. */
export function toSemicolon(csv: string): string {
  return csv
    .split("\n")
    .map((line) => line.split(",").map((f) => (/^-?\d+\.\d+$/.test(f) ? f.replace(".", ",") : f)).join(";"))
    .join("\n");
}
