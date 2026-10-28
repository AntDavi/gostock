# GoStock

Ferramenta de decisão de estoque para a GoBeauté (Desafio AI-First Gogroup, Problema 3). O chefe de estoque sai dela com duas coisas:

1. **Pedidos de compra prontos** para emitir de 01/10 a 29/12/2026, dentro do orçamento de R$ 1,97 mi: SKU, fornecedor, quantidade em múltiplo do lote na unidade certa, data limite e o motivo. Cada linha pode ser aprovada, editada ou recusada, e as aprovadas saem em CSV.
2. **Sugestões de liquidação** do estoque parado: desconto (até 40%), unidades vendidas, capital liberado e custo de manter evitado.

Um **agente de IA (Claude Haiku 5.5)** revisa o plano montado pelo código. Ele julga os casos críticos e altera o plano só por ferramentas que validam as regras de negócio. Nenhum número na tela é escrito pelo agente: todos vêm de funções determinísticas.

- **Aplicação:** _link do Vercel_
- **Código:** este repositório

## As cinco perguntas, com os números

Dados do desafio, referência 29/09/2026. Todos os números aparecem na aplicação e vêm de `npm run data` (ver [Como rodar](#como-rodar)).

### 1. Quanto capital está parado hoje, e em quê?

**R$ 2,27 mi** de um estoque de R$ 6,78 mi a custo. "Parado" é o excedente acima de 180 dias de cobertura mais todo o saldo de descontinuados.

- R$ 454 mil estão em SKUs descontinuados, que não serão recomprados.
- R$ 1,82 mi estão em SKUs ativos com cobertura acima de 180 dias.
- O parado é concentrado: são 121 SKUs, e os 10 maiores somam R$ 1,53 mi. O maior, RTU-1083, tem R$ 535 mil parados e quase nenhuma venda.
- Por categoria: Suplemento (R$ 643 mil), Fragrâncias (R$ 619 mil) e Hair Care (R$ 480 mil).

Na aplicação: Visão geral (KPI e gráfico "Maior capital parado") e Estoque (filtro "Excesso").

### 2. Quanto deixamos de vender por falta de produto?

**R$ 912 mil em 12 meses** (cerca de 23 mil unidades), com fill rate de 98,6% no agregado. O agregado esconde a concentração:

- 85 SKUs tiveram venda perdida, e os 10 piores respondem por 58% dela.
- A curva A perdeu R$ 678 mil, ou 74% do total.
- O fornecedor F05, de lead time instável, responde por R$ 374 mil.

A venda observada num dia sem estoque não é a demanda daquele dia. Por isso a venda perdida é a demanda estimada nos dias de ruptura (ver [Método](#método)), e não a diferença contra a média.

### 3. O que comprar nos próximos 90 dias, em que quantidade e quando, dentro do orçamento?

O **plano padrão** tem **135 pedidos, R$ 1.969.975** (dentro de R$ 1.970.000), com **fill esperado de 89,5%** até 29/12. Cada linha cobre lead time + 30 dias de revisão + estoque de segurança e é arredondada para múltiplo do lote na unidade de compra (58 SKUs compram em `cx 12 un`).

- **Como o orçamento é distribuído:** pela margem protegida por real investido, contando só a demanda até o fim da janela. Pedido que só serve janeiro fica por último.
- **Sem pedido novo**, 17 SKUs rompem antes da Black Friday (20/11), já contando os 90 POs em aberto.
- **O que o agente acrescenta:** numa execução real, antecipou para 01/10 as emissões do F05 (mediana de 32 dias, P90 de 75). Também antecipou linhas de SKUs com PO atrasado, sem custo extra. E apontou, sem cortar outros SKUs A para isso, três SKUs A sem pedido que rompem antes da BF e que o orçamento não cobre.

Na aplicação: Plano de compras (botão "Gerar plano de compras com o agente" na Visão geral).

### 4. O que fazer com o estoque que não gira?

**Liquidar 87 SKUs** (53 descontinuados), que **liberam R$ 228 mil em 90 dias**. Para cada SKU com excesso, o código compara descontos de 0% a 40%. Um SKU ativo só entra quando vender com desconto vale mais do que manter; descontinuado entra sempre.

Liquidação não resolve todo o parado: R$ 228 mil de R$ 2,27 mi. A maior parte é estoque de lançamento sem saída (como o RTU-1083) que nem 40% de desconto move em 90 dias. Esses itens pedem outra decisão, como negociação com o fornecedor, venda em lote ou baixa, e a ferramenta mostra quais são.

Na aplicação: Liquidação (desconto ajustável por SKU, exportação CSV).

### 5. Que equilíbrio entre caixa e nível de serviço você recomenda, e por quê?

| Orçamento | Fill esperado até 29/12 |
|---|---|
| R$ 0,99 mi | 77,7% |
| **R$ 1,97 mi (atual)** | **89,5%** |
| R$ 2,96 mi | 96,2% |
| R$ 3,94 mi | 98,7% (satura) |

**"98% para todos os SKUs" custaria cerca de R$ 5,35 mi**, quase três vezes o orçamento. A recomendação é **serviço diferenciado**: 98% para a curva A, 95% para a B e 90% para a C. Com isso o dinheiro vai primeiro para os SKUs que mais vendem e mais dão margem, onde está 74% da venda perdida.

Com R$ 1,97 mi não dá para chegar à meta de 98%. O ganho marginal é alto até cerca de R$ 3 mi (96%) e quase some depois de R$ 3,9 mi. O argumento para a diretoria: cada real acima de R$ 3,9 mi compra pouco serviço, enquanto R$ 1 mi a mais sobre o orçamento atual leva o fill de 89,5% para 96,2%.

Na aplicação: Visão geral, gráfico "Orçamento × nível de serviço". Em Dados, dá para mudar orçamento e metas e ver o plano recalculado.

## Como o agente funciona

> O código monta o plano, o agente julga, o validador decide.

1. **O código calcula:** limpeza, demanda, estoque de segurança e um plano base quase ótimo pela margem.
2. **O agente recebe esse contexto pronto:** o resumo do plano (com os candidatos a corte) e os casos críticos. Os casos são corte de orçamento, ruptura antes da campanha, lead time instável antes da BF, histórico curto e PO atrasado.
3. **O agente age só por ferramentas** (`aplicar_ajustes`, `alterar_emissao`, `adicionar_linha`, `propor_liquidacao`…). Cada ferramenta passa pelo validador, que recusa e explica:
   - quantidade fora do múltiplo do lote (com a conversão de caixa);
   - estouro do orçamento;
   - emissão fora da janela;
   - recompra de descontinuado;
   - desconto acima de 40%.
4. **Guarda de números:** antes de mostrar o resumo do agente, o código confere cada número do texto contra as saídas das ferramentas. O que não confere aparece como "Números não verificados".
5. **A tela mostra o que mudou:** antes → depois e o motivo de cada ajuste, linha a linha.

**Funciona sem o LLM.** Se a API falhar, o plano base continua válido e visível. Se a falha vier no meio da revisão, os ajustes já validados ficam, com o aviso "Revisão parcial".

O modelo fica atrás de uma interface (`ChatClient`, em `src/agent/run.ts`); trocar de provedor é trocar só o adaptador (`src/agent/claude.ts`).

## Método

- **Limpeza:**
  - 656 linhas duplicadas de vendas são removidas por (SKU, data).
  - Dias sem registro de estoque são reconstruídos com estoque(t) = estoque(t−1) − vendas + recebimentos. A reconstrução bate em 99,9% dos dias com registro.
  - Estoque negativo é tratado como ruptura.
- **Demanda censurada:** em dia com estoque zerado, a demanda estimada é a média dos dias com estoque em ±14 dias, nunca abaixo do vendido.
- **Previsão:**
  - Base dos últimos 56 dias e tendência das últimas 26 semanas, limitada a ±5% ao mês. As vendas cresceram cerca de 3× em 18 meses.
  - Efeito de campanha medido como multiplicador sobre a base da época, na BF e no Natal de 2025.
  - SKU com histórico curto usa o padrão da categoria.
- **Lead time:** medido por fornecedor nas compras recebidas (mediana e P90).
- **POs em aberto:** contam como estoque a caminho e não consomem o orçamento novo. PO cuja chegada esperada já passou é marcado como atrasado.
- **Estoque de segurança:** usa a incerteza da demanda e do lead time e atinge a meta de fill rate de cada ciclo de pedido.
- **Custo de manter:** 18% a.a. de capital + 1,2% a.m. de armazenagem, sobre o custo.

## Premissas e limitações

- **Uma só amostra de BF e Natal (2025).** O efeito de campanha de 2026 é o de 2025, medido relativo à base da época.
- **Desconto confundido com campanha.** Os únicos descontos do histórico são os da BF 2025. A resposta ao preço atribui 50% do ganho da BF ao desconto; o parâmetro é editável em Dados.
- **O fill esperado do plano não é recalculado** depois de edições e recusas manuais na tela. A tela avisa quando isso acontece.
- **Dados no repositório.** Por confidencialidade, o repositório não traz os CSVs nem o PDF do desafio, só o agregado `src/data/dataset.json`. Ele tem histórico semanal por SKU e indicadores, sem custo nem preço unitário crus. O histórico diário só aparece quando o usuário envia os CSVs, e fica no navegador dele.
- **Upload só nesta aba.** Os CSVs enviados são processados no navegador e não vão a nenhum servidor; ao recarregar a página, voltam os dados padrão. O agente recebe só o resumo por SKU.

## Como rodar

Requer Node.js 20+.

```bash
npm install
cp .env.example .env.local   # preencha ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Sem `ANTHROPIC_API_KEY`, a aplicação funciona normalmente e o painel do agente avisa que ele está indisponível.

Para regerar o agregado a partir dos CSVs do desafio, coloque-os em `case_estoque/` (pasta fora do git) e rode:

```bash
npm run data
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm test` | Testes (Vitest) do pipeline, motor de plano, validador, ferramentas do agente, guarda de números e funções da UI |
| `npm run lint` | ESLint |
| `npx next typegen && npx tsc --noEmit` | Checagem de tipos |
| `npm run build` | Build de produção |

Variáveis de ambiente (só no servidor):

| Variável | Padrão | Uso |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Chave da API do Claude |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` | Modelo do agente |

## Arquitetura

```
CSVs ──► pipeline (TypeScript puro) ──► resumo por SKU (JSON)
          │                               │
          ├ local: npm run data → src/data/dataset.json
          └ upload: Web Worker no navegador
                                          ├ servidor: /api/agent (Claude + ferramentas + validador)
                                          └ navegador: Visão geral · Plano · Liquidação · Estoque · Fornecedores · Dados
```

- `src/core/`: pipeline puro (carga, limpeza, lead time, demanda, métricas, liquidação), sem I/O nem APIs de Node ou do navegador.
- `src/core/plan/`: simulação por SKU, estoque de segurança, alocação do orçamento, validador, casos críticos, curvas e exportação.
- `src/agent/`: sessão, ferramentas, guarda de números, prompt e loop do agente.
- `src/app/`: rotas Next.js (páginas e `/api/agent`, `/api/dataset`).
- `src/ui/`: telas (shadcn + Recharts), provedor de dados e cálculos de tela, que rodam num Web Worker.

Stack: Next.js 16 (App Router), TypeScript `strict`, Tailwind 4, shadcn, Recharts, Vitest, SDK da Anthropic.

O documento de problema e design está em `docs/superpowers/specs/2026-10-27-gostock-design.md`.
