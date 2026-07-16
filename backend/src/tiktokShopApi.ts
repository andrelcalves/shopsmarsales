/**
 * Cliente da TikTok Shop Partner API (vendas / pedidos da loja).
 *
 * Espelha o estilo de `shopeeApi.ts`: funções puras de assinatura + chamadas HTTP,
 * sem nenhuma dependência de Prisma/Express (isso fica em index.ts).
 *
 * IMPORTANTE — validar antes de usar em produção:
 * Os nomes de endpoint, versão da API (aqui fixada em "202309") e o formato exato
 * da URL de autorização SÓ podem ser confirmados dentro do TikTok Shop Partner Center
 * (https://partner.tiktokshop.com) depois que o app estiver criado, porque a doc é
 * renderizada via JS e não pôde ser lida automaticamente nesta sessão. A lógica de
 * assinatura (HMAC-SHA256) segue o algoritmo documentado publicamente, mas confirme
 * os detalhes finos (quais parâmetros entram/saem do sign) com uma chamada de teste
 * real assim que tiver App Key/App Secret — ver docs/tiktok-integration-setup.md.
 */
import crypto from 'crypto';

const API_HOST = 'https://open-api.tiktokglobalshop.com';
const AUTH_HOST = 'https://auth.tiktok-shops.com';
const API_VERSION = '202309';

// ── Assinatura ──────────────────────────────────────────────────────────────

/**
 * Algoritmo de assinatura da TikTok Shop API:
 * 1. Remove `sign` e `access_token` dos parâmetros.
 * 2. Ordena os parâmetros restantes por chave.
 * 3. Concatena como `chave1valor1chave2valor2...` e prefixa com o `path`.
 * 4. Se houver corpo (POST) e o Content-Type não for multipart, o JSON do corpo
 *    entra concatenado antes do secret final.
 * 5. Envolve a string resultante com o App Secret no início e no fim, e aplica
 *    HMAC-SHA256 usando o App Secret como chave. Resultado em hex.
 */
export function signRequest(
  appSecret: string,
  path: string,
  params: Record<string, string | number | undefined>,
  body?: unknown,
): string {
  const filteredKeys = Object.keys(params)
    .filter((k) => k !== 'sign' && k !== 'access_token' && params[k] !== undefined)
    .sort();

  let base = path;
  for (const key of filteredKeys) {
    base += `${key}${params[key]}`;
  }

  if (body !== undefined && body !== null) {
    base += JSON.stringify(body);
  }

  const wrapped = `${appSecret}${base}${appSecret}`;
  return crypto.createHmac('sha256', appSecret).update(wrapped).digest('hex');
}

function ts(): number {
  return Math.floor(Date.now() / 1000);
}

interface SignedParams {
  app_key: string;
  timestamp: number;
  sign: string;
  access_token?: string;
  shop_cipher?: string;
  [k: string]: string | number | undefined;
}

function buildSignedQuery(
  appKey: string,
  appSecret: string,
  path: string,
  extraParams: Record<string, string | number | undefined>,
  accessToken?: string,
  body?: unknown,
): URLSearchParams {
  const timestamp = ts();
  const paramsForSign: Record<string, string | number | undefined> = {
    app_key: appKey,
    timestamp,
    ...extraParams,
  };
  const sign = signRequest(appSecret, path, paramsForSign, body);

  const finalParams: SignedParams = {
    app_key: appKey,
    timestamp,
    sign,
    ...extraParams,
  };
  if (accessToken) finalParams.access_token = accessToken;

  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(finalParams)) {
    if (v !== undefined) usp.set(k, String(v));
  }
  return usp;
}

// ── Autorização (OAuth) ─────────────────────────────────────────────────────

/**
 * Monta a URL que o vendedor (dono da loja TikTok Shop) deve abrir para autorizar
 * o app a acessar a conta dele. Depois de autorizar, a TikTok Shop redireciona
 * para a URL de callback configurada no Partner Center com `?code=...`.
 */
export function buildAuthUrl(appKey: string, state: string): string {
  const params = new URLSearchParams({
    app_key: appKey,
    state,
  });
  return `${AUTH_HOST}/api/v2/authorization?${params.toString()}`;
}

interface TiktokShopTokenResponse {
  code: number;
  message: string;
  data?: {
    access_token: string;
    access_token_expire_in: number; // segundos
    refresh_token: string;
    refresh_token_expire_in: number; // segundos
    open_id?: string;
    seller_name?: string;
    seller_base_region?: string;
  };
}

export async function getAccessToken(
  appKey: string,
  appSecret: string,
  authCode: string,
): Promise<TiktokShopTokenResponse> {
  const params = new URLSearchParams({
    app_key: appKey,
    app_secret: appSecret,
    auth_code: authCode,
    grant_type: 'authorized_code',
  });
  const res = await fetch(`${AUTH_HOST}/api/v2/token/get?${params.toString()}`);
  return res.json() as Promise<TiktokShopTokenResponse>;
}

export async function refreshAccessToken(
  appKey: string,
  appSecret: string,
  refreshToken: string,
): Promise<TiktokShopTokenResponse> {
  const params = new URLSearchParams({
    app_key: appKey,
    app_secret: appSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(`${AUTH_HOST}/api/v2/token/get?${params.toString()}`);
  return res.json() as Promise<TiktokShopTokenResponse>;
}

// ── Lojas autorizadas (para obter o shop_cipher) ────────────────────────────

export interface TiktokAuthorizedShop {
  id: string; // shop_id
  name: string;
  cipher: string; // shop_cipher, exigido nas chamadas de pedido
  code?: string;
  region?: string;
  seller_type?: string;
}

interface AuthorizedShopsResponse {
  code: number;
  message: string;
  data?: { shops: TiktokAuthorizedShop[] };
}

export async function getAuthorizedShops(
  appKey: string,
  appSecret: string,
  accessToken: string,
): Promise<AuthorizedShopsResponse> {
  const path = `/authorization/${API_VERSION}/shops`;
  const query = buildSignedQuery(appKey, appSecret, path, {}, accessToken);
  const res = await fetch(`${API_HOST}${path}?${query.toString()}`, {
    headers: { 'x-tts-access-token': accessToken },
  });
  return res.json() as Promise<AuthorizedShopsResponse>;
}

// ── Pedidos ──────────────────────────────────────────────────────────────────

export interface TiktokShopOrderLineItem {
  id: string;
  product_id: string;
  product_name: string;
  sku_id: string;
  seller_sku: string;
  sale_price: string;
  original_price: string;
  display_status?: string;
}

export interface TiktokShopOrder {
  id: string; // order_id
  status: string; // UNPAID | AWAITING_SHIPMENT | AWAITING_COLLECTION | IN_TRANSIT | DELIVERED | COMPLETED | CANCELLED
  create_time: number; // epoch seconds
  update_time: number;
  payment?: {
    total_amount: string;
    currency: string;
  };
  line_items: TiktokShopOrderLineItem[];
}

interface OrderListResponse {
  code: number;
  message: string;
  data?: {
    orders: TiktokShopOrder[];
    next_page_token?: string;
    total_count?: number;
  };
}

/** POST /order/{version}/orders/search — busca por página, filtrando por data de criação. */
export async function searchOrders(
  appKey: string,
  appSecret: string,
  accessToken: string,
  shopCipher: string,
  createTimeGe: number,
  createTimeLt: number,
  pageToken = '',
  pageSize = 100,
): Promise<OrderListResponse> {
  const path = `/order/${API_VERSION}/orders/search`;
  const body = {
    page_size: pageSize,
    ...(pageToken ? { page_token: pageToken } : {}),
    create_time_ge: createTimeGe,
    create_time_lt: createTimeLt,
    order_status: 'ALL',
  };
  const query = buildSignedQuery(
    appKey,
    appSecret,
    path,
    { shop_cipher: shopCipher, page_size: pageSize },
    accessToken,
    body,
  );

  const res = await fetch(`${API_HOST}${path}?${query.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tts-access-token': accessToken,
    },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<OrderListResponse>;
}

/** Busca todos os pedidos de um intervalo de datas, paginando automaticamente. */
export async function fetchAllOrders(
  appKey: string,
  appSecret: string,
  accessToken: string,
  shopCipher: string,
  createTimeGe: number,
  createTimeLt: number,
): Promise<TiktokShopOrder[]> {
  const all: TiktokShopOrder[] = [];
  let pageToken = '';
  let hasMore = true;

  while (hasMore) {
    const res = await searchOrders(
      appKey, appSecret, accessToken, shopCipher,
      createTimeGe, createTimeLt, pageToken,
    );
    if (res.code !== 0) {
      throw new Error(`TikTok Shop API error: ${res.code} - ${res.message}`);
    }
    const orders = res.data?.orders ?? [];
    all.push(...orders);
    pageToken = res.data?.next_page_token ?? '';
    hasMore = Boolean(pageToken) && orders.length > 0;
  }

  return all;
}
