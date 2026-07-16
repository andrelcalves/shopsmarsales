# Integração TikTok (vendas + custo de ADS) — guia de configuração

Sua conta atual em **TikTok for Developers** (developers.tiktok.com) é usada para
login social / conteúdo — **não** serve para o que você precisa. São necessários
**dois outros cadastros**, cada um com seu próprio App Key/Secret:

| Objetivo | Portal | O que ele te dá |
|---|---|---|
| Vendas / pedidos da loja | [partner.tiktokshop.com](https://partner.tiktokshop.com) (TikTok Shop Partner Center) | App Key + App Secret para a **TikTok Shop API** |
| Custo com anúncios (ADS) | [business-api.tiktok.com/portal](https://business-api.tiktok.com/portal) (TikTok Business API Portal) | App ID + Secret para a **Marketing API** |

Este pacote já inclui os módulos de código (`tiktokShopApi.ts`, `tiktokAdsApi.ts`) e
os endpoints no backend. Falta só criar os apps nos dois portais e conectar.

---

## 1. Antes de tudo: aplicar a migration do banco

Os novos dados (chaves, tokens) ficam em duas tabelas novas. Rode localmente:

```bash
cd backend
npx prisma migrate dev --name add_tiktok_integrations
npx prisma generate
```

Sem isso, os endpoints `/api/tiktok-shop/*` e `/api/tiktok-ads/*` vão responder
com erro dizendo que o model não existe.

---

## 2. TikTok Shop — vendas

1. Acesse **partner.tiktokshop.com** e entre com sua conta de vendedor (a mesma
   do TikTok Shop Seller Center).
2. Crie um app (App Type: **Self-built app**, já que é só para a sua própria
   loja, não para revender a outros lojistas).
3. Ao criar, informe a **URL de redirecionamento**:
   `https://SEU-DOMINIO/api/tiktok-shop/callback`
   (troque pelo domínio real onde o backend está publicado; em teste local pode
   ser necessário um túnel público, já que a TikTok Shop precisa alcançar essa URL).
4. Solicite/ative os escopos de **Order** (leitura de pedidos). Alguns escopos
   exigem aprovação manual da TikTok — pode levar alguns dias.
5. Copie **App Key** e **App Secret** da página do app.
6. No seu sistema, chame:
   - `POST /api/tiktok-shop/config` com `{ "appKey": "...", "appSecret": "..." }`
   - `GET /api/tiktok-shop/auth-url` → abra a `url` retornada no navegador,
     logado como o vendedor, e autorize o app.
   - Isso redireciona para `/api/tiktok-shop/callback`, que já salva o token e a
     loja conectada.
7. Para puxar pedidos de um mês: `POST /api/tiktok-shop/sync` com
   `{ "month": "2026-06" }`. Isso grava/atualiza os pedidos na mesma tabela usada
   pelo upload manual (`source = "tiktok"`), então os dashboards existentes já
   enxergam esses dados automaticamente.

**Atenção:** a documentação da Partner Center é renderizada via JavaScript e não
pôde ser lida automaticamente ao montar este pacote. Os nomes de endpoint e o
formato exato da assinatura em `tiktokShopApi.ts` seguem o padrão publicamente
documentado (HMAC-SHA256, versão de API `202309`), mas **confirme na primeira
chamada de teste** (a própria Partner Center tem uma ferramenta de teste de API)
se algum campo mudou — é comum a TikTok atualizar a versão da API periodicamente.

---

## 3. TikTok Ads — custo de anúncios

1. Acesse **business-api.tiktok.com/portal** e crie um app no Developer Portal
   (é uma conta separada da Shop Partner Center).
2. Informe a **Redirect URI**: `https://SEU-DOMINIO/api/tiktok-ads/callback`.
3. Solicite o escopo de **Reporting** (leitura de relatórios/custo).
4. Copie **App ID** e **Secret**.
5. No seu sistema:
   - `POST /api/tiktok-ads/config` com `{ "appId": "...", "appSecret": "..." }`
   - `GET /api/tiktok-ads/auth-url` → abra a `url`, logado na conta de anúncios
     (TikTok Ads Manager / Business Center) que tem acesso à conta de anúncios
     que você quer monitorar, e autorize.
   - O callback salva o token e a primeira `advertiser_id` autorizada.
6. Para puxar o gasto do mês: `POST /api/tiktok-ads/sync` com
   `{ "month": "2026-06" }`. Isso grava o total gasto na tabela `AdSpend` com
   `channel = "tiktok"` — a mesma tabela que já alimenta o dashboard de ROAS
   (`GET /api/adspend`), então nada mais precisa mudar na tela.

**Atenção:** mesma ressalva do item anterior — os nomes exatos de campo da
Marketing API (`v1.3`) devem ser conferidos contra a doc ao vivo quando você
tiver o app criado, pois a leitura automática da doc não foi possível nesta
sessão.

---

## 4. Resumo do que foi entregue

- `backend/src/tiktokShopApi.ts` — cliente HTTP assinado para a TikTok Shop API
  (OAuth, lojas autorizadas, busca de pedidos).
- `backend/src/tiktokAdsApi.ts` — cliente HTTP para a TikTok Marketing API
  (OAuth, info da conta de anúncio, relatório de gasto).
- `backend/prisma/schema.prisma` — modelos `TiktokShopIntegration` e
  `TiktokAdsIntegration` (mesmo padrão de `ShopeeIntegration`, já existente).
- `backend/src/index.ts` — endpoints `/api/tiktok-shop/*` e `/api/tiktok-ads/*`,
  seguindo exatamente o padrão dos endpoints `/api/shopee/*` que você já usa.

Nada disso troca o fluxo manual de upload de planilha que já existe — ele
continua funcionando normalmente. Os novos endpoints são uma via alternativa
(automática) que grava nas mesmas tabelas.
