/**
 * Parser do relatório onhold / pedidos não liquidados TikTok Shop.
 */
import {
  aggregateOrderLines,
  findSheetByHint,
  normHeader,
  readWorkbook,
  sheetToArrays,
  type TikTokSettlementCol,
  type XlsxSheet,
} from './tiktokSettlementCommon.js';

const SHEET_ONHOLD = 'Pedidos não liquidados e ajuste';

export const ONHOLD_COL: TikTokSettlementCol = {
  txType: ['Tipo de transação', 'Tipo de transacao'],
  orderId: ['ID do pedido/ajuste', 'ID do pedido'],
  skuId: ['ID do SKU', 'ID do SKU/Produto'],
  settlement: ['Valor estimado a ser liquidado'],
  platformCommission: ['Tarifa de comissão da plataforma', 'Tarifa de comissao da plataforma'],
  serviceFee: ['Taxas de serviço', 'Taxas de servico'],
  sfpFee: ['Taxa de serviço do SFP', 'Taxa de servico do SFP'],
  perItemFee: ['Taxa por item vendido'],
  taxesTotal: ['Taxas e impostos'],
  affiliate: ['Comissões de afiliados', 'Comissoes de afiliados'],
  creator: ['Comissão de afiliada estimada', 'Comissao de afiliada estimada'],
  agency: ['Comissão paga às agências parceiras', 'Comissao paga as agencias parceiras'],
  shopAdsCreator: [
    'Comissão de Anúncios da loja paga aos criadores',
    'Comissao de Anuncios da loja paga aos criadores',
  ],
  shopAdsAgency: [
    'Comissão de Anúncios da loja paga às agências parceiras',
    'Comissao de Anuncios da loja paga as agencias parceiras',
  ],
};

export interface TikTokOnholdOrderRow {
  orderId: string;
  estimatedSettlementAmount: number;
  commissionFee: number;
  serviceFee: number;
  partnerCommission: number;
  taxesAndFeesTotal: number;
}

export interface ParseTikTokOnholdResult {
  orders: TikTokOnholdOrderRow[];
  rawRows: number;
  orderRows: number;
  message: string;
}

export function hasTikTokOnholdSheet(sheetNames: string[]): boolean {
  return (
    findSheetByHint(sheetNames, SHEET_ONHOLD, 'pedidos nao liquidados') != null ||
    findSheetByHint(sheetNames, SHEET_ONHOLD, 'nao liquidados e ajuste') != null
  );
}

function arraysToRowObjects(arrays: unknown[][]): Record<string, unknown>[] {
  const headerIdx = arrays.findIndex((row) => {
    const first = normHeader(String(row?.[0] ?? ''));
    return first === 'tipo de transacao';
  });
  if (headerIdx < 0) return [];

  const headers = (arrays[headerIdx] as unknown[]).map((h) => String(h ?? '').trim());
  const rows: Record<string, unknown>[] = [];

  for (let i = headerIdx + 1; i < arrays.length; i++) {
    const line = arrays[i] as unknown[];
    if (!line || !line.length) continue;
    const obj: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((header, colIdx) => {
      if (!header) return;
      const val = line[colIdx] ?? '';
      if (val !== '' && val != null) hasValue = true;
      obj[header] = val;
    });
    if (hasValue) rows.push(obj);
  }

  return rows;
}

export function parseTikTokOnholdReport(filepath: string): ParseTikTokOnholdResult {
  const { workbook, error } = readWorkbook(filepath);
  if (error || !workbook) {
    return { orders: [], rawRows: 0, orderRows: 0, message: error || 'Arquivo inválido.' };
  }

  const sheetName =
    findSheetByHint(workbook.SheetNames, SHEET_ONHOLD, 'pedidos nao liquidados') ??
    findSheetByHint(workbook.SheetNames, SHEET_ONHOLD, 'nao liquidados e ajuste');
  if (!sheetName) {
    return {
      orders: [],
      rawRows: 0,
      orderRows: 0,
      message: `Aba "${SHEET_ONHOLD}" não encontrada.`,
    };
  }

  const sheet = workbook.Sheets[sheetName] as XlsxSheet;
  const arrays = sheetToArrays(sheet);
  const rows = arraysToRowObjects(arrays);

  const byOrder = new Map<string, Record<string, unknown>[]>();
  let orderRows = 0;

  for (const row of rows) {
    const txType = String(row['Tipo de transação'] ?? row['Tipo de transacao'] ?? '').trim();
    if (txType && txType.toLowerCase() !== 'pedido') continue;

    const orderId = String(
      row['ID do pedido/ajuste'] ?? row['ID do pedido'] ?? '',
    ).trim();
    if (!orderId) continue;

    orderRows++;
    if (!byOrder.has(orderId)) byOrder.set(orderId, []);
    byOrder.get(orderId)!.push(row);
  }

  const orders: TikTokOnholdOrderRow[] = [];
  for (const [orderId, lines] of byOrder.entries()) {
    const agg = aggregateOrderLines(orderId, lines, ONHOLD_COL);
    orders.push({
      orderId,
      estimatedSettlementAmount: agg.settlementAmount,
      commissionFee: agg.commissionFee,
      serviceFee: agg.serviceFee,
      partnerCommission: agg.partnerCommission,
      taxesAndFeesTotal: agg.taxesAndFeesTotal,
    });
  }

  return {
    orders,
    rawRows: rows.length,
    orderRows,
    message: '',
  };
}
