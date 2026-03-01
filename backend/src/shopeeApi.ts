import crypto from 'crypto';

const SHOPEE_HOST = 'https://partner.shopeemobile.com';

// ── Signature ───────────────────────────────────────────────────────────────

function makeSign(partnerKey: string, baseString: string): string {
  return crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex');
}

function ts(): number {
  return Math.floor(Date.now() / 1000);
}

/** Sign for auth-level endpoints (no access_token / shop_id) */
export function signAuth(partnerId: number, partnerKey: string, path: string, timestamp: number): string {
  return makeSign(partnerKey, `${partnerId}${path}${timestamp}`);
}

/** Sign for shop-level endpoints */
export function signShop(
  partnerId: number,
  partnerKey: string,
  path: string,
  timestamp: number,
  accessToken: string,
  shopId: number,
): string {
  return makeSign(partnerKey, `${partnerId}${path}${timestamp}${accessToken}${shopId}`);
}

// ── Auth URL ────────────────────────────────────────────────────────────────

export function buildAuthUrl(partnerId: number, partnerKey: string, redirectUrl: string): string {
  const path = '/api/v2/shop/auth_partner';
  const timestamp = ts();
  const sign = signAuth(partnerId, partnerKey, path, timestamp);
  const params = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign,
    redirect: redirectUrl,
  });
  return `${SHOPEE_HOST}${path}?${params.toString()}`;
}

// ── Token exchange ──────────────────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expire_in: number;      // seconds until access_token expires (usually ~14400 = 4h)
  request_id: string;
  error: string;
  message: string;
  shop_id_list?: number[];
  merchant_id_list?: number[];
}

export async function getAccessToken(
  partnerId: number,
  partnerKey: string,
  code: string,
  shopId: number,
): Promise<TokenResponse> {
  const path = '/api/v2/auth/token/get';
  const timestamp = ts();
  const sign = signAuth(partnerId, partnerKey, path, timestamp);
  const url = `${SHOPEE_HOST}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      shop_id: shopId,
      partner_id: partnerId,
    }),
  });
  return res.json() as Promise<TokenResponse>;
}

export async function refreshAccessToken(
  partnerId: number,
  partnerKey: string,
  refreshToken: string,
  shopId: number,
): Promise<TokenResponse> {
  const path = '/api/v2/auth/access_token/get';
  const timestamp = ts();
  const sign = signAuth(partnerId, partnerKey, path, timestamp);
  const url = `${SHOPEE_HOST}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: refreshToken,
      shop_id: shopId,
      partner_id: partnerId,
    }),
  });
  return res.json() as Promise<TokenResponse>;
}

// ── Shop Info ───────────────────────────────────────────────────────────────

interface ShopInfoResponse {
  shop_name: string;
  region: string;
  status: string;
  error: string;
  message: string;
  request_id: string;
}

export async function getShopInfo(
  partnerId: number,
  partnerKey: string,
  accessToken: string,
  shopId: number,
): Promise<ShopInfoResponse> {
  const path = '/api/v2/shop/get_shop_info';
  const timestamp = ts();
  const sign = signShop(partnerId, partnerKey, path, timestamp, accessToken, shopId);
  const params = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign,
    access_token: accessToken,
    shop_id: String(shopId),
  });
  const res = await fetch(`${SHOPEE_HOST}${path}?${params.toString()}`);
  return res.json() as Promise<ShopInfoResponse>;
}

// ── Orders ──────────────────────────────────────────────────────────────────

interface OrderListItem {
  order_sn: string;
}

interface OrderListResponse {
  error: string;
  message: string;
  response: {
    more: boolean;
    next_cursor: string;
    order_list: OrderListItem[];
  };
}

export interface ShopeeOrderItem {
  item_id: number;
  item_name: string;
  item_sku: string;
  model_id: number;
  model_name: string;
  model_sku: string;
  model_quantity_purchased: number;
  model_original_price: number;
  model_discounted_price: number;
}

export interface ShopeeOrderDetail {
  order_sn: string;
  order_status: string;
  create_time: number;
  update_time: number;
  total_amount: number;
  buyer_username: string;
  item_list: ShopeeOrderItem[];
  pay_time: number;
  estimated_shipping_fee: number;
}

interface OrderDetailResponse {
  error: string;
  message: string;
  response: {
    order_list: ShopeeOrderDetail[];
  };
}

export async function getOrderList(
  partnerId: number,
  partnerKey: string,
  accessToken: string,
  shopId: number,
  timeFrom: number,
  timeTo: number,
  cursor = '',
  pageSize = 100,
): Promise<OrderListResponse> {
  const path = '/api/v2/order/get_order_list';
  const timestamp = ts();
  const sign = signShop(partnerId, partnerKey, path, timestamp, accessToken, shopId);
  const params = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign,
    access_token: accessToken,
    shop_id: String(shopId),
    time_range_field: 'create_time',
    time_from: String(timeFrom),
    time_to: String(timeTo),
    page_size: String(pageSize),
    order_status: 'ALL',
  });
  if (cursor) params.set('cursor', cursor);

  const res = await fetch(`${SHOPEE_HOST}${path}?${params.toString()}`);
  return res.json() as Promise<OrderListResponse>;
}

export async function getOrderDetail(
  partnerId: number,
  partnerKey: string,
  accessToken: string,
  shopId: number,
  orderSnList: string[],
): Promise<OrderDetailResponse> {
  const path = '/api/v2/order/get_order_detail';
  const timestamp = ts();
  const sign = signShop(partnerId, partnerKey, path, timestamp, accessToken, shopId);
  const optionalFields = [
    'buyer_user_id',
    'buyer_username',
    'estimated_shipping_fee',
    'item_list',
    'pay_time',
    'total_amount',
  ].join(',');

  const params = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign,
    access_token: accessToken,
    shop_id: String(shopId),
    order_sn_list: orderSnList.join(','),
    response_optional_fields: optionalFields,
  });

  const res = await fetch(`${SHOPEE_HOST}${path}?${params.toString()}`);
  return res.json() as Promise<OrderDetailResponse>;
}

// ── Fetch all order SNs for a date range (paginated) ────────────────────────

export async function fetchAllOrderSns(
  partnerId: number,
  partnerKey: string,
  accessToken: string,
  shopId: number,
  timeFrom: number,
  timeTo: number,
): Promise<string[]> {
  const allSns: string[] = [];
  let cursor = '';
  let hasMore = true;

  // Shopee limits time_to - time_from to 15 days max
  const FIFTEEN_DAYS = 15 * 24 * 60 * 60;
  let rangeStart = timeFrom;

  while (rangeStart < timeTo) {
    const rangeEnd = Math.min(rangeStart + FIFTEEN_DAYS, timeTo);
    cursor = '';
    hasMore = true;

    while (hasMore) {
      const res = await getOrderList(
        partnerId, partnerKey, accessToken, shopId,
        rangeStart, rangeEnd, cursor,
      );
      if (res.error) throw new Error(`Shopee API error: ${res.error} - ${res.message}`);

      const orders = res.response?.order_list ?? [];
      allSns.push(...orders.map((o) => o.order_sn));
      hasMore = res.response?.more ?? false;
      cursor = res.response?.next_cursor ?? '';
    }
    rangeStart = rangeEnd;
  }

  return allSns;
}

// ── Fetch full order details in batches of 50 ──────────────────────────────

export async function fetchOrderDetails(
  partnerId: number,
  partnerKey: string,
  accessToken: string,
  shopId: number,
  orderSns: string[],
): Promise<ShopeeOrderDetail[]> {
  const all: ShopeeOrderDetail[] = [];
  const BATCH = 50;

  for (let i = 0; i < orderSns.length; i += BATCH) {
    const batch = orderSns.slice(i, i + BATCH);
    const res = await getOrderDetail(partnerId, partnerKey, accessToken, shopId, batch);
    if (res.error) throw new Error(`Shopee API error: ${res.error} - ${res.message}`);
    all.push(...(res.response?.order_list ?? []));
  }

  return all;
}
