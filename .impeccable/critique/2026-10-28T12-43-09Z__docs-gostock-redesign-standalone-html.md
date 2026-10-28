---
target: docs/GoStock Redesign (standalone).html
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/anthony/Documentos/Projetos/gostock/docs/GoStock Redesign (standalone).html"
target_fingerprint: "sha256:ae2d74997b10502b243618ac3d684486a123e7c0e7cd58468cfb4b2ff3e76799"
target_path: /home/anthony/Documentos/Projetos/gostock/docs/GoStock Redesign (standalone).html
timestamp: 2026-10-28T12-43-09Z
slug: docs-gostock-redesign-standalone-html
---
# Critique: GoStock Redesign (standalone).html

Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score
| # | Heurística | Nota | Problema principal |
|---|---|---|---|
| 1 | Visibilidade do estado | 2 | Agente só no estado "depois"; sem rodando, erro ou revisão parcial; "Exportar aprovados (0)" parece ativo |
| 2 | Linguagem do usuário | 4 | P90, cobertura, curva A, BF, cx/un corretos |
| 3 | Controle e liberdade | 2 | Editar/Recusar escondidos no "⋯"; sem antes → depois, não dá para desfazer o agente |
| 4 | Consistência | 2 | Âmbar = excesso, cobertura 20–30 d e cenário caro; linha "ok" com barra vermelha |
| 5 | Prevenção de erros | 3 | Processamento travado e "Envie os 5 arquivos" bons |
| 6 | Reconhecer em vez de lembrar | 3 | Atalhos e "i" ajudam; curva sem eixos |
| 7 | Flexibilidade e eficiência | 2 | Sem aprovação em lote; paginação de 25 em 135 linhas |
| 8 | Estética e minimalismo | 3 | Calmo e bem agrupado; cartão ameixa e avisos coloridos decoram |
| 9 | Recuperação de erros | 1 | Nenhum estado de falha do agente ou do upload desenhado |
| 10 | Ajuda | 3 | Tooltips "i", legenda da barra de fornecedores, premissa da liquidação |
| **Total** | | **25/40** | **Aceitável** |

## Prioridades
- [P0] Plano perde o antes → depois do agente e os estados do agente (regras 3 e 4 do CLAUDE.md).
- [P1] Cor fora da regra 6: verde como "meta/ok", ameixa nas barras de dados, âmbar com três sentidos, chip "ok" com barra vermelha.
- [P1] Curva orçamento × serviço sem eixos (pergunta 5 do desafio).
- [P1] Tabela do plano: ações escondidas, sem lote, alvos de ~30 px, KPI "3 SKUs A" sem função determinística.
- [P2] Estoque/Fornecedores perdem colunas (curva, fornecedor, mín–máx); projeção "esquema"; contraste abaixo de AA (#8a8177, #d9780f); sem estados de foco nem comportamento em 375 px.

## Detector
29 achados no DOM renderizado (12 low-contrast, 9 clipped-overflow, 4 all-caps, 1 nested-cards, 1 cream-palette, 1 cramped-padding, 1 dark-glow); arquivo original 0 (bundle). dark-glow e overflow horizontal são do invólucro/prancheta.
