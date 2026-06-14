/**
 * Parser do relatório de income / liquidação TikTok Shop (aba "Detalhes do pedido").
 */
import {
  aggregateOrderLines,
  findSheetByHint,
  groupRowsByOrder,
  readWorkbook,
  sheetToRowObjects,
  type TikTokSettlementCol,
  type XlsxSheet,
} from './tiktokSettlementCommon.js';

const SHEET_ORDER_DETAILS = 'Detalhes do pedido';

export const INCOME_COL: TikTokSettlementCol = {
  txType: ['Tipo de transação', 'Tipo de transacao'],
  orderId: ['ID do pedido/ajuste', 'ID do pedido'],
  paymentId: ['ID do pagamento'],
  statementId: ['ID do demonstrativo'],
  skuId: ['ID do SKU', 'ID do SKU/Produto'],
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
};

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

export function hasTikTokIncomeSheet(sheetNames: string[]): boolean {
  return findSheetByHint(sheetNames, SHEET_ORDER_DETAILS, 'detalhes do pedido') != null;
}

export function parseTikTokIncomeReport(filepath: string): ParseTikTokIncomeResult {
  const { workbook, error } = readWorkbook(filepath);
  if (error || !workbook) {
    return { orders: [], rawRows: 0, orderRows: 0, message: error || 'Arquivo inválido.' };
  }

  const sheetName = findSheetByHint(workbook.SheetNames, SHEET_ORDER_DETAILS, 'detalhes do pedido');
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
  const { byOrder, orderRows } = groupRowsByOrder(rows, INCOME_COL);

  const orders: TikTokIncomeOrderRow[] = [];
  for (const [orderId, lines] of byOrder.entries()) {
    orders.push(aggregateOrderLines(orderId, lines, INCOME_COL));
  }

  return {
    orders,
    rawRows: rows.length,
    orderRows,
    message: '',
  };
}
