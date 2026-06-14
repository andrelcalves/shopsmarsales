/**
 * Métricas P&L da simulação (por mês e canal) — compartilhado entre /api/simulation e /api/contribution-dashboard.
 */
import { Prisma } from '@prisma/client';
import { resolveCombinedCost } from './masterProductCost.js';
import { loadCombinedCostLookup } from './masterProductRoutes.js';

export const TRAY_SOURCE_ATACADO = 'tray_atacado';
export const TRAY_SOURCE_VAREJO = 'tray_varejo';
const TRAY_ORDER_SOURCES_LIST = [TRAY_SOURCE_ATACADO, TRAY_SOURCE_VAREJO, 'tray'] as const;

export const CONTRIBUTION_DASHBOARD_CHANNELS = [
  'shopee',
  'tiktok',
  TRAY_SOURCE_ATACADO,
  TRAY_SOURCE_VAREJO,
] as const;

export type ContributionDashboardChannel = (typeof CONTRIBUTION_DASHBOARD_CHANNELS)[number];

const ORDER_STATUS_EXCLUDED: Prisma.OrderWhereInput[] = [
  { status: { contains: 'ancelado', mode: 'insensitive' } },
  { status: { contains: 'Não pago', mode: 'insensitive' } },
  { status: { contains: 'Aguardando pagamento', mode: 'insensitive' } },
  { status: 'Devolvido' },
];

function isTrayOrderSource(source: string): boolean {
  const s = String(source || '').toLowerCase();
  return s === 'tray' || s === TRAY_SOURCE_ATACADO || s === TRAY_SOURCE_VAREJO;
}

function resolveTraySubSource(orderId: string): string {
  const oid = String(orderId || '').trim();
  const first = oid.charAt(0);
  if (first === '5') return TRAY_SOURCE_ATACADO;
  if (first === '2') return TRAY_SOURCE_VAREJO;
  return 'tray';
}

function feeChannelForTrayOrder(orderSource: string, orderId: string): string {
  if (orderSource === TRAY_SOURCE_ATACADO || orderSource === TRAY_SOURCE_VAREJO) return orderSource;
  if (orderSource === 'tray') return resolveTraySubSource(orderId);
  return orderSource;
}

function collectProductIdsFromOrders(
  orders: Array<{ items: Array<{ productId: number | null }> }>,
): number[] {
  const ids = new Set<number>();
  for (const o of orders) {
    for (const item of o.items) {
      if (item.productId != null) ids.add(item.productId);
    }
  }
  return [...ids];
}

export function monthStartFromYYYYMM(v: string): Date | null {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]) - 1;
  const d = new Date(yyyy, mm, 1);
  return isNaN(d.getTime()) ? null : d;
}

export function monthStrFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function listMonthsInclusive(from: string, to: string): string[] {
  const start = monthStartFromYYYYMM(from);
  const end = monthStartFromYYYYMM(to);
  if (!start || !end) return from ? [from] : [];
  const lo = start.getTime() <= end.getTime() ? start : end;
  const hi = start.getTime() <= end.getTime() ? end : start;
  const out: string[] = [];
  const cur = new Date(lo.getFullYear(), lo.getMonth(), 1);
  const last = new Date(hi.getFullYear(), hi.getMonth(), 1);
  while (cur.getTime() <= last.getTime()) {
    out.push(monthStrFromDate(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return out.length ? out : [monthStrFromDate(lo)];
}

export function buildSimulationOrderWhere(monthStart: Date, channelRaw: string): Prisma.OrderWhereInput {
  const channel = String(channelRaw || 'all').trim().toLowerCase();
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const orderWhere: Prisma.OrderWhereInput = {
    orderDate: { gte: monthStart, lt: monthEnd },
    NOT: [...ORDER_STATUS_EXCLUDED],
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

export type SimulationMetrics = {
  month: string;
  channel: string;
  faturamentoBruto: number;
  adsInvestimento: number;
  adsPercent: number;
  taxasShopee: number;
  taxasShopeePercent: number;
  taxasTiktok: number;
  taxasTiktokPercent: number;
  taxasCartaoPix: number;
  taxasCartaoPixPercent: number;
  frete: number;
  fretePercent: number;
  custoProducao: number;
  custoProducaoPercent: number;
  custoFixo: number;
  custoFixoPercent: number;
  imposto: number;
  impostoPercent: number;
  margemContribuicao: number;
  margemContribuicaoPercent: number;
  lucroLiquido: number;
  margemLucro: number;
};

export function taxasForChannel(m: SimulationMetrics, channel: string): number {
  const ch = String(channel || '').toLowerCase();
  if (ch === 'shopee') return m.taxasShopee;
  if (ch === 'tiktok') return m.taxasTiktok;
  if (ch === TRAY_SOURCE_ATACADO || ch === TRAY_SOURCE_VAREJO) {
    return m.taxasCartaoPix + m.frete;
  }
  return m.taxasShopee + m.taxasTiktok + m.taxasCartaoPix + m.frete;
}

export async function computeSimulationMetrics(
  prisma: any,
  monthStr: string,
  channel: string,
  taxPercent = 5,
): Promise<SimulationMetrics | null> {
  const monthStart = monthStartFromYYYYMM(monthStr);
  if (!monthStart) return null;

  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const orderWhere = buildSimulationOrderWhere(monthStart, channel);

  const orders = await prisma.order.findMany({
    where: orderWhere,
    include: { items: { include: { product: true } } },
  });

  const totalRevenue = orders.reduce((s: number, o: { totalPrice: number | null }) => s + (o.totalPrice || 0), 0);

  const isTrayChannelFilter =
    channel === 'tray' || channel === TRAY_SOURCE_ATACADO || channel === TRAY_SOURCE_VAREJO;

  const shopeeFees =
    isTrayChannelFilter || channel === 'tiktok'
      ? 0
      : orders
          .filter((o: { source: string }) => o.source === 'shopee')
          .reduce(
            (s: number, o: { commissionFee: number | null; serviceFee: number | null }) =>
              s + (o.commissionFee || 0) + (o.serviceFee || 0),
            0,
          );

  const tiktokFees =
    isTrayChannelFilter || channel === 'shopee'
      ? 0
      : orders
          .filter((o: { source: string }) => o.source === 'tiktok')
          .reduce(
            (s: number, o: { commissionFee: number | null; serviceFee: number | null; partnerCommission?: number | null }) =>
              s +
              (o.commissionFee || 0) +
              (o.serviceFee || 0) +
              (o.partnerCommission || 0),
            0,
          );

  const trayOrders = orders.filter((o: { source: string }) => isTrayOrderSource(o.source));

  const feePercentFor = (feeByCh: Map<string, Map<string, number>>, ch: string, pt: string): number => {
    const trimmed = String(pt || '').trim();
    return feeByCh.get(ch)?.get(trimmed) ?? feeByCh.get('tray')?.get(trimmed) ?? 0;
  };

  let cardPix = 0;
  if (isTrayChannelFilter || channel === 'all') {
    const feeRows = await prisma.paymentTypeFee.findMany({
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
      const pt = String(o.paymentType || '').trim();
      const feeCh = feeChannelForTrayOrder(o.source, o.orderId);
      const pct = feePercentFor(feeByCh, feeCh, pt);
      cardPix += (o.totalPrice || 0) * (pct / 100);
    }
  }

  const freight =
    isTrayChannelFilter || channel === 'all'
      ? orders
          .filter((o: { source: string; freight?: number | null }) => isTrayOrderSource(o.source))
          .reduce((s: number, o: { freight?: number | null }) => s + (o.freight || 0), 0)
      : 0;

  const simProductIds = collectProductIdsFromOrders(orders);
  const simCombined = await loadCombinedCostLookup(prisma, simProductIds);

  const productionCost = orders.reduce(
    (s: number, o: { orderDate: Date; items: Array<{ productId: number | null; quantity: number; product?: { costPrice: number | null } | null }> }) => {
      const orderDate = new Date(o.orderDate);
      for (const item of o.items) {
        const unitCost = resolveCombinedCost(
          simCombined,
          item.productId,
          orderDate,
          item.product?.costPrice,
        );
        s += unitCost * (item.quantity || 0);
      }
      return s;
    },
    0,
  );

  const adSpendWhere: { month: { gte: Date; lt: Date }; channel?: string | { in: string[] } } = {
    month: { gte: monthStart, lt: monthEnd },
  };
  if (channel !== 'all') {
    if (channel === 'tray') {
      adSpendWhere.channel = { in: ['tray', TRAY_SOURCE_ATACADO, TRAY_SOURCE_VAREJO] };
    } else {
      adSpendWhere.channel = channel;
    }
  }
  const adSpendRows = await prisma.adSpend.findMany({ where: adSpendWhere });
  const adsSpend = adSpendRows.reduce((s: number, r: { amount: number | null }) => s + Number(r.amount || 0), 0);

  const fixedCostPayments = await prisma.billPayment.findMany({
    where: {
      dueDate: { gte: monthStart, lt: monthEnd },
      bill: { isFixedCost: true },
    },
    include: { bill: true },
  });
  const fixedCost = fixedCostPayments.reduce(
    (s: number, p: { amount: number | null }) => s + Number(p.amount || 0),
    0,
  );

  const allOrdersForProportion =
    channel !== 'all'
      ? await prisma.order.findMany({
          where: {
            orderDate: { gte: monthStart, lt: monthEnd },
            NOT: [...ORDER_STATUS_EXCLUDED],
          },
        })
      : orders;
  const totalRevenueAll = allOrdersForProportion.reduce(
    (s: number, o: { totalPrice: number | null }) => s + (o.totalPrice || 0),
    0,
  );
  const fixedCostProportional =
    totalRevenueAll > 0 && channel !== 'all' ? fixedCost * (totalRevenue / totalRevenueAll) : fixedCost;

  const tax = totalRevenue * (taxPercent / 100);
  const variableCosts = adsSpend + shopeeFees + tiktokFees + cardPix + freight + productionCost + tax;
  const contributionMargin = totalRevenue - variableCosts;
  const contributionMarginPercent = totalRevenue > 0 ? (contributionMargin / totalRevenue) * 100 : 0;
  const profit = contributionMargin - fixedCostProportional;
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  const pct = (v: number) => (totalRevenue > 0 ? Number(((v / totalRevenue) * 100).toFixed(2)) : 0);

  return {
    month: monthStr,
    channel,
    faturamentoBruto: Number(totalRevenue.toFixed(2)),
    adsInvestimento: Number(adsSpend.toFixed(2)),
    adsPercent: pct(adsSpend),
    taxasShopee: Number(shopeeFees.toFixed(2)),
    taxasShopeePercent: pct(shopeeFees),
    taxasTiktok: Number(tiktokFees.toFixed(2)),
    taxasTiktokPercent: pct(tiktokFees),
    taxasCartaoPix: Number(cardPix.toFixed(2)),
    taxasCartaoPixPercent: pct(cardPix),
    frete: Number(freight.toFixed(2)),
    fretePercent: pct(freight),
    custoProducao: Number(productionCost.toFixed(2)),
    custoProducaoPercent: pct(productionCost),
    custoFixo: Number(fixedCostProportional.toFixed(2)),
    custoFixoPercent: pct(fixedCostProportional),
    imposto: Number(tax.toFixed(2)),
    impostoPercent: taxPercent,
    margemContribuicao: Number(contributionMargin.toFixed(2)),
    margemContribuicaoPercent: Number(contributionMarginPercent.toFixed(2)),
    lucroLiquido: Number(profit.toFixed(2)),
    margemLucro: Number(margin.toFixed(2)),
  };
}

export type ContributionChannelRow = {
  channel: string;
  faturamentoBruto: number;
  adsInvestimento: number;
  taxas: number;
  taxasCartaoPix: number;
  frete: number;
  custoProducao: number;
  margemContribuicao: number;
  margemContribuicaoPercent: number;
};

export async function computeContributionDashboard(
  prisma: any,
  from: string,
  to: string,
): Promise<{
  from: string;
  to: string;
  channels: string[];
  byMonth: Array<{ month: string; byChannel: ContributionChannelRow[] }>;
}> {
  const months = listMonthsInclusive(from, to);
  const rangeFrom = months[0] ?? from;
  const rangeTo = months[months.length - 1] ?? to;

  const byMonth: Array<{ month: string; byChannel: ContributionChannelRow[] }> = [];

  for (const month of months) {
    const byChannel: ContributionChannelRow[] = [];
    for (const ch of CONTRIBUTION_DASHBOARD_CHANNELS) {
      const m = await computeSimulationMetrics(prisma, month, ch);
      if (!m) continue;
      byChannel.push({
        channel: ch,
        faturamentoBruto: m.faturamentoBruto,
        adsInvestimento: m.adsInvestimento,
        taxas: taxasForChannel(m, ch),
        taxasCartaoPix: m.taxasCartaoPix,
        frete: m.frete,
        custoProducao: m.custoProducao,
        margemContribuicao: m.margemContribuicao,
        margemContribuicaoPercent: m.margemContribuicaoPercent,
      });
    }
    byMonth.push({ month, byChannel });
  }

  return {
    from: rangeFrom,
    to: rangeTo,
    channels: [...CONTRIBUTION_DASHBOARD_CHANNELS],
    byMonth,
  };
}
