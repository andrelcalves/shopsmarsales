# PRD — Shopsmarsales

Documento de referência de produto e comportamento esperado das telas principais.

---

## Vendas diárias por canal

### Visão geral

Tela que mostra **vendas agregadas por dia**, separadas por **canal** (Shopee, TikTok, Tray atacado, Tray varejo), com opção de **comparar** vendas entre períodos.

Comportamento base (já implementado): comparar **mês calendário completo** com o **mês anterior**, alinhando dia 1 com dia 1, etc.

**Evolução planejada:**

1. **Filtro por canal no gráfico** — o usuário escolhe quais canais entram no gráfico; a **comparação** (linhas e deltas) passa a considerar **apenas os canais selecionados** (soma diária e totais desses canais), para isolar a análise por canal ou por subconjunto de canais.
2. **Modos de período** — além do mês inteiro, permitir limitar o intervalo **até a data atual** (ver definição abaixo) e permitir **intervalos de datas personalizados**, com regras claras para o período de comparação.

- **Nome no menu:** «Vendas por Dia»
- **Título na página:** «Vendas diárias por canal»
- **Implementação (frontend):** `frontend/src/SalesByDayDashboard.tsx`
- **Rota de navegação:** `currentView === 'sales_by_day'` em `frontend/src/App.tsx`

### Filtro por canal (gráfico e comparação)

- **Controle:** seleção de um ou mais canais entre: Shopee, TikTok, Tray Atacado, Tray Varejo (comportamento tipo “marcar/desmarcar”; default: **todos visíveis**, equivalente ao comportamento atual).
- **Gráfico de barras:** exibir apenas as séries dos canais **marcados**. Se só um canal estiver marcado, o gráfico pode ser uma **única série** de barras (sem empilhamento) para leitura mais clara.
- **Linhas de comparação:** quando a comparação estiver ligada, as linhas “atual” e “anterior” representam a **soma dos valores diários apenas dos canais selecionados** (não o total geral da loja).
- **Cards resumo no topo:** devem refletir o **mesmo escopo** — totais e variações calculados **somente sobre os canais selecionados** (ou manter cards globais e um modo “escopo: filtrado” — **decisão de UX:** preferível **alinhar cards ao filtro** para evitar contradizer o gráfico).
- **Tabela:** colunas de canal podem ocultar colunas não selecionadas **ou** manter todas as colunas para transparência; **preferência de produto:** **filtrar linhas/colunas** para bater com o gráfico (apenas canais selecionados visíveis na tabela), mantendo linha de total coerente com a soma filtrada.

### Modos de período e comparação

O usuário escolhe **como delimitar o período “atual”** e **como derivar o período “de comparação”** quando a comparação estiver ativa.

**Tipos de período (período atual / analisado)**

| Modo | Descrição |
|------|-----------|
| **Mês calendário completo** | Do primeiro ao último dia do mês escolhido no seletor de mês. Comportamento já existente. |
| **Do início do mês até hoje** | Do dia 1 do mês selecionado até **a data de hoje** (inclusive), **desde que** “hoje” caia dentro desse mês. Se o mês selecionado for **anterior** ao mês corrente, tratar o intervalo como **mês fechado completo** (dia 1 ao último dia daquele mês), pois não há “até hoje” no futuro. |
| **Intervalo personalizado** | Usuário informa **data inicial** e **data final** (validar início ≤ fim; ambas no calendário gregoriano). |

**Período de comparação** (quando comparação ligada)

| Cenário | Regra |
|---------|--------|
| **Mês calendário** × **mês anterior** | Mantém a regra atual: mesmo número de dias posicionais no mês anterior (dia 1↔dia 1). |
| **Do início do mês até hoje** | Comparar com o intervalo **do dia 1 até o mesmo dia do mês no mês anterior** (ex.: dias 1–10 do mês M vs dias 1–10 do mês M−1). **Mesmo número de dias** nos dois lados. |
| **Intervalo personalizado** | Duas opções de UX (implementar ao menos uma na primeira entrega; a outra pode ser fase 2): **(A)** usuário define **dois intervalos** explicitamente (atual vs baseline); **(B)** usuário define só o intervalo atual e escolhe baseline **presets**: “mesmo intervalo deslocado 1 mês”, “mesmo intervalo ano anterior”, ou “mesmo comprimento terminando em [data]”. |

**Representação no gráfico:** para intervalos que não começam no dia 1, o eixo X pode ser **índice do dia dentro do intervalo** (1…N) ou **datas absolutas**; preferência: **datas** quando o intervalo for personalizado, para evitar ambiguidade.

### API

**Estado atual**

- **Endpoint:** `GET /api/sales-by-day?month=YYYY-MM`
- **Implementação (backend):** `backend/src/index.ts` — handler `/api/sales-by-day`
- **Sem `month`:** usa o primeiro dia do mês corrente até o início do mês seguinte.

**Evolução planejada (contrato a definir na implementação)**

- Suportar intervalo por **`start` e `end`** em `YYYY-MM-DD` (ou estender query existente) em vez de apenas `month`, mantendo `month` como atalho.
- Opcional: parâmetro **`channels`** (lista de identificadores alinhados aos buckets do backend) para filtrar agregação no servidor **ou** manter agregação completa no cliente só para filtro — **decisão técnica** entre payload menor vs simplicidade.
- Para comparação em dois intervalos arbitrários, podem ser **duas chamadas** (período A e B) ou **um endpoint** que aceita dois intervalos — definir na implementação.

### Regras de dados

- **Fonte:** tabela de pedidos (`order`), filtro por `orderDate` no intervalo solicitado.
- **Excluídos do agregado:** pedidos com status que indiquem cancelamento («cancelado»), «Não pago», «Aguardando pagamento», ou status `Devolvido`.
- **Métricas por dia:** soma de `totalPrice` e **contagem de pedidos** por canal e total.
- **Canais:**
  - `source === 'shopee'` → Shopee
  - `source === 'tiktok'` → TikTok
  - Fontes Tray (`tray`, `tray_atacado`, `tray_varejo` conforme modelo): divisão em **Atacado** ou **Varejo** via `bucketTrayMetrics(source, orderId)`; pedidos Tray genéricos não classificados entram nas métricas como **Tray Atacado** (sem série “legado” na UI).

### UI

- **Período:** seletor de mês **e/ou** controles adicionais para modo «até hoje» e «intervalo personalizado», conforme seção **Modos de período e comparação**.
- **Comparação:** toggle de comparação; quando ativo, escolha do **modo de baseline** conforme tabela acima.
- **Filtro de canais:** controles para incluir/excluir canais do gráfico, das linhas de comparação e dos totais exibidos.
- **Cards superiores:** totais no escopo do filtro de canal e do período selecionado; com comparação, variação vs período de baseline.
- **Gráfico:** barras por canal (filtradas); linhas de comparação no escopo filtrado.
- **Tabela:** alinhada ao filtro de canal e ao intervalo de datas.
- **Atualizar:** refaz as requisições sem alterar filtros.

### Observações para evolução

- Pedidos com `source` que não seja Shopee, TikTok ou Tray podem **entrar no total** do dia mas **não** aparecer nas barras por canal — avaliar se há outros marketplaces no modelo; para o **filtro por canal**, esses pedidos continuam fora das séries por canal.
- Intervalos em fusos horários: usar a mesma convenção já adotada para `orderDate` (datas “de negócio” no servidor ou no cliente de forma consistente).

---

## Estoque e produto mestre (SKU)

### Visão geral

Reorganização do módulo de estoque em **três telas** e introdução de **produto mestre** como identidade única de controle interno.

**Contexto:** cada canal (Shopee, TikTok, Tray) importa produtos com **nomes de marketing diferentes** e **SKUs de canal diferentes ou ausentes**. O agrupamento cross-channel é **manual** — o usuário define o **SKU mestre** na lista mestre e vincula as listagens de cada canal.

**Evolução em relação ao modelo atual:**

| Hoje | Depois |
|------|--------|
| Tela única `Stock.tsx` (consulta + lançamento + consolidação) | Três telas especializadas |
| `ProductGroup` (agrupamento manual por nome) | `MasterProduct` (agrupamento manual com **SKU mestre**) |
| `ProductGroupStock` / `ProductStock` | `MasterProductStock` (um estoque por SKU mestre) |
| Custo por produto/canal | Custo no mestre (`MasterProductCostHistory`) |

**Menus:**

| Grupo | Item | View | Componente |
|-------|------|------|------------|
| Dashboards | Estoque | `stock_overview` | `frontend/src/StockOverview.tsx` |
| Cadastros | Lançar estoque | `stock_launch` | `frontend/src/StockLaunch.tsx` |
| Cadastros | Produtos mestre | `master_products` | `frontend/src/MasterProducts.tsx` |

### Dois níveis de SKU

| Campo | Onde | Quem define | Uso |
|-------|------|-------------|-----|
| **SKU mestre** | `MasterProduct.sku` | Usuário (lista mestre) | Identificador único do sistema; estoque, custo, consulta, filtros |
| **SKU de canal** | `Product.sku` | Marketplace (opcional) | Referência informativa; **não** usado para agrupar automaticamente |

### Produto mestre — regras de negócio

1. Cada `MasterProduct` tem **SKU mestre único** e **nome canônico** (ex.: «Macacão Empina Bumbum Wave Avelã»).
2. Vários `Product` (um por canal/listagem) podem ser **vinculados manualmente** ao mesmo mestre via `Product.masterProductId`.
3. Produtos de canais diferentes podem ter nomes e SKUs de canal distintos ou vazios — o vínculo é decisão do usuário.
4. Um `Product` pertence a **no máximo um** mestre.
5. **Estoque:** uma quantidade de abertura por mestre (`MasterProductStock`); vendido = soma de `OrderItem.quantity` de **todos os membros** desde `InventoryConfig.stockStartDate`.
6. **Custo:** histórico por mestre (`MasterProductCostHistory`); vigência por `effectiveDate`; usado na simulação quando o pedido referencia um membro vinculado.
7. **Upload de vendas não agrupa** — import continua criando/atualizando `Product` por canal; novos produtos aparecem em **Pendentes** até vínculo manual.

### Migração do agrupamento atual (`ProductGroup`)

- Cada `ProductGroup` existente vira um `MasterProduct`:
  - `name` ← nome do grupo
  - `sku` ← placeholder `GRUPO-{id}` até o usuário definir o SKU mestre real
  - membros ← `ProductGroupItem`
  - estoque ← `ProductGroupStock.quantity` → `MasterProductStock`
- Endpoints `POST /api/products/consolidate` e `POST /api/product-groups` serão **depreciados** e substituídos pelas APIs de mestre.
- `autoGroupVariations()` no import Shopee será **desativado** — variações passam a ser vinculadas manualmente na tela mestre.

---

### Dashboard — Consulta de estoque

**Nome no menu:** «Estoque» (grupo Dashboards)  
**Título na página:** «Estoque» ou «Consulta de estoque»

**Objetivo:** visualizar posição de estoque por produto mestre, **somente leitura**.

**Conteúdo:**

- Indicador da **data inicial do estoque** (`stockStartDate`) vigente.
- Cards de **projeção** (faturamento e custo se todo estoque atual for vendido ao preço médio) — hoje em `Stock.tsx`.
- Tabela por **produto mestre**:
  - SKU mestre, nome canônico
  - Canais presentes (badges: shopee, tiktok, tray…)
  - Abertura, vendido, atual
  - Custo vigente, vigente desde
- **Filtros:** nome (contém) e SKU mestre (contém), independentes.
- **Expandir linha:** membros por canal (nome marketing, SKU de canal, vendido por membro) + histórico de custo.
- Ação: link «Lançar estoque» → navega para Cadastros → Lançar estoque.

**API:** `GET /api/stock-current` (retorna linhas por `MasterProduct`), `GET /api/stock-projection`.

---

### Cadastros — Lançar estoque

**Nome no menu:** «Lançar estoque»  
**Título na página:** «Lançar estoque»

**Objetivo:** configurar data inicial e registrar **abertura + custo + vigência** por produto mestre.

**Conteúdo:**

- **Data inicial do estoque** — formulário existente (`POST /api/inventory-config`).
- **Lançamento por mestre:** quantidade (abertura absoluta), preço de custo, data de vigência (default: hoje).
- Validação: se quantidade > 0, custo é obrigatório.
- **Filtros:** nome e SKU mestre para localizar o produto na lista.
- **Não incluir:** tabela de consulta, projeção, consolidação de produtos (movidos para outras telas).

**API:** `PUT /api/master-product-stock` com `{ masterProductId, quantity, unitCost?, effectiveDate? }`.

---

### Cadastros — Produtos mestre (SKU)

**Nome no menu:** «Produtos mestre»  
**Título na página:** «Produtos mestre»

**Objetivo:** definir SKU mestre, nome canônico e **vincular manualmente** listagens de canais.

**Aba Lista mestre:**

- Colunas: SKU mestre, nome canônico, qtd canais, estoque atual, ações (editar, ver membros).
- Editar SKU mestre e nome canônico.

**Aba Pendentes:**

- Produtos importados **sem** `masterProductId`.
- Filtros: nome, SKU de canal, canal.
- Ações:
  - **Criar mestre** a partir deste produto (informar SKU mestre + nome).
  - **Vincular** a mestre existente.

**Fluxo de agrupamento manual:**

1. Criar mestre → SKU mestre + nome canônico.
2. Selecionar 2+ produtos (nomes/SKUs de canal diferentes).
3. Vincular → compartilham estoque e custo do mestre.

**Facilitador (não automático):**

- Sugestões por **nome similar** (reutilizar lógica de `GET /api/products/suggest-matches`); usuário **confirma** antes de vincular.

**Expandir mestre:**

- Lista de membros: canal, nome marketing, SKU de canal (referência), ação desvincular.

**APIs:**

| Método | Rota | Função |
|--------|------|--------|
| GET | `/api/master-products` | Lista mestres; query `?name=&sku=` |
| GET | `/api/master-products/pending` | Produtos sem mestre |
| POST | `/api/master-products` | Criar mestre `{ sku, name, productIds?[] }` |
| PATCH | `/api/master-products/:id` | Editar SKU, nome, membros |
| POST | `/api/master-products/:id/members` | Vincular produtos |
| DELETE | `/api/products/:id/unlink-master` | Desvincular |

---

### Impacto no upload de vendas

**Sem alteração no fluxo de importação:**

- Cada upload continua criando/atualizando um `Product` por `{source}_{productCode}` via `ensureProduct()`.
- Nomes diferentes por canal permanecem aceitos.
- SKUs de canal (quando existem) continuam em `Product.sku` como referência.

**O que muda após o upload:**

- Produto sem mestre → aparece em **Pendentes** na tela Produtos mestre.
- Estoque consolidado e simulação (custo via mestre) só aplicam plenamente após vínculo manual.
- Pedidos e faturamento por canal **continuam funcionando** independentemente do vínculo.

---

### Impacto em outras telas

| Tela / API | Ajuste |
|------------|--------|
| **Simulação** | Custo de produção: `MasterProductCostHistory` → `ProductCostHistory` → `Product.costPrice` |
| **Custo produção (detalhe)** | Opção agregar por mestre ou por canal |
| **Curva ABC** | Rollup por `MasterProduct` |
| **Products.tsx** | Exibir SKU mestre; remover aba/seleção de consolidate (vai para Produtos mestre) |
| **Stock.tsx** | Substituído por `StockOverview` + `StockLaunch` |

---

### Modelo de dados (novos)

```prisma
MasterProduct       — sku (unique), name
MasterProductStock  — masterProductId (unique), quantity
MasterProductCostHistory — masterProductId, unitCost, effectiveDate, notes
Product.masterProductId  — FK opcional
```

---

### Critérios de aceite

1. Dois produtos de canais diferentes (SKUs de canal diferentes ou vazios), vinculados manualmente ao mesmo mestre → **estoque compartilhado**.
2. Venda em um canal **reduz** estoque do mestre na consulta.
3. Lançamento com custo + data reflete na **simulação** para pedidos de qualquer membro.
4. Filtros **nome** e **SKU mestre** funcionam em consulta e lançamento.
5. Produto importado sem mestre aparece em **Pendentes**; após vincular, entra no controle consolidado.
6. Grupos `ProductGroup` existentes são **migrados** sem perda de estoque (SKU placeholder até edição manual).
7. Upload Shopee/TikTok/Tray **não quebra** e **não agrupa** automaticamente.

---

### Observações para implementação

- Ordem sugerida: schema + migration → APIs mestre → `MasterProducts.tsx` → refatorar stock/simulação → `StockOverview` + `StockLaunch` → ajustes Products/curva ABC → deprecar UI antiga de grupos.
- Plano técnico detalhado: `.cursor/plans/estoque_e_sku_mestre_45b82523.plan.md`.
