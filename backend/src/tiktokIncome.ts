/**
 * Parser do relatório de income / liquidação TikTok Shop (aba "Detalhes do pedido").
 */
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const xlsx = require('xlsx');

const SHEET_ORDER_DETAILS = 'Detalhes do pedido';

const COL = {
  txType: ['Tipo de transação', 'Tipo de transacao'],
  orderId: ['ID do pedido/ajuste', 'ID do pedido'],
  paymentId: ['ID do pagamento'],
  statementId: ['ID do demonstrativo'],
  settlement: ['Valor total a ser liquidado'],
  platformCommission: ['Tarifa de comissão da plataforma', 'Tarifa de comissao da plataforma'],
  serviceFee: ['Taxas de serviço', 'Taxas de servico'],
  sfpFee: ['Taxa de serviço do SFP', 'Taxa de servico do SFP'],
  perItemFee: ['Taxa por item vendido'],
  taxesTotal: ['Taxas e impostos'],
  affiliate: ['Comissões de afiliados', 'Comissoes de afiliados'],
  creator: ['Comissão paga aos criadores', 'Comissao paga aos criadores'],
  agency: ['Comissão paga às agências parceiras', 'Comissao paga as agencias parceiras'],
  shopAdsCreator: [
    'Comissão de Anúncios da loja paga aos criadores',
    'Comissao de Anuncios da loja paga aos criadores',
  ],
  shopAdsAgency: [
    'Comissão de Anúncios da loja paga às agências parceiras',
    'Comissao de Anuncios da loja paga as agencias parceiras',
  ],
} as const;

export interface TikTokIncomeOrderRow {
  orderId: string;
  paymentId: string;
  settlementAmount: number;
  commissionFee: number;
  serviceFee: number;
  partnerCommission: number;
  taxesAndFeesTotal: number;
}

export interface ParseTikTokIncomeResult {
  orders: TikTokIncomeOrderRow[];
  rawRows: number;
  orderRows: number;
  message: string;
}

function pick(row: Record<string, unknown>, keys: readonly string[]): unknown {
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

function parseBrNumber(v: unknown): number {
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

const AMOUNT_EPS = 0.02;

function round2(n: number): number {
  return Number(n.toFixed(2));
}

/** Se todos os valores (abs) forem iguais, retorna um; senão soma (valores distintos por SKU). */
function dedupeOrSumAbs(values: number[]): number {
  const abs = values.map((v) => round2(Math.abs(v)));
  if (abs.length === 0) return 0;
  const first = abs[0];
  if (abs.every((v) => Math.abs(v - first) <= AMOUNT_EPS)) return first;
  return round2(abs.reduce((a, b) => a + b, 0));
}

function paymentBucketKey(row: Record<string, unknown>, lineIndex: number): string {
  const payId = String(pick(row, COL.paymentId) ?? '').trim();
  if (payId) return `pay:${payId}`;
  const stmtId = String(pick(row, COL.statementId) ?? '').trim();
  if (stmtId) return `stmt:${stmtId}`;
  return `line:${lineIndex}`;
}

function groupLinesByPayment(lines: Record<string, unknown>[]): Record<string, unknown>[][] {
  const buckets = new Map<string, Record<string, unknown>[]>();
  lines.forEach((row, i) => {
    const key = paymentBucketKey(row, i);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  });
  return [...buckets.values()];
}

function aggregatePaymentBucket(lines: Record<string, unknown>[]): {
  settlementAmount: number;
  commissionFee: number;
  serviceFee: number;
  partnerCommission: number;
  taxesAndFeesTotal: number;
} {
  const settlements = lines.map((r) => parseBrNumber(pick(r, COL.settlement)));
  const platformComm = lines.map((r) => absCost(pick(r, COL.platformCommission)));
  const taxesTotal = lines.map((r) => absCost(pick(r, COL.taxesTotal)));

  const lineServiceFees = lines.map((r) => {
    const taxes = absCost(pick(r, COL.taxesTotal));
    const comm = absCost(pick(r, COL.platformCommission));
    if (taxes > AMOUNT_EPS) return round2(Math.max(0, taxes - comm));
    const parts = [
      absCost(pick(r, COL.serviceFee)),
      absCost(pick(r, COL.sfpFee)),
      absCost(pick(r, COL.perItemFee)),
    ].filter((v) => v > AMOUNT_EPS);
    return parts.length ? Math.max(...parts) : 0;
  });

  const taxesFromCol = dedupeOrSumAbs(taxesTotal);
  const commissionFee = dedupeOrSumAbs(platformComm);
  let serviceFee = dedupeOrSumAbs(lineServiceFees);
  if (serviceFee <= AMOUNT_EPS && taxesFromCol > AMOUNT_EPS) {
    serviceFee = round2(Math.max(0, taxesFromCol - commissionFee));
  }

  const partnerParts = lines.map((r) => {
    return (
      absCost(pick(r, COL.affiliate)) +
      absCost(pick(r, COL.creator)) +
      absCost(pick(r, COL.agency)) +
      absCost(pick(r, COL.shopAdsCreator)) +
      absCost(pick(r, COL.shopAdsAgency))
    );
  });
  const partnerCommission = dedupeOrSumAbs(partnerParts);

  return {
    settlementAmount: dedupeOrSumAbs(settlements),
    commissionFee,
    serviceFee,
    partnerCommission,
    taxesAndFeesTotal: taxesFromCol || round2(commissionFee + serviceFee),
  };
}

function collectPaymentIds(lines: Record<string, unknown>[]): string {
  const ids = new Set<string>();
  for (const r of lines) {
    const payId = String(pick(r, COL.paymentId) ?? '').trim();
    if (payId) ids.add(payId);
  }
  return [...ids].join(', ');
}

function aggregateOrderLines(
  orderId: string,
  lines: Record<string, unknown>[],
): TikTokIncomeOrderRow {
  const paymentBuckets = groupLinesByPayment(lines);

  let settlementAmount = 0;
  let commissionFee = 0;
  let serviceFee = 0;
  let partnerCommission = 0;
  let taxesAndFeesTotal = 0;

  for (const bucket of paymentBuckets) {
    const agg = aggregatePaymentBucket(bucket);
    settlementAmount = round2(settlementAmount + agg.settlementAmount);
    commissionFee = round2(commissionFee + agg.commissionFee);
    serviceFee = round2(serviceFee + agg.serviceFee);
    partnerCommission = round2(partnerCommission + agg.partnerCommission);
    taxesAndFeesTotal = round2(taxesAndFeesTotal + agg.taxesAndFeesTotal);
  }

  return {
    orderId,
    paymentId: collectPaymentIds(lines),
    settlementAmount,
    commissionFee,
    serviceFee,
    partnerCommission,
    taxesAndFeesTotal,
  };
}

function findSheetName(sheetNames: string[]): string | null {
  const exact = sheetNames.find((n) => n === SHEET_ORDER_DETAILS);
  if (exact) return exact;
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  return sheetNames.find((n) => norm(n).includes('detalhes do pedido')) ?? null;
}

type XlsxSheet = Record<string, unknown>;

/**
 * TikTok exports often declare a tiny !ref (e.g. A1:AM4) while real rows exist in the XML.
 * SheetJS respects !ref and would drop rows — expand from actual cell keys.
 */
function expandSheetRange(sheet: XlsxSheet): boolean {
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

function sheetToRowObjects(sheet: XlsxSheet): Record<string, unknown>[] {
  expandSheetRange(sheet);
  return xlsx.utils.sheet_to_json(sheet, {
    defval: '',
    raw: true,
  }) as Record<string, unknown>[];
}

export function parseTikTokIncomeReport(filepath: string): ParseTikTokIncomeResult {
  const ext = String(path.extname(filepath || '')).toLowerCase();
  if (ext !== '.xlsx' && ext !== '.xls') {
    return { orders: [], rawRows: 0, orderRows: 0, message: 'Use arquivo Excel (.xlsx ou .xls).' };
  }

  const workbook = xlsx.readFile(filepath, { raw: true });
  const sheetName = findSheetName(workbook.SheetNames);
  if (!sheetName) {
    return {
      orders: [],
      rawRows: 0,
      orderRows: 0,
      message: `Aba "${SHEET_ORDER_DETAILS}" não encontrada.`,
    };
  }

  const sheet = workbook.Sheets[sheetName] as XlsxSheet;
  const rows = sheetToRowObjects(sheet);

  const byOrder = new Map<string, Record<string, unknown>[]>();
  let orderRows = 0;

  for (const row of rows) {
    const txType = String(pick(row, COL.txType) ?? '').trim();
    if (txType && txType.toLowerCase() !== 'pedido') continue;

    const orderId = String(pick(row, COL.orderId) ?? '').trim();
    if (!orderId) continue;

    orderRows++;
    if (!byOrder.has(orderId)) byOrder.set(orderId, []);
    byOrder.get(orderId)!.push(row);
  }

  const orders: TikTokIncomeOrderRow[] = [];
  for (const [orderId, lines] of byOrder.entries()) {
    orders.push(aggregateOrderLines(orderId, lines));
  }

  return {
    orders,
    rawRows: rows.length,
    orderRows,
    message: '',
  };
}
