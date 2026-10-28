import { describe, expect, test } from "vitest";
import { defaultConfig, validateConfig } from "@/core/config";

describe("validateConfig", () => {
  test("padrão é válido", () => expect(validateConfig(defaultConfig)).toEqual([]));
  test("janela invertida", () => expect(validateConfig({ ...defaultConfig, windowStart: "2026-12-30" }).join(" ")).toMatch(/janela/i));
  test("janela antes da referência", () => expect(validateConfig({ ...defaultConfig, windowStart: "2026-09-01" }).join(" ")).toMatch(/referência/i));
  test("orçamento não positivo", () => expect(validateConfig({ ...defaultConfig, budget: 0 }).join(" ")).toMatch(/orçamento/i));
  test("desconto acima de 100%", () => expect(validateConfig({ ...defaultConfig, maxDiscount: 1.2 }).join(" ")).toMatch(/desconto/i));
  test("nível de serviço fora de 50%–99,9%", () => expect(validateConfig({ ...defaultConfig, tiers: { A: 1, B: 0.95, C: 0.9 } }).join(" ")).toMatch(/serviço/i));
  test("data inválida", () => expect(validateConfig({ ...defaultConfig, referenceDate: "29/09/2026" }).join(" ")).toMatch(/data/i));
  test("campanha com fim antes do início", () =>
    expect(validateConfig({ ...defaultConfig, campaigns: [{ ...defaultConfig.campaigns[0], end: "2026-11-01" }] }).join(" ")).toMatch(/Black Friday/));
});
