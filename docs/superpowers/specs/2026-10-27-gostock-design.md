# GoStock — Documento de problema e design

**Data:** 27/10/2026 · **Prazo de entrega:** domingo, 01/11/2026
**Contexto:** Desafio AI-First Gogroup, Etapa 3, Problema 3 (Estoque).

---

## 1. O problema

A GoBeauté vende ~500 SKUs (441 ativos, 59 descontinuados; 8 marcas, 20 categorias, 6 fornecedores) no e-commerce próprio. Compras são decididas pela média de vendas e pela experiência do time. Resultado: ruptura em alguns produtos (venda perdida) e capital parado em outros.

O enunciado pede uma solução **funcional**, publicada num **link público sem login**, com código num **GitHub público**, contendo **um agente de IA que realiza uma ação útil** (chat genérico não basta). "As melhores respostas são defendidas com números."

### Perguntas de referência do desafio
1. Quanto capital está parado hoje, e em quê?
2. Quanto deixamos de vender por falta de produto?
3. O que comprar nos próximos 90 dias, em que quantidade e quando, dentro do orçamento?
4. O que fazer com o estoque que não gira?
5. Que equilíbrio entre caixa e nível de serviço você recomenda, e por quê?

### Parâmetros de negócio (parametros.md)
- Data de referência: **29/09/2026** (último dia com dados). Histórico desde 01/04/2025 (18 meses).
- Orçamento de compras **01/10 a 29/12/2026: R$ 1.970.000**.
- Custo de capital **18% a.a.**; armazenagem **1,2% do custo do estoque por mês** (≈ 32,4% a.a. somados).
- Desconto máximo em liquidação: **40% sobre o preço de venda**.
- Meta da diretoria: **nível de serviço de 98% para todos os SKUs**.
- Calendário: **Black Friday 27/11/2026, campanha 20/11–30/11**; **Natal, campanha 01/12–22/12**.
- Pedido de compra só em **múltiplos do MOQ, na unidade de compra do SKU** (`un` ou `cx 12 un`).
- Compras com `data_recebimento` vazia ainda não chegaram. Lead times se calculam de `compras.csv`.

### O que os dados mostram (reconhecimento feito em 27/10)

| Achado | Número | Implicação |
|---|---|---|
| Valor do estoque a custo em 29/09 | **R$ 6,79 mi** | ~3,4× o orçamento de 90 dias; há espaço para liberar caixa |
| Estoque de descontinuados a custo | **R$ 454 mil** | Candidato direto a liquidação; nunca recomprar |
| SKUs que já zeraram em algum dia | **65** (6 zerados hoje) | Ruptura existe e está espalhada no histórico |
| Dias-SKU com estoque zero | 1.837 | Base para estimar venda perdida |
| Dias-SKU ausentes no estoque_diario | 2.467 | Lacunas precisam ser tratadas (interpolar / reconstruir) |
| Linhas de estoque negativo | 120 (58 SKUs) | Erro de dado; tratar como zero/ruptura |
| Vendas registradas em dia com estoque zero | 104 | Inconsistência; documentar a regra adotada |
| Linhas duplicadas em vendas_diarias | **656, todas idênticas** | Deduplicar, senão a demanda infla |
| Reconciliação estoque(t) = estoque(t-1) − vendas + recebimentos | 99,9% bate (222 divergências) | O modelo de estoque é confiável; divergências viram nota |
| Unidade `cx 12 un` | 58 SKUs, 265 POs | Converter ×12 sempre; MOQ está em caixas para esses |
| POs em aberto | **90**, emitidos de 31/07 a 29/09 | Entram como estoque a caminho; alguns podem estar atrasados |
| Primeiro registro de estoque | 181 SKUs em 01/04/2025; lançamentos ao longo do período | SKUs novos têm histórico curto; saldo inicial sem PO |
| Vendas totais/mês | 50 mil un (abr/25) → 165 mil un (set/26) | **Crescimento forte (~3×)**, parte por lançamentos; média simples de 18 meses subestima |
| Black Friday 2025 | ~2,8–3,2 mil un/dia antes → **7,8–8,8 mil un/dia** de 20/11 a 30/11 | Pico de ~2,5–3× sobre a base |
| Natal 2025 | ~4,3–5,0 mil un/dia em dez | Pico menor que BF, mais longo |
| Maio 2026 | ~8,5 mil un/dia no início do mês (Dia das Mães) | Sazonalidade não prevista no calendário, mas fora do horizonte |
| Dias vendidos abaixo do preço cheio | 3.282 dias-SKU | Dá para medir a resposta de demanda a desconto (útil para liquidação) |

**Lead time por fornecedor (dias, POs recebidos):**

| Fornecedor | N | Mediana | Média | P90 | Mín–Máx |
|---|---|---|---|---|---|
| F01 Alfa Terceirização Capilar | 426 | 24 | 23,6 | 30 | 11–35 |
| F02 Beta Fragrâncias Industriais | 575 | 27 | 27,1 | 34 | 16–41 |
| F03 Gama Nutra Suplementos | 153 | 21 | 21,1 | 24 | 15–27 |
| F04 Delta Óleos Naturais | 258 | 14 | 13,8 | 16 | 8–20 |
| F05 Épsilon Dermocosméticos | 166 | 32 | **39,5** | **75** | 18–83 |
| F06 Zeta Cosméticos Capilares | 94 | 17 | 17,6 | 21 | 12–24 |

F05 é imprevisível (cauda longa até 83 dias): pedidos para a BF precisam sair já no início de outubro, e o estoque de segurança desses SKUs precisa ser maior.

### Armadilhas que a solução precisa tratar explicitamente
1. **Demanda censurada:** em dias de estoque zero (ou negativo, ou sem registro após zerar) a venda observada não é a demanda. Usar a média simples subestima justamente quem rompe. A demanda nesses dias deve ser estimada (ex.: média dos dias com estoque no mesmo período/dia da semana).
2. **Duplicatas** em vendas_diarias.
3. **Conversão de caixa** (`cx 12 un`) em MOQ, PO e custo.
4. **Pedidos em aberto** já comprometidos (não contam no orçamento novo, mas contam como estoque a caminho).
5. **Crescimento e lançamentos:** tendência recente pesa mais que o histórico antigo.
6. **Uma única amostra de BF/Natal** (2025): o efeito precisa ser medido relativo à base da época, não em unidades absolutas.
7. **98% para todos** provavelmente não cabe no orçamento; a solução precisa mostrar o custo de cada ponto de serviço.

---

## 2. Intenção e o porquê

**Usuário principal:** o chefe de estoque (e o estoquista). Abre a ferramenta para tomar duas decisões e sai com dois resultados:

1. **Pedidos de compra prontos** para 01/10–29/12/2026: SKU, fornecedor, quantidade (múltiplo do MOQ, na unidade certa), data limite de emissão e o porquê, dentro do orçamento.
2. **Sugestões de liquidação** do estoque que não gira: SKU, desconto (≤ 40%), capital liberado e o custo de manter parado.

**O diferencial (palavras do usuário):** "um chat interativo é interessante para ter projeções, mas ter um agente que baseado nos dados monta o plano é ainda mais interessante." O agente é quem **monta o plano**; o chat é a forma de pedir ajustes.

---

## 3. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
- Responder as cinco perguntas de referência com números rastreáveis.
- Plano de compras de 90 dias gerado pelo agente, aprovável linha a linha, exportável em CSV.
- Sugestões de liquidação com cálculo de capital liberado vs custo de manter.
- Recomendação defendida de equilíbrio caixa × nível de serviço (curva).
- Upload de CSVs pelo usuário para recalcular tudo com outros dados.
- Publicado no Vercel, link público sem login; código no GitHub público.

**Não-objetivos**
- Dados externos (mercado, concorrência, clima). Decisão do usuário: "vamos nos ater aos dados que temos". Cenários entram só como hipóteses digitadas pelo usuário (ex.: "BF 20% maior").
- Login, multiusuário, integração com ERP ou envio real de pedidos ao fornecedor.
- Dashboard decorativo: gráfico só existe se apoiar uma decisão.

**Anti-objetivos (falha mesmo funcionando)**
- **O agente inventar números.** Nas palavras do usuário: "números inventados pelo agente seria o pior". Todo número exibido deve vir de cálculo determinístico.
- Plano que viola regra de negócio (fora do MOQ, acima do orçamento, desconto > 40%, recompra de descontinuado).
- Expor os dados brutos ou o PDF do desafio no repositório público.

---

## 4. Restrições
- **Prazo:** 5 dias (até 01/11/2026).
- **Confidencialidade:** o PDF diz "não compartilhe os dados nem este documento". Decisão do usuário: **CSVs e PDF não vão para o GitHub.** O repositório leva só os **resultados agregados** (projeções e indicadores por SKU) gerados localmente, com o comando para regerar documentado.
  - **Nível de detalhe permitido no repositório (decidido pelo usuário, 27/10):** histórico **semanal** de vendas e estoque por SKU, projeções e indicadores derivados. **Sem** custo unitário nem preço de venda crus por SKU (só valores agregados já calculados, como capital parado, valor do pedido e venda perdida). Sem histórico diário.
  - O **histórico diário completo** e os dados crus só aparecem quando o usuário faz **upload** dos CSVs, e ficam apenas no navegador dele.
  - Consequência para o builder: as ferramentas do agente e o motor de plano precisam funcionar sobre o resumo agregado. Para valorar pedidos, o resumo precisa de algum custo por SKU (ex.: custo por lote de MOQ). **Limitação aceita:** quem dividir o valor de um pedido pela quantidade chega ao custo unitário. O objetivo é não republicar as tabelas cruas do desafio, não esconder cada número derivado.
- **LLM:** Groq (chave gratuita), via variável de ambiente no servidor.
- **Vercel:** corpo de requisição ≤ ~4,5 MB; `vendas_diarias.csv` e `estoque_diario.csv` têm ~4,6 MB cada → upload não pode ir ao servidor bruto.

---

## 5. O que foi decidido (como foi decidido)

### Stack (proposta minha, aceita pelo usuário)
- **Next.js + TypeScript**, publicado no **Vercel**. Tudo em TypeScript (sem Python) — a mesma lógica roda no script local, no navegador (upload) e no servidor (agente).

### Arquitetura em três camadas
1. **Pipeline de dados (TypeScript, módulo compartilhado):** lê os CSVs → limpa (dedup, negativos, lacunas, conversão de caixa) → calcula demanda corrigida pela ruptura, tendência, efeito BF/Natal, lead times por fornecedor, estoque a caminho, capital parado, venda perdida, nível de serviço histórico → gera um **resumo por SKU** (JSON).
   - **Dados padrão:** o pipeline roda **na máquina do desenvolvedor** sobre `case_estoque/` e o JSON agregado é commitado.
   - **Upload:** o usuário envia os mesmos CSVs pela interface; o pipeline roda **no navegador** (Web Worker), os dados brutos nunca saem da máquina dele, e o resumo substitui o dataset padrão na sessão. Validar colunas e avisar o que estiver errado.
2. **Servidor (rotas Next.js):** o agente (Groq com tool calling) e o motor de plano. Recebe do navegador o resumo por SKU (algumas centenas de KB) e executa as ferramentas sobre ele. Cenários ("BF +20%", "corta 200 mil") recalculam o plano na hora.
3. **Navegador:** exibe, aprova/edita/recusa, exporta CSV.

### O agente — "o agente decide, o código calcula"
- O agente **nunca escreve um número próprio**. Só usa números devolvidos por ferramentas, e cita de qual ferramenta cada número veio.
- Ferramentas mínimas (nomes a critério do builder): consultar projeção/situação de um SKU; listar candidatos (risco de ruptura, excesso); simular orçamento/cenário; adicionar/alterar/remover linha do plano; propor liquidação; resumo do plano.
- **Regras de negócio validadas no código, não no prompt:** múltiplo do MOQ, conversão ×12, teto de R$ 1,97 mi, desconto ≤ 40%, sem recompra de descontinuado, data de emissão dentro de 01/10–29/12. Ferramenta recusa e devolve o motivo; o agente refaz.
- **Divisão de trabalho (decidida pelo usuário, 27/10): o código monta o plano base, o agente faz o julgamento.**
  1. O código calcula para todos os SKUs a necessidade de compra (projeção, cobertura, MOQ, custo) e gera o **plano base**, que em geral estoura o orçamento. Junto vem a lista de **casos críticos**: corte necessário para caber no orçamento, SKUs de fornecedor com lead time longo/instável (F05) que precisam de emissão imediata para a BF, SKUs com histórico curto ou projeção incerta, POs em aberto atrasados.
  2. O agente recebe o resumo e trabalha **só nos casos críticos**, por meio de ferramentas: decide o que cortar e o que proteger quando o orçamento não cobre tudo, antecipa emissões, ajusta estoque de segurança de casos de risco. Cada ação passa pelo validador.
  3. A tela mostra **o que o agente mudou em relação ao plano base**: linha destacada, valor antes → depois, motivo citando os números das ferramentas, e um resumo no topo (quanto cortou, o que protegeu, nível de serviço estimado resultante).
  4. O usuário pede ajustes em linguagem natural ("BF 20% maior", "não corta nada da Kokeshi") e o agente refaz só o afetado.
- Motivo: torna a ação do agente visível e rastreável para o avaliador, cabe no limite gratuito do Groq (dezenas de casos, não 441 SKUs) e reduz o risco de número errado.
- **Plano B:** se o Groq cair ou estourar o limite, o sistema gera um **plano base por regra** (sem LLM). O agente melhora e explica, mas a ferramenta não depende dele para funcionar.

### Telas (escolha do usuário: "Painel B", diagnóstico primeiro)
- **Visão geral (padrão):** 4 indicadores — capital em estoque, capital parado, venda perdida por ruptura, nível de serviço atual vs meta 98%. Dois gráficos funcionais: **cobertura em dias por SKU** (quem rompe antes da BF / quem tem excesso) e **curva caixa × nível de serviço**. Alertas: SKUs que rompem antes de 20/11, excesso, POs atrasados. Botão para gerar o plano com o agente.
- **Plano de compras:** tabela do agente (emitir até, SKU, fornecedor, quantidade na unidade de compra, valor, porquê), aprovar/editar/recusar por linha, orçamento usado vs disponível, campo para pedir ajustes ao agente, exportar aprovados em CSV.
- **Liquidação:** SKU, cobertura atual, desconto sugerido, capital liberado, custo de manter parado.
- **Estoque:** tabela completa com busca e filtros; clique abre a ficha do SKU (histórico de vendas e estoque, projeção, marcações de BF e Natal, POs).
- **Fornecedores:** lead time real (mediana e P90), SKUs, POs em aberto/atrasados.
- **Upload de dados:** enviar CSVs e recalcular.

---

## 6. Chamadas minhas (o usuário pode contestar)
- **"Parado"** com critério explícito na tela: excedente acima de uma cobertura-alvo (ex.: > 180 dias) **ou** descontinuado com saldo. Valor a custo.
- **Visual sóbrio**, cor só para estado (vermelho = ruptura, âmbar = excesso).
- **Aprovações e edições salvas no navegador** (localStorage). Suficiente para link público sem login.
- **Nível de serviço = fill rate** (fração da demanda atendida do estoque), medido no histórico com a demanda corrigida.
- **Orçamento** = soma de custo × unidades dos **novos** POs emitidos em 01/10–29/12. POs já em aberto não consomem o orçamento novo.
- **POs em aberto** chegam em data_pedido + lead time mediano do fornecedor; se essa data já passou em 29/09 sem recebimento, marcar como **atrasado** e assumir chegada em data_pedido + P90 (ou alerta, se já passou também).
- **Recomendação de serviço diferenciada** (ex.: 98% para os SKUs que mais vendem/margem, menor para cauda), sustentada pela curva caixa × serviço. É a resposta à pergunta 5.
- **Horizonte de cobertura de cada pedido:** a quantidade cobre lead time do fornecedor + período de revisão de 30 dias + estoque de segurança (política de reposição até um nível-alvo). O estoque não termina zerado em 29/12.
- **Nível de serviço padrão do plano:** o recomendado e diferenciado (98% para os SKUs de maior venda/margem, menor para a cauda). "98% para todos" é um cenário com um clique, que mostra o custo e o déficit de orçamento.
- **Parâmetros após upload:** orçamento, data de referência, janela de emissão, calendário de campanhas, custos de capital/armazenagem e teto de desconto viram um objeto de configuração editável na tela, com os valores do parametros.md como padrão. Nada disso fica fixo no código.
- **Caixa liberado na liquidação:** por padrão não aumenta o orçamento de compra (módulos separados). O valor aparece como informação, e existe um cenário opcional "reinvestir caixa liberado".
- **Modelo Groq:** um modelo com bom suporte a tool calling (ex.: `llama-3.3-70b-versatile` ou `openai/gpt-oss-120b`); builder confirma disponibilidade.

## 7. Deixado ao builder
- Método exato de projeção (ex.: base recente por SKU com tendência + multiplicadores de BF/Natal medidos em 2025 relativos à base da época; fallback por categoria para SKUs com histórico curto), desde que documentado e defensável.
- Fórmula de estoque de segurança (ex.: z do nível de serviço × variabilidade da demanda e do lead time).
- Algoritmo de alocação do orçamento (ex.: guloso por margem esperada protegida por real investido).
- Modelo de liquidação (ex.: usar dias com desconto para estimar resposta da demanda; comparar custo de manter vs margem perdida no desconto).
- Bibliotecas de UI, gráficos e parsing de CSV.

## 8. Entregáveis e ordem
1. Este documento (problema + design) — **agora**.
2. **CLAUDE.md** do projeto (regras, comandos, convenções, anti-objetivos).
3. Plano de implementação.
4. Aplicação.
5. Publicação: link Vercel público + repositório GitHub público (sem `case_estoque/` e sem o PDF, via `.gitignore`).
