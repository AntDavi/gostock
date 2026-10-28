# GoStock

Ferramenta de decisão de estoque para a GoBeauté (Desafio AI-First Gogroup, Problema 3). O chefe de estoque sai dela com duas coisas:

1. **Pedidos de compra prontos** para emitir de 01/10 a 29/12/2026, dentro do orçamento de R$ 1,97 mi: SKU, fornecedor, quantidade em múltiplo do lote na unidade certa, data limite e o motivo. Cada linha pode ser aprovada, editada ou recusada, e as aprovadas saem em CSV.
2. **Sugestões de liquidação** do estoque parado: desconto (até 40%), unidades vendidas, capital liberado e custo de manter evitado.

Um **agente de IA (Claude Haiku 5.5)** revisa o plano montado pelo código. Ele julga os casos críticos e altera o plano só por ferramentas que validam as regras de negócio. Nenhum número na tela é escrito pelo agente: todos vêm de funções determinísticas.

- **Aplicação:** _link do Vercel_
- **Código:** este repositório

**Neste documento:** [Como usar](#como-usar) · [As cinco perguntas](#as-cinco-perguntas-com-os-números) · [Como funciona por dentro](#como-funciona-por-dentro) · [Como o agente funciona](#como-o-agente-funciona) · [Método](#método) · [Premissas e limitações](#premissas-e-limitações) · [Como rodar](#como-rodar) · [Publicação](#publicação-no-vercel) · [Manutenção](#manutenção) · [Solução de problemas](#solução-de-problemas) · [Arquitetura](#arquitetura)

## Como usar

O app não traz dados. Tudo parte dos CSVs do seu estoque.

1. **Envie os dados.** Em **Dados**, arraste os cinco arquivos e clique em **Processar**. O processamento roda no seu navegador e leva alguns segundos (cerca de 3 s com os dados do desafio). Os arquivos não vão a nenhum servidor. O resultado fica salvo neste navegador, e recarregar a página não apaga.
2. **Leia o diagnóstico.** A **Visão geral** mostra primeiro o que precisa de atenção: SKUs que rompem antes da Black Friday, excesso e POs atrasados. Depois vêm os indicadores e a curva orçamento × nível de serviço.
3. **Revise o plano de compras.** Em **Plano de compras**, o código já montou um plano dentro do orçamento. Clique em **Revisar com o agente** para ele ajustar os casos críticos, ou escreva um pedido na barra do rodapé (há sugestões prontas). O que o agente mudou aparece destacado, com antes → depois e o motivo.
4. **Decida linha a linha.** Aprove, edite ou recuse cada pedido, ou selecione vários de uma vez. Exporte os aprovados em CSV.
5. **Liquide o parado.** Em **Liquidação**, escolha o desconto por SKU (10% a 40%) e exporte a lista.
6. **Ajuste os parâmetros.** Em **Dados**, mude orçamento, metas de serviço, janela e campanhas e clique em **Aplicar ao plano**. As telas recalculam na hora.

**Estoque** (busca, filtros e ficha de cada SKU) e **Fornecedores** (lead time e POs em aberto) servem para investigar um caso específico.

### Formato dos CSVs

| Arquivo | Colunas obrigatórias |
|---|---|
| `skus.csv` | `sku`, `marca`, `descricao`, `categoria`, `status`, `custo_unitario`, `preco_venda`, `fornecedor`, `unidade_compra`, `moq` |
| `vendas_diarias.csv` | `sku`, `data`, `unidades_vendidas`, `receita` |
| `estoque_diario.csv` | `sku`, `data`, `estoque_disponivel` |
| `compras.csv` | `po_id`, `fornecedor`, `sku`, `data_pedido`, `data_recebimento`, `quantidade`, `unidade` |
| `fornecedores.csv` | `fornecedor`, `nome_fornecedor` |

O nome do arquivo precisa ser exatamente esse. Se faltar coluna, a tela diz qual arquivo e qual coluna. `data_recebimento` vazia marca o PO como em aberto. `unidade_compra = cx 12 un` faz o lote e a quantidade valerem em caixas de 12.

## As cinco perguntas, com os números

Dados do desafio, referência 29/09/2026. Todos os números aparecem na aplicação depois de enviar os CSVs do desafio em Dados (ver [Como rodar](#como-rodar)).

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
- **O risco que o plano base não mede:** o plano usa o lead time **mediano** de cada fornecedor. Pelo **P90** (o prazo em que 9 de cada 10 pedidos chegam), **54 pedidos (R$ 824 mil) chegam antes da Black Friday ou do Natal pela mediana, mas depois deles no pior caso comum.** O fill esperado não mostra isso, porque também usa a mediana.
- **O que o agente acrescenta:** numa execução real, o agente antecipou 40 desses pedidos para a data mais tardia segura, calculada pelo código, e o risco caiu para **14 pedidos (R$ 80 mil), sem gastar um real a mais do orçamento.** Ele priorizou as curvas A e B e deixou de fora os pedidos de curva C com mais de 60 dias de cobertura. Também explicou os 10 pedidos do F05 sem solução: nem emitindo no primeiro dia da janela o P90 de 75 dias chega a tempo. De quebra, os SKUs A que rompem antes da BF caíram de 5 para 4. Os três SKUs A restantes não têm pedido, e cada lote custa mais do que daria para liberar cortando outros: o agente os aponta como decisão de orçamento.

Na aplicação: Plano de compras (ou o botão "Gerar plano com o agente" na Visão geral).

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

## Como funciona por dentro

```
Navegador                                                     Servidor (Vercel)
─────────                                                     ─────────────────
CSVs ─► Web Worker: pipeline ─► resumo por SKU ─► IndexedDB
                                     │
                                     ├─► Web Worker: cálculos de tela
                                     │     (plano base, curvas, rupturas)
                                     │
                                     └─► resumo enxuto ───────► /api/agent
                                                                 Claude + ferramentas
                                         plano revisado ◄─────── + validador
                                              │
                          aprovações e edições ─► localStorage
```

1. **Upload.** O navegador lê os cinco CSVs e os entrega a um Web Worker (`src/workers/pipeline.worker.ts`). Ele roda o pipeline do núcleo: limpeza, demanda corrigida, lead times, métricas. Sai um resumo por SKU (o `Dataset`; com os dados do desafio, ~2 MB sem o histórico diário).
2. **Persistência.** O resumo e a configuração aplicada ficam no IndexedDB (`src/ui/storedDataset.ts`). Os CSVs brutos não são guardados.
3. **Cálculos de tela.** Plano base, curva orçamento × serviço e datas de ruptura são contas pesadas (até ~2 s). Rodam em outro Web Worker (`src/workers/compute.worker.ts`, via o hook `useCompute`), uma vez por combinação de dados e configuração, e são compartilhados entre as telas.
4. **Agente.** No Plano, o navegador manda ao servidor o resumo sem histórico (`stripForAgent`, para caber no limite de 4,5 MB do Vercel) e o estado atual do plano. A rota `/api/agent` roda o agente e devolve o plano revisado. O servidor não guarda nada entre chamadas.
5. **Decisões do usuário.** Aprovações, recusas, edições e a última revisão do agente ficam no `localStorage`, numa chave ligada ao dataset e à configuração. Trocar os dados ou mudar a configuração começa um plano novo. As decisões antigas nunca são aplicadas ao plano errado, e o navegador guarda as de um plano só.

O **núcleo** (`src/core/`) é TypeScript puro, sem I/O nem APIs de Node ou do navegador. Por isso o mesmo código roda no Web Worker, no servidor (ferramentas do agente) e no script `npm run data`.

## Como o agente funciona

> O código monta o plano, o agente julga, o validador decide.

1. **O código calcula:** limpeza, demanda, estoque de segurança e um plano base quase ótimo pela margem.
2. **O agente recebe esse contexto pronto:** o resumo do plano (com os candidatos a corte e o risco pelo P90), os casos críticos e a lista completa de pedidos expostos ao P90, cada um com a data de emissão sugerida. Os casos são corte de orçamento, ruptura antes da campanha, lead time instável antes da BF, histórico curto e PO atrasado.
3. **O agente age só por ferramentas** (`listar_risco_p90`, `aplicar_ajustes`, `alterar_emissao`, `adicionar_linha`, `propor_liquidacao`…). Cada ferramenta passa pelo validador, que recusa e explica:
   - quantidade fora do múltiplo do lote (com a conversão de caixa);
   - estouro do orçamento;
   - emissão fora da janela;
   - recompra de descontinuado;
   - desconto acima de 40%.
4. **Guarda de números:** antes de mostrar o resumo do agente, o código confere cada número do texto contra as saídas das ferramentas. O que não confere aparece como "Números não verificados".
5. **A tela mostra o que mudou:** antes → depois e o motivo de cada ajuste, linha a linha, com a etiqueta do agente. O painel mostra o pedido feito e a resposta; "Ver só alteradas" filtra a tabela e "Voltar ao plano base" desfaz a revisão.

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
- **Sem dados no repositório.** Por confidencialidade, o repositório e o app publicado não trazem os CSVs, o PDF nem agregados do desafio. O app abre vazio e pede o upload.
- **Upload no navegador.** Os CSVs enviados são processados no navegador e não vão a nenhum servidor. O resumo fica salvo neste navegador (IndexedDB) até você remover em Dados. O agente recebe só o resumo por SKU.

## Como rodar

Requer Node.js 20 ou mais novo (desenvolvido no 24).

```bash
npm install
cp .env.example .env.local   # preencha ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Sem `ANTHROPIC_API_KEY`, a aplicação funciona normalmente e o painel do agente avisa que ele está indisponível.

Abra o app, vá em **Dados** e envie os cinco CSVs. Para conferir os números no terminal sem abrir o app, coloque os CSVs em `case_estoque/` (pasta fora do git) e rode o comando abaixo. Ele imprime os indicadores de referência e não grava nada:

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

## Publicação no Vercel

1. Importe o repositório no Vercel (framework Next.js, sem configuração extra).
2. Em **Settings → Environment Variables**, defina `ANTHROPIC_API_KEY` (e, se quiser, `ANTHROPIC_MODEL`).
3. Publique. O link é público e sem login. Cada pessoa que abrir envia os próprios CSVs, que ficam só no navegador dela.

A rota do agente declara `maxDuration = 120` s e o loop do agente para em 100 s. Se o plano do Vercel limitar funções a menos tempo, revisões longas terminam como "Revisão parcial".

## Manutenção

### Onde mexer

| Para… | Mexa em | E também |
|---|---|---|
| Mudar um padrão de negócio (orçamento, janela, campanhas, custos, metas, teto de desconto) | `src/core/config.ts` (`defaultConfig`) | O usuário também muda na tela Dados. Não espalhe constantes pelo código. |
| Criar ou mudar uma regra de negócio | `src/core/plan/validate.ts` | Teste em `tests/core/plan/validate.test.ts`. A regra vale no código, nunca só no prompt. |
| Mudar como a demanda é estimada | `src/core/demand.ts` | Testes em `tests/core/demand.test.ts`; rode `npm run data` e confira os números de referência. |
| Aceitar outro formato de CSV | `src/core/load.ts` (colunas em `FILES`) | Teste em `tests/core/load.test.ts`; atualize a tabela de formato acima. |
| Criar ou mudar uma ferramenta do agente | `src/agent/tools.ts` | O nome em `TOOL_LABEL` (`src/ui/plan/AgentPanel.tsx`), o prompt em `src/agent/prompt.ts` e teste em `tests/agent/tools.test.ts`. Toda escrita no plano passa pelo validador. |
| Mudar as sugestões de pedido ao agente | `SUGGESTIONS` em `src/ui/plan/PromptBar.tsx` | Só sugira o que as ferramentas sabem atender. |
| Trocar o modelo ou o provedor de LLM | `ANTHROPIC_MODEL`, ou um novo adaptador de `ChatClient` (`src/agent/run.ts`) | O adaptador atual é `src/agent/claude.ts`. O Haiku 5.5 rejeita `temperature` e prefill, e os blocos de thinking precisam voltar intactos. |
| Adicionar um componente de UI | `npx shadcn@latest add <nome>` | Estilo `base-nova` (Base UI): use `render={<Link …/>}` com `nativeButton={false}`, não `asChild`. |
| Mudar cores ou tokens | `src/app/globals.css` | Cor só para estado (vermelho = ruptura, âmbar = excesso), sem verde; ameixa só para interação. |
| Mudar o formato do `Dataset` | `src/core/types.ts` e `src/core/pipeline.ts` | Dados já salvos nos navegadores ficam no formato antigo. Peça para remover e reenviar em Dados, ou valide a forma ao ler em `src/ui/storedDataset.ts`. |

### Antes de publicar uma mudança

```bash
npm test && npm run lint && npx next typegen && npx tsc --noEmit && npm run build
```

Depois, rode `npm run dev`, envie os CSVs do desafio em Dados e confira se a Visão geral e o Plano batem com os números de referência: estoque a custo R$ 6,78 mi, parado R$ 2,27 mi, venda perdida R$ 912 mil, 135 pedidos, R$ 1.969.975, fill esperado de 89,5%. O teste do agente com o LLM real é manual.

### Testes

Ficam em `tests/`, espelhando `src/` (`core/`, `core/plan/`, `agent/`, `ui/`). Usam fixtures pequenas e sintéticas (`tests/fixtures/mini.ts`), nunca os CSVs do desafio, que não estão no repositório. O pipeline, o motor de plano e o validador são escritos com o teste primeiro.

### Dados confidenciais

`case_estoque/`, o PDF do desafio e `.env*` estão no `.gitignore` e nunca entram no repositório. Nada de dados, nem agregados, vai para o git: o app depende só do upload.

## Solução de problemas

| Sintoma | Causa e o que fazer |
|---|---|
| Todas as telas pedem para enviar os CSVs | É o estado normal sem dados. Envie os cinco arquivos em Dados. |
| "Não foi possível salvar neste navegador" | Aba anônima ou armazenamento bloqueado. O app funciona, mas ao recarregar será preciso enviar de novo. |
| Erro ao processar, citando arquivo e coluna | Falta uma coluna obrigatória ou o arquivo está com outro nome. Veja [Formato dos CSVs](#formato-dos-csvs). |
| "Agente indisponível: ANTHROPIC_API_KEY não configurada" | Defina a chave em `.env.local` (local) ou nas variáveis do Vercel. O plano base continua valendo. |
| O agente demora ou devolve "Revisão parcial" | Limite de uso da API (429) ou tempo esgotado. Os ajustes já validados ficam. Tente de novo em alguns segundos. |
| Aparecem "Números não verificados" | O agente escreveu números que nenhuma ferramenta devolveu. Não confie neles; os números da tabela continuam corretos. |
| Aprovações sumiram | A configuração ou os dados mudaram, e isso começa um plano novo. O navegador guarda as decisões de um plano só: exporte os aprovados antes de mudar a configuração. |
| Dados de outra pessoa ou versão antiga | Em Dados, clique em **Remover dados** e envie de novo. |

## Arquitetura

```
CSVs ──► pipeline (TypeScript puro) ──► resumo por SKU (JSON)
          │                               │
          ├ upload: Web Worker no navegador → IndexedDB
          └ local: npm run data (só imprime a conferência)
                                          ├ servidor: /api/agent (Claude + ferramentas + validador)
                                          └ navegador: Visão geral · Plano · Liquidação · Estoque · Fornecedores · Dados
```

- `src/core/`: pipeline puro (carga, limpeza, lead time, demanda, métricas, liquidação), sem I/O nem APIs de Node ou do navegador.
- `src/core/plan/`: simulação por SKU, estoque de segurança, alocação do orçamento, validador, casos críticos, curvas e exportação.
- `src/agent/`: sessão, ferramentas, guarda de números, prompt e loop do agente.
- `src/app/`: rotas Next.js (páginas e `/api/agent`).
- `src/ui/`: telas (shadcn + Recharts), provedor de dados (`DatasetProvider`, `storedDataset`), peças de tela (`kit.tsx`) e cálculos de tela.
- `src/workers/`: Web Workers do upload (`pipeline.worker.ts`) e dos cálculos de tela (`compute.worker.ts`).
- `scripts/check-data.ts`: conferência local (`npm run data`).
- `tests/`: testes Vitest com fixtures sintéticas.

Stack: Next.js 16 (App Router), TypeScript `strict`, Tailwind 4, shadcn, Recharts, Vitest, SDK da Anthropic.

### Documentação

- `docs/2026-10-27-gostock-design.md`: problema, decisões e o porquê (fonte da verdade). As seções 9 e 10 registram o que mudou depois da implementação.
- `docs/2026-10-27-gostock.md`: plano de implementação original (histórico).
- `CLAUDE.md`: regras do projeto, convenções e fatos do domínio para quem mantém o código (pessoas e agentes de IA).
