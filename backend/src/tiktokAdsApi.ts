/**
 * Cliente da TikTok Business API / Marketing API (custos de anúncios).
 *
 * Portal de app: https://business-api.tiktok.com/portal (DIFERENTE do TikTok Shop
 * Partner Center e do TikTok for Developers genérico — são 3 cadastros distintos).
 *
 * IMPORTANTE — validar antes de usar em produção: os nomes de campo e a versão
 * da API (fixada aqui em "v1.3") devem ser confirmados no Developer Portal ao
 * criar o app, pois a doc pública não pôde ser lida automaticamente nesta sessão.
 * Ver docs/tiktok-integration-setup.md para o passo a passo de cadastro.
 */

const API_HOST = 'https://business-api.tiktok.com';
const API_VERSION = 'v1.3';

// ── Autorização (OAuth) ─────────────────────────────────────────────────────

/**
 * URL que o dono da conta de anúncios (Business Center / TikTok Ads Manager)
 * deve abrir para autorizar o app. Depois de autorizar, redireciona para
 * `redirectUri` com `?auth_code=...&state=...`.
 */
export function buildAuthUrl(appId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    app_id: appId,
    state,
    redirect_uri: redirectUri,
  });
  return `${API_HOST}/portal/auth?${params.toString()}`;
}

interface TiktokAdsTokenResponse {
  code: number;
  message: string;
  data?: {
    access_token: string;
    advertiser_ids: string[];
    scope?: number[];
  };
}

/** Troca o auth_code recebido no callback por um access_token de longa duração. */
export async function getAccessToken(
  appId: string,
  appSecret: string,
  authCode: string,
): Promise<TiktokAdsTokenResponse> {
  const res = await fetch(`${API_HOST}/open_api/${API_VERSION}/oauth2/access_token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: appId,
      secret: appSecret,
      auth_code: authCode,
    }),
  });
  return res.json() as Promise<TiktokAdsTokenResponse>;
}

// ── Contas de anúncio autorizadas ────────────────────────────────────────────

export interface TiktokAdvertiserInfo {
  advertiser_id: string;
  name: string;
  currency: string;
  status: string;
}

interface AdvertiserInfoResponse {
  code: number;
  message: string;
  data?: { list: TiktokAdvertiserInfo[] };
}

export async function getAdvertiserInfo(
  accessToken: string,
  advertiserIds: string[],
): Promise<AdvertiserInfoResponse> {
  const params = new URLSearchParams({
    advertiser_ids: JSON.stringify(advertiserIds),
  });
  const res = await fetch(
    `${API_HOST}/open_api/${API_VERSION}/advertiser/info/?${params.toString()}`,
    { headers: { 'Access-Token': accessToken } },
  );
  return res.json() as Promise<AdvertiserInfoResponse>;
}

// ── Relatório de custo (spend) ───────────────────────────────────────────────

interface IntegratedReportResponse {
  code: number;
  message: string;
  data?: {
    list: Array<{
      dimensions: Record<string, string>;
      metrics: Record<string, string>;
    }>;
  };
}

/**
 * Retorna o gasto total (spend) de uma conta de anúncio em um intervalo de datas
 * (ex.: primeiro ao último dia do mês). Agrega no nível da conta (sem quebrar por
 * campanha) — é o número que interessa para "custo com ADS do mês".
 */
export async function getAdvertiserSpend(
  accessToken: string,
  advertiserId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string, // YYYY-MM-DD
): Promise<{ spend: number; raw: IntegratedReportResponse }> {
  const params = new URLSearchParams({
    advertiser_id: advertiserId,
    report_type: 'BASIC',
    data_level: 'AUCTION_ADVERTISER',
    dimensions: JSON.stringify(['advertiser_id']),
    metrics: JSON.stringify(['spend']),
    start_date: startDate,
    end_date: endDate,
    page: '1',
    page_size: '10',
  });

  const res = await fetch(
    `${API_HOST}/open_api/${API_VERSION}/report/integrated/get/?${params.toString()}`,
    { headers: { 'Access-Token': accessToken } },
  );
  const json = (await res.json()) as IntegratedReportResponse;

  if (json.code !== 0) {
    throw new Error(`TikTok Ads API error: ${json.code} - ${json.message}`);
  }

  const rows = json.data?.list ?? [];
  const spend = rows.reduce((sum, row) => sum + (parseFloat(row.metrics?.spend ?? '0') || 0), 0);

  return { spend: Math.round(spend * 100) / 100, raw: json };
}
