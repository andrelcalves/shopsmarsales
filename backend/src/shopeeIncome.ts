/**
 * Parser do relatório de income / liquidação Shopee (aba "Renda", linhas Ver=Order).
 */
import {
  findSheetByHint,
  normHeader,
  parseBrNumber,
  readWorkbook,
  sheetToArrays,
} from './tiktokSettlementCommon.js';

const SHEET_RENDA = 'Renda';

const COL_VER = ['Ver'];
const COL_ORDER_ID = ['ID do pedido', 'ID do Pedido', 'Order ID'];
const COL_SETTLEMENT = ['Quantia total lançada (R$)', 'Quantia total lancada (R$)'];
const COL_COMMISSION = ['Taxa de comissão líquida', 'Taxa de comissao liquida', 'Net Commission Fee'];
const COL_SERVICE = ['Taxa de serviço líquida', 'Taxa de servico liquida'];
const COL_EASY_RETURN = ['Taxa de Devolução Fácil Shopee', 'Taxa de Devolucao Facil Shopee'];
const COL_AUTO_RECHARGE = ['Taxa da Recarga Automática (Pedido)', 'Taxa da Recarga Automatica (Pedido)'];
const COL_PAYMENT_DATE = ['Data de conclusão do pagamento', 'Data de conclusao do pagamento'];

export interface ShopeeIncomeOrderRow {
  orderId: string;
  settlementAmount: number;
  commissionFee: number;
  serviceFee: number;
  easyReturnFee: number;
  autoRechargeFee: number;
  paymentCompletedAt?: string;
}

export interface ParseShopeeIncomeResult {
  orders: ShopeeIncomeOrderRow[];
  rawRows: number;
  orderRows: number;
  message: string;
}

function colIndex(header: string[], keys: readonly string[]): number {
  const wants = keys.map((k) => normHeader(k));
  for (let i = 0; i < header.length; i++) {
    const h = normHeader(header[i] ?? '');
    if (!h) continue;
    if (wants.includes(h)) return i;
    for (const w of wants) {
      if (h.includes(w) || w.includes(h)) return i;
    }
  }
  return -1;
}

function cellStr(row: unknown[], idx: number): string {
  if (idx < 0 || idx >= row.length) return '';
  return String(row[idx] ?? '').trim();
}

function absFee(v: unknown): number {
  return Math.abs(parseBrNumber(v));
}

export function hasShopeeIncomeSheet(sheetNames: string[]): boolean {
  return findSheetByHint(sheetNames, SHEET_RENDA, 'renda') != null;
}

export function parseShopeeIncomeReport(filepath: string): ParseShopeeIncomeResult {
  const { workbook, error } = readWorkbook(filepath);
  if (error || !workbook) {
    return { orders: [], rawRows: 0, orderRows: 0, message: error || 'Arquivo inválido.' };
  }

  const sheetName = findSheetByHint(workbook.SheetNames, SHEET_RENDA, 'renda');
  if (!sheetName) {
    return {
      orders: [],
      rawRows: 0,
      orderRows: 0,
      message: `Aba "${SHEET_RENDA}" não encontrada.`,
    };
  }

  const rows = sheetToArrays(workbook.Sheets[sheetName]);
  let headerIdx = -1;
  let header: string[] = [];

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = (rows[i] || []).map((c) => String(c ?? '').trim());
    const hasOrderId = r.some((c) => normHeader(c).includes('id do pedido'));
    const hasVer = r.some((c) => normHeader(c) === 'ver');
    if (hasOrderId && hasVer) {
      headerIdx = i;
      header = r;
      break;
    }
  }

  if (headerIdx < 0) {
    return {
      orders: [],
      rawRows: 0,
      orderRows: 0,
      message: 'Cabeçalho da aba Renda não encontrado (ID do pedido / Ver).',
    };
  }

  const idxVer = colIndex(header, COL_VER);
  const idxOrderId = colIndex(header, COL_ORDER_ID);
  const idxSettlement = colIndex(header, COL_SETTLEMENT);
  const idxCommission = colIndex(header, COL_COMMISSION);
  const idxService = colIndex(header, COL_SERVICE);
  const idxEasyReturn = colIndex(header, COL_EASY_RETURN);
  const idxAutoRecharge = colIndex(header, COL_AUTO_RECHARGE);
  const idxPaymentDate = colIndex(header, COL_PAYMENT_DATE);

  if (idxVer < 0 || idxOrderId < 0) {
    return {
      orders: [],
      rawRows: 0,
      orderRows: 0,
      message: 'Colunas Ver ou ID do pedido ausentes na aba Renda.',
    };
  }

  const byOrder = new Map<string, ShopeeIncomeOrderRow>();
  let orderRows = 0;
  const dataRows = rows.length - headerIdx - 1;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const ver = cellStr(row, idxVer);
    if (normHeader(ver) !== 'order') continue;

    const orderId = cellStr(row, idxOrderId);
    if (!orderId || orderId === '-') continue;

    orderRows++;
    const paymentCompletedAt = idxPaymentDate >= 0 ? cellStr(row, idxPaymentDate) : undefined;

    byOrder.set(orderId, {
      orderId,
      settlementAmount: idxSettlement >= 0 ? parseBrNumber(row[idxSettlement]) : 0,
      commissionFee: idxCommission >= 0 ? absFee(row[idxCommission]) : 0,
      serviceFee: idxService >= 0 ? absFee(row[idxService]) : 0,
      easyReturnFee: idxEasyReturn >= 0 ? absFee(row[idxEasyReturn]) : 0,
      autoRechargeFee: idxAutoRecharge >= 0 ? absFee(row[idxAutoRecharge]) : 0,
      paymentCompletedAt: paymentCompletedAt || undefined,
    });
  }

  const orders = [...byOrder.values()];

  return {
    orders,
    rawRows: dataRows,
    orderRows,
    message: orders.length === 0 ? 'Nenhum pedido (Ver=Order) encontrado na aba Renda.' : '',
  };
}
