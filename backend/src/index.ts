// src/index.ts
import express from 'express';
import cors from 'cors';
import formidable from 'formidable';
import { PrismaClient, Prisma } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import util from 'util';
import { createRequire } from 'module';
import * as shopeeApi from './shopeeApi.js';
import { parseTikTokIncomeReport } from './tiktokIncome.js';

type FormFields = Record<string, unknown>;
type FormFiles = Record<string, unknown>;

const require = createRequire(import.meta.url);
const xlsx = require('xlsx');

const APP_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const prismaClientPath = path.join(process.cwd(), 'node_modules', '.prisma', 'client');

function pick(row: Record<string, unknown>, keys: string[]) {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}

/** Tray: loja atacado 987162 (pedidos costumam começar com 5); varejo 1178940 (com 2). */
const TRAY_STORE_ID_ATACADO = '987162';
const TRAY_STORE_ID_VAREJO = '1178940';
const TRAY_SOURCE_ATACADO = 'tray_atacado';
const TRAY_SOURCE_VAREJO = 'tray_varejo';
const TRAY_ORDER_SOURCES_LIST = [TRAY_SOURCE_ATACADO, TRAY_SOURCE_VAREJO, 'tray'] as const;

/** Alinhado ao PRD (vendas diárias por canal): não entram em métricas de venda agregadas. */
const ORDER_STATUS_EXCLUDED_FROM_SALES_METRICS: Prisma.OrderWhereInput[] = [
  { status: { contains: 'ancelado', mode: 'insensitive' } },
  { status: { contains: 'Não pago', mode: 'insensitive' } },
  { status: { contains: 'Aguardando pagamento', mode: 'insensitive' } },
  { status: 'Devolvido' },
];

function trayDigitsOnly(s: string): string {
  return String(s || '').replace(/\D/g, '');
}

/** Define o `source` do pedido Tray a partir da planilha (loja) ou do prefixo do número do pedido. */
function resolveTraySubSource(row: Record<string, unknown> | null, orderId: string): string {
  const oid = String(orderId || '').trim();
  const storeVal = row
    ? pick(row, [
        'Loja',
        'Identificador loja',
        'Identificador da loja',
        'ID loja',
        'Id loja',
        'Código loja',
        'Codigo loja',
        'Store ID',
        'Store id',
      ])
    : undefined;
  if (storeVal != null && String(storeVal).trim()) {
    const d = trayDigitsOnly(String(storeVal));
    if (d === TRAY_STORE_ID_ATACADO) return TRAY_SOURCE_ATACADO;
    if (d === TRAY_STORE_ID_VAREJO) return TRAY_SOURCE_VAREJO;
  }
  const first = oid.charAt(0);
  if (first === '5') return TRAY_SOURCE_ATACADO;
  if (first === '2') return TRAY_SOURCE_VAREJO;
  if (oid) console.warn('[tray] Canal não identificado (nem loja nem prefixo 5/2); gravando como tray legado:', oid);
  return 'tray';
}

function isTrayOrderSource(source: string): boolean {
  const s = String(source || '').toLowerCase();
  return s === 'tray' || s === TRAY_SOURCE_ATACADO || s === TRAY_SOURCE_VAREJO;
}

/** Upload de CSV Tray (pedidos ou itens): delimitador `;` e parser de linha Tray. */
function isTrayUploadSource(source: string): boolean {
  return isTrayOrderSource(String(source || '').toLowerCase());
}

function feeChannelForTrayOrder(orderSource: string, orderId: string): string {
  if (orderSource === TRAY_SOURCE_ATACADO || orderSource === TRAY_SOURCE_VAREJO) return orderSource;
  if (orderSource === 'tray') return resolveTraySubSource(null, orderId);
  return orderSource;
}

function channelLabelForChart(source: string): string {
  switch (source) {
    case 'shopee':
      return 'Shopee';
    case 'tiktok':
      return 'TikTok';
    case TRAY_SOURCE_ATACADO:
      return 'Tray Atacado';
    case TRAY_SOURCE_VAREJO:
      return 'Tray Varejo';
    case 'tray':
      return 'Tray';
    default:
      return source.charAt(0).toUpperCase() + source.slice(1);
  }
}

function bucketTrayMetrics(source: string, orderId: string): 'trayAtacado' | 'trayVarejo' | 'trayLegacy' {
  if (source === TRAY_SOURCE_ATACADO) return 'trayAtacado';
  if (source === TRAY_SOURCE_VAREJO) return 'trayVarejo';
  if (source === 'tray') {
    const r = resolveTraySubSource(null, orderId);
    if (r === TRAY_SOURCE_ATACADO) return 'trayAtacado';
    if (r === TRAY_SOURCE_VAREJO) return 'trayVarejo';
    return 'trayLegacy';
  }
  return 'trayLegacy';
}

/** Parsea YYYY-MM-DD como meio-dia UTC para não perder um dia em fusos como Brasil. */
function parseDateOnlyAsNoonUTC(dateStr: string | null | undefined): Date | null {
  if (dateStr == null || String(dateStr).trim() === '') return null;
  const s = String(dateStr).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const d = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseBrNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  
  let s = String(v).trim();
  s = s.replace(/R\$\s?/g, '').replace(/BRL\s?/g, '');
  
  if (!s) return 0;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    s = s.replace(',', '.');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDateFlexible(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  if (!s) return null;

  // IMPORTANT: formatos como "12/01/2026" são ambíguos e o JS costuma interpretar como MM/DD.
  // Se bater com dd/mm/aaaa (com hora opcional), parseamos manualmente primeiro.
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yyyy = Number(m[3]);
    const hh = Number(m[4] ?? 0);
    const min = Number(m[5] ?? 0);
    const ss = Number(m[6] ?? 0);
    const d = new Date(yyyy, mm, dd, hh, min, ss);
    return isNaN(d.getTime()) ? null : d;
  }

  // Para outros formatos (ISO etc.), o parse nativo é OK
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function prettyInspect(obj: unknown) {
  return util.inspect(obj, { depth: 8, colors: false, breakLength: 140 });
}

interface StandardizedSale {
  orderId: string;
  orderDate: Date;
  productName: string;
  quantity: number;
  totalPrice: number;
  status: string;
  source: string;
  freight?: number;
  paymentType?: string; // Pagamento tipo (apenas Tray)
}

interface StandardizedOrderItem {
  orderId: string;
  source: string;
  productCode: string;
  name: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
}

interface StandardizedShopeeItem {
  orderId: string;
  orderDate: Date;
  status: string;
  commissionFee: number | null;
  serviceFee: number | null;
  productCode: string;
  name: string;
  baseName: string;         // nome do produto sem variação
  variationName: string;    // nome da variação (ex: "Preto M")
  skuId: string;            // SKU ID original (pode ser usado como SKU universal)
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  discount: number | null;
  sellerDiscount: number;
  platformDiscount: number;
}

function standardizeShopeeRow(row: Record<string, unknown>): StandardizedShopeeItem | null {
  try {
    const orderIdVal = pick(row, ['ID do pedido', 'ID do Pedido', 'Order ID']);
    const orderDateVal = pick(row, ['Data de criação do pedido', 'Data de Criação do Pedido', 'Created Time']);
    const statusVal = pick(row, ['Status do pedido', 'Status', 'Order Status']);
    const productNameVal = pick(row, ['Nome do Produto', 'Nome do produto', 'Product Name']);
    const variationVal = pick(row, ['Nome da variação', 'Nome da Variação', 'Nome da variacao', 'Variation', 'Variação', 'Variacao', 'Variation Name']);
    const skuIdVal = pick(row, ['Número de referência SKU', 'Numero de referencia SKU', 'Nº de referência do SKU principal', 'SKU ID', 'ID do SKU', 'SKU Reference No.']);
    const qtyVal = pick(row, ['Quantidade', 'Qty', 'Quantity']);
    const priceVal = pick(row, ['SKU Subtotal After Discount', 'Subtotal do produto', 'Valor Total', 'Total global', 'Preço Final Total']);
    const unitPriceVal = pick(row, ['SKU Unit Original Price', 'Preço unitário', 'Preco unitario', 'Unit Price', 'Preço']);
    const platformDiscVal = pick(row, ['SKU Platform Discount']);
    const sellerDiscVal = pick(row, ['SKU Seller Discount']);
    const discountVal = pick(row, ['Desconto', 'Discount', 'Desconto do produto', 'Seller discount']);
    const commissionVal = pick(row, ['Net Commission Fee', 'Taxa de comissão líquida', 'Commission Fee']);
    const serviceVal = pick(row, ['Taxa de serviço bruta', 'Gross service fee', 'Service Fee', 'Taxa de servico bruta']);

    const orderId = orderIdVal ? String(orderIdVal).trim() : '';
    const orderDate = parseDateFlexible(orderDateVal);
    const status = statusVal ? String(statusVal).trim() : 'Desconhecido';
    const productName = productNameVal ? String(productNameVal).trim() : '';
    const variation = variationVal ? String(variationVal).trim() : '';
    const name = variation ? `${productName} - ${variation}` : productName;
    const skuId = skuIdVal ? String(skuIdVal).trim() : '';
    const slug = slugifyProductKey(productName, variation);
    const productCode = skuId
      ? (variation ? `${skuId}_${slugifyProductKey('', variation)}` : skuId)
      : hashToUniqueId(slug);
    const quantity = qtyVal ? parseInt(String(qtyVal), 10) || 0 : 0;
    const totalPrice = parseBrNumber(priceVal);
    const unitPrice = unitPriceVal != null ? parseBrNumber(unitPriceVal) : (quantity > 0 ? totalPrice / quantity : 0);
    const sellerDiscount = Math.abs(parseBrNumber(sellerDiscVal));
    const platformDiscount = Math.abs(parseBrNumber(platformDiscVal));
    const discount = discountVal != null
      ? Math.abs(parseBrNumber(discountVal))
      : sellerDiscount + platformDiscount > 0
        ? sellerDiscount + platformDiscount
        : null;
    const commissionFee = commissionVal != null ? parseBrNumber(commissionVal) : null;
    const serviceFee = serviceVal != null ? parseBrNumber(serviceVal) : null;

    if (!orderId || !orderDate || isNaN(orderDate.getTime())) return null;

    return {
      orderId,
      orderDate,
      status,
      commissionFee,
      serviceFee,
      productCode,
      name,
      baseName: productName,
      variationName: variation,
      skuId: skuId,
      unitPrice,
      quantity,
      totalPrice,
      discount,
      sellerDiscount,
      platformDiscount,
    };
  } catch (e) {
    console.error('Erro ao padronizar linha Shopee:', e);
    return null;
  }
}

const SHOPEE_DUP_PRICE_EPS = 0.02;

/** Duas linhas do mesmo pedido Shopee representando o mesmo SKU (planilha pai + variação ou API/CSV mistos). */
function shopeeOrderItemsDuplicateShape(
  a: { name: string; productCode: string; unitPrice: number; quantity: number; totalPrice: number },
  b: { name: string; productCode: string; unitPrice: number; quantity: number; totalPrice: number },
): boolean {
  const na = String(a.name || '').trim();
  const nb = String(b.name || '').trim();
  const ca = String(a.productCode || '').trim();
  const cb = String(b.productCode || '').trim();
  if (na === nb && ca === cb) return false;
  if (Math.abs(a.unitPrice - b.unitPrice) > SHOPEE_DUP_PRICE_EPS) return false;
  if (ca !== cb && (ca.startsWith(`${cb}_`) || cb.startsWith(`${ca}_`))) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length > nb.length ? na : nb;
  if (longer.startsWith(`${shorter} - `)) return true;
  return false;
}

function clusterShopeeDuplicateIndices<
  T extends { name: string; productCode: string; unitPrice: number; quantity: number; totalPrice: number },
>(items: T[]): number[][] {
  const n = items.length;
  if (n === 0) return [];
  const parent = [...Array(n).keys()];
  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  }
  function union(i: number, j: number) {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (shopeeOrderItemsDuplicateShape(items[i], items[j])) union(i, j);
    }
  }
  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r)!.push(i);
  }
  return [...byRoot.values()];
}

function dedupeShopeeImportRows(rows: StandardizedShopeeItem[]): StandardizedShopeeItem[] {
  const byOrder = new Map<string, StandardizedShopeeItem[]>();
  for (const r of rows) {
    if (!byOrder.has(r.orderId)) byOrder.set(r.orderId, []);
    byOrder.get(r.orderId)!.push(r);
  }
  const out: StandardizedShopeeItem[] = [];
  for (const [, list] of byOrder) {
    const groups = clusterShopeeDuplicateIndices(list);
    for (const g of groups) {
      if (g.length === 1) {
        out.push(list[g[0]]);
      } else {
        const cluster = g.map((i) => list[i]);
        const withVar = cluster.filter((r) => String(r.variationName || '').trim());
        const pool = withVar.length > 0 ? withVar : cluster;
        const pick = pool.slice().sort((x, y) => {
          const ln = y.name.length - x.name.length;
          if (ln !== 0) return ln;
          return String(y.productCode).length - String(x.productCode).length;
        })[0];
        out.push(pick);
      }
    }
  }
  return out;
}

interface StandardizedTiktokItem {
  orderId: string;
  orderDate: Date;
  status: string;
  productCode: string;
  name: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  discount: number | null;
  sellerDiscount: number;
  platformDiscount: number;
}

function standardizeTiktokRow(row: Record<string, unknown>): StandardizedTiktokItem | null {
  try {
    const orderIdVal = pick(row, ['Order ID']);
    const orderDateVal = pick(row, ['Created Time']);
    const statusVal = pick(row, ['Order Status', 'Order Substatus']);
    const productNameVal = pick(row, ['Product Name']);
    const variationVal = pick(row, ['Variation']);
    const skuIdVal = pick(row, ['SKU ID']);
    const sellerSkuVal = pick(row, ['Seller SKU']);
    const qtyVal = pick(row, ['Quantity']);
    const unitPriceVal = pick(row, ['SKU Unit Original Price']);
    const subtotalAfterVal = pick(row, ['SKU Subtotal After Discount']);
    const platformDiscountVal = pick(row, ['SKU Platform Discount']);
    const sellerDiscountVal = pick(row, ['SKU Seller Discount']);

    const orderId = orderIdVal ? String(orderIdVal).trim() : '';
    const orderDate = parseDateFlexible(orderDateVal);
    const status = statusVal ? String(statusVal).trim() : 'Desconhecido';
    const productName = productNameVal ? String(productNameVal).trim() : '';
    const variation = variationVal ? String(variationVal).trim() : '';
    const name = variation ? `${productName} - ${variation}` : productName;
    const productCode = (sellerSkuVal ? String(sellerSkuVal).trim() : null) || (skuIdVal ? String(skuIdVal).trim() : '') || `${orderId}_${(productName || 'item').slice(0, 30)}`;
    const quantity = qtyVal ? parseInt(String(qtyVal), 10) || 0 : 0;
    const unitPrice = parseBrNumber(unitPriceVal);
    const totalPrice = parseBrNumber(subtotalAfterVal);
    const sellerDiscount = Math.abs(parseBrNumber(sellerDiscountVal));
    const platformDiscount = Math.abs(parseBrNumber(platformDiscountVal));
    const discount =
      sellerDiscount + platformDiscount > 0 ? sellerDiscount + platformDiscount : null;

    if (!orderId || !orderDate || isNaN(orderDate.getTime())) return null;

    return {
      orderId,
      orderDate,
      status,
      productCode,
      name,
      unitPrice,
      quantity,
      totalPrice,
      discount: discount !== null && discount > 0 ? discount : null,
      sellerDiscount,
      platformDiscount,
    };
  } catch (e) {
    console.error('Erro ao padronizar linha TikTok:', e);
    return null;
  }
}
function parseTimeToParts(v: unknown): { hh: number; mm: number; ss: number } | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return { hh: Number(m[1]), mm: Number(m[2]), ss: Number(m[3] ?? 0) };
}

function parseDateAndTime(dateVal: unknown, timeVal: unknown): Date | null {
  const d = parseDateFlexible(dateVal);
  if (!d) return null;
  const t = parseTimeToParts(timeVal);
  if (!t) return d;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.hh, t.mm, t.ss);
}

function monthStartFromYYYYMM(v: string): Date | null {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]) - 1;
  const d = new Date(yyyy, mm, 1);
  return isNaN(d.getTime()) ? null : d;
}

/** Início do dia local para YYYY-MM-DD (validação de calendário). */
function dateStartFromYYYYMMDD(v: string): Date | null {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]) - 1;
  const dd = Number(m[3]);
  const d = new Date(yyyy, mm, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm || d.getDate() !== dd) return null;
  return d;
}

/** Mesmo filtro de pedidos usado em GET /api/simulation (mês + canal + status). */
function buildSimulationOrderWhere(monthStart: Date, channelRaw: string): any {
  const channel = String(channelRaw || 'all').trim().toLowerCase();
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const orderWhere: any = {
    orderDate: { gte: monthStart, lt: monthEnd },
    NOT: [...ORDER_STATUS_EXCLUDED_FROM_SALES_METRICS],
  };
  if (channel !== 'all') {
    if (channel === 'tray') {
      orderWhere.source = { in: [...TRAY_ORDER_SOURCES_LIST] };
    } else {
      orderWhere.source = channel;
    }
  }
  return orderWhere;
}

function buildSimulationOrderWhereRange(
  monthStart: Date,
  monthEndInclusive: Date,
  channelRaw: string,
): any {
  const channel = String(channelRaw || 'all').trim().toLowerCase();
  const rangeEnd = new Date(monthEndInclusive.getFullYear(), monthEndInclusive.getMonth() + 1, 1);
  const orderWhere: any = {
    orderDate: { gte: monthStart, lt: rangeEnd },
    NOT: [...ORDER_STATUS_EXCLUDED_FROM_SALES_METRICS],
  };
  if (channel !== 'all') {
    if (channel === 'tray') {
      orderWhere.source = { in: [...TRAY_ORDER_SOURCES_LIST] };
    } else {
      orderWhere.source = channel;
    }
  }
  return orderWhere;
}

function roundMoney(n: number): number {
  return Math.round(Number(n || 0) * 100) / 100;
}

function mapOrderToGrossRevenueRow(o: {
  orderId: string;
  source: string;
  orderDate: Date;
  status: string;
  totalPrice: number | null;
  commissionFee: number | null;
  serviceFee: number | null;
  partnerCommission?: number | null;
  settlementAmount?: number | null;
  paymentId?: string | null;
  items: Array<{
    productCode: string;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    discount: number | null;
    sellerDiscount?: number | null;
    platformDiscount?: number | null;
  }>;
}) {
  const items = o.items.map((i) => {
    const qty = i.quantity || 0;
    const unit = Number(i.unitPrice || 0);
    const sellerDisc = roundMoney(
      Number(i.sellerDiscount ?? 0) > 0
        ? Math.abs(Number(i.sellerDiscount))
        : Number(i.discount ?? 0) > 0 && Number(i.platformDiscount ?? 0) === 0
          ? Math.abs(Number(i.discount))
          : 0,
    );
    return {
      productCode: i.productCode,
      name: i.name,
      quantity: qty,
      unitPrice: roundMoney(unit),
      lineGross: roundMoney(unit * qty),
      sellerDiscount: sellerDisc,
      lineTotal: roundMoney(Number(i.totalPrice || 0)),
    };
  });

  const grossProductSales = roundMoney(items.reduce((s, it) => s + it.lineGross, 0));
  const sellerDiscount = roundMoney(items.reduce((s, it) => s + it.sellerDiscount, 0));
  const commissionFee = roundMoney(Math.abs(Number(o.commissionFee || 0)));
  const serviceFee = roundMoney(Math.abs(Number(o.serviceFee || 0)));
  const partnerCommission = roundMoney(Math.abs(Number(o.partnerCommission || 0)));
  const totalFees = roundMoney(commissionFee + serviceFee + partnerCommission);
  const orderTotal = roundMoney(Number(o.totalPrice || 0));
  const settlementFromIncome =
    o.settlementAmount != null && Number(o.settlementAmount) > 0
      ? roundMoney(Number(o.settlementAmount))
      : null;
  const amountReceived = settlementFromIncome;
  // Com income importado, o valor liquidado do TikTok é a referência (não total do CSV − taxas)
  const amountToReceive =
    settlementFromIncome != null
      ? settlementFromIncome
      : roundMoney(Math.max(0, orderTotal - totalFees));
  const isSettled = amountReceived != null;
  const paymentId = String(o.paymentId ?? '').trim() || null;

  return {
    orderId: o.orderId,
    source: o.source,
    orderDate: o.orderDate.toISOString(),
    status: o.status || '',
    paymentId,
    grossProductSales,
    sellerDiscount,
    commissionFee,
    serviceFee,
    partnerCommission,
    amountToReceive,
    amountReceived,
    isSettled,
    orderTotal,
    items,
    unitsInOrder: items.reduce((s, it) => s + it.quantity, 0),
  };
}

const standardizeData = (row: Record<string, unknown>, source: string): StandardizedSale | null => {
  try {
    if (source === 'shopee') {
      const orderIdVal = pick(row, ['ID do pedido', 'ID do Pedido', 'Order ID']);
      const orderDateVal = pick(row, ['Data de criação do pedido', 'Data de Criação do Pedido', 'Created Time']);
      const productNameVal = pick(row, ['Nome do Produto', 'Nome do produto', 'Product Name']);
      const qtyVal = pick(row, ['Quantidade', 'Qty', 'Quantity']);
      const priceVal = pick(row, ['Subtotal do produto', 'Valor Total', 'Total global', 'Preço Final Total']);
      
      // Captura o status da Shopee
      const statusVal = pick(row, ['Status do pedido', 'Status', 'Order Status']);

      const orderId = orderIdVal ? String(orderIdVal).trim() : '';
      const orderDate = parseDateFlexible(orderDateVal);
      const productName = productNameVal ? String(productNameVal).trim() : '';
      const quantity = qtyVal ? parseInt(String(qtyVal), 10) || 0 : 0;
      const totalPrice = parseBrNumber(priceVal);
      const status = statusVal ? String(statusVal).trim() : 'Desconhecido';

      if (!orderId || !orderDate || isNaN(orderDate.getTime())) return null;

      return {
        orderId,
        orderDate,
        productName,
        quantity,
        totalPrice,
        status, // <--- Incluindo no objeto
        source: 'shopee',
      };
    }

    if (source === 'tiktok') {
      if (!row['Order ID']) return null;
      const statusVal = pick(row, ['Order Status', 'Status', 'Order status']);
      return {
        orderId: String(row['Order ID']),
        orderDate: new Date(String(row['Created Time'] ?? '')),
        productName: String(row['Product Name'] ?? ''),
        quantity: parseInt(String(row['Quantity'] ?? '0'), 10) || 0,
        totalPrice: parseBrNumber(row['Order Amount']),
        status: statusVal ? String(statusVal).trim() : 'Desconhecido',
        source: 'tiktok',
      };
    }

    if (isTrayUploadSource(source)) {
      // CSV template: "Pedido";"Data";"Hora";"Frete valor"; ... ;"Status pedido"; ... ;"Total"; ...
      const orderIdVal = pick(row, ['Pedido', 'pedido', 'Order ID']);
      const orderDateVal = pick(row, ['Data', 'data']);
      const orderTimeVal = pick(row, ['Hora', 'hora']);
      const totalVal = pick(row, ['Total', 'total', 'Subtotal produtos', 'Subtotal produtos ']);
      const freightVal = pick(row, ['Frete valor', 'Frete', 'Valor frete']);
      const paymentTypeVal = pick(row, ['Pagamento tipo', 'Pagamento', 'Forma pagamento paga']);
      const statusVal = pick(row, ['Status pedido', 'Status', 'Status do pedido']);
      const channelVal = pick(row, ['Canal de venda', 'Canal', 'Canal']);

      const orderId = orderIdVal ? String(orderIdVal).trim() : '';
      const orderDate = parseDateAndTime(orderDateVal, orderTimeVal);
      const totalPrice = parseBrNumber(totalVal);
      const freight = freightVal != null ? parseBrNumber(freightVal) : undefined;
      const paymentType = paymentTypeVal ? String(paymentTypeVal).trim() : undefined;
      const status = statusVal ? String(statusVal).trim() : 'Desconhecido';

      if (!orderId || !orderDate || isNaN(orderDate.getTime())) return null;

      const srcLower = String(source).trim().toLowerCase();
      const traySource =
        srcLower === TRAY_SOURCE_ATACADO || srcLower === TRAY_SOURCE_VAREJO
          ? srcLower
          : resolveTraySubSource(row, orderId);
      const productName =
        channelVal && String(channelVal).trim()
          ? `Pedido (${String(channelVal).trim()})`
          : traySource === TRAY_SOURCE_ATACADO
            ? 'Pedido (Tray Atacado)'
            : traySource === TRAY_SOURCE_VAREJO
              ? 'Pedido (Tray Varejo)'
              : 'Pedido (Tray)';

      return {
        orderId,
        orderDate,
        productName,
        quantity: 1,
        totalPrice,
        status,
        source: traySource,
        freight,
        paymentType,
      };
    }

    return null;
  } catch (e) {
    console.error('Erro ao padronizar linha:', prettyInspect({ row, source, e }));
    return null;
  }
};

const standardizeTrayItem = (row: Record<string, unknown>, uploadTraySource: string): StandardizedOrderItem | null => {
  try {
    // CSV: "Código pedido";"Nome produto";"Preço venda";"Quantidade";"Código produto"
    
    const orderIdVal = pick(row, ['Código pedido', 'Codigo pedido', 'C�digo pedido', 'Pedido', 'orderId']);
    const productCodeVal = pick(row, ['Código produto', 'Codigo produto', 'C�digo produto']);
    const nameVal = pick(row, ['Nome produto', 'Nome do Produto', 'Produto']);
    const unitPriceVal = pick(row, ['Preço venda', 'Preco venda', 'Pre�o venda', 'Valor']);
    const qtyVal = pick(row, ['Quantidade', 'Qtd', 'Quantity']);

    const orderId = orderIdVal ? String(orderIdVal).trim() : '';
    const productCode = productCodeVal ? String(productCodeVal).trim() : '';
    const nameRaw = nameVal ? String(nameVal) : '';
    const name = nameRaw
      .replace(/<br\s*\/?>/gi, '')
      .replace(/\s*\(Disponibilidade[^)]*\)/gi, '')
      .replace(/\s*\(Imediata\)/gi, '')
      .trim();
    const unitPrice = parseBrNumber(unitPriceVal);
    const quantity = qtyVal ? parseInt(String(qtyVal), 10) || 0 : 0;

    if (!orderId || !productCode || !name) return null;
    if (quantity <= 0) return null;

    const us = String(uploadTraySource || 'tray').trim().toLowerCase();
    const traySource =
      us === TRAY_SOURCE_ATACADO || us === TRAY_SOURCE_VAREJO ? us : resolveTraySubSource(row, orderId);

    return {
      orderId,
      source: traySource,
      productCode,
      name,
      unitPrice,
      quantity,
      totalPrice: Number((unitPrice * quantity).toFixed(2)),
    };
  } catch (e) {
    console.error('Erro ao padronizar item Tray:', prettyInspect({ row, e }));
    return null;
  }
};

function first<T>(v: T | T[] | undefined): T | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function getFileFromFormidable(files: FormFiles) {
  const filesObj = files as unknown as Record<string, any>;
  const keys = Object.keys(filesObj || {});
  if (keys.length === 0) return { key: undefined as string | undefined, file: undefined as any };
  const key = keys[0];
  const uploaded = filesObj[key];
  const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;
  return { key, file };
}

function getFilePath(file: any): string | undefined {
  if (!file) return undefined;
  return file.filepath || file.path || file.filePath || file.tempFilePath;
}

function monthKeyFromAnyDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const m1 = s.match(/^(\d{4})-(\d{2})/);
  if (m1) return `${m1[1]}-${m1[2]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (typeof v === 'number') {
    // Excel serial date (best-effort)
    const jsDate = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) return `${jsDate.getFullYear()}-${String(jsDate.getMonth() + 1).padStart(2, '0')}`;
  }
  return null;
}

function parseShopeeAdsWalletReport(filepath: string) {
  const ext = String(path.extname(filepath || '')).toLowerCase();
  const workbook =
    ext === '.csv'
      ? xlsx.readFile(filepath, { FS: ',', raw: true })
      : xlsx.readFile(filepath, { raw: true });

  const sheetName = workbook.SheetNames[0];
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];

  const headerIdx = rows.findIndex((r) => {
    const a = (r || []).map((c) => String(c ?? '').trim());
    return a.includes('Data') && a.includes('Descrição') && a.includes('Valor');
  });
  if (headerIdx < 0) {
    return { byMonth: new Map<string, number>(), matchedRows: 0, total: 0, message: 'Cabeçalho não encontrado.' };
  }

  const header = (rows[headerIdx] || []).map((c) => String(c ?? '').trim());
  const col = (name: string) => header.findIndex((h) => h === name);
  const idxData = col('Data');
  const idxTipo = col('Tipo de transação');
  const idxDesc = col('Descrição');
  const idxValor = col('Valor');

  if (idxData < 0 || idxDesc < 0 || idxValor < 0) {
    return { byMonth: new Map<string, number>(), matchedRows: 0, total: 0, message: 'Colunas obrigatórias ausentes.' };
  }

  const wantText = 'Pagamento no Saldo da Carteira - Recarga por compra de ADS'.toLowerCase();
  const byMonth = new Map<string, number>();
  let matchedRows = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const dateVal = r[idxData];
    const monthKey = monthKeyFromAnyDate(dateVal);
    if (!monthKey) continue;

    const tipo = idxTipo >= 0 ? String(r[idxTipo] ?? '').trim() : '';
    const desc = String(r[idxDesc] ?? '').trim();
    const combined = `${tipo} - ${desc}`.toLowerCase();

    const isMatch =
      combined.includes(wantText) ||
      (desc.toLowerCase().includes('recarga por compra de ads') &&
        tipo.toLowerCase().includes('saldo da carteira') &&
        tipo.toLowerCase().includes('pagamento'));

    if (!isMatch) continue;

    const rawVal = r[idxValor];
    const value = typeof rawVal === 'number' ? rawVal : parseBrNumber(rawVal);
    const amount = Math.abs(Number(value || 0));
    if (!amount) continue;

    matchedRows++;
    byMonth.set(monthKey, Number(((byMonth.get(monthKey) || 0) + amount).toFixed(2)));
  }

  const total = Number([...byMonth.values()].reduce((a, b) => a + b, 0).toFixed(2));
  return { byMonth, matchedRows, total, message: '' };
}

function slugifyProductKey(name: string, variation: string): string {
  const s = `${name}${variation ? '_' + variation : ''}`.trim();
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'item';
}

function hashToUniqueId(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return String(Math.abs(h));
}

interface EnsureProductOpts {
  sku?: string | null;
  variationName?: string | null;
  parentCode?: string | null;
}

async function ensureProduct(
  prisma: any,
  source: string,
  productCode: string,
  name: string,
  opts?: EnsureProductOpts,
): Promise<number> {
  const code = `${source}_${String(productCode).trim()}`;
  const extra: Record<string, unknown> = {};
  if (opts?.variationName) extra.variationName = opts.variationName;
  if (opts?.parentCode) extra.parentCode = opts.parentCode;
  if (opts?.sku) extra.sku = opts.sku;

  const p = await prisma.product.upsert({
    where: { code },
    update: { name, ...extra },
    create: { code, name, source, ...extra },
  });
  return p.id;
}

/** Auto-create a ProductGroup for variations that share the same parentCode */
async function autoGroupVariations(prisma: any, parentCode: string, groupName: string) {
  const products = await prisma.product.findMany({
    where: { parentCode },
    include: { productGroupItem: true },
  });

  const ungrouped = products.filter((p: any) => !p.productGroupItem);
  if (ungrouped.length < 2) return;

  // Build a descriptive group name that includes variation names
  const variations = products
    .map((p: any) => p.variationName)
    .filter(Boolean)
    .sort();
  const fullGroupName = variations.length > 0
    ? `${groupName} (${variations.join(', ')})`
    : groupName;

  const alreadyGrouped = products.find((p: any) => p.productGroupItem);
  let groupId: number;

  if (alreadyGrouped) {
    groupId = alreadyGrouped.productGroupItem.productGroupId;
    // Update group name to reflect current variations
    await prisma.productGroup.update({
      where: { id: groupId },
      data: { name: fullGroupName },
    });
  } else {
    const group = await prisma.productGroup.create({ data: { name: fullGroupName } });
    groupId = group.id;
  }

  for (const p of ungrouped) {
    await prisma.productGroupItem.upsert({
      where: { productId: p.id },
      update: { productGroupId: groupId },
      create: { productGroupId: groupId, productId: p.id },
    });
  }
}

async function main() {
  console.log('Node:', process.version);
  
  if (!fs.existsSync(prismaClientPath)) {
    console.warn('Warning: Prisma client folder not found.');
  }

  const prisma = new PrismaClient();
  await prisma.$connect();
  console.log('prisma.$connect() OK');

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post('/api/upload', (req, res) => {
    const form = formidable({ multiples: false, keepExtensions: true });

    form.parse(req, async (err: unknown, fields: FormFields, files: FormFields) => {
      if (err) return res.status(500).json({ message: 'Erro no form.' });

      try {
        const { key: fileKey, file } = getFileFromFormidable(files);
        if (!file) return res.status(400).json({ message: 'Arquivo não enviado.' });

        const filepath = getFilePath(file);
        if (!filepath) return res.status(400).json({ message: 'Caminho do arquivo não encontrado.' });

        const sourceRaw = (fields as any).source;
        const source = String(first(sourceRaw) ?? '')
          .trim()
          .toLowerCase() as string;

        const allowedUpload = ['shopee', 'tiktok', 'tray', TRAY_SOURCE_ATACADO, TRAY_SOURCE_VAREJO];
        if (!source || !allowedUpload.includes(source)) {
          return res.status(400).json({ message: 'Source inválido.' });
        }

        const ext = String(path.extname(filepath || '')).toLowerCase();
        // CSV: Tray usa ';', TikTok/Shopee usam ','
        const workbook =
          ext === '.csv'
            ? xlsx.readFile(filepath, { FS: isTrayUploadSource(source) ? ';' : ',', raw: true })
            : xlsx.readFile(filepath);
        const sheetName = workbook.SheetNames[0];
        const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
          defval: '',
          raw: true,
        }) as Record<string, unknown>[];

        if (source === 'shopee') {
          const rowsRaw = jsonData
            .map((row) => standardizeShopeeRow(row))
            .filter((r): r is StandardizedShopeeItem => r !== null);
          // Planilha Shopee costuma trazer linha "pai" (só nome do produto) + linha da variação — mesma venda, mesmo preço.
          const rows = dedupeShopeeImportRows(rowsRaw);

          const byOrder = new Map<string, {
            orderDate: Date;
            status: string;
            commissionFee: number | null;
            serviceFee: number | null;
            totalPrice: number;
            productName: string;
            quantity: number;
          }>();
          for (const r of rows) {
            const key = r.orderId;
            if (!byOrder.has(key)) {
              byOrder.set(key, {
                orderDate: r.orderDate,
                status: r.status,
                commissionFee: r.commissionFee,
                serviceFee: r.serviceFee,
                totalPrice: 0,
                productName: r.name,
                quantity: 0,
              });
            }
            const agg = byOrder.get(key)!;
            agg.totalPrice += r.totalPrice;
            agg.quantity += r.quantity;
          }

          const ops: any[] = [];
          for (const [orderId, agg] of byOrder.entries()) {
            ops.push(
              prisma.order.upsert({
                where: { orderId_source: { orderId, source: 'shopee' } },
                update: {
                  orderDate: agg.orderDate,
                  status: agg.status,
                  totalPrice: Number(agg.totalPrice.toFixed(2)),
                  quantity: agg.quantity,
                  productName: agg.productName,
                  commissionFee: agg.commissionFee,
                  serviceFee: agg.serviceFee,
                },
                create: {
                  orderId,
                  source: 'shopee',
                  orderDate: agg.orderDate,
                  status: agg.status,
                  totalPrice: Number(agg.totalPrice.toFixed(2)),
                  quantity: agg.quantity,
                  productName: agg.productName,
                  commissionFee: agg.commissionFee,
                  serviceFee: agg.serviceFee,
                },
              })
            );
          }
          const productIds = new Map<string, number>();
          const parentNames = new Map<string, string>(); // parentCode → baseName
          for (const r of rows) {
            const key = `shopee_${r.productCode}`;
            if (!productIds.has(key)) {
              const parentCode = r.variationName ? `shopee_base_${slugifyProductKey(r.baseName, '')}` : undefined;
              const id = await ensureProduct(prisma, 'shopee', r.productCode, r.name, {
                variationName: r.variationName || null,
                parentCode: parentCode || null,
                sku: r.skuId || null,
              });
              productIds.set(key, id);
              if (parentCode && r.baseName) parentNames.set(parentCode, r.baseName);
            }
          }
          // Auto-group variations by parent product
          for (const [parentCode, baseName] of parentNames.entries()) {
            await autoGroupVariations(prisma, parentCode, baseName);
          }
          for (const r of rows) {
            const productId = productIds.get(`shopee_${r.productCode}`);
            ops.push(
              (prisma as any).orderItem.upsert({
                where: { orderId_source_productCode: { orderId: r.orderId, source: 'shopee', productCode: r.productCode } },
                update: {
                  name: r.name,
                  unitPrice: r.unitPrice,
                  quantity: r.quantity,
                  totalPrice: r.totalPrice,
                  discount: r.discount,
                  sellerDiscount: r.sellerDiscount,
                  platformDiscount: r.platformDiscount,
                  productId,
                },
                create: {
                  orderId: r.orderId,
                  source: 'shopee',
                  productCode: r.productCode,
                  name: r.name,
                  unitPrice: r.unitPrice,
                  quantity: r.quantity,
                  totalPrice: r.totalPrice,
                  discount: r.discount ?? 0,
                  sellerDiscount: r.sellerDiscount,
                  platformDiscount: r.platformDiscount,
                  productId,
                },
              })
            );
          }
          const results = await prisma.$transaction(ops);
          return res.status(200).json({
            message: 'Processado com sucesso.',
            count: results.length,
          });
        }

        if (source === 'tiktok') {
          const rows = jsonData
            .map((row) => standardizeTiktokRow(row))
            .filter((r): r is StandardizedTiktokItem => r !== null);

          const byOrder = new Map<string, {
            orderDate: Date;
            status: string;
            orderAmount: number;
            productName: string;
            quantity: number;
          }>();
          for (const r of rows) {
            const key = r.orderId;
            if (!byOrder.has(key)) {
              const firstMatch = jsonData.find((row) => String(row['Order ID'] ?? '').trim() === key);
              const orderAmount = parseBrNumber(firstMatch?.['Order Amount']);
              byOrder.set(key, {
                orderDate: r.orderDate,
                status: r.status,
                orderAmount,
                productName: r.name,
                quantity: 0,
              });
            }
            byOrder.get(key)!.quantity += r.quantity;
          }

          const ops: any[] = [];
          for (const [orderId, agg] of byOrder.entries()) {
            const orderTotal = agg.orderAmount > 0 ? agg.orderAmount : rows.filter((r) => r.orderId === orderId).reduce((s, r) => s + r.totalPrice, 0);
            ops.push(
              prisma.order.upsert({
                where: { orderId_source: { orderId, source: 'tiktok' } },
                update: {
                  orderDate: agg.orderDate,
                  status: agg.status,
                  totalPrice: Number(orderTotal.toFixed(2)),
                  quantity: agg.quantity,
                  productName: agg.productName,
                },
                create: {
                  orderId,
                  source: 'tiktok',
                  orderDate: agg.orderDate,
                  status: agg.status,
                  totalPrice: Number(orderTotal.toFixed(2)),
                  quantity: agg.quantity,
                  productName: agg.productName,
                },
              })
            );
          }
          const productIds = new Map<string, number>();
          for (const r of rows) {
            const key = `tiktok_${r.productCode}`;
            if (!productIds.has(key)) {
              const id = await ensureProduct(prisma, 'tiktok', r.productCode, r.name);
              productIds.set(key, id);
            }
          }
          for (const r of rows) {
            const productId = productIds.get(`tiktok_${r.productCode}`);
            ops.push(
              (prisma as any).orderItem.upsert({
                where: { orderId_source_productCode: { orderId: r.orderId, source: 'tiktok', productCode: r.productCode } },
                update: {
                  name: r.name,
                  unitPrice: r.unitPrice,
                  quantity: r.quantity,
                  totalPrice: r.totalPrice,
                  discount: r.discount,
                  sellerDiscount: r.sellerDiscount,
                  platformDiscount: r.platformDiscount,
                  productId,
                },
                create: {
                  orderId: r.orderId,
                  source: 'tiktok',
                  productCode: r.productCode,
                  name: r.name,
                  unitPrice: r.unitPrice,
                  quantity: r.quantity,
                  totalPrice: r.totalPrice,
                  discount: r.discount ?? 0,
                  sellerDiscount: r.sellerDiscount,
                  platformDiscount: r.platformDiscount,
                  productId,
                },
              })
            );
          }
          const results = await prisma.$transaction(ops);
          return res.status(200).json({ message: 'Processado com sucesso.', count: results.length });
        }

        const standardizedSales = jsonData
          .map((row) => standardizeData(row, source))
          .filter((sale): sale is StandardizedSale => sale !== null);

        // Mesmo número de pedido em `tray` (legado) + em tray_atacado/tray_varejo contava duas vezes nos KPIs.
        // Ao importar com subcanal explícito ou automático que grava atacado/varejo, remove o legado equivalente.
        const splitTrayOrderIds = [
          ...new Set(
            standardizedSales
              .filter((s) => s.source === TRAY_SOURCE_ATACADO || s.source === TRAY_SOURCE_VAREJO)
              .map((s) => s.orderId)
          ),
        ];
        if (splitTrayOrderIds.length > 0) {
          const CHUNK = 500;
          let removed = 0;
          for (let i = 0; i < splitTrayOrderIds.length; i += CHUNK) {
            const chunk = splitTrayOrderIds.slice(i, i + CHUNK);
            const r = await prisma.order.deleteMany({
              where: { source: 'tray', orderId: { in: chunk } },
            });
            removed += r.count;
          }
          if (removed > 0) {
            console.log(
              `[tray] Removidos ${removed} pedido(s) com source=tray legado (mesmo código já existe como atacado/varejo neste arquivo).`
            );
          }
        }

        const operations = standardizedSales.map((sale) => {
          const data: any = {
            orderId: sale.orderId,
            source: sale.source,
            orderDate: sale.orderDate,
            productName: sale.productName,
            quantity: sale.quantity,
            totalPrice: sale.totalPrice,
            status: sale.status,
          };
          if (isTrayOrderSource(sale.source)) {
            if (sale.freight != null) data.freight = sale.freight;
            if (sale.paymentType != null) data.paymentType = sale.paymentType;
          }
          return prisma.order.upsert({
            where: {
              orderId_source: {
                orderId: sale.orderId,
                source: sale.source,
              },
            },
            update: data,
            create: data,
          });
        });

        console.log(`Processando ${operations.length} registros...`);
        const results = await prisma.$transaction(operations);

        return res.status(200).json({
          message: 'Processado com sucesso.',
          count: results.length,
        });

      } catch (e) {
        console.error(e);
        return res.status(500).json({ message: 'Erro interno.' });
      }
    });
  });

  // Upload de itens/produtos vendidos (Tray)
  app.post('/api/upload-items', (req, res) => {
    const form = formidable({ multiples: false, keepExtensions: true });

    form.parse(req, async (err: unknown, fields: FormFields, files: FormFields) => {
      if (err) return res.status(500).json({ message: 'Erro no form.' });

      try {
        const { file } = getFileFromFormidable(files as any);
        if (!file) return res.status(400).json({ message: 'Arquivo não enviado.' });

        const filepath = getFilePath(file);
        if (!filepath) return res.status(400).json({ message: 'Caminho do arquivo não encontrado.' });

        const sourceRaw = (fields as any).source;
        const source = String(first(sourceRaw) ?? '').trim().toLowerCase();
        const allowedItems = ['tray', TRAY_SOURCE_ATACADO, TRAY_SOURCE_VAREJO];
        if (!allowedItems.includes(source)) {
          return res.status(400).json({ message: 'Source inválido (use tray, tray_atacado ou tray_varejo).' });
        }

        const ext = String(path.extname(filepath || '')).toLowerCase();
        const workbook =
          ext === '.csv'
            ? xlsx.readFile(filepath, { FS: ';', raw: true })
            : xlsx.readFile(filepath);

        const sheetName = workbook.SheetNames[0];
        const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
          defval: '',
          raw: true,
        }) as Record<string, unknown>[];

        const items = jsonData
          .map((row) => standardizeTrayItem(row, source))
          .filter((it): it is StandardizedOrderItem => it !== null);

        // Agrupar por pedido para atualizar metadados no Order (sem alterar totalPrice,
        // pois o canal Tray pode ter desconto progressivo e o total correto vem da planilha de pedidos)
        const byOrder = new Map<string, { qty: number; firstName: string }>();
        for (const it of items) {
          const k = it.orderId;
          const prev = byOrder.get(k);
          if (!prev) byOrder.set(k, { qty: it.quantity, firstName: it.name });
          else byOrder.set(k, { qty: prev.qty + it.quantity, firstName: prev.firstName });
        }

        const productIds = new Map<string, number>();
        for (const it of items) {
          const key = `tray_${it.productCode}`;
          if (!productIds.has(key)) {
            const id = await ensureProduct(prisma, 'tray', it.productCode, it.name);
            productIds.set(key, id);
          }
        }

        const ops: any[] = [];

        // upsert item por (orderId, source, productCode)
        for (const it of items) {
          const productId = productIds.get(`tray_${it.productCode}`);
          ops.push(
            (prisma as any).orderItem.upsert({
              where: { orderId_source_productCode: { orderId: it.orderId, source: it.source, productCode: it.productCode } },
              update: {
                name: it.name,
                unitPrice: it.unitPrice,
                quantity: it.quantity,
                totalPrice: it.totalPrice,
                productId,
              },
              create: { ...it, productId },
            })
          );
        }

        // Atualiza o Order somando itens (se o pedido existir)
        const orderIdToSources = new Map<string, Set<string>>();
        for (const it of items) {
          if (!orderIdToSources.has(it.orderId)) orderIdToSources.set(it.orderId, new Set());
          orderIdToSources.get(it.orderId)!.add(it.source);
        }
        for (const [orderId, agg] of byOrder.entries()) {
          const sources = orderIdToSources.get(orderId);
          const list = sources ? [...sources] : [resolveTraySubSource(null, orderId)];
          for (const src of list) {
            ops.push(
              prisma.order.updateMany({
                where: { orderId, source: src },
                data: {
                  quantity: agg.qty,
                  productName: agg.firstName,
                },
              })
            );
          }
        }

        const results = await prisma.$transaction(ops);
        const updatedOrders = results.filter((r: any) => r && typeof r.count === 'number').reduce((a: number, r: any) => a + r.count, 0);

        return res.status(200).json({
          message: 'Itens processados com sucesso.',
          items: items.length,
          ordersUpdated: updatedOrders,
        });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ message: 'Erro interno.' });
      }
    });
  });

  app.get('/api/sales', async (_req, res) => {
    try {
      const sales = await prisma.order.findMany({ orderBy: { orderDate: 'desc' } });
      return res.status(200).json(sales);
    } catch (e) {
      return res.status(500).json({ message: 'Erro ao buscar vendas.' });
    }
  });

  app.get('/api/products', async (req, res) => {
    try {
      const q = String(req.query.q ?? '').trim();
      const where = q ? {
        OR: [
          { code: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      } : {};
      const rows = await (prisma as any).product.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { _count: { select: { orderItems: true } } },
      });
      return res.status(200).json(rows);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar produtos.' });
    }
  });

  app.post('/api/products', async (req, res) => {
    try {
      const { code, name, costPrice, source } = req.body ?? {};
      const c = String(code ?? '').trim();
      const n = String(name ?? '').trim();
      const src = String(source ?? '').trim().toLowerCase();
      if (!c || !n) return res.status(400).json({ message: 'code e name obrigatórios.' });
      const lookupCode = src ? `${src}_${c}` : c;
      const row = await (prisma as any).product.upsert({
        where: { code: lookupCode },
        update: { name: n, costPrice: costPrice != null ? parseBrNumber(costPrice) : null, source: src },
        create: { code: lookupCode, name: n, costPrice: costPrice != null ? parseBrNumber(costPrice) : null, source: src },
      });
      return res.status(200).json(row);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao salvar produto.' });
    }
  });

  app.put('/api/products/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { name, costPrice } = req.body ?? {};
      const data: any = {};
      if (name != null) data.name = String(name);
      if (costPrice !== undefined) data.costPrice = costPrice === null ? null : parseBrNumber(costPrice);
      const row = await (prisma as any).product.update({ where: { id }, data });
      return res.status(200).json(row);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao atualizar produto.' });
    }
  }); 
  // Remove registros por origem (ex.: ?source=tray)
  app.delete('/api/orders', async (req, res) => {
    try {
      const source = String(req.query.source ?? '').trim().toLowerCase();
      if (!source) return res.status(400).json({ message: 'Informe ?source=...' });

      const result = await prisma.order.deleteMany({ where: { source } });
      return res.status(200).json({ message: 'Removido com sucesso.', deleted: result.count, source });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao remover pedidos.' });
    }
  });

  // Remove itens/produtos por origem (ex.: ?source=tray)
  app.delete('/api/order-items', async (req, res) => {
    try {
      const source = String(req.query.source ?? '').trim().toLowerCase();
      if (!source) return res.status(400).json({ message: 'Informe ?source=...' });

      const prismaAny = prisma as any;
      if (!prismaAny.orderItem) {
        return res.status(500).json({ message: 'Model OrderItem não disponível no Prisma Client. Rode prisma generate.' });
      }

      const result = await prismaAny.orderItem.deleteMany({ where: { source } });
      return res.status(200).json({ message: 'Itens removidos com sucesso.', deleted: result.count, source });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao remover itens.' });
    }
  });

  // --- ADS Spend ---
  // GET /api/adspend?from=2026-01&to=2026-12
  app.get('/api/adspend', async (req, res) => {
    try {
      const from = req.query.from ? monthStartFromYYYYMM(String(req.query.from)) : null;
      const to = req.query.to ? monthStartFromYYYYMM(String(req.query.to)) : null;

      const where: any = {};
      if (from || to) {
        where.month = {};
        if (from) where.month.gte = from;
        if (to) where.month.lt = new Date(to.getFullYear(), to.getMonth() + 1, 1);
      }

      const prismaAny = prisma as any;
      const rows = await prismaAny.adSpend.findMany({
        where,
        orderBy: [{ month: 'asc' }, { channel: 'asc' }],
      });
      return res.status(200).json(rows);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar gastos de ADS.' });
    }
  });

  // UPSERT por (month, channel)
  // body: { month: "2026-01", channel: "meta", amount: 1234.56, notes?: "" }
  app.post('/api/adspend', async (req, res) => {
    try {
      const monthStr = String(req.body?.month ?? '');
      const channel = String(req.body?.channel ?? '').trim().toLowerCase();
      const amount = parseBrNumber(req.body?.amount);
      const notes = String(req.body?.notes ?? '');

      const month = monthStartFromYYYYMM(monthStr);
      if (!month) return res.status(400).json({ message: 'month inválido. Use YYYY-MM (ex: 2026-01).' });
      if (!channel) return res.status(400).json({ message: 'channel obrigatório.' });

      const prismaAny = prisma as any;
      if (!prismaAny.adSpend) return res.status(500).json({ message: 'Model AdSpend não disponível. Rode prisma generate.' });

      const row = await prismaAny.adSpend.upsert({
        where: { month_channel: { month, channel } },
        update: { amount, notes },
        create: { month, channel, amount, notes },
      });
      return res.status(200).json(row);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao salvar gasto de ADS.' });
    }
  });

  // DELETE /api/adspend?month=2026-01&channel=meta
  app.delete('/api/adspend', async (req, res) => {
    try {
      const monthStr = String(req.query.month ?? '');
      const channel = String(req.query.channel ?? '').trim().toLowerCase();
      const month = monthStartFromYYYYMM(monthStr);
      if (!month) return res.status(400).json({ message: 'month inválido. Use YYYY-MM.' });
      if (!channel) return res.status(400).json({ message: 'channel obrigatório.' });

      const prismaAny = prisma as any;
      await prismaAny.adSpend.delete({
        where: { month_channel: { month, channel } },
      });
      return res.status(200).json({ message: 'Removido com sucesso.' });
    } catch (e: any) {
      if (String(e?.code || '') === 'P2025') {
        return res.status(200).json({ message: 'Não havia registro para remover.' });
      }
      console.error(e);
      return res.status(500).json({ message: 'Erro ao remover gasto de ADS.' });
    }
  });

  // Limpeza total da tabela AdSpend (registros inconsistentes). Senha em ADS_DELETE_ALL_PASSWORD ou padrão interno.
  app.post('/api/adspend/delete-all', async (req, res) => {
    try {
      const expected = String(process.env.ADS_DELETE_ALL_PASSWORD ?? 'Wmdang12!@');
      const pwd = String((req.body as { password?: string })?.password ?? '');
      if (!pwd || pwd !== expected) {
        return res.status(403).json({ message: 'Senha incorreta.' });
      }
      const prismaAny = prisma as any;
      if (!prismaAny.adSpend) {
        return res.status(500).json({ message: 'Model AdSpend não disponível.' });
      }
      const result = await prismaAny.adSpend.deleteMany({});
      return res.status(200).json({
        message: 'Todos os registros de ADS foram removidos.',
        deleted: result.count,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao remover todos os gastos de ADS.' });
    }
  });

  // Importação de ADS por planilha (inicialmente Shopee)
  // POST /api/adspend/import (multipart/form-data: channel, file)
  app.post('/api/adspend/import', (req, res) => {
    const form = formidable({ multiples: false, keepExtensions: true });

    form.parse(req, async (err: unknown, fields: FormFields, files: FormFiles) => {
      if (err) return res.status(500).json({ message: 'Erro no form.' });

      try {
        const { file } = getFileFromFormidable(files);
        if (!file) return res.status(400).json({ message: 'Arquivo não enviado.' });

        const filepath = getFilePath(file);
        if (!filepath) return res.status(400).json({ message: 'Caminho do arquivo não encontrado.' });

        const channel = String(first((fields as any).channel) ?? '')
          .trim()
          .toLowerCase();

        const mode = String(first((fields as any).mode) ?? 'replace')
          .trim()
          .toLowerCase(); // replace | add
        const dryRunRaw = String(first((fields as any).dryRun) ?? '')
          .trim()
          .toLowerCase();
        const dryRun = dryRunRaw === '1' || dryRunRaw === 'true' || dryRunRaw === 'yes';

        if (!channel) return res.status(400).json({ message: 'channel obrigatório.' });
        if (channel !== 'shopee') return res.status(400).json({ message: 'Por enquanto, a importação suporta apenas o canal shopee.' });
        if (mode !== 'replace' && mode !== 'add') return res.status(400).json({ message: 'mode inválido. Use replace | add.' });

        const { byMonth, matchedRows, total, message } = parseShopeeAdsWalletReport(filepath);
        if (message) return res.status(400).json({ message });
        if (byMonth.size === 0) {
          return res.status(200).json({ message: 'Nenhuma linha de ADS encontrada no arquivo.', dryRun, mode, matchedRows, total, months: [] });
        }

        const prismaAny = prisma as any;
        if (!prismaAny.adSpend) return res.status(500).json({ message: 'Model AdSpend não disponível. Rode prisma generate.' });

        const monthKeys = [...byMonth.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b));
        const monthDates = monthKeys
          .map((k) => ({ k, d: monthStartFromYYYYMM(k) }))
          .filter((x): x is { k: string; d: Date } => !!x.d);

        const existingRows = await prismaAny.adSpend.findMany({
          where: { channel, month: { in: monthDates.map((x) => x.d) } },
        });
        const existingByKey = new Map<string, number>();
        for (const r of existingRows || []) {
          const dt = (r as any).month as Date;
          const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
          existingByKey.set(k, Number((r as any).amount || 0));
        }

        const monthsOut: Array<{ month: string; imported: number; existing: number; result: number }> = [];
        for (const { k, d } of monthDates) {
          const imported = Number(byMonth.get(k) || 0);
          const existing = Number(existingByKey.get(k) || 0);
          const result = mode === 'add' ? Number((existing + imported).toFixed(2)) : imported;
          monthsOut.push({ month: k, imported, existing, result });
        }

        if (!dryRun) {
          for (const m of monthsOut) {
            const month = monthStartFromYYYYMM(m.month);
            if (!month) continue;
            await prismaAny.adSpend.upsert({
              where: { month_channel: { month, channel } },
              update: {
                amount: m.result,
                notes: `Import Shopee (${mode === 'add' ? 'somar' : 'sobrescrever'}): Pagamento no Saldo da Carteira - Recarga por compra de ADS`,
              },
              create: {
                month,
                channel,
                amount: m.result,
                notes: `Import Shopee (${mode === 'add' ? 'somar' : 'sobrescrever'}): Pagamento no Saldo da Carteira - Recarga por compra de ADS`,
              },
            });
          }
        }

        const totalResult = Number(monthsOut.reduce((a, m) => a + (m.result || 0), 0).toFixed(2));
        return res.status(200).json({
          message: dryRun ? 'Pré-visualização concluída.' : 'Importação concluída.',
          channel,
          dryRun,
          mode,
          matchedRows,
          total,
          totalResult,
          months: monthsOut,
        });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ message: 'Erro ao importar ADS por planilha.' });
      }
    });
  });

  // Importação income / liquidação TikTok Shop (xlsx, aba Detalhes do pedido)
  // POST /api/tiktok/income/import (multipart: file)
  app.post('/api/tiktok/income/import', (req, res) => {
    const form = formidable({ multiples: false, keepExtensions: true });

    form.parse(req, async (err: unknown, _fields: FormFields, files: FormFiles) => {
      if (err) return res.status(500).json({ message: 'Erro no form.' });

      try {
        const { file } = getFileFromFormidable(files);
        if (!file) return res.status(400).json({ message: 'Arquivo não enviado.' });

        const filepath = getFilePath(file);
        if (!filepath) return res.status(400).json({ message: 'Caminho do arquivo não encontrado.' });

        const dryRunRaw = String(first((_fields as any).dryRun) ?? '').trim().toLowerCase();
        const dryRun = dryRunRaw === '1' || dryRunRaw === 'true' || dryRunRaw === 'yes';

        const { orders, rawRows, orderRows, message } = parseTikTokIncomeReport(filepath);
        if (message) return res.status(400).json({ message });
        if (orders.length === 0) {
          return res.status(200).json({
            message: 'Nenhum pedido liquidado encontrado na aba Detalhes do pedido.',
            dryRun,
            rawRows,
            orderRows,
            matched: 0,
            notFound: 0,
            updated: 0,
          });
        }

        const orderIds = orders.map((o) => o.orderId);
        const existing = await prisma.order.findMany({
          where: { source: 'tiktok', orderId: { in: orderIds } },
          select: { orderId: true },
        });
        const existingSet = new Set(existing.map((o) => o.orderId));

        let updated = 0;
        const notFoundIds: string[] = [];

        if (!dryRun) {
          for (const row of orders) {
            if (!existingSet.has(row.orderId)) {
              notFoundIds.push(row.orderId);
              continue;
            }
            await prisma.order.update({
              where: { orderId_source: { orderId: row.orderId, source: 'tiktok' } },
              data: {
                settlementAmount: row.settlementAmount,
                commissionFee: row.commissionFee,
                serviceFee: row.serviceFee,
                partnerCommission: row.partnerCommission,
                paymentId: row.paymentId || '',
              },
            });
            updated++;
          }
        }

        const matched = orders.filter((o) => existingSet.has(o.orderId)).length;
        const notFound = orders.length - matched;

        return res.status(200).json({
          message: dryRun
            ? 'Pré-visualização concluída.'
            : `Liquidação TikTok aplicada em ${updated} pedido(s).`,
          dryRun,
          rawRows,
          orderRows,
          ordersInFile: orders.length,
          matched,
          notFound,
          updated: dryRun ? 0 : updated,
          notFoundSample: notFoundIds.slice(0, 20),
          preview: dryRun
            ? orders.slice(0, 10).map((o) => ({
                orderId: o.orderId,
                paymentId: o.paymentId,
                settlementAmount: o.settlementAmount,
                commissionFee: o.commissionFee,
                serviceFee: o.serviceFee,
                partnerCommission: o.partnerCommission,
                exists: existingSet.has(o.orderId),
              }))
            : undefined,
        });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ message: 'Erro ao importar income TikTok.' });
      }
    });
  });

  // Taxas por tipo de pagamento (Tray)
  // GET /api/payment-type-fees?month=2026-01&channel=tray
  app.get('/api/payment-type-fees', async (req, res) => {
    try {
      const monthStr = String(req.query.month ?? '').trim();
      const channel = String(req.query.channel ?? 'tray').trim().toLowerCase();
      const month = monthStartFromYYYYMM(monthStr);
      if (!month) return res.status(400).json({ message: 'Parâmetro month inválido (use YYYY-MM).' });

      const prismaAny = prisma as any;
      const rows = await prismaAny.paymentTypeFee.findMany({
        where: { month, channel },
        orderBy: { paymentType: 'asc' },
      });
      return res.status(200).json(rows);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar taxas por tipo de pagamento.' });
    }
  });

  // POST /api/payment-type-fees - body: { month, channel, paymentType, percent }
  app.post('/api/payment-type-fees', async (req, res) => {
    try {
      const { month: monthStr, channel, paymentType, percent } = req.body ?? {};
      const ch = String(channel ?? 'tray').trim().toLowerCase();
      const allowedFeeChannels = ['tray', TRAY_SOURCE_ATACADO, TRAY_SOURCE_VAREJO];
      if (!allowedFeeChannels.includes(ch)) {
        return res.status(400).json({ message: `channel inválido. Use: ${allowedFeeChannels.join(', ')}.` });
      }
      const pt = String(paymentType ?? '').trim();
      const pct = parseBrNumber(percent ?? 0);
      const month = monthStartFromYYYYMM(String(monthStr ?? ''));
      if (!month) return res.status(400).json({ message: 'month inválido. Use YYYY-MM.' });
      if (!pt) return res.status(400).json({ message: 'paymentType obrigatório.' });

      const prismaAny = prisma as any;
      const row = await prismaAny.paymentTypeFee.upsert({
        where: { month_channel_paymentType: { month, channel: ch, paymentType: pt } },
        update: { percent: pct },
        create: { month, channel: ch, paymentType: pt, percent: pct },
      });
      return res.status(200).json(row);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao salvar taxa.' });
    }
  });

  // DELETE /api/payment-type-fees?month=2026-01&channel=tray&paymentType=...
  app.delete('/api/payment-type-fees', async (req, res) => {
    try {
      const monthStr = String(req.query.month ?? '');
      const channel = String(req.query.channel ?? 'tray').trim().toLowerCase();
      const paymentType = String(req.query.paymentType ?? '').trim();
      const month = monthStartFromYYYYMM(monthStr);
      if (!month) return res.status(400).json({ message: 'month inválido. Use YYYY-MM.' });
      if (!paymentType) return res.status(400).json({ message: 'paymentType obrigatório.' });

      const prismaAny = prisma as any;
      await prismaAny.paymentTypeFee.delete({
        where: { month_channel_paymentType: { month, channel, paymentType } },
      });
      return res.status(200).json({ message: 'Removido com sucesso.' });
    } catch (e: any) {
      if (String(e?.code || '') === 'P2025') {
        return res.status(200).json({ message: 'Não havia registro para remover.' });
      }
      console.error(e);
      return res.status(500).json({ message: 'Erro ao remover taxa.' });
    }
  });

  // GET /api/payment-types - lista tipos de pagamento únicos dos pedidos Tray (para dropdown)
  app.get('/api/payment-types', async (_req, res) => {
    try {
      const rows = await prisma.order.findMany({
        where: { source: { in: [...TRAY_ORDER_SOURCES_LIST] } },
      });
      const seen = new Set<string>();
      for (const r of rows) {
        const pt = (r as any).paymentType;
        if (pt && String(pt).trim()) seen.add(String(pt).trim());
      }
      const types = [...seen].sort();
      return res.status(200).json(types);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar tipos de pagamento.' });
    }
  });

  // --- Estoque (data inicial + baixa por vendas + projeção) ---
  const prismaAny = prisma as any;

  app.get('/api/inventory-config', async (_req, res) => {
    try {
      const row = await prismaAny.inventoryConfig.findFirst({ orderBy: { id: 'desc' } });
      if (!row) return res.status(200).json({ stockStartDate: null });
      const d = new Date(row.stockStartDate);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return res.status(200).json({ stockStartDate: dateStr });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar config de estoque.' });
    }
  });

  app.post('/api/inventory-config', async (req, res) => {
    try {
      const { stockStartDate } = req.body ?? {};
      const dateStr = String(stockStartDate ?? '').trim();
      if (!dateStr) return res.status(400).json({ message: 'stockStartDate obrigatório (YYYY-MM-DD).' });
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return res.status(400).json({ message: 'Data inválida.' });
      const existing = await prismaAny.inventoryConfig.findFirst({ orderBy: { id: 'desc' } });
      if (existing) {
        await prismaAny.inventoryConfig.update({
          where: { id: existing.id },
          data: { stockStartDate: d },
        });
      } else {
        await prismaAny.inventoryConfig.create({ data: { stockStartDate: d } });
      }
      return res.status(200).json({ stockStartDate: dateStr });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao salvar config de estoque.' });
    }
  });

  // Grupos de produtos (consolidar estoque quando o mesmo produto tem nomes diferentes nos canais)
  app.get('/api/product-groups', async (_req, res) => {
    try {
      const prismaAny = prisma as any;
      if (!prismaAny.productGroup) return res.status(200).json([]);
      const groups = await prismaAny.productGroup.findMany({
        include: {
          items: { include: { product: true } },
          stock: true,
        },
        orderBy: { id: 'asc' },
      });
      return res.status(200).json(groups);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar grupos de produtos.' });
    }
  });

  app.post('/api/product-groups', async (req, res) => {
    try {
      const prismaAny = prisma as any;
      if (!prismaAny.productGroup) return res.status(500).json({ message: 'Model ProductGroup não disponível.' });
      const { name, productIds } = req.body ?? {};
      const nameStr = typeof name === 'string' ? name.trim() : '';
      const ids = Array.isArray(productIds) ? productIds.map((x: unknown) => parseInt(String(x), 10)).filter((n: number) => Number.isInteger(n) && n > 0) : [];
      if (!nameStr) return res.status(400).json({ message: 'Nome do grupo é obrigatório.' });
      if (ids.length < 2) return res.status(400).json({ message: 'Selecione pelo menos 2 produtos para formar um grupo.' });
      const group = await prismaAny.productGroup.create({
        data: { name: nameStr },
      });
      for (const pid of ids) {
        await prismaAny.productGroupItem.create({ data: { productGroupId: group.id, productId: pid } });
      }
      const created = await prismaAny.productGroup.findUnique({
        where: { id: group.id },
        include: { items: { include: { product: true } }, stock: true },
      });
      return res.status(201).json(created);
    } catch (e: any) {
      if (e?.code === 'P2002') return res.status(400).json({ message: 'Um dos produtos já pertence a outro grupo.' });
      console.error(e);
      return res.status(500).json({ message: 'Erro ao criar grupo.' });
    }
  });

  app.patch('/api/product-groups/:id', async (req, res) => {
    try {
      const prismaAny = prisma as any;
      const gid = parseInt(req.params.id, 10);
      if (!Number.isInteger(gid) || gid <= 0) return res.status(400).json({ message: 'ID do grupo inválido.' });
      const { name, productIds } = req.body ?? {};
      const updates: { name?: string; items?: { deleteMany: {}; create: { productGroupId: number; productId: number }[] } } = {};
      if (typeof name === 'string' && name.trim()) updates.name = name.trim();
      if (Array.isArray(productIds)) {
        const ids = productIds.map((x: unknown) => parseInt(String(x), 10)).filter((n: number) => Number.isInteger(n) && n > 0);
        if (ids.length >= 2) {
          await prismaAny.productGroupItem.deleteMany({ where: { productGroupId: gid } });
          for (const pid of ids) {
            await prismaAny.productGroupItem.create({ data: { productGroupId: gid, productId: pid } });
          }
        }
      }
      if (Object.keys(updates).length === 0) {
        const g = await prismaAny.productGroup.findUnique({ where: { id: gid }, include: { items: { include: { product: true } }, stock: true } });
        return res.status(200).json(g);
      }
      if (updates.name) await prismaAny.productGroup.update({ where: { id: gid }, data: { name: updates.name } });
      const updated = await prismaAny.productGroup.findUnique({
        where: { id: gid },
        include: { items: { include: { product: true } }, stock: true },
      });
      return res.status(200).json(updated);
    } catch (e: any) {
      if (e?.code === 'P2002') return res.status(400).json({ message: 'Um dos produtos já pertence a outro grupo.' });
      console.error(e);
      return res.status(500).json({ message: 'Erro ao atualizar grupo.' });
    }
  });

  app.delete('/api/product-groups/:id', async (req, res) => {
    try {
      const prismaAny = prisma as any;
      const gid = parseInt(req.params.id, 10);
      if (!Number.isInteger(gid) || gid <= 0) return res.status(400).json({ message: 'ID do grupo inválido.' });
      await prismaAny.productGroup.delete({ where: { id: gid } });
      return res.status(204).send();
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao excluir grupo.' });
    }
  });

  app.put('/api/product-group-stock', async (req, res) => {
    try {
      const prismaAny = prisma as any;
      const { productGroupId, quantity } = req.body ?? {};
      const gid = productGroupId != null ? parseInt(String(productGroupId), 10) : NaN;
      const qty = quantity != null ? parseInt(String(quantity), 10) : 0;
      if (!Number.isInteger(gid) || gid <= 0) return res.status(400).json({ message: 'productGroupId inválido.' });
      const row = await prismaAny.productGroupStock.upsert({
        where: { productGroupId: gid },
        update: { quantity: qty },
        create: { productGroupId: gid, quantity: qty },
      });
      return res.status(200).json(row);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao salvar estoque do grupo.' });
    }
  });

  app.get('/api/product-stock', async (_req, res) => {
    try {
      const rows = await prismaAny.productStock.findMany({
        include: { product: true },
        orderBy: { productId: 'asc' },
      });
      return res.status(200).json(rows);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar estoque por produto.' });
    }
  });

  app.put('/api/product-stock', async (req, res) => {
    try {
      const { productId, quantity } = req.body ?? {};
      const pid = productId != null ? parseInt(String(productId), 10) : NaN;
      const qty = quantity != null ? parseInt(String(quantity), 10) : 0;
      if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ message: 'productId inválido.' });
      const row = await prismaAny.productStock.upsert({
        where: { productId: pid },
        update: { quantity: qty },
        create: { productId: pid, quantity: qty },
      });
      return res.status(200).json(row);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao salvar estoque do produto.' });
    }
  });

  function isOrderValidForStock(o: any): boolean {
    const st = String(o.status || '').toLowerCase();
    if (st.includes('cancelado')) return false;
    if (st.includes('não pago') || st.includes('nao pago')) return false;
    return true;
  }

  app.get('/api/stock-current', async (_req, res) => {
    try {
      const config = await prismaAny.inventoryConfig.findFirst({ orderBy: { id: 'desc' } });
      const stockStartDate = config ? new Date(config.stockStartDate) : null;

      const ordersSince = stockStartDate
        ? await prisma.order.findMany({
            where: { orderDate: { gte: stockStartDate } },
            include: { items: true },
          })
        : [];

      const soldByProduct = new Map<number, number>();
      for (const o of ordersSince) {
        if (!isOrderValidForStock(o)) continue;
        for (const item of o.items) {
          const pid = item.productId;
          if (pid == null) continue;
          soldByProduct.set(pid, (soldByProduct.get(pid) || 0) + (item.quantity || 0));
        }
      }

      const result: any[] = [];
      const productIdsInGroup = new Set<number>();

      if (prismaAny.productGroup) {
        const allGroupItems = await prismaAny.productGroupItem.findMany({
          include: { productGroup: true, product: true },
        });
        allGroupItems.forEach((gi: any) => productIdsInGroup.add(gi.productId));

        const groupStockRows = await prismaAny.productGroupStock.findMany({
          include: {
            productGroup: {
              include: { items: { include: { product: true } } },
            },
          },
          orderBy: { productGroupId: 'asc' },
        });
        for (const gs of groupStockRows) {
          const group = gs.productGroup;
          const groupItems = group?.items ?? [];
          const productIds = groupItems.map((i: any) => i.productId);
          const sold = productIds.reduce((sum: number, pid: number) => sum + (soldByProduct.get(pid) || 0), 0);
          const opening = gs.quantity || 0;
          const current = Math.max(0, opening - sold);
          const firstProduct = groupItems[0]?.product;

          const variations = groupItems.map((gi: any) => ({
            productId: gi.productId,
            name: gi.product?.name ?? '',
            variationName: gi.product?.variationName ?? null,
            source: gi.product?.source ?? '',
            sold: soldByProduct.get(gi.productId) || 0,
          }));

          result.push({
            type: 'group',
            productGroupId: gs.productGroupId,
            productId: null,
            code: null,
            name: group?.name ?? 'Grupo',
            opening,
            sold,
            current,
            costPrice: firstProduct?.costPrice ?? null,
            productNames: groupItems.map((i: any) => i.product?.name).filter(Boolean),
            variations,
          });
        }
      }

      const stockRows = await prismaAny.productStock.findMany({
        include: { product: true },
        orderBy: { productId: 'asc' },
      });
      for (const r of stockRows) {
        if (productIdsInGroup.has(r.productId)) continue;
        const opening = r.quantity || 0;
        const sold = soldByProduct.get(r.productId) || 0;
        const current = Math.max(0, opening - sold);
        result.push({
          type: 'product',
          productGroupId: null,
          productId: r.productId,
          code: r.product?.code,
          name: r.product?.name,
          opening,
          sold,
          current,
          costPrice: r.product?.costPrice,
        });
      }

      result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      return res.status(200).json({
        stockStartDate: stockStartDate ? stockStartDate.toISOString().slice(0, 10) : null,
        items: result,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao calcular estoque atual.' });
    }
  });

    // --- Contas a pagar (Bills) ---
  const updateBillStatus = async (billId: number) => {
    const prismaAny = prisma as any;
    const bill = await prismaAny.bill.findUnique({
      where: { id: billId },
      include: { payments: true },
    });
    if (!bill) return;
    const totalPaid = (bill.payments || []).reduce(
      (s: number, p: any) => s + (p.paidAt != null ? (p.amount || 0) : 0),
      0
    );
    let status = 'pending';
    if (totalPaid >= bill.totalAmount) status = 'paid';
    else if (totalPaid > 0) status = 'partial';
    await prismaAny.bill.update({
      where: { id: billId },
      data: { status },
    });
  };

  app.get('/api/bills', async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
      const prismaAny = prisma as any;
      const where: any = status ? { status } : {};
      const bills = await prismaAny.bill.findMany({
        where,
        include: { payments: { orderBy: { dueDate: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      });
      return res.status(200).json(bills);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar contas a pagar.' });
    }
  });

  app.get('/api/bills/:id', async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });
      const prismaAny = prisma as any;
      const bill = await prismaAny.bill.findUnique({
        where: { id },
        include: { payments: { orderBy: { dueDate: 'asc' } } },
      });
      if (!bill) return res.status(404).json({ message: 'Conta não encontrada.' });
      return res.status(200).json(bill);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar conta.' });
    }
  });

  app.post('/api/bills', async (req, res) => {
    try {
      const description = String(req.body?.description ?? '').trim();
      const invoiceNumber = req.body?.invoiceNumber != null ? String(req.body.invoiceNumber).trim() || null : null;
      const totalAmount = parseBrNumber(req.body?.totalAmount);
      const dueDateStr = req.body?.dueDate ? String(req.body.dueDate).trim() : null;
      const isFixedCost = req.body?.isFixedCost === true || req.body?.isFixedCost === 'true';
      if (!description) return res.status(400).json({ message: 'Descrição obrigatória.' });
      if (totalAmount <= 0) return res.status(400).json({ message: 'Valor total deve ser maior que zero.' });

      const dueDate = parseDateOnlyAsNoonUTC(dueDateStr);

      const prismaAny = prisma as any;
      const bill = await prismaAny.bill.create({
        data: { description, invoiceNumber, totalAmount, dueDate, status: 'pending', isFixedCost },
      });
      return res.status(200).json(bill);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao criar conta a pagar.' });
    }
  });

  app.patch('/api/bills/:id', async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });
      const description = req.body?.description != null ? String(req.body.description).trim() : undefined;
      const invoiceNumber = req.body?.invoiceNumber !== undefined ? (req.body.invoiceNumber ? String(req.body.invoiceNumber).trim() || null : null) : undefined;
      const totalAmount = req.body?.totalAmount != null ? parseBrNumber(req.body.totalAmount) : undefined;
      const dueDateStr = req.body?.dueDate;
      const isFixedCost = req.body?.isFixedCost;

      let dueDate: Date | null | undefined = undefined;
      if (dueDateStr !== undefined) {
        dueDate = dueDateStr === null || dueDateStr === '' ? null : parseDateOnlyAsNoonUTC(dueDateStr) ?? undefined;
      }

      const prismaAny = prisma as any;
      const data: any = {};
      if (description !== undefined) data.description = description;
      if (invoiceNumber !== undefined) data.invoiceNumber = invoiceNumber;
      if (totalAmount !== undefined) data.totalAmount = totalAmount;
      if (dueDate !== undefined) data.dueDate = dueDate;
      if (isFixedCost !== undefined) data.isFixedCost = isFixedCost === true || isFixedCost === 'true';
      const bill = await prismaAny.bill.update({ where: { id }, data });
      await updateBillStatus(id);
      const updated = await prismaAny.bill.findUnique({
        where: { id },
        include: { payments: { orderBy: { dueDate: 'asc' } } },
      });
      return res.status(200).json(updated);
    } catch (e: any) {
      if (String(e?.code) === 'P2025') return res.status(404).json({ message: 'Conta não encontrada.' });
      console.error(e);
      return res.status(500).json({ message: 'Erro ao atualizar conta.' });
    }
  });

  app.delete('/api/bills/:id', async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });
      const prismaAny = prisma as any;
      await prismaAny.bill.delete({ where: { id } });
      return res.status(200).json({ message: 'Removido com sucesso.' });
    } catch (e: any) {
      if (String(e?.code) === 'P2025') return res.status(404).json({ message: 'Conta não encontrada.' });
      console.error(e);
      return res.status(500).json({ message: 'Erro ao remover conta.' });
    }
  });

  app.post('/api/bills/:id/payments', async (req, res) => {
    try {
      const billId = parseInt(String(req.params.id), 10);
      if (isNaN(billId)) return res.status(400).json({ message: 'ID da conta inválido.' });
      const amount = parseBrNumber(req.body?.amount);
      const dueDateStr = String(req.body?.dueDate ?? '').trim();
      const paidAtStr = req.body?.paidAt ? String(req.body.paidAt).trim() : null;
      const notes = String(req.body?.notes ?? '').trim();
      if (amount <= 0) return res.status(400).json({ message: 'Valor da parcela deve ser maior que zero.' });
      const dueDate = parseDateOnlyAsNoonUTC(dueDateStr);
      if (!dueDate) return res.status(400).json({ message: 'Data de vencimento inválida (use YYYY-MM-DD).' });
      const paidAt = parseDateOnlyAsNoonUTC(paidAtStr);


      const prismaAny = prisma as any;
      await prismaAny.billPayment.create({
        data: { billId, amount, dueDate, paidAt, notes },
      });
      await updateBillStatus(billId);
      const bill = await prismaAny.bill.findUnique({
        where: { id: billId },
        include: { payments: { orderBy: { dueDate: 'asc' } } },
      });
      return res.status(200).json(bill);
    } catch (e: any) {
      if (String(e?.code) === 'P2003') return res.status(404).json({ message: 'Conta não encontrada.' });
      console.error(e);
      return res.status(500).json({ message: 'Erro ao registrar parcela.' });
    }
  });

  // Gerar parcelas (até 4 ou mais vencimentos): body { installments: [ { dueDate, amount }, ... ] }
  app.post('/api/bills/:id/installments', async (req, res) => {
    try {
      const billId = parseInt(String(req.params.id), 10);
      if (isNaN(billId)) return res.status(400).json({ message: 'ID da conta inválido.' });
      const installments = req.body?.installments;
      if (!Array.isArray(installments) || installments.length === 0) {
        return res.status(400).json({ message: 'Envie installments: [ { dueDate, amount }, ... ] com ao menos uma parcela.' });
      }

      const prismaAny = prisma as any;
      const bill = await prismaAny.bill.findUnique({ where: { id: billId } });
      if (!bill) return res.status(404).json({ message: 'Conta não encontrada.' });

      for (const item of installments) {
        const dueDateStr = String(item?.dueDate ?? '').trim();
        const amount = parseBrNumber(item?.amount);
        if (amount <= 0) continue;
        const dueDate = parseDateOnlyAsNoonUTC(dueDateStr);
        if (!dueDate) continue;
        await prismaAny.billPayment.create({
          data: { billId, amount, dueDate, paidAt: null, notes: '' },
        });
      }
      await updateBillStatus(billId);
      const updated = await prismaAny.bill.findUnique({
        where: { id: billId },
        include: { payments: { orderBy: { dueDate: 'asc' } } },
      });
      return res.status(200).json(updated);
    } catch (e: any) {
      if (String(e?.code) === 'P2003') return res.status(404).json({ message: 'Conta não encontrada.' });
      console.error(e);
      return res.status(500).json({ message: 'Erro ao gerar parcelas.' });
    }
  });

  app.patch('/api/bills/:id/payments/:paymentId', async (req, res) => {
    try {
      const billId = parseInt(String(req.params.id), 10);
      const paymentId = parseInt(String(req.params.paymentId), 10);
      if (isNaN(billId) || isNaN(paymentId)) return res.status(400).json({ message: 'IDs inválidos.' });
      const amount = req.body?.amount != null ? parseBrNumber(req.body.amount) : undefined;
      const dueDateStr = req.body?.dueDate;
      const paidAtStr = req.body?.paidAt;
      const notes = req.body?.notes !== undefined ? String(req.body.notes).trim() : undefined;
      let dueDate: Date | undefined;
      if (dueDateStr != null) {
        const d = parseDateOnlyAsNoonUTC(dueDateStr);
        if (d) dueDate = d;
      }
      let paidAt: Date | null | undefined = undefined;
      if (paidAtStr !== undefined) {
        paidAt = paidAtStr === null || paidAtStr === '' ? null : parseDateOnlyAsNoonUTC(paidAtStr) ?? undefined;
      }

      const prismaAny = prisma as any;
      const data: any = {};
      if (amount !== undefined) data.amount = amount;
      if (dueDate !== undefined) data.dueDate = dueDate;
      if (paidAt !== undefined) data.paidAt = paidAt;
      if (notes !== undefined) data.notes = notes;
      await prismaAny.billPayment.updateMany({
        where: { id: paymentId, billId },
        data,
      });
      await updateBillStatus(billId);
      const bill = await prismaAny.bill.findUnique({
        where: { id: billId },
        include: { payments: { orderBy: { dueDate: 'asc' } } },
      });
      return res.status(200).json(bill);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao atualizar parcela.' });
    }
  });

  app.delete('/api/bills/:id/payments/:paymentId', async (req, res) => {
    try {
      const billId = parseInt(String(req.params.id), 10);
      const paymentId = parseInt(String(req.params.paymentId), 10);
      if (isNaN(billId) || isNaN(paymentId)) return res.status(400).json({ message: 'IDs inválidos.' });
      const prismaAny = prisma as any;
      await prismaAny.billPayment.deleteMany({ where: { id: paymentId, billId } });
      await updateBillStatus(billId);
      const bill = await prismaAny.bill.findUnique({
        where: { id: billId },
        include: { payments: { orderBy: { dueDate: 'asc' } } },
      });
      return res.status(200).json(bill);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao remover parcela.' });
    }
  });

  app.get('/api/stock-projection', async (_req, res) => {
    try {
      const config = await prismaAny.inventoryConfig.findFirst({ orderBy: { id: 'desc' } });
      const stockStartDate = config ? new Date(config.stockStartDate) : null;

      const orderItems = await prisma.orderItem.findMany({
        where: { productId: { not: null } },
        select: { productId: true, unitPrice: true },
      });
      const avgPriceByProduct = new Map<number, number>();
      const countByProduct = new Map<number, number>();
      for (const i of orderItems) {
        const pid = i.productId!;
        const prevSum = avgPriceByProduct.get(pid) || 0;
        const prevCount = countByProduct.get(pid) || 0;
        avgPriceByProduct.set(pid, prevSum + (i.unitPrice || 0));
        countByProduct.set(pid, prevCount + 1);
      }
      for (const [pid, sum] of avgPriceByProduct) {
        const c = countByProduct.get(pid) || 1;
        avgPriceByProduct.set(pid, c > 0 ? sum / c : 0);
      }

      const ordersSince = stockStartDate
        ? await prisma.order.findMany({
            where: { orderDate: { gte: stockStartDate } },
            include: { items: true },
          })
        : [];
      const soldByProduct = new Map<number, number>();
      for (const o of ordersSince) {
        if (!isOrderValidForStock(o)) continue;
        for (const item of o.items) {
          const pid = item.productId;
          if (pid == null) continue;
          soldByProduct.set(pid, (soldByProduct.get(pid) || 0) + (item.quantity || 0));
        }
      }

      let projectedRevenue = 0;
      let projectedCost = 0;
      const details: any[] = [];
      const productIdsInGroup = new Set<number>();

      if (prismaAny.productGroupItem) {
        const allGroupItems = await prismaAny.productGroupItem.findMany({});
        allGroupItems.forEach((gi: any) => productIdsInGroup.add(gi.productId));
      }
      if (prismaAny.productGroupStock) {
        const groupStockRows = await prismaAny.productGroupStock.findMany({
          include: {
            productGroup: {
              include: { items: { include: { product: true } } },
            },
          },
        });
        for (const gs of groupStockRows) {
          const group = gs.productGroup;
          const productIds = (group?.items ?? []).map((i: any) => i.productId);
          const sold = productIds.reduce((sum: number, pid: number) => sum + (soldByProduct.get(pid) || 0), 0);
          const opening = gs.quantity || 0;
          const current = Math.max(0, opening - sold);
          const items = group?.items ?? [];
          const avgUnitPrice =
            items.length > 0
              ? items.reduce((s: number, i: any) => s + (avgPriceByProduct.get(i.productId) ?? i.product?.costPrice ?? 0), 0) / items.length
              : 0;
          const costPrice = items[0]?.product?.costPrice ?? 0;
          const unitPrice = avgUnitPrice || costPrice || 0;
          projectedRevenue += current * unitPrice;
          projectedCost += current * costPrice;
          details.push({
            type: 'group',
            productGroupId: gs.productGroupId,
            productId: null,
            name: group?.name ?? 'Grupo',
            current,
            unitPrice,
            revenue: Math.round(current * unitPrice * 100) / 100,
          });
        }
      }

      const stockRows = await prismaAny.productStock.findMany({
        include: { product: true },
      });
      for (const r of stockRows) {
        if (productIdsInGroup.has(r.productId)) continue;
        const opening = r.quantity || 0;
        const sold = soldByProduct.get(r.productId) || 0;
        const current = Math.max(0, opening - sold);
        const costPrice = r.product?.costPrice ?? 0;
        const avgUnitPrice = avgPriceByProduct.get(r.productId) ?? costPrice ?? 0;
        const unitPrice = avgUnitPrice || costPrice || 0;
        projectedRevenue += current * unitPrice;
        projectedCost += current * costPrice;
        details.push({
          type: 'product',
          productGroupId: null,
          productId: r.productId,
          name: r.product?.name,
          current,
          unitPrice,
          revenue: Math.round(current * unitPrice * 100) / 100,
        });
      }

      return res.status(200).json({
        stockStartDate: stockStartDate ? stockStartDate.toISOString().slice(0, 10) : null,
        projectedRevenue: Math.round(projectedRevenue * 100) / 100,
        projectedCost: Math.round(projectedCost * 100) / 100,
        details,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao calcular projeção.' });
    }
  });

  // Simulação P&L por mês e canal
  // GET /api/simulation?month=2026-01&channel=shopee|tiktok|tray|tray_atacado|tray_varejo|all
  app.get('/api/simulation', async (req, res) => {
    try {
      const monthStr = String(req.query.month ?? '').trim();
      const channel = String(req.query.channel ?? 'all').trim().toLowerCase();
      const taxPercent = 5;

      const monthStart = monthStartFromYYYYMM(monthStr);
      if (!monthStart) return res.status(400).json({ message: 'Parâmetro month inválido (use YYYY-MM).' });

      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
      const orderWhere = buildSimulationOrderWhere(monthStart, channel);

      const orders = await prisma.order.findMany({
        where: orderWhere,
        include: { items: { include: { product: true } } },
      });

      const totalRevenue = orders.reduce((s, o) => s + (o.totalPrice || 0), 0);

      const isTrayChannelFilter =
        channel === 'tray' || channel === TRAY_SOURCE_ATACADO || channel === TRAY_SOURCE_VAREJO;

      const shopeeFees = isTrayChannelFilter || channel === 'tiktok' ? 0 : orders
        .filter((o) => o.source === 'shopee')
        .reduce((s, o) => s + (o.commissionFee || 0) + (o.serviceFee || 0), 0);

      const tiktokFees = isTrayChannelFilter || channel === 'shopee' ? 0 : orders
        .filter((o) => o.source === 'tiktok')
        .reduce(
          (s, o) =>
            s +
            (o.commissionFee || 0) +
            (o.serviceFee || 0) +
            ((o as { partnerCommission?: number | null }).partnerCommission || 0),
          0,
        );

      const trayOrders = orders.filter((o) => isTrayOrderSource(o.source));

      const feePercentFor = (feeByCh: Map<string, Map<string, number>>, ch: string, pt: string): number => {
        const trimmed = String(pt || '').trim();
        return (
          feeByCh.get(ch)?.get(trimmed) ??
          feeByCh.get('tray')?.get(trimmed) ??
          0
        );
      };

      let cardPix = 0;
      const prismaAnySim = prisma as any;
      if (isTrayChannelFilter || channel === 'all') {
        const feeRows = await prismaAnySim.paymentTypeFee.findMany({
          where: {
            month: monthStart,
            channel: { in: ['tray', TRAY_SOURCE_ATACADO, TRAY_SOURCE_VAREJO] },
          },
        });
        const feeByCh = new Map<string, Map<string, number>>();
        for (const r of feeRows) {
          const ch = String(r.channel || '').trim().toLowerCase();
          if (!feeByCh.has(ch)) feeByCh.set(ch, new Map());
          feeByCh.get(ch)!.set(String(r.paymentType || '').trim(), Number(r.percent || 0));
        }
        for (const o of trayOrders) {
          const pt = String((o as any).paymentType || '').trim();
          const feeCh = feeChannelForTrayOrder(o.source, o.orderId);
          const pct = feePercentFor(feeByCh, feeCh, pt);
          cardPix += (o.totalPrice || 0) * (pct / 100);
        }
      }

      const freight =
        isTrayChannelFilter || channel === 'all'
          ? orders.filter((o) => isTrayOrderSource(o.source)).reduce((s, o) => s + ((o as any).freight || 0), 0)
          : 0;

      const productionCost = orders.reduce((s, o) => {
        for (const item of o.items) {
          const cost = (item.product?.costPrice ?? 0) * (item.quantity || 0);
          s += cost;
        }
        return s;
      }, 0);

      const adSpendWhere: any = {
        month: { gte: monthStart, lt: monthEnd },
      };
      if (channel !== 'all') {
        if (channel === 'tray') {
          adSpendWhere.channel = { in: ['tray', TRAY_SOURCE_ATACADO, TRAY_SOURCE_VAREJO] };
        } else {
          adSpendWhere.channel = channel;
        }
      }
      const adSpendRows = await prismaAnySim.adSpend.findMany({
        where: adSpendWhere,
      });
      const adsSpend = adSpendRows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

      // Fixed cost from Bills with isFixedCost=true, summing BillPayment.amount due in the month
      const fixedCostPayments = await (prisma as any).billPayment.findMany({
        where: {
          dueDate: { gte: monthStart, lt: monthEnd },
          bill: { isFixedCost: true },
        },
        include: { bill: true },
      });
      const fixedCost = fixedCostPayments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

      const allOrdersForProportion = channel !== 'all'
        ? await prisma.order.findMany({
            where: {
              orderDate: { gte: monthStart, lt: monthEnd },
              NOT: [...ORDER_STATUS_EXCLUDED_FROM_SALES_METRICS],
            },
          })
        : orders;
      const totalRevenueAll = allOrdersForProportion.reduce((s, o) => s + (o.totalPrice || 0), 0);
      const fixedCostProportional = totalRevenueAll > 0 && channel !== 'all'
        ? fixedCost * (totalRevenue / totalRevenueAll)
        : fixedCost;

      const tax = totalRevenue * (taxPercent / 100);
      const profit = totalRevenue - adsSpend - shopeeFees - tiktokFees - cardPix - freight - productionCost - fixedCostProportional - tax;
      const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

      return res.status(200).json({
        month: monthStr,
        channel,
        faturamentoBruto: Number(totalRevenue.toFixed(2)),
        adsInvestimento: Number(adsSpend.toFixed(2)),
        adsPercent: totalRevenue > 0 ? Number((adsSpend / totalRevenue * 100).toFixed(2)) : 0,
        taxasShopee: Number(shopeeFees.toFixed(2)),
        taxasShopeePercent: totalRevenue > 0 ? Number((shopeeFees / totalRevenue * 100).toFixed(2)) : 0,
        taxasTiktok: Number(tiktokFees.toFixed(2)),
        taxasTiktokPercent: totalRevenue > 0 ? Number((tiktokFees / totalRevenue * 100).toFixed(2)) : 0,
        taxasCartaoPix: Number(cardPix.toFixed(2)),
        taxasCartaoPixPercent: totalRevenue > 0 ? Number((cardPix / totalRevenue * 100).toFixed(2)) : 0,
        frete: Number(freight.toFixed(2)),
        fretePercent: totalRevenue > 0 ? Number((freight / totalRevenue * 100).toFixed(2)) : 0,
        custoProducao: Number(productionCost.toFixed(2)),
        custoProducaoPercent: totalRevenue > 0 ? Number((productionCost / totalRevenue * 100).toFixed(2)) : 0,
        custoFixo: Number(fixedCostProportional.toFixed(2)),
        custoFixoPercent: totalRevenue > 0 ? Number((fixedCostProportional / totalRevenue * 100).toFixed(2)) : 0,
        imposto: Number(tax.toFixed(2)),
        impostoPercent: taxPercent,
        lucroLiquido: Number(profit.toFixed(2)),
        margemLucro: Number(margin.toFixed(2)),
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao calcular simulação.' });
    }
  });

  // Detalhe do custo de produção da simulação (agregado por produto / linha)
  // GET /api/simulation/production-cost?month=2026-01&channel=all
  app.get('/api/simulation/production-cost', async (req, res) => {
    try {
      const monthStr = String(req.query.month ?? '').trim();
      const channel = String(req.query.channel ?? 'all').trim().toLowerCase();
      const monthStart = monthStartFromYYYYMM(monthStr);
      if (!monthStart) return res.status(400).json({ message: 'Parâmetro month inválido (use YYYY-MM).' });

      const orderWhere = buildSimulationOrderWhere(monthStart, channel);
      const orders = await prisma.order.findMany({
        where: orderWhere,
        include: { items: { include: { product: true } } },
        orderBy: [{ orderDate: 'asc' }, { orderId: 'asc' }],
      });

      type LineAgg = {
        productId: number | null;
        productCode: string;
        name: string;
        quantity: number;
        totalCost: number;
      };
      const map = new Map<string, LineAgg>();

      for (const o of orders) {
        for (const item of o.items) {
          const qty = item.quantity || 0;
          if (qty <= 0) continue;
          const unitCost = Number(item.product?.costPrice ?? 0);
          const lineCost = unitCost * qty;
          const key =
            item.productId != null
              ? `pid:${item.productId}`
              : `row:${String(item.productCode || '')}|${String(item.name || '')}`;
          const cur = map.get(key);
          if (cur) {
            cur.quantity += qty;
            cur.totalCost += lineCost;
          } else {
            map.set(key, {
              productId: item.productId ?? null,
              productCode: String(item.productCode || ''),
              name: String(item.name || ''),
              quantity: qty,
              totalCost: lineCost,
            });
          }
        }
      }

      const lines = [...map.values()]
        .map((l) => {
          const totalCost = Math.round(l.totalCost * 100) / 100;
          const unitCost =
            l.quantity > 0 ? Math.round((l.totalCost / l.quantity) * 10000) / 10000 : 0;
          return {
            productId: l.productId,
            productCode: l.productCode,
            name: l.name,
            unitCost,
            quantity: l.quantity,
            totalCost,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

      const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0);
      const totalCostAll = Math.round(lines.reduce((s, l) => s + l.totalCost, 0) * 100) / 100;

      return res.status(200).json({
        month: monthStr,
        channel,
        lines,
        totalQuantity,
        totalCost: totalCostAll,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao listar custo de produção.' });
    }
  });

  // Detalhe do faturamento bruto da simulação (pedidos e itens)
  // GET /api/simulation/gross-revenue?month=2026-01&channel=all
  // GET /api/simulation/gross-revenue?start=2026-01&end=2026-05&channel=tiktok
  app.get('/api/simulation/gross-revenue', async (req, res) => {
    try {
      const channel = String(req.query.channel ?? 'all').trim().toLowerCase();
      const startStr = String(req.query.start ?? req.query.month ?? '').trim();
      const endStr = String(req.query.end ?? req.query.month ?? startStr).trim();
      const monthStart = monthStartFromYYYYMM(startStr);
      const monthEnd = monthStartFromYYYYMM(endStr);
      if (!monthStart || !monthEnd) {
        return res.status(400).json({ message: 'Parâmetros inválidos (use month=YYYY-MM ou start/end=YYYY-MM).' });
      }

      const rangeStart =
        monthStart.getTime() <= monthEnd.getTime() ? monthStart : monthEnd;
      const rangeEnd =
        monthStart.getTime() <= monthEnd.getTime() ? monthEnd : monthStart;

      const orderWhere = buildSimulationOrderWhereRange(rangeStart, rangeEnd, channel);
      const orders = await prisma.order.findMany({
        where: orderWhere,
        include: { items: true },
        orderBy: [{ orderDate: 'desc' }, { orderId: 'desc' }],
      });

      const list = orders.map((o) =>
        mapOrderToGrossRevenueRow({
          orderId: o.orderId,
          source: o.source,
          orderDate: o.orderDate,
          status: o.status,
          totalPrice: o.totalPrice,
          commissionFee: o.commissionFee,
          serviceFee: o.serviceFee,
          partnerCommission: (o as { partnerCommission?: number | null }).partnerCommission,
          settlementAmount: (o as { settlementAmount?: number | null }).settlementAmount,
          paymentId: (o as { paymentId?: string | null }).paymentId,
          items: o.items,
        }),
      );

      const faturamentoBruto = roundMoney(list.reduce((s, o) => s + o.orderTotal, 0));
      const totalProductUnits = list.reduce((s, o) => s + o.unitsInOrder, 0);

      return res.status(200).json({
        month: startStr === endStr ? startStr : `${startStr} → ${endStr}`,
        startMonth: `${rangeStart.getFullYear()}-${String(rangeStart.getMonth() + 1).padStart(2, '0')}`,
        endMonth: `${rangeEnd.getFullYear()}-${String(rangeEnd.getMonth() + 1).padStart(2, '0')}`,
        channel,
        orders: list,
        totalOrders: list.length,
        totalProductUnits,
        faturamentoBruto,
        totals: {
          grossProductSales: roundMoney(list.reduce((s, o) => s + o.grossProductSales, 0)),
          sellerDiscount: roundMoney(list.reduce((s, o) => s + o.sellerDiscount, 0)),
          commissionFee: roundMoney(list.reduce((s, o) => s + o.commissionFee, 0)),
          serviceFee: roundMoney(list.reduce((s, o) => s + o.serviceFee, 0)),
          partnerCommission: roundMoney(list.reduce((s, o) => s + o.partnerCommission, 0)),
          amountToReceive: roundMoney(list.reduce((s, o) => s + o.amountToReceive, 0)),
          amountReceived: roundMoney(
            list.reduce((s, o) => s + (o.amountReceived ?? 0), 0),
          ),
        },
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao listar faturamento bruto.' });
    }
  });

  // Dashboard ADS (ROAS) baseado em Orders + AdSpend
  // GET /api/ads-dashboard?from=2026-01&to=2026-12
  app.get('/api/ads-dashboard', async (req, res) => {
    try {
      const from = req.query.from ? monthStartFromYYYYMM(String(req.query.from)) : null;
      const to = req.query.to ? monthStartFromYYYYMM(String(req.query.to)) : null;

      const orderWhere: any = {};
      if (from || to) {
        orderWhere.orderDate = {};
        if (from) orderWhere.orderDate.gte = from;
        if (to) orderWhere.orderDate.lt = new Date(to.getFullYear(), to.getMonth() + 1, 1);
      }

      const orders = await prisma.order.findMany({
        where: orderWhere,
        select: { orderDate: true, source: true, totalPrice: true, status: true },
      });

      const revenueByMonthChannel = new Map<string, number>(); // YYYY-MM|channel
      const revenueByMonthTotal = new Map<string, number>(); // YYYY-MM

      for (const o of orders) {
        const status = String(o.status || '').toLowerCase();
        if (status.includes('cancelado')) continue;
        if (status.includes('não pago') || status.includes('nao pago')) continue;
        if (status.includes('aguardando pagamento')) continue;
        if (status === 'devolvido') continue;
        const d = new Date(o.orderDate);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const ch = String(o.source || '').toLowerCase();
        const key = `${ym}|${ch}`;
        revenueByMonthChannel.set(key, (revenueByMonthChannel.get(key) || 0) + (o.totalPrice || 0));
        revenueByMonthTotal.set(ym, (revenueByMonthTotal.get(ym) || 0) + (o.totalPrice || 0));
      }

      const prismaAny = prisma as any;
      const spendRows = await prismaAny.adSpend.findMany({
        where: (() => {
          const where: any = {};
          if (from || to) {
            where.month = {};
            if (from) where.month.gte = from;
            if (to) where.month.lt = new Date(to.getFullYear(), to.getMonth() + 1, 1);
          }
          return where;
        })(),
        orderBy: [{ month: 'asc' }, { channel: 'asc' }],
      });

      const spendByMonthChannel = new Map<string, number>(); // YYYY-MM|channel
      const spendByMonthTotal = new Map<string, number>(); // YYYY-MM
      for (const r of spendRows) {
        const d = new Date(r.month);
        // AdSpend.month é início do mês em UTC; getMonth() local (ex.: BR) empurrava gasto para o mês anterior.
        const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        const ch = String(r.channel || '').toLowerCase();
        const key = `${ym}|${ch}`;
        const amt = Number(r.amount || 0);
        spendByMonthChannel.set(key, (spendByMonthChannel.get(key) || 0) + amt);
        spendByMonthTotal.set(ym, (spendByMonthTotal.get(ym) || 0) + amt);
      }

      const months = new Set<string>([...revenueByMonthTotal.keys(), ...spendByMonthTotal.keys()]);
      const monthsSorted = [...months].sort();

      const channels = new Set<string>();
      for (const k of revenueByMonthChannel.keys()) channels.add(k.split('|')[1]);
      for (const k of spendByMonthChannel.keys()) channels.add(k.split('|')[1]);
      const channelsSorted = [...channels].sort();

      const byMonth = monthsSorted.map((ym) => {
        const revenue = Number((revenueByMonthTotal.get(ym) || 0).toFixed(2));
        const spend = Number((spendByMonthTotal.get(ym) || 0).toFixed(2));
        const roas = spend > 0 ? Number((revenue / spend).toFixed(4)) : null;

        const byChannel = channelsSorted.map((ch) => {
          const rev = Number((revenueByMonthChannel.get(`${ym}|${ch}`) || 0).toFixed(2));
          const sp = Number((spendByMonthChannel.get(`${ym}|${ch}`) || 0).toFixed(2));
          const r = sp > 0 ? Number((rev / sp).toFixed(4)) : null;
          return { channel: ch, revenue: rev, spend: sp, roas: r };
        });

        return { month: ym, revenue, spend, roas, byChannel };
      });

      const totalRevenue = Number([...revenueByMonthTotal.values()].reduce((a, b) => a + b, 0).toFixed(2));
      const totalSpend = Number([...spendByMonthTotal.values()].reduce((a, b) => a + b, 0).toFixed(2));
      const totalRoas = totalSpend > 0 ? Number((totalRevenue / totalSpend).toFixed(4)) : null;

      return res.status(200).json({
        kpis: { revenue: totalRevenue, spend: totalSpend, roas: totalRoas },
        channels: channelsSorted,
        byMonth,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao gerar dashboard de ADS.' });
    }
  });
// src/index.ts (Substitua o endpoint /api/dashboard por este mais completo)

app.get('/api/dashboard', async (_req, res) => {
  try {
    // 1. Busca vendas válidas
    const sales = await prisma.order.findMany({
      where: {
        NOT: [...ORDER_STATUS_EXCLUDED_FROM_SALES_METRICS],
      },
      orderBy: { orderDate: 'asc' }
    });

    // Estruturas de dados
    const salesByChannel: Record<string, number> = {};
    const ordersByChannel: Record<string, number> = {};
    const salesByMonth: Record<string, any> = {};

    sales.forEach(sale => {
      const monthYear = new Date(sale.orderDate).toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' });
      const amount = sale.totalPrice;
      const source = sale.source;

      salesByChannel[source] = (salesByChannel[source] || 0) + amount;
      ordersByChannel[source] = (ordersByChannel[source] || 0) + 1;

      if (!salesByMonth[monthYear]) {
        salesByMonth[monthYear] = {
          name: monthYear,
          shopee: 0,
          tiktok: 0,
          trayAtacado: 0,
          trayVarejo: 0,
          total: 0,
          shopeeCount: 0,
          tiktokCount: 0,
          trayAtacadoCount: 0,
          trayVarejoCount: 0,
          totalCount: 0,
        };
      }
      if (source === 'shopee') {
        salesByMonth[monthYear].shopee += amount;
        salesByMonth[monthYear].shopeeCount += 1;
      }
      if (source === 'tiktok') {
        salesByMonth[monthYear].tiktok += amount;
        salesByMonth[monthYear].tiktokCount += 1;
      }
      if (isTrayOrderSource(source)) {
        const b = bucketTrayMetrics(source, sale.orderId);
        if (b === 'trayVarejo') {
          salesByMonth[monthYear].trayVarejo += amount;
          salesByMonth[monthYear].trayVarejoCount += 1;
        } else {
          // trayAtacado + trayLegacy (sem série legado nas métricas)
          salesByMonth[monthYear].trayAtacado += amount;
          salesByMonth[monthYear].trayAtacadoCount += 1;
        }
      }
      salesByMonth[monthYear].total += amount;
      salesByMonth[monthYear].totalCount += 1;
    });

    const chartChannel = Object.keys(salesByChannel).map((key) => ({
      name: channelLabelForChart(key),
      value: Number(salesByChannel[key].toFixed(2)),
    }));
    const chartMonthly = Object.values(salesByMonth);

    // Top products using OrderItem + Product (individual product/variation level)
    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          NOT: [...ORDER_STATUS_EXCLUDED_FROM_SALES_METRICS],
        },
      },
      include: { product: true },
    });

    const productRanking: Record<string, { quantity: number; total: number; sources: Set<string> }> = {};
    for (const item of orderItems) {
      const key = item.product?.name || item.name;
      if (!productRanking[key]) {
        productRanking[key] = { quantity: 0, total: 0, sources: new Set() };
      }
      productRanking[key].quantity += item.quantity || 0;
      productRanking[key].total += item.totalPrice || 0;
      productRanking[key].sources.add(item.source);
    }

    const topProducts = Object.entries(productRanking)
      .map(([name, data]) => ({
        name,
        quantity: data.quantity,
        total: Number(data.total.toFixed(2)),
        channels: Array.from(data.sources),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const totalRevenue = chartChannel.reduce((acc, curr) => acc + curr.value, 0);
    const totalOrders = Object.values(ordersByChannel).reduce((acc, curr) => acc + curr, 0);

    return res.status(200).json({
      kpis: {
        revenue: totalRevenue,
        orders: totalOrders,
        ticketMedio: totalOrders > 0 ? totalRevenue / totalOrders : 0
      },
      byChannel: chartChannel,
      byMonth: chartMonthly,
      topProducts: topProducts
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Erro ao gerar dashboard.' });
  }
});

  // Curva A – ranking completo de produtos por faturamento
  app.get('/api/product-curve', async (req, res) => {
    try {
      const monthStr = String(req.query.month ?? '').trim();
      let dateFilter: any = {};
      if (monthStr) {
        const [y, m] = monthStr.split('-').map(Number);
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 1);
        dateFilter = { order: { orderDate: { gte: start, lt: end } } };
      }

      const items = await prisma.orderItem.findMany({
        where: {
          ...dateFilter,
          order: {
            ...(dateFilter.order || {}),
            NOT: [...ORDER_STATUS_EXCLUDED_FROM_SALES_METRICS],
          },
        },
        include: {
          product: {
            include: { productGroupItem: { include: { productGroup: true } } },
          },
        },
      });

      // Consolidate by group when product belongs to a group; otherwise show individually
      const ranking: Record<string, { displayName: string; quantity: number; total: number; sources: Set<string>; groupId: number | null; products: Set<string> }> = {};
      for (const it of items) {
        const group = it.product?.productGroupItem?.productGroup;
        const productName = it.product?.name || it.name;
        const key = group ? `__group_${group.id}` : productName;
        if (!ranking[key]) {
          ranking[key] = {
            displayName: group ? group.name : productName,
            quantity: 0, total: 0, sources: new Set(), groupId: group?.id ?? null, products: new Set(),
          };
        }
        ranking[key].quantity += it.quantity || 0;
        ranking[key].total += it.totalPrice || 0;
        ranking[key].sources.add(it.source);
        ranking[key].products.add(productName);
      }

      const sorted = Object.values(ranking)
        .map(d => ({
          name: d.displayName,
          quantity: d.quantity,
          total: Number(d.total.toFixed(2)),
          channels: Array.from(d.sources),
          groupId: d.groupId,
          products: Array.from(d.products),
        }))
        .sort((a, b) => b.total - a.total);

      const grandTotal = sorted.reduce((s, p) => s + p.total, 0);

      let cumPct = 0;
      const rows = sorted.map((p, idx) => {
        const pct = grandTotal > 0 ? (p.total / grandTotal) * 100 : 0;
        cumPct += pct;
        let curve: 'A' | 'B' | 'C' = 'C';
        if (cumPct <= 80) curve = 'A';
        else if (cumPct <= 95) curve = 'B';
        return { ...p, pct: Number(pct.toFixed(2)), cumPct: Number(cumPct.toFixed(2)), curve, rank: idx + 1 };
      });

      return res.json({
        grandTotal: Number(grandTotal.toFixed(2)),
        totalProducts: rows.length,
        countA: rows.filter(r => r.curve === 'A').length,
        countB: rows.filter(r => r.curve === 'B').length,
        countC: rows.filter(r => r.curve === 'C').length,
        rows,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao gerar curva A.' });
    }
  });

  // Vendas por dia por canal: GET /api/sales-by-day?month=2026-02 | ?start=YYYY-MM-DD&end=YYYY-MM-DD
  app.get('/api/sales-by-day', async (req, res) => {
    try {
      const startQ = String(req.query.start ?? '').trim();
      const endQ = String(req.query.end ?? '').trim();
      let start: Date;
      let end: Date;

      if (startQ && endQ) {
        const ds = dateStartFromYYYYMMDD(startQ);
        const de = dateStartFromYYYYMMDD(endQ);
        if (!ds || !de || ds > de) {
          return res.status(400).json({ message: 'Parâmetros start e end devem ser YYYY-MM-DD com início ≤ fim.' });
        }
        start = ds;
        end = new Date(de.getFullYear(), de.getMonth(), de.getDate() + 1);
      } else {
        const monthStr = String(req.query.month ?? '').trim();
        const monthStart = monthStr ? monthStartFromYYYYMM(monthStr) : null;
        start = monthStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      }

      const orders = await prisma.order.findMany({
        where: {
          orderDate: { gte: start, lt: end },
          NOT: [...ORDER_STATUS_EXCLUDED_FROM_SALES_METRICS],
        },
        select: { orderDate: true, source: true, totalPrice: true, orderId: true },
      });

      type DayAgg = {
        shopee: number;
        tiktok: number;
        trayAtacado: number;
        trayVarejo: number;
        total: number;
        shopeeOrders: number;
        tiktokOrders: number;
        trayAtacadoOrders: number;
        trayVarejoOrders: number;
        totalOrders: number;
      };
      const emptyDay = (): DayAgg => ({
        shopee: 0,
        tiktok: 0,
        trayAtacado: 0,
        trayVarejo: 0,
        total: 0,
        shopeeOrders: 0,
        tiktokOrders: 0,
        trayAtacadoOrders: 0,
        trayVarejoOrders: 0,
        totalOrders: 0,
      });

      const byDay: Record<string, DayAgg> = {};
      const dayKeys: string[] = [];
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        byDay[key] = emptyDay();
        dayKeys.push(key);
      }

      for (const o of orders) {
        const d = new Date(o.orderDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!byDay[key]) {
          byDay[key] = emptyDay();
          dayKeys.push(key);
          dayKeys.sort();
        }
        const amt = o.totalPrice || 0;
        byDay[key].total += amt;
        byDay[key].totalOrders += 1;
        if (o.source === 'shopee') {
          byDay[key].shopee += amt;
          byDay[key].shopeeOrders += 1;
        } else if (o.source === 'tiktok') {
          byDay[key].tiktok += amt;
          byDay[key].tiktokOrders += 1;
        } else if (isTrayOrderSource(o.source)) {
          const b = bucketTrayMetrics(o.source, o.orderId);
          if (b === 'trayVarejo') {
            byDay[key].trayVarejo += amt;
            byDay[key].trayVarejoOrders += 1;
          } else {
            // trayAtacado + trayLegacy agregados em Tray Atacado nas métricas
            byDay[key].trayAtacado += amt;
            byDay[key].trayAtacadoOrders += 1;
          }
        }
      }

      const rows = dayKeys.map((k) => {
        const b = byDay[k];
        return {
          date: k,
          name: new Date(k + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          ...b,
          tray: b.trayAtacado + b.trayVarejo,
          trayOrders: b.trayAtacadoOrders + b.trayVarejoOrders,
        };
      });

      return res.status(200).json(rows);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar vendas por dia.' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SHOPEE OPEN PLATFORM INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  // Get integration status
  app.get('/api/shopee/status', async (_req, res) => {
    try {
      const integration = await prisma.shopeeIntegration.findFirst({ orderBy: { id: 'desc' } });
      if (!integration) return res.json({ configured: false, status: 'disconnected' });

      const now = new Date();
      let status = integration.status;
      if (status === 'connected' && integration.tokenExpiresAt && integration.tokenExpiresAt < now) {
        status = integration.refreshExpiresAt && integration.refreshExpiresAt > now ? 'token_expired' : 'expired';
      }

      return res.json({
        configured: true,
        status,
        shopId: integration.shopId,
        shopName: integration.shopName,
        partnerId: integration.partnerId,
        lastSyncAt: integration.lastSyncAt,
        tokenExpiresAt: integration.tokenExpiresAt,
        refreshExpiresAt: integration.refreshExpiresAt,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar status da integração.' });
    }
  });

  // Save partner credentials
  app.post('/api/shopee/config', express.json(), async (req, res) => {
    try {
      const { partnerId, partnerKey } = req.body;
      if (!partnerId || !partnerKey) {
        return res.status(400).json({ message: 'Partner ID e Partner Key são obrigatórios.' });
      }

      const existing = await prisma.shopeeIntegration.findFirst({ orderBy: { id: 'desc' } });
      if (existing) {
        await prisma.shopeeIntegration.update({
          where: { id: existing.id },
          data: { partnerId: String(partnerId), partnerKey: String(partnerKey) },
        });
      } else {
        await prisma.shopeeIntegration.create({
          data: { partnerId: String(partnerId), partnerKey: String(partnerKey) },
        });
      }

      return res.json({ success: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao salvar configuração.' });
    }
  });

  // Generate OAuth authorization URL
  app.get('/api/shopee/auth-url', async (req, res) => {
    try {
      const integration = await prisma.shopeeIntegration.findFirst({ orderBy: { id: 'desc' } });
      if (!integration) return res.status(400).json({ message: 'Configure Partner ID e Partner Key primeiro.' });

      const redirectUrl = `${req.protocol}://${req.get('host')}/api/shopee/callback`;
      const url = shopeeApi.buildAuthUrl(
        Number(integration.partnerId),
        integration.partnerKey,
        redirectUrl,
      );

      return res.json({ url, redirectUrl });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao gerar URL de autorização.' });
    }
  });

  // OAuth callback from Shopee
  app.get('/api/shopee/callback', async (req, res) => {
    try {
      const code = String(req.query.code ?? '');
      const shopId = String(req.query.shop_id ?? '');

      if (!code || !shopId) {
        return res.status(400).send('Parâmetros code e shop_id são obrigatórios.');
      }

      const integration = await prisma.shopeeIntegration.findFirst({ orderBy: { id: 'desc' } });
      if (!integration) return res.status(400).send('Integração não configurada.');

      const tokenRes = await shopeeApi.getAccessToken(
        Number(integration.partnerId),
        integration.partnerKey,
        code,
        Number(shopId),
      );

      if (tokenRes.error) {
        console.error('Shopee token error:', tokenRes);
        return res.status(400).send(`Erro ao obter token: ${tokenRes.error} - ${tokenRes.message}`);
      }

      const now = new Date();
      const tokenExpires = new Date(now.getTime() + (tokenRes.expire_in ?? 14400) * 1000);
      const refreshExpires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      let shopName = '';
      try {
        const info = await shopeeApi.getShopInfo(
          Number(integration.partnerId),
          integration.partnerKey,
          tokenRes.access_token,
          Number(shopId),
        );
        shopName = info.shop_name || '';
      } catch { /* optional */ }

      await prisma.shopeeIntegration.update({
        where: { id: integration.id },
        data: {
          shopId,
          shopName,
          accessToken: tokenRes.access_token,
          refreshToken: tokenRes.refresh_token,
          tokenExpiresAt: tokenExpires,
          refreshExpiresAt: refreshExpires,
          status: 'connected',
        },
      });

      // Redirect to frontend with success
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}?shopee_connected=1`);
    } catch (e) {
      console.error(e);
      return res.status(500).send('Erro interno ao processar callback.');
    }
  });

  // Refresh token manually
  app.post('/api/shopee/refresh-token', async (_req, res) => {
    try {
      const integration = await prisma.shopeeIntegration.findFirst({ orderBy: { id: 'desc' } });
      if (!integration?.refreshToken || !integration?.shopId) {
        return res.status(400).json({ message: 'Integração não conectada.' });
      }

      const tokenRes = await shopeeApi.refreshAccessToken(
        Number(integration.partnerId),
        integration.partnerKey,
        integration.refreshToken,
        Number(integration.shopId),
      );

      if (tokenRes.error) {
        await prisma.shopeeIntegration.update({
          where: { id: integration.id },
          data: { status: 'expired' },
        });
        return res.status(400).json({ message: `Erro Shopee: ${tokenRes.error} - ${tokenRes.message}` });
      }

      const now = new Date();
      await prisma.shopeeIntegration.update({
        where: { id: integration.id },
        data: {
          accessToken: tokenRes.access_token,
          refreshToken: tokenRes.refresh_token,
          tokenExpiresAt: new Date(now.getTime() + (tokenRes.expire_in ?? 14400) * 1000),
          refreshExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          status: 'connected',
        },
      });

      return res.json({ success: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao renovar token.' });
    }
  });

  // Helper: ensure valid access token (auto-refresh if needed)
  async function ensureValidToken() {
    const integration = await prisma.shopeeIntegration.findFirst({ orderBy: { id: 'desc' } });
    if (!integration?.accessToken || !integration?.shopId) throw new Error('Integração não conectada.');

    const now = new Date();
    if (integration.tokenExpiresAt && integration.tokenExpiresAt > now) return integration;

    if (!integration.refreshToken || (integration.refreshExpiresAt && integration.refreshExpiresAt < now)) {
      await prisma.shopeeIntegration.update({ where: { id: integration.id }, data: { status: 'expired' } });
      throw new Error('Refresh token expirado. Reconecte a loja.');
    }

    const tokenRes = await shopeeApi.refreshAccessToken(
      Number(integration.partnerId),
      integration.partnerKey,
      integration.refreshToken,
      Number(integration.shopId),
    );

    if (tokenRes.error) {
      await prisma.shopeeIntegration.update({ where: { id: integration.id }, data: { status: 'expired' } });
      throw new Error(`Erro ao renovar token: ${tokenRes.error}`);
    }

    const updated = await prisma.shopeeIntegration.update({
      where: { id: integration.id },
      data: {
        accessToken: tokenRes.access_token,
        refreshToken: tokenRes.refresh_token,
        tokenExpiresAt: new Date(now.getTime() + (tokenRes.expire_in ?? 14400) * 1000),
        refreshExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        status: 'connected',
      },
    });

    return updated;
  }

  // Sync orders from Shopee
  app.post('/api/shopee/sync', express.json(), async (req, res) => {
    try {
      const integration = await ensureValidToken();
      const partnerId = Number(integration.partnerId);
      const shopId = Number(integration.shopId);

      // Default: sync last 30 days (or custom date range)
      const daysBack = Number(req.body.daysBack) || 30;
      const now = Math.floor(Date.now() / 1000);
      const timeFrom = req.body.timeFrom ? Number(req.body.timeFrom) : now - daysBack * 24 * 60 * 60;
      const timeTo = req.body.timeTo ? Number(req.body.timeTo) : now;

      // 1. Fetch all order SNs
      const orderSns = await shopeeApi.fetchAllOrderSns(
        partnerId, integration.partnerKey, integration.accessToken!, shopId,
        timeFrom, timeTo,
      );

      if (orderSns.length === 0) {
        await prisma.shopeeIntegration.update({
          where: { id: integration.id },
          data: { lastSyncAt: new Date() },
        });
        return res.json({ success: true, synced: 0, total: 0, message: 'Nenhum pedido encontrado no período.' });
      }

      // 2. Fetch order details
      const orders = await shopeeApi.fetchOrderDetails(
        partnerId, integration.partnerKey, integration.accessToken!, shopId, orderSns,
      );

      // 3. Upsert into database
      let synced = 0;
      for (const order of orders) {
        const orderId = order.order_sn;
        const orderDate = new Date(order.create_time * 1000);
        const statusMap: Record<string, string> = {
          UNPAID: 'Não pago',
          READY_TO_SHIP: 'Pronto para envio',
          PROCESSED: 'Processado',
          SHIPPED: 'Enviado',
          COMPLETED: 'Concluído',
          IN_CANCEL: 'Em cancelamento',
          CANCELLED: 'Cancelado',
          INVOICE_PENDING: 'Nota pendente',
        };
        const status = statusMap[order.order_status] || order.order_status;
        const totalPrice = order.total_amount || 0;
        const items = order.item_list || [];
        const productName = items.length > 0
          ? items.map((i) => i.item_name).join(' + ')
          : 'Produto Shopee';
        const quantity = items.reduce((sum, i) => sum + (i.model_quantity_purchased || 1), 0);

        await prisma.order.upsert({
          where: { orderId_source: { orderId, source: 'shopee' } },
          update: {
            orderDate,
            productName,
            quantity,
            totalPrice,
            status,
          },
          create: {
            orderId,
            orderDate,
            productName,
            quantity,
            totalPrice,
            source: 'shopee',
            status,
          },
        });

        // Upsert items with variation support
        const parentItemIds = new Set<string>();
        for (const item of items) {
          const hasVariation = !!item.model_id && !!item.model_name;
          const productCode = `shopee_${item.item_id}${item.model_id ? '_' + item.model_id : ''}`;
          const itemName = hasVariation
            ? `${item.item_name} - ${item.model_name}`
            : item.item_name;
          const variationName = hasVariation ? item.model_name : null;
          const parentCode = hasVariation ? `shopee_item_${item.item_id}` : null;
          const unitPrice = item.model_discounted_price || item.model_original_price || 0;
          const qty = item.model_quantity_purchased || 1;
          const itemSku = item.model_sku || item.item_sku || null;

          await prisma.product.upsert({
            where: { code: productCode },
            update: {
              name: itemName,
              source: 'shopee',
              variationName,
              parentCode,
              sku: itemSku,
            },
            create: {
              code: productCode,
              name: itemName,
              source: 'shopee',
              variationName,
              parentCode,
              sku: itemSku,
            },
          });

          const product = await prisma.product.findUnique({ where: { code: productCode } });

          await prisma.orderItem.upsert({
            where: { orderId_source_productCode: { orderId, source: 'shopee', productCode } },
            update: {
              name: itemName,
              unitPrice,
              quantity: qty,
              totalPrice: unitPrice * qty,
              productId: product?.id ?? null,
            },
            create: {
              orderId,
              source: 'shopee',
              productCode,
              name: itemName,
              unitPrice,
              quantity: qty,
              totalPrice: unitPrice * qty,
              productId: product?.id ?? null,
            },
          });

          if (parentCode) parentItemIds.add(`${parentCode}|${item.item_name}`);
        }

        // Auto-group Shopee variations
        for (const entry of parentItemIds) {
          const [parentCode, baseName] = entry.split('|');
          await autoGroupVariations(prisma, parentCode, baseName);
        }

        synced++;
      }

      await prisma.shopeeIntegration.update({
        where: { id: integration.id },
        data: { lastSyncAt: new Date() },
      });

      return res.json({ success: true, synced, total: orderSns.length });
    } catch (e: any) {
      console.error('Shopee sync error:', e);
      return res.status(500).json({ message: e.message || 'Erro ao sincronizar pedidos.' });
    }
  });

  // Disconnect Shopee integration
  app.post('/api/shopee/disconnect', async (_req, res) => {
    try {
      const integration = await prisma.shopeeIntegration.findFirst({ orderBy: { id: 'desc' } });
      if (integration) {
        await prisma.shopeeIntegration.update({
          where: { id: integration.id },
          data: {
            accessToken: null,
            refreshToken: null,
            tokenExpiresAt: null,
            refreshExpiresAt: null,
            shopId: null,
            shopName: null,
            status: 'disconnected',
          },
        });
      }
      return res.json({ success: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao desconectar.' });
    }
  });

  // Itens Shopee duplicados no mesmo pedido (planilha pai + variação / códigos hierárquicos) — impacta custo e P&L
  // GET /api/shopee/duplicate-order-items?month=2026-01&maxOrders=5000
  app.get('/api/shopee/duplicate-order-items', async (req, res) => {
    try {
      const monthStr = String(req.query.month ?? '').trim();
      const maxOrders = Math.min(
        Math.max(parseInt(String(req.query.maxOrders ?? '4000'), 10) || 4000, 50),
        20000,
      );
      const orderWhere: any = { source: 'shopee' };
      if (monthStr) {
        const monthStart = monthStartFromYYYYMM(monthStr);
        if (!monthStart) return res.status(400).json({ message: 'Parâmetro month inválido (use YYYY-MM).' });
        const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
        orderWhere.orderDate = { gte: monthStart, lt: monthEnd };
      }

      const orders = await prisma.order.findMany({
        where: orderWhere,
        include: { items: { orderBy: { id: 'asc' } } },
        orderBy: { orderDate: 'desc' },
        take: maxOrders,
      });

      const groupsOut: any[] = [];
      for (const o of orders) {
        if (!o.items || o.items.length < 2) continue;
        const idxGroups = clusterShopeeDuplicateIndices(o.items);
        for (const g of idxGroups) {
          if (g.length < 2) continue;
          const cluster = g.map((i) => o.items[i]);
          const linesSum = Math.round(cluster.reduce((s, it) => s + Number(it.totalPrice || 0), 0) * 100) / 100;
          const withVar = cluster.filter((it) => String(it.name || '').includes(' - '));
          const pool = withVar.length > 0 ? withVar : cluster;
          const suggestedKeep = pool.slice().sort((a, b) => {
            const ln = String(b.name).length - String(a.name).length;
            if (ln !== 0) return ln;
            return String(b.productCode).length - String(a.productCode).length;
          })[0];
          groupsOut.push({
            orderId: o.orderId,
            orderDate: o.orderDate.toISOString(),
            orderTotal: Number(o.totalPrice || 0),
            linesSum,
            exceedsOrderTotal: linesSum > Number(o.totalPrice || 0) + SHOPEE_DUP_PRICE_EPS,
            suggestedKeepItemId: suggestedKeep.id,
            suggestedKeepProductCode: suggestedKeep.productCode,
            items: cluster.map((it) => ({
              id: it.id,
              productCode: it.productCode,
              name: it.name,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              totalPrice: it.totalPrice,
              productId: it.productId,
              isSuggestedKeep: it.id === suggestedKeep.id,
            })),
          });
        }
      }

      return res.status(200).json({
        scannedOrders: orders.length,
        duplicateGroups: groupsOut.length,
        groups: groupsOut,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao analisar duplicatas Shopee.' });
    }
  });

  // Remove uma linha de item (uso: excluir duplicata Shopee após conferência)
  app.delete('/api/order-items/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: 'id inválido.' });
      const row = await prisma.orderItem.findUnique({ where: { id } });
      if (!row || row.source !== 'shopee') {
        return res.status(404).json({ message: 'Item não encontrado ou exclusão permitida apenas para Shopee.' });
      }
      const { orderId } = row;
      await prisma.orderItem.delete({ where: { id } });
      const remaining = await prisma.orderItem.findMany({
        where: { orderId, source: 'shopee' },
        orderBy: { id: 'asc' },
      });
      const qty = remaining.reduce((s, it) => s + (it.quantity || 0), 0);
      const productName =
        remaining.map((it) => it.name).join(' + ').slice(0, 500) || 'Produto Shopee';
      await prisma.order.updateMany({
        where: { orderId, source: 'shopee' },
        data: { quantity: qty, productName },
      });
      return res.status(200).json({ ok: true, id });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao excluir item.' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ORDER RETURNS (devoluções)
  // ═══════════════════════════════════════════════════════════════════════════

  // Search orders for return registration
  app.get('/api/orders/search', async (req, res) => {
    try {
      const q = String(req.query.q ?? '').trim();
      if (!q) return res.json([]);
      const orders = await prisma.order.findMany({
        where: {
          OR: [
            { orderId: { contains: q, mode: 'insensitive' } },
            { productName: { contains: q, mode: 'insensitive' } },
          ],
        },
        include: { returnRecord: true },
        orderBy: { orderDate: 'desc' },
        take: 20,
      });
      return res.json(orders);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar pedidos.' });
    }
  });

  // Register a return (devolução)
  app.post('/api/returns', express.json(), async (req, res) => {
    try {
      const { orderId, source, reason, notes, returnDate } = req.body ?? {};
      if (!orderId || !source || !reason || !returnDate) {
        return res.status(400).json({ message: 'orderId, source, reason e returnDate são obrigatórios.' });
      }

      const order = await prisma.order.findUnique({
        where: { orderId_source: { orderId: String(orderId), source: String(source) } },
      });
      if (!order) return res.status(404).json({ message: 'Pedido não encontrado.' });

      const prismaAny = prisma as any;
      const returnRecord = await prismaAny.orderReturn.create({
        data: {
          orderId: String(orderId),
          source: String(source),
          reason: String(reason),
          notes: String(notes ?? ''),
          returnDate: new Date(returnDate),
        },
      });

      await prisma.order.update({
        where: { orderId_source: { orderId: String(orderId), source: String(source) } },
        data: { status: 'Devolvido' },
      });

      return res.status(201).json(returnRecord);
    } catch (e: any) {
      if (e?.code === 'P2002') return res.status(400).json({ message: 'Este pedido já possui uma devolução registrada.' });
      console.error(e);
      return res.status(500).json({ message: 'Erro ao registrar devolução.' });
    }
  });

  // List all returns
  app.get('/api/returns', async (req, res) => {
    try {
      const monthStr = String(req.query.month ?? '').trim();
      let dateFilter: any = {};
      if (monthStr) {
        const [y, m] = monthStr.split('-').map(Number);
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 1);
        dateFilter = { returnDate: { gte: start, lt: end } };
      }

      const prismaAny = prisma as any;
      const returns = await prismaAny.orderReturn.findMany({
        where: dateFilter,
        include: {
          order: { select: { productName: true, totalPrice: true, quantity: true, orderDate: true, status: true } },
        },
        orderBy: { returnDate: 'desc' },
      });
      return res.json(returns);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao listar devoluções.' });
    }
  });

  // Delete a return (undo)
  app.delete('/api/returns/:orderId/:source', async (req, res) => {
    try {
      const { orderId, source } = req.params;
      const prismaAny = prisma as any;
      await prismaAny.orderReturn.delete({
        where: { orderId_source: { orderId, source } },
      });
      // Restore order status
      await prisma.order.update({
        where: { orderId_source: { orderId, source } },
        data: { status: '' },
      });
      return res.json({ ok: true });
    } catch (e: any) {
      if (e?.code === 'P2025') return res.status(404).json({ message: 'Devolução não encontrada.' });
      console.error(e);
      return res.status(500).json({ message: 'Erro ao remover devolução.' });
    }
  });

  // PRODUCT CONSOLIDATION (cross-channel)
  // ═══════════════════════════════════════════════════════════════════════════

  // List products grouped by channel with variation info
  app.get('/api/products/by-channel', async (_req, res) => {
    try {
      const products = await prisma.product.findMany({
        orderBy: [{ source: 'asc' }, { name: 'asc' }],
        include: {
          _count: { select: { orderItems: true } },
          productGroupItem: { include: { productGroup: true } },
          orderItems: { select: { quantity: true } },
        },
      });

      const result = products.map((p) => {
        const totalQtySold = (p.orderItems ?? []).reduce((sum, oi) => sum + (oi.quantity || 0), 0);
        const { orderItems: _oi, ...rest } = p;
        return { ...rest, totalQtySold };
      });

      return res.json(result);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar produtos.' });
    }
  });

  // Update product SKU
  app.patch('/api/products/:id/sku', express.json(), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { sku } = req.body;
      const updated = await prisma.product.update({
        where: { id },
        data: { sku: sku || null },
      });
      return res.json(updated);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao atualizar SKU.' });
    }
  });

  // Suggest matches across channels using name similarity
  app.get('/api/products/suggest-matches', async (_req, res) => {
    try {
      const products = await prisma.product.findMany({
        select: { id: true, code: true, name: true, source: true, sku: true, variationName: true, parentCode: true },
        orderBy: { name: 'asc' },
      });

      // Group products by normalized base name (without variation)
      function normalizeForMatch(name: string): string {
        return name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s*-\s*[^-]*$/, '') // remove last segment after ' - ' (likely variation)
          .replace(/[^a-z0-9]/g, '')
          .trim();
      }

      const byNormalized = new Map<string, typeof products>();
      for (const p of products) {
        const baseName = p.variationName ? p.name.replace(` - ${p.variationName}`, '') : p.name;
        const key = normalizeForMatch(baseName);
        if (!key) continue;
        if (!byNormalized.has(key)) byNormalized.set(key, []);
        byNormalized.get(key)!.push(p);
      }

      // Only return groups that span multiple channels
      const suggestions: Array<{ matchKey: string; products: typeof products }> = [];
      for (const [key, group] of byNormalized.entries()) {
        const channels = new Set(group.map((p) => p.source));
        if (channels.size >= 2) {
          suggestions.push({ matchKey: key, products: group });
        }
      }

      return res.json(suggestions);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar sugestões.' });
    }
  });

  // Link products into a ProductGroup (consolidation)
  app.post('/api/products/consolidate', express.json(), async (req, res) => {
    try {
      const { productIds, groupName, groupId } = req.body as {
        productIds: number[];
        groupName?: string;
        groupId?: number;
      };

      if (!productIds || productIds.length < 2) {
        return res.status(400).json({ message: 'Selecione pelo menos 2 produtos.' });
      }

      let targetGroupId: number;

      if (groupId) {
        targetGroupId = groupId;
      } else {
        const group = await prisma.productGroup.create({
          data: { name: groupName || 'Grupo consolidado' },
        });
        targetGroupId = group.id;
      }

      for (const pid of productIds) {
        await prisma.productGroupItem.upsert({
          where: { productId: pid },
          update: { productGroupId: targetGroupId },
          create: { productGroupId: targetGroupId, productId: pid },
        });
      }

      // If any product in the group has a SKU, propagate it to others that don't have one
      const groupProducts = await prisma.product.findMany({
        where: { id: { in: productIds } },
      });
      const skuSource = groupProducts.find((p: any) => p.sku);
      if (skuSource) {
        for (const p of groupProducts) {
          if (!p.sku) {
            await prisma.product.update({ where: { id: p.id }, data: { sku: skuSource.sku } });
          }
        }
      }

      const group = await prisma.productGroup.findUnique({
        where: { id: targetGroupId },
        include: { items: { include: { product: true } } },
      });

      return res.json(group);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao consolidar produtos.' });
    }
  });

  // Remove product from a group
  app.delete('/api/products/:id/ungroup', async (req, res) => {
    try {
      const productId = Number(req.params.id);
      await prisma.productGroupItem.deleteMany({ where: { productId } });
      return res.json({ success: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao remover do grupo.' });
    }
  });

  app.listen(APP_PORT, () => console.log(`Rodando em ${APP_PORT}`));
}



main().catch(console.error);