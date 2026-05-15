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
