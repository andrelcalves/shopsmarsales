/**
 * Parser do export de vendas Nuvemshop (CSV `;`).
 * Usado no canal Atacado (ex-tray_atacado).
 *
 * O arquivo traz várias linhas por pedido: a 1ª linha tem cabeçalho do pedido + 1º item;
 * as seguintes repetem o número do pedido e só preenchem colunas de produto.
 */

export const SOURCE_ATACADO = 'atacado';

export type NuvemshopOrderItem = {
  productCode: string;
  name: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  sellerDiscount: number;
};

export type NuvemshopOrder = {
  orderId: string;
  orderNumber: string;
  orderDate: Date;
  status: string;
  paymentStatus: string;
  totalPrice: number;
  freight: number;
  discount: number;
  fees: number;
  paymentType: string;
  paymentId: string | null;
  items: NuvemshopOrderItem[];
};

function normalizeHeader(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function pickNormalized(row: Record<string, unknown>, candidates: string[]): unknown {
  const entries = Object.entries(row || {});
  const normalized = entries.map(([k, v]) => [normalizeHeader(k), v] as const);
  // 1) match exato
  for (const c of candidates) {
    const nc = normalizeHeader(c);
    const hit = normalized.find(([k]) => k === nc);
    if (hit && hit[1] !== undefined && hit[1] !== null && String(hit[1]).trim() !== '') {
      return hit[1];
    }
  }
  // 2) match por inclusão só se o cabeçalho for curto o bastante (evita "Identificador da transação no meio de pagamento")
  for (const c of candidates) {
    const nc = normalizeHeader(c);
    const hit = normalized.find(([k]) => k.includes(nc) && k.length <= nc.length + 8);
    if (hit && hit[1] !== undefined && hit[1] !== null && String(hit[1]).trim() !== '') {
      return hit[1];
    }
  }
  return undefined;
}

function parseBrNumber(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim().replace(/\s/g, '');
  if (!s) return 0;
  // Nuvemshop costuma usar ponto decimal (539.5); também aceita formato BR (1.234,56)
  if (s.includes(',') && s.includes('.')) {
    return Number(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (s.includes(',')) return Number(s.replace(',', '.')) || 0;
  return Number(s) || 0;
}

function parseNuvemDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  const s = String(v).trim();
  // 07/07/2026 19:02:36 ou 07/07/2026
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yyyy = Number(m[3]);
    const hh = Number(m[4] || 0);
    const mi = Number(m[5] || 0);
    const ss = Number(m[6] || 0);
    const d = new Date(yyyy, mm, dd, hh, mi, ss);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function cleanSku(v: unknown): string {
  let s = String(v ?? '').trim();
  // Excel-style ="13119902053130"
  const m = s.match(/^="(.+)"$/);
  if (m) s = m[1];
  return s.trim();
}

/**
 * Agrupa linhas do CSV Nuvemshop em pedidos com itens.
 */
export function parseNuvemshopSalesRows(rows: Record<string, unknown>[]): {
  orders: NuvemshopOrder[];
  skipped: number;
} {
  type Acc = {
    orderNumber: string;
    orderId: string;
    orderDate: Date | null;
    status: string;
    paymentStatus: string;
    totalPrice: number;
    freight: number;
    discount: number;
    fees: number;
    paymentType: string;
    paymentId: string | null;
    items: NuvemshopOrderItem[];
  };

  const byNumber = new Map<string, Acc>();
  let skipped = 0;

  for (const row of rows) {
    const orderNumberRaw = pickNormalized(row, [
      'Numero do Pedido',
      'Número do Pedido',
      'Numero do pedido',
    ]);
    const orderNumber = orderNumberRaw != null ? String(orderNumberRaw).trim() : '';
    if (!orderNumber) {
      skipped++;
      continue;
    }

    let acc = byNumber.get(orderNumber);
    if (!acc) {
      acc = {
        orderNumber,
        orderId: '',
        orderDate: null,
        status: 'Desconhecido',
        paymentStatus: '',
        totalPrice: 0,
        freight: 0,
        discount: 0,
        fees: 0,
        paymentType: '',
        paymentId: null,
        items: [],
      };
      byNumber.set(orderNumber, acc);
    }

    const idPedido = pickNormalized(row, [
      'Identificador do pedido',
      'Identificador do Pedido',
      'ID do pedido',
    ]);
    if (idPedido != null && String(idPedido).trim()) {
      acc.orderId = String(idPedido).trim();
    }

    const dateVal = pickNormalized(row, ['Data', 'Data do pedido', 'Data de criacao']);
    const parsedDate = parseNuvemDate(dateVal);
    if (parsedDate && !acc.orderDate) acc.orderDate = parsedDate;

    const statusVal = pickNormalized(row, ['Status do Pedido', 'Status do pedido']);
    if (statusVal != null && String(statusVal).trim()) {
      acc.status = String(statusVal).trim();
    }

    const payStatus = pickNormalized(row, ['Status do Pagamento', 'Status do pagamento']);
    if (payStatus != null && String(payStatus).trim()) {
      acc.paymentStatus = String(payStatus).trim();
    }

    const totalVal = pickNormalized(row, ['Total']);
    if (totalVal != null && String(totalVal).trim() !== '') {
      acc.totalPrice = parseBrNumber(totalVal);
    }

    const freightVal = pickNormalized(row, ['Valor do Frete', 'Valor do frete', 'Frete']);
    if (freightVal != null && String(freightVal).trim() !== '') {
      acc.freight = parseBrNumber(freightVal);
    }

    const discountVal = pickNormalized(row, ['Desconto']);
    if (discountVal != null && String(discountVal).trim() !== '') {
      acc.discount = parseBrNumber(discountVal);
    }

    const feesVal = pickNormalized(row, ['Taxas']);
    if (feesVal != null && String(feesVal).trim() !== '') {
      acc.fees = parseBrNumber(feesVal);
    }

    const payType = pickNormalized(row, ['Meio de pagamento']);
    if (payType != null && String(payType).trim()) {
      acc.paymentType = String(payType).trim();
    } else {
      const payForm = pickNormalized(row, ['Forma de Pagamento', 'Forma de pagamento']);
      if (payForm != null && String(payForm).trim() && !acc.paymentType) {
        acc.paymentType = String(payForm).trim();
      }
    }

    const payId = pickNormalized(row, [
      'Identificador da transacao no meio de pagamento',
      'Identificador da transação no meio de pagamento',
    ]);
    if (payId != null && String(payId).trim()) {
      acc.paymentId = String(payId).trim();
    }

    const nameVal = pickNormalized(row, ['Nome do Produto', 'Nome do produto']);
    const skuVal = pickNormalized(row, ['SKU', 'Sku']);
    const qtyVal = pickNormalized(row, ['Quantidade Comprada', 'Quantidade']);
    const unitVal = pickNormalized(row, ['Valor do Produto', 'Valor do produto']);

    const name = nameVal != null ? String(nameVal).trim() : '';
    const productCode = cleanSku(skuVal) || (name ? `sku_${normalizeHeader(name).slice(0, 40)}` : '');
    const quantity = qtyVal != null ? parseInt(String(qtyVal), 10) || 0 : 0;
    const unitPrice = parseBrNumber(unitVal);

    if (name && productCode && quantity > 0) {
      acc.items.push({
        productCode,
        name,
        unitPrice,
        quantity,
        totalPrice: Number((unitPrice * quantity).toFixed(2)),
        sellerDiscount: 0,
      });
    }
  }

  const orders: NuvemshopOrder[] = [];
  for (const acc of byNumber.values()) {
    if (!acc.orderDate) {
      skipped++;
      continue;
    }
    // Preferir identificador Nuvemshop; fallback para número do pedido na loja
    const orderId = acc.orderId || acc.orderNumber;
    if (!orderId) {
      skipped++;
      continue;
    }

    // Rateia desconto do pedido nos itens (proporcional ao bruto da linha)
    const itemsGross = acc.items.reduce((s, it) => s + it.totalPrice, 0);
    if (acc.discount > 0 && itemsGross > 0 && acc.items.length > 0) {
      let allocated = 0;
      for (let i = 0; i < acc.items.length; i++) {
        const it = acc.items[i];
        const share =
          i === acc.items.length - 1
            ? Number((acc.discount - allocated).toFixed(2))
            : Number(((acc.discount * it.totalPrice) / itemsGross).toFixed(2));
        allocated = Number((allocated + share).toFixed(2));
        it.sellerDiscount = share;
        it.totalPrice = Number((it.totalPrice - share).toFixed(2));
      }
    }

    orders.push({
      orderId,
      orderNumber: acc.orderNumber,
      orderDate: acc.orderDate,
      status: acc.status,
      paymentStatus: acc.paymentStatus,
      totalPrice: acc.totalPrice,
      freight: acc.freight,
      discount: acc.discount,
      fees: acc.fees,
      paymentType: acc.paymentType,
      paymentId: acc.paymentId,
      items: acc.items,
    });
  }

  return { orders, skipped };
}
