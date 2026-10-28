export type ISODate = string;
export type PurchaseUnit = "un" | "cx12";
export type SkuStatus = "ativo" | "descontinuado";

export interface SkuRow {
  sku: string;
  brand: string;
  description: string;
  category: string;
  status: SkuStatus;
  unitCost: number;
  price: number;
  supplier: string;
  purchaseUnit: PurchaseUnit;
  moq: number;
}
export interface SaleRow { sku: string; date: ISODate; units: number; revenue: number }
export interface StockRow { sku: string; date: ISODate; onHand: number }
export interface PurchaseRow {
  poId: string;
  supplier: string;
  sku: string;
  orderDate: ISODate;
  receivedDate: ISODate | null;
  quantity: number;
  unit: PurchaseUnit;
}
export interface SupplierRow { supplier: string; name: string }
export interface RawDataset {
  skus: SkuRow[];
  sales: SaleRow[];
  stock: StockRow[];
  purchases: PurchaseRow[];
  suppliers: SupplierRow[];
}
export interface CsvFiles { skus: string; vendas: string; estoque: string; compras: string; fornecedores: string }
export interface LoadResult { data: RawDataset | null; errors: string[]; warnings: string[] }

export interface Campaign { id: string; name: string; start: ISODate; end: ISODate; lastYearStart: ISODate; lastYearEnd: ISODate }
export interface Config {
  referenceDate: ISODate;
  historyStart: ISODate;
  budget: number;
  windowStart: ISODate;
  windowEnd: ISODate;
  capitalCostYear: number;
  storageCostMonth: number;
  maxDiscount: number;
  serviceTarget: number;
  reviewDays: number;
  idleCoverageDays: number;
  tiers: { A: number; B: number; C: number };
  markdownPriceShare: number;
  campaigns: Campaign[];
}

export interface DayPoint { date: ISODate; units: number; revenue: number; onHand: number; censored: boolean }
export interface LeadTimeStats { n: number; median: number; mean: number; p90: number; std: number; min: number; max: number }
export interface OpenOrder { poId: string; units: number; orderDate: ISODate; expectedDate: ISODate; late: boolean }

export interface DemandModel {
  baseDaily: number;
  sigmaDaily: number;
  trendMonthly: number;
  campaignLift: Record<string, number>;
  historyDays: number;
  source: "sku" | "category";
}

export interface Scenario {
  campaignMultiplier: Record<string, number>;
  budget?: number;
  serviceMode: "tiered" | "uniform";
  uniformLevel?: number;
  protectedBrands: string[];
  reinvestMarkdown: boolean;
}

export const defaultScenario: Scenario = {
  campaignMultiplier: {},
  serviceMode: "tiered",
  protectedBrands: [],
  reinvestMarkdown: false,
};

export interface SkuMetrics {
  onHand: number;
  stockValue: number;
  coverageDays: number;
  idleUnits: number;
  idleValue: number;
  lostUnits12m: number;
  lostRevenue12m: number;
  fillRate12m: number;
  revenue12m: number;
  avgPrice12m: number;
}
