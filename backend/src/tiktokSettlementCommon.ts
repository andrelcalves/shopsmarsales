/**
 * Utilitários compartilhados para parsers de liquidação TikTok (income + onhold).
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const xlsx = require('xlsx');

export type TikTokSettlementCol = {
  txType: readonly string[];
  orderId: readonly string[];
  paymentId?: readonly string[];
  statementId?: readonly string[];
  skuId: readonly string[];
  settlement: readonly string[];
  platformCommission: readonly string[];
  serviceFee: readonly string[];
  sfpFee: readonly string[];
  perItemFee: readonly string[];
  taxesTotal: readonly string[];
  affiliate: readonly string[];
  creator: readonly string[];
  agency: readonly string[];
  shopAdsCreator: readonly string[];
  shopAdsAgency: readonly string[];
};

export interface TikTokAggregatedOrderRow {
  orderId: string;
  paymentId: string;
  settlementAmount: number;
  commissionFee: number;
  serviceFee: number;
  partnerCommission: number;
  taxesAndFeesTotal: number;
}

export type XlsxSheet = Record<string, unknown>;

export const AMOUNT_EPS = 0.02;

export function pick(row: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ');
  const want = keys.map((k) => norm(k));
  for (const [key, val] of Object.entries(row)) {
    if (val === undefined || val === null || String(val).trim() === '') continue;
    if (want.includes(norm(key))) return val;
  }
  return undefined;
}

export function parseBrNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  s = s.replace(/R\$\s?/g, '').replace(/BRL\s?/g, '');
  if (!s) return 0;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function absCost(v: unknown): number {
  return Math.abs(parseBrNumber(v));
}

export function round2(n: number): number {
  return Number(n.toFixed(2));
}

function sumAbs(values: number[]): number {
  return round2(values.reduce((acc, v) => acc + Math.abs(v), 0));
}

function dedupeOrSumAbs(
  values: number[],
  lines: Record<string, unknown>[],
  col: TikTokSettlementCol,
): number {
  const abs = values.map((v) => round2(Math.abs(v)));
  if (abs.length === 0) return 0;
  if (abs.length === 1) return abs[0];

  const first = abs[0];
  if (abs.every((v) => Math.abs(v - first) <= AMOUNT_EPS)) return first;

  const skuIds = new Set<string>();
  for (const r of lines) {
    const sku = String(pick(r, col.skuId) ?? '').trim();
    if (sku) skuIds.add(sku);
  }
  if (skuIds.size > 1) return sumAbs(values);
  return sumAbs(values);
}

function paymentBucketKey(
  row: Record<string, unknown>,
  lineIndex: number,
  col: TikTokSettlementCol,
): string {
  const payKeys = col.paymentId ?? [];
  const stmtKeys = col.statementId ?? [];
  if (!payKeys.length && !stmtKeys.length) return 'order:0';
  const payId = payKeys.length ? String(pick(row, payKeys) ?? '').trim() : '';
  if (payId) return `pay:${payId}`;
  const stmtId = stmtKeys.length ? String(pick(row, stmtKeys) ?? '').trim() : '';
  if (stmtId) return `stmt:${stmtId}`;
  return `line:${lineIndex}`;
}

function groupLinesByPayment(
  lines: Record<string, unknown>[],
  col: TikTokSettlementCol,
): Record<string, unknown>[][] {
  const buckets = new Map<string, Record<string, unknown>[]>();
  lines.forEach((row, i) => {
    const key = paymentBucketKey(row, i, col);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  });
  return [...buckets.values()];
}

/** Evita somar coluna-pai (Comissões de afiliados) com subcolunas já incluídas (shop ads). */
function linePartnerFee(r: Record<string, unknown>, col: TikTokSettlementCol): number {
  const affiliate = absCost(pick(r, col.affiliate));
  const creator = absCost(pick(r, col.creator));
  const agency = absCost(pick(r, col.agency));
  const shopAdsCreator = absCost(pick(r, col.shopAdsCreator));
  const shopAdsAgency = absCost(pick(r, col.shopAdsAgency));
  const shopSub = round2(shopAdsCreator + shopAdsAgency);
  const detailSub = round2(creator + shopSub);

  if (affiliate > AMOUNT_EPS) {
    if (detailSub > AMOUNT_EPS && Math.abs(affiliate - detailSub) <= AMOUNT_EPS) {
      return round2(affiliate + agency);
    }
    if (shopSub > AMOUNT_EPS && Math.abs(affiliate - shopSub) <= AMOUNT_EPS) {
      return round2(affiliate + agency + creator);
    }
    return round2(affiliate + agency + creator + shopSub);
  }

  return round2(creator + agency + shopSub);
}

function lineServiceFee(r: Record<string, unknown>, col: TikTokSettlementCol): number {
  const serviceCol = absCost(pick(r, col.serviceFee));
  if (serviceCol > AMOUNT_EPS) return serviceCol;

  const sfp = absCost(pick(r, col.sfpFee));
  const perItem = absCost(pick(r, col.perItemFee));
  const partsSum = round2(sfp + perItem);
  if (partsSum > AMOUNT_EPS) return partsSum;

  const taxes = absCost(pick(r, col.taxesTotal));
  if (taxes > AMOUNT_EPS) {
    const comm = absCost(pick(r, col.platformCommission));
    const partner = linePartnerFee(r, col);
    return round2(Math.max(0, taxes - comm - partner));
  }

  return 0;
}

function aggregatePaymentBucket(
  lines: Record<string, unknown>[],
  col: TikTokSettlementCol,
): Omit<TikTokAggregatedOrderRow, 'orderId' | 'paymentId'> {
  const settlements = lines.map((r) => parseBrNumber(pick(r, col.settlement)));
  const platformComm = lines.map((r) => absCost(pick(r, col.platformCommission)));
  const taxesTotal = lines.map((r) => absCost(pick(r, col.taxesTotal)));

  const taxesFromCol = dedupeOrSumAbs(taxesTotal, lines, col);
  const commissionFee = dedupeOrSumAbs(platformComm, lines, col);

  const partnerParts = lines.map((r) => linePartnerFee(r, col));
  const partnerCommission = dedupeOrSumAbs(partnerParts, lines, col);

  const lineServiceFees = lines.map((r) => lineServiceFee(r, col));
  let serviceFee = dedupeOrSumAbs(lineServiceFees, lines, col);
  if (serviceFee <= AMOUNT_EPS && taxesFromCol > AMOUNT_EPS) {
    serviceFee = round2(Math.max(0, taxesFromCol - commissionFee - partnerCommission));
  }

  return {
    settlementAmount: dedupeOrSumAbs(settlements, lines, col),
    commissionFee,
    serviceFee,
    partnerCommission,
    taxesAndFeesTotal:
      taxesFromCol || round2(commissionFee + serviceFee + partnerCommission),
  };
}

function collectPaymentIds(lines: Record<string, unknown>[], col: TikTokSettlementCol): string {
  const payKeys = col.paymentId ?? [];
  if (!payKeys.length) return '';
  const ids = new Set<string>();
  for (const r of lines) {
    const payId = String(pick(r, payKeys) ?? '').trim();
    if (payId) ids.add(payId);
  }
  return [...ids].join(', ');
}

export function aggregateOrderLines(
  orderId: string,
  lines: Record<string, unknown>[],
  col: TikTokSettlementCol,
): TikTokAggregatedOrderRow {
  const paymentBuckets = groupLinesByPayment(lines, col);

  let settlementAmount = 0;
  let commissionFee = 0;
  let serviceFee = 0;
  let partnerCommission = 0;
  let taxesAndFeesTotal = 0;

  for (const bucket of paymentBuckets) {
    const agg = aggregatePaymentBucket(bucket, col);
    settlementAmount = round2(settlementAmount + agg.settlementAmount);
    commissionFee = round2(commissionFee + agg.commissionFee);
    serviceFee = round2(serviceFee + agg.serviceFee);
    partnerCommission = round2(partnerCommission + agg.partnerCommission);
    taxesAndFeesTotal = round2(taxesAndFeesTotal + agg.taxesAndFeesTotal);
  }

  return {
    orderId,
    paymentId: collectPaymentIds(lines, col),
    settlementAmount,
    commissionFee,
    serviceFee,
    partnerCommission,
    taxesAndFeesTotal,
  };
}

export function expandSheetRange(sheet: XlsxSheet): boolean {
  let maxRow = 0;
  let maxCol = 0;
  for (const key of Object.keys(sheet)) {
    if (key[0] === '!') continue;
    try {
      const { r, c } = xlsx.utils.decode_cell(key);
      if (r > maxRow) maxRow = r;
      if (c > maxCol) maxCol = c;
    } catch {
      /* ignore malformed keys */
    }
  }
  if (maxRow === 0 && maxCol === 0) return false;

  const newRef = xlsx.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxRow, c: maxCol },
  });
  const prev = String(sheet['!ref'] ?? '');
  sheet['!ref'] = newRef;
  return prev !== newRef;
}

export function sheetToRowObjects(sheet: XlsxSheet): Record<string, unknown>[] {
  expandSheetRange(sheet);
  return xlsx.utils.sheet_to_json(sheet, {
    defval: '',
    raw: true,
  }) as Record<string, unknown>[];
}

export function sheetToArrays(sheet: XlsxSheet): unknown[][] {
  expandSheetRange(sheet);
  return xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];
}

export function normHeader(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function readWorkbook(filepath: string): { workbook: any; error?: string } {
  if (!filepath) {
    return { workbook: null, error: 'Caminho do arquivo inválido.' };
  }
  const ext = String(filepath).toLowerCase();
  const hasValidExt = ext.endsWith('.xlsx') || ext.endsWith('.xls');
  try {
    return { workbook: xlsx.readFile(filepath, { raw: true }) };
  } catch {
    if (!hasValidExt) {
      return { workbook: null, error: 'Use arquivo Excel (.xlsx ou .xls).' };
    }
    return { workbook: null, error: 'Não foi possível ler o arquivo Excel.' };
  }
}

export function findSheetByHint(sheetNames: string[], exact: string, hint: string): string | null {
  const found = sheetNames.find((n) => n === exact);
  if (found) return found;
  const want = normHeader(hint);
  return sheetNames.find((n) => normHeader(n).includes(want)) ?? null;
}

export function isOrderTransactionRow(txType: string): boolean {
  const t = String(txType ?? '').trim();
  return !t || t.toLowerCase() === 'pedido';
}

export function groupRowsByOrder(
  rows: Record<string, unknown>[],
  col: TikTokSettlementCol,
): { byOrder: Map<string, Record<string, unknown>[]>; orderRows: number } {
  const byOrder = new Map<string, Record<string, unknown>[]>();
  let orderRows = 0;

  for (const row of rows) {
    const txType = String(pick(row, col.txType) ?? '').trim();
    if (!isOrderTransactionRow(txType)) continue;

    const orderId = String(pick(row, col.orderId) ?? '').trim();
    if (!orderId) continue;

    orderRows++;
    if (!byOrder.has(orderId)) byOrder.set(orderId, []);
    byOrder.get(orderId)!.push(row);
  }

  return { byOrder, orderRows };
}
