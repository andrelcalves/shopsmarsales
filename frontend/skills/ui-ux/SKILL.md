---
name: ui-ux
description: >-
  Diretrizes de UI/UX do shopsmarsales, com navegação no formato do ERP UpSeller
  (menu lateral por módulos). Use ao criar ou redesenhar telas, menus, sidebars,
  layout de ERP, dashboards ou fluxos operacionais de e-commerce.
---

# UI/UX — shopsmarsales

## Objetivo

Definir as diretrizes de UI/UX da aplicação shopsmarsales (gestão de vendas multimercado).

## Contexto da aplicação

A aplicação gerencia vendas da loja de moda fitness, com foco em canais:

- Shopee
- TikTok Shop
- Mercado Livre
- Instagram / WhatsApp
- Atacado
- Varejo

## Referência principal: ERP UpSeller

Usar o **ERP UpSeller** como referência funcional e de navegação para:

- Gestão de pedidos
- Gestão de produtos
- Controle de estoque
- Publicação e organização de anúncios
- Gestão de notas fiscais
- Integração com marketplaces
- Visão consolidada da operação
- Automação de processos repetitivos
- Acompanhamento de status operacionais

Sempre que uma tela nova for criada, considerar primeiro como um ERP de e-commerce organizaria essa informação.

## Navegação (formato UpSeller)

A navegação **deve seguir o formato do menu do UpSeller**, não o padrão atual de chips horizontais no header.

### Padrão visual e estrutural

1. **Menu lateral esquerdo persistente** (sidebar), fixo na altura da viewport.
2. **Área de conteúdo à direita**, com título da tela ativa no topo.
3. Cada item principal do menu: **ícone + rótulo curto**.
4. Módulos com subitens usam **grupo expansível/colapsável** (submenu aninhado).
5. Item ativo: destaque claro (fundo/contraste), sem depender só de cor.
6. Sidebar pode **recolher** (só ícones) em desktop; em mobile vira drawer.
7. Ordem: **operação diária primeiro**, depois análises, depois cadastros/configurações.
8. Evitar menu horizontal com muitas “pills” no header (anti-padrão atual a migrar).

### Hierarquia-alvo do menu (espelho UpSeller → shopsmarsales)

Use esta árvore ao criar/reorganizar navegação. Itens entre parênteses são telas atuais do app.

```
Home / Dashboard
  ├─ Vendas Geral          (dashboard)
  └─ Vendas por Dia        (sales_by_day)

Pedidos
  ├─ Lista de pedidos      (orders)
  └─ Devoluções            (returns)

Produtos
  ├─ Produtos de canal     (products)
  ├─ Produtos mestre       (master_products)
  └─ Precificação          (pricing)

Estoque
  ├─ Visão de estoque      (stock_overview)
  └─ Lançar estoque        (stock_launch)

Análises
  ├─ Margem por Canal      (contribution_dashboard)
  ├─ Custo ADS             (ads_dashboard)
  ├─ Curva ABC             (product_curve)
  ├─ Simulação             (simulation)
  └─ Faturamento bruto     (simulation_gross_revenue)

Financeiro
  ├─ Contas a pagar        (bills_dashboard)
  ├─ Cadastro contas       (bills_to_pay)
  ├─ Contas a receber      (receivables)
  └─ Cadastro ADS          (ads_spend)

Integrações
  ├─ Upload & Lista        (upload)
  ├─ Taxas Tray            (payment_type_fees)
  ├─ Integrações           (shopee_integration)
  └─ Duplicatas Shopee     (shopee_duplicates)

Configurações
  └─ (reservado para preferências / canais / parâmetros)
```

### Regras ao implementar o menu

- Agrupar por **módulo de negócio** (Pedidos, Produtos, Estoque…), não por tipo técnico (“Dashboards”, “Cadastros”).
- Submenus com 1 nível apenas (módulo → tela). Evitar árvore profunda.
- Labels curtos, em português, iguais ou próximos ao UpSeller quando fizer sentido.
- Novas telas entram no módulo correto; não criar seção solta no header.
- Manter consistência: mesmo padrão de ícone, espaçamento e estado ativo em todos os itens.

### Layout sugerido (estrutura)

```
+------------------+------------------------------------------+
| Logo / app       | Título da tela + ações da página         |
|                  |------------------------------------------+
| [ícone] Home     |                                          |
| [ícone] Pedidos ▶|           Conteúdo da tela               |
|   · Lista        |                                          |
|   · Devoluções   |                                          |
| [ícone] Produtos |                                          |
| [ícone] Estoque  |                                          |
| [ícone] Análises |                                          |
| [ícone] Financeiro|                                         |
| [ícone] Integrações|                                        |
| [ícone] Config.  |                                          |
+------------------+------------------------------------------+
```

## Princípios de UX

- Ser simples para uso diário.
- Priorizar velocidade operacional.
- Reduzir cliques em tarefas frequentes.
- Mostrar status claros para pedidos, produtos e estoque.
- Facilitar comparação entre canais de venda.
- Evitar telas visualmente poluídas.
- Dar destaque para problemas que exigem ação.
- Separar operação diária de análise estratégica.
- Usar tabelas, filtros e cards de resumo de forma objetiva.
- Sempre considerar a rotina real da loja.

## Módulos de conteúdo

### Dashboard / Home

Visão rápida da operação.

- Vendas do dia / mês
- Vendas por dia
- Faturamento bruto
- Margem por canal
- Produtos mais vendidos

### Pedidos

Operação de pedidos e pós-venda.

- Lista de pedidos por canal/status
- Devoluções

### Produtos

Cadastro e acompanhamento dos produtos.

- Produtos de canal
- Produtos mestre
- Precificação

### Estoque

Controle e lançamentos de estoque.

- Visão consolidada
- Lançamentos

### Análises

Telas analíticas e simulação (não misturar com operação diária no menu).

- Margem, ADS, Curva ABC, Simulação, Faturamento bruto

### Financeiro

Contas, recebíveis e custos de ADS.

### Integrações

Cargas e conexões com marketplaces (na maioria por upload de arquivos).

- Upload de vendas
- Taxas / integrações / utilitários de canal

## Ao criar ou alterar UI

1. Verificar se a tela cabe em um módulo da hierarquia UpSeller acima.
2. Se for navegação/menu: implementar/atualizar **sidebar**, não chips no header.
3. Manter conteúdo limpo: filtros no topo, tabela/cards no centro, ações contextuais.
4. Preferir padrões já usados no frontend (Tailwind, componentes existentes), adaptando ao layout sidebar + content.
