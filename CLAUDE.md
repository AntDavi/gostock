# GoStock

Ferramenta de decisão de estoque para a GoBeauté (Desafio AI-First Gogroup, Problema 3). Usuário: chefe de estoque. Saídas: **pedidos de compra prontos** para 01/10–29/12/2026 e **sugestões de liquidação** do estoque parado, com um agente de IA que monta o plano.

**Prazo: domingo, 01/11/2026.** Entrega: link público no Vercel (sem login) + repositório público no GitHub.

Documento de problema e design (fonte da verdade sobre escopo e decisões): `docs/superpowers/specs/2026-10-27-gostock-design.md`. Leia antes de mudar comportamento. Se algo aqui conflitar com ele, o documento de design vence. Avise e atualize este arquivo.

## Regras inegociáveis

1. **O agente nunca inventa números.** Todo número na tela vem de função determinística. O agente só usa valores devolvidos por ferramentas e cita a origem. Se uma resposta do agente contém número que não veio de ferramenta, é bug.
2. **Regras de negócio vivem no código, não no prompt.** Ficam no validador: múltiplo do MOQ na unidade de compra, conversão `cx 12 un` = 12 unidades, teto de orçamento, desconto ≤ 40%, sem recompra de descontinuado, emissão dentro da janela. A ferramenta recusa e devolve o motivo.
3. **O código monta o plano base, o agente faz o julgamento.** O agente atua sobre os casos críticos (corte de orçamento, F05/lead time instável antes da BF, histórico curto, PO atrasado). A UI mostra o que ele mudou: antes → depois + motivo.
4. **Funciona sem o LLM.** Se o LLM falhar, o plano base continua válido e visível. Nunca deixe a tela quebrar por erro do agente.
5. **Dados confidenciais.** `case_estoque/` e `Desafio_AI-First_Gogroup.pdf` **nunca** vão para o git. O repo leva só agregados: histórico **semanal** por SKU, projeções e indicadores, sem custo/preço unitário cru. Histórico diário só via upload, só no navegador do usuário.
6. **Gráfico só se apoiar uma decisão.** Visual sóbrio, neutro quente. Cor com significado só para estado (vermelho = ruptura, âmbar = excesso), com as variantes `-ink` para texto (contraste ≥ 4,5:1). A ameixa (`--primary`, #5b2a55) é só cor de interação: botão principal, item ativo, foco, seleção e marca do que o agente mudou. Sem verde; barras de dados em cinza/tinta.

## Stack

- Next.js (App Router) + TypeScript `strict`, publicado no Vercel.
- UI com **shadcn** (estilo `base-nova`, sobre Base UI: use `render={<Link …/>}` em vez de `asChild`), Tailwind 4, fonte Hanken Grotesk e Recharts via o `chart` do shadcn. Adicione componentes com `npx shadcn@latest add <nome>`. Tokens em `src/app/globals.css` (`danger`/`warn` com `-ink` e `-soft`, `surface`, `hairline`); peças de tela em `src/ui/kit.tsx` (`Stat`, `Meter`, `Pills`, `Notice`, `Section`, `InfoTip`) e o menu lateral em `src/ui/AppShell.tsx`. O redesign seguiu `docs/GoStock Redesign (standalone).html`, com as correções da crítica em `.impeccable/critique/`.
- Contas pesadas da tela (plano base, curvas, rupturas) rodam num Web Worker (`src/workers/compute.worker.ts`, hook `useCompute`). O upload processa os CSVs em `src/workers/pipeline.worker.ts`. O React Compiler está ligado: não use `useMemo`/`useCallback` manuais em componentes novos.
- Tudo em TypeScript. O **pipeline de dados é um módulo puro e compartilhado**: roda em script local (dados padrão), em Web Worker no navegador (upload) e é consumido pelo servidor (agente/plano). Nada de I/O ou APIs de Node/DOM dentro do núcleo do pipeline.
- LLM: atrás da interface `ChatClient` (`src/agent/run.ts`). O adaptador é o Claude Haiku 5.5 (`src/agent/claude.ts`, `@anthropic-ai/sdk`; `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, padrão `claude-haiku-5-5`, effort `medium`, thinking adaptativo). O Groq foi abandonado por limite de uso (8.000 tokens/min). Chaves ficam só no servidor (`.env.local`, nunca no cliente, nunca commitadas).
- Haiku 5.5 rejeita `temperature`/`top_p`/`top_k` e prefill. Os blocos de thinking precisam voltar intactos (`ChatMessage.raw`) e o histórico não pode ser editado, senão a API responde 400.
- Requisições ao servidor ≤ 4,5 MB (limite do Vercel). Por isso CSV bruto nunca vai ao servidor. O navegador manda o resumo por SKU.

## Arquitetura

```
CSVs ──► pipeline (puro, TS) ──► resumo por SKU (JSON)
          │                         │
          ├ local: script → data/   ├ servidor: motor de plano + agente (Claude, tools) + validador
          └ upload: Web Worker      └ navegador: Visão geral · Plano · Liquidação · Estoque · Fornecedores · Upload
```

Mapa do código:
- `src/core/`: pipeline puro (`load`, `clean`, `leadtime`, `demand`, `metrics`, `markdown`, `pipeline`).
- `src/core/plan/`: plano (`simulate`, `safety`, `allocate`, `validate`, `critical`, `curve`, `export`).
- `src/agent/`: sessão, ferramentas, guarda de números, prompt e loop.
- `src/app/api/{agent,dataset}`: rotas. `src/app/*`: páginas finas que renderizam `src/ui/pages/*` (cliente).
- `src/ui/`: provedor de dados, formatação pt-BR, gráficos, plano (`plan/`), funções puras testadas (`overview`, `inventory`, `approvals`).
- `src/data/dataset.json`: agregado padrão.

### Arquitetura do agente

- **Contexto inicial calculado pelo código:** a 1ª mensagem já traz `resumo_plano` (com `candidatos_corte` e custo acumulado) e `listar_casos_criticos` (3 de cada tipo, com custo do lote, lead time mediano e P90, e as linhas do SKU).
- **Ajustes em lote:** o agente faz os ajustes numa chamada de `aplicar_ajustes`. Dentro do lote, cortes e reduções são aplicados antes das adições. Depois chama `finalizar`.
- **Histórico só cresce:** nada é resumido nem editado (exigência do thinking e do cache de prompt, que fica ligado).
- **Erros do modelo:** o SDK repete 429/5xx 2 vezes; depois disso o loop ainda espera o `retry-after` dentro do prazo de 100 s. Recusa (`stop_reason: refusal`) conta como falha do modelo.
- **Falha no meio:** os ajustes já validados são mantidos com a mensagem "Revisão parcial", gerada pelo código. Sem nenhum ajuste, a rota responde `ok:false` e o plano base fica intacto.
- **Guarda de números:** `numberGuard` confere cada número do resumo contra as saídas das ferramentas. A saída de `finalizar` não conta como fonte. Hífens tipográficos e milhar com espaço são normalizados.
- **Onde está o valor:** o plano base já usa o orçamento de forma quase ótima pela margem. O ganho do agente está em risco que o código não pesa, como antecipar emissões quando a chegada pelo P90 do fornecedor cai depois do início da campanha.

Parâmetros de negócio (orçamento, data de referência, janela, calendário, custos, teto de desconto) são **um objeto de configuração**, com padrão vindo de `case_estoque/parametros.md`. Não espalhe constantes como `1970000` ou `"2026-11-20"` pelo código.

## Domínio: fatos que já custaram caro

Referência: 29/09/2026. Histórico desde 01/04/2025. 500 SKUs (441 ativos / 59 descontinuados), 6 fornecedores.

- **Demanda censurada:** em dia com estoque ≤ 0 a venda observada não é demanda. Estime a demanda desses dias. Nunca use média simples crua.
- `vendas_diarias.csv` tem **656 linhas duplicadas idênticas**. Deduplique por (sku, data).
- Dias sem venda não aparecem (venda = 0). Há ~2.467 dias-SKU sem registro de estoque. Reconstrua com estoque(t) = estoque(t-1) − vendas + recebimentos (bate em 99,9%).
- 120 linhas de estoque negativo (58 SKUs): trate como ruptura.
- 58 SKUs compram em `cx 12 un`: MOQ e quantidade de PO estão em caixas.
- 90 POs em aberto (`data_recebimento` vazia): é estoque a caminho e não consome o orçamento novo. Chegada esperada = pedido + lead time mediano. Se já passou, marque como atrasado.
- Lead time por fornecedor vem de `compras.csv`. F05 é instável (mediana 32d, P90 75d, máx 83d).
- Vendas cresceram ~3× em 18 meses (inclui lançamentos). Pese o histórico recente mais. SKU com histórico curto usa fallback por categoria.
- BF 2025 ≈ 2,5–3× a base diária da época (20–30/11). Natal menor e mais longo. Meça como multiplicador relativo à base, não em unidades absolutas.
- Saldo inicial de SKUs lançados após 01/04/2025 não tem PO correspondente. É esperado.
- Custo de manter = 18% a.a. (capital) + 1,2% a.m. (armazenagem) sobre o custo.

Definições adotadas (mude só atualizando o design):
- **Parado** = excedente acima de 180 dias de cobertura + todo saldo de descontinuado, a custo.
- **Nível de serviço** = fill rate (fração da demanda atendida).
- **Orçamento** = custo dos POs novos emitidos na janela.
- **Quantidade do pedido** cobre lead time + 30 dias de revisão + estoque de segurança.
- **Plano padrão** usa serviço diferenciado (98% para os SKUs de maior venda/margem, menor para a cauda). "98% para todos" é cenário.
- **Prioridade de uma linha no orçamento** = margem × unidades vendidas até o fim da janela ÷ custo. Linha que só serve janeiro vale 0 e é financiada por último.
- **Fill do plano** é medido até `windowEnd`. A perda estatística σL·G(z) só conta para linhas que chegam até lá.
- **Curva caixa × serviço:** `budgetCurve` (orçamento → fill alcançável) é a que responde a pergunta 5. `serviceCurve` (nível uniforme sem teto) só serve para o custo de "98% para todos".

Números de referência (dados reais, 29/09/2026), para conferir a UI:
- **Situação atual:** estoque a custo R$ 6.784.129; parado R$ 2.274.926; venda perdida 12m R$ 911.964; fill 12m 98,6%; 90 POs em aberto (10 atrasados).
- **Plano padrão:** 135 linhas, R$ 1.969.975, fill esperado 89,5%.
- **Curva orçamento → fill:** R$ 2,96 mi dá 96,2%; R$ 3,94 mi dá 98,7% (satura).
- **"98% para todos":** custaria cerca de R$ 5,35 mi.
- **Liquidação:** 87 SKUs, R$ 228 mil liberados em 90 dias.

## Convenções

- Texto da UI e respostas do agente em **português do Brasil**. Identificadores de código em inglês. Termos de domínio no glossário abaixo.
- Glossário: SKU = `sku`; lote mínimo = `moq`; unidade de compra = `purchaseUnit` (`un` | `cx12`); pedido de compra = `purchaseOrder`; cobertura = `coverageDays`; ruptura = `stockout`; liquidação = `markdown`; nível de serviço = `serviceLevel`; lead time = `leadTime`.
- Dinheiro em reais com 2 casas só na exibição. Internamente use número em centavos ou valores sem arredondamento intermediário.
- Datas como `YYYY-MM-DD` (string) no núcleo. Não use `Date` com fuso no pipeline.
- Funções do pipeline e do validador são puras e testadas.

## Testes

- **TDD no pipeline, motor de plano e validador.** São a parte que precisa estar certa.
- Testes usam **fixtures pequenas e sintéticas** escritas à mão (em `tests/fixtures/`), nunca os CSVs do desafio, porque estes não estão no repo.
- Cobrir com teste: dedup, demanda censurada, conversão de caixa, múltiplo de MOQ, teto de orçamento, PO em aberto/atrasado, recusa de descontinuado, desconto > 40%.
- O agente é testado nas ferramentas e no validador. Teste de ponta a ponta com LLM é manual.

## Comandos

- `npm run dev`: servidor local
- `npm test`: testes (Vitest, `tests/**/*.test.ts`)
- `npm run data`: roda o pipeline sobre `case_estoque/` e grava os agregados em `src/data/dataset.json`
- `npm run build`: build de produção
- `npm run lint`: ESLint
- `npx next typegen && npx tsc --noEmit`: checagem de tipos (o typegen gera os tipos de rota, como `LayoutProps`)

Next.js 16 tem mudanças de API. Antes de escrever código Next, leia o guia relevante em `node_modules/next/dist/docs/` (ver `AGENTS.md`).

## Fluxo de trabalho

- Ordem do projeto: design (feito) → CLAUDE.md (este) → plano de implementação (`docs/superpowers/plans/2026-10-27-gostock.md`) → aplicação → publicação.
- Estado em 28/10: Tasks 1–17 completas (README em pt-BR com as respostas às 5 perguntas). Publicação no Vercel fica com o usuário (configurar `ANTHROPIC_API_KEY`). Próximo: melhorias visuais e de usabilidade.
- Push para o GitHub é feito pelo usuário (este ambiente não tem credencial).
- Antes de dizer que algo está pronto: rode testes e build e confira na tela. Números da Visão geral devem bater com os do reconhecimento no documento de design (ex.: estoque a custo em 29/09 ≈ R$ 6,79 mi).
- Commits só quando o usuário pedir.
