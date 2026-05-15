import React, { useEffect, useState } from "react";

import { API_URL } from './config';

type SimulationData = {
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
  lucroLiquido: number;
  margemLucro: number;
};

type SimulationItemKey =
  | "adsInvestimento"
  | "taxasShopee"
  | "taxasTiktok"
  | "taxasCartaoPix"
  | "frete"
  | "custoProducao"
  | "custoFixo"
  | "imposto";

type ProductionCostLine = {
  productId: number | null;
  productCode: string;
  name: string;
  unitCost: number;
  quantity: number;
  totalCost: number;
};

type ProductionCostDetail = {
  month: string;
  channel: string;
  lines: ProductionCostLine[];
  totalQuantity: number;
  totalCost: number;
};

type GrossRevenueItem = {
  productCode: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type GrossRevenueOrder = {
  orderId: string;
  source: string;
  orderDate: string;
  totalPrice: number;
  unitsInOrder: number;
  items: GrossRevenueItem[];
};

type GrossRevenueDetail = {
  month: string;
  channel: string;
  orders: GrossRevenueOrder[];
  totalOrders: number;
  totalProductUnits: number;
  faturamentoBruto: number;
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

const UI = {
  bg: "bg-slate-50",
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

function fmtMoney(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function monthToDate(m: string) {
  const [y, mm] = (m || "").split("-").map((v) => Number(v));
  if (!y || !mm) return null;
  const d = new Date(y, mm - 1, 1);
  if (isNaN(d.getTime())) return null;
  return d;
}

function monthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function clampMonthRange(a: string, b: string) {
  const da = monthToDate(a);
  const db = monthToDate(b);
  if (!da || !db) return { start: a, end: b };
  return da.getTime() <= db.getTime() ? { start: a, end: b } : { start: b, end: a };
}

function listMonthsInclusive(start: string, end: string) {
  const ds = monthToDate(start);
  const de = monthToDate(end);
  if (!ds || !de) return [start];
  const out: string[] = [];
  const cur = new Date(ds.getFullYear(), ds.getMonth(), 1);
  const last = new Date(de.getFullYear(), de.getMonth(), 1);
  while (cur.getTime() <= last.getTime()) {
    out.push(monthStr(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return out.length ? out : [start];
}

const channelLabel: Record<string, string> = {
  all: "Todos os canais",
  shopee: "Shopee",
  tiktok: "TikTok",
  tray: "Site Tray (atacado + varejo)",
  tray_atacado: "Tray Atacado",
  tray_varejo: "Tray Varejo",
};

export default function Simulation(): JSX.Element {
  const [baseData, setBaseData] = useState<SimulationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [detailKind, setDetailKind] = useState<null | "custo" | "faturamento">(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [custoDetail, setCustoDetail] = useState<ProductionCostDetail | null>(null);
  const [fatDetail, setFatDetail] = useState<GrossRevenueDetail | null>(null);

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [startMonth, setStartMonth] = useState(defaultMonth);
  const [endMonth, setEndMonth] = useState(defaultMonth);
  const [channel, setChannel] = useState<string>("all");

  const [include, setInclude] = useState<Record<SimulationItemKey, boolean>>({
    adsInvestimento: true,
    taxasShopee: true,
    taxasTiktok: true,
    taxasCartaoPix: true,
    frete: true,
    custoProducao: true,
    custoFixo: true,
    imposto: true,
  });

  function toggleInclude(key: SimulationItemKey) {
    setInclude((s) => ({ ...s, [key]: !s[key] }));
  }

  function computeViewData(d: SimulationData | null): SimulationData | null {
    if (!d) return null;
    const faturamentoBruto = Number(d.faturamentoBruto || 0);

    const adsInvestimento = include.adsInvestimento ? Number(d.adsInvestimento || 0) : 0;
    const taxasShopee = include.taxasShopee ? Number(d.taxasShopee || 0) : 0;
    const taxasTiktok = include.taxasTiktok ? Number(d.taxasTiktok || 0) : 0;
    const taxasCartaoPix = include.taxasCartaoPix ? Number(d.taxasCartaoPix || 0) : 0;
    const frete = include.frete ? Number(d.frete || 0) : 0;
    const custoProducao = include.custoProducao ? Number(d.custoProducao || 0) : 0;
    const custoFixo = include.custoFixo ? Number(d.custoFixo || 0) : 0;
    const imposto = include.imposto ? Number(d.imposto || 0) : 0;

    const totalDescontos =
      adsInvestimento + taxasShopee + taxasTiktok + taxasCartaoPix + frete + custoProducao + custoFixo + imposto;
    const lucroLiquido = faturamentoBruto - totalDescontos;
    const margemLucro = faturamentoBruto > 0 ? (lucroLiquido / faturamentoBruto) * 100 : 0;

    const pct = (v: number) => (faturamentoBruto > 0 ? (v / faturamentoBruto) * 100 : 0);

    return {
      ...d,
      adsInvestimento,
      adsPercent: pct(adsInvestimento),
      taxasShopee,
      taxasShopeePercent: pct(taxasShopee),
      taxasTiktok,
      taxasTiktokPercent: pct(taxasTiktok),
      taxasCartaoPix,
      taxasCartaoPixPercent: pct(taxasCartaoPix),
      frete,
      fretePercent: pct(frete),
      custoProducao,
      custoProducaoPercent: pct(custoProducao),
      custoFixo,
      custoFixoPercent: pct(custoFixo),
      imposto,
      impostoPercent: pct(imposto),
      lucroLiquido,
      margemLucro,
    };
  }

  const data = computeViewData(baseData);
  const monthRange = clampMonthRange(startMonth, endMonth);
  const monthsInRange = listMonthsInclusive(monthRange.start, monthRange.end);
  const isMultiMonth = monthsInRange.length > 1;

  async function fetchData() {
    setLoading(true);
    setMessage("");
    try {
      const results: SimulationData[] = [];
      for (const m of monthsInRange) {
        const qs = new URLSearchParams();
        qs.set("month", m);
        qs.set("channel", channel);
        const res = await fetch(`${API_URL}/api/simulation?${qs.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || "Falha ao carregar simulação.");
        results.push(json as SimulationData);
      }

      if (results.length === 1) {
        setBaseData(results[0]);
      } else {
        const sum = <K extends keyof SimulationData>(key: K) => results.reduce((acc, r) => acc + Number(r[key] || 0), 0);
        const faturamentoBruto = sum("faturamentoBruto");
        const adsInvestimento = sum("adsInvestimento");
        const taxasShopee = sum("taxasShopee");
        const taxasTiktok = sum("taxasTiktok");
        const taxasCartaoPix = sum("taxasCartaoPix");
        const frete = sum("frete");
        const custoProducao = sum("custoProducao");
        const custoFixo = sum("custoFixo");
        const imposto = sum("imposto");

        const lucroLiquido =
          faturamentoBruto -
          (adsInvestimento + taxasShopee + taxasTiktok + taxasCartaoPix + frete + custoProducao + custoFixo + imposto);
        const margemLucro = faturamentoBruto > 0 ? (lucroLiquido / faturamentoBruto) * 100 : 0;

        const pct = (v: number) => (faturamentoBruto > 0 ? (v / faturamentoBruto) * 100 : 0);

        setBaseData({
          month: `${monthRange.start} → ${monthRange.end}`,
          channel,
          faturamentoBruto,
          adsInvestimento,
          adsPercent: pct(adsInvestimento),
          taxasShopee,
          taxasShopeePercent: pct(taxasShopee),
          taxasTiktok,
          taxasTiktokPercent: pct(taxasTiktok),
          taxasCartaoPix,
          taxasCartaoPixPercent: pct(taxasCartaoPix),
          frete,
          fretePercent: pct(frete),
          custoProducao,
          custoProducaoPercent: pct(custoProducao),
          custoFixo,
          custoFixoPercent: pct(custoFixo),
          imposto,
          impostoPercent: pct(imposto),
          lucroLiquido,
          margemLucro,
        });
      }
    } catch (e: any) {
      console.error(e);
      setBaseData(null);
      setMessage(`Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMonth, endMonth, channel]);

  function closeDetailModal() {
    if (detailLoading) return;
    setDetailKind(null);
    setDetailError("");
    setCustoDetail(null);
    setFatDetail(null);
  }

  async function openCustoDetail() {
    if (isMultiMonth) return;
    setDetailKind("custo");
    setDetailLoading(true);
    setDetailError("");
    setCustoDetail(null);
    try {
      const qs = new URLSearchParams();
      qs.set("month", startMonth);
      qs.set("channel", channel);
      const res = await fetch(`${API_URL}/api/simulation/production-cost?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Falha ao carregar custo de produção.");
      setCustoDetail(json as ProductionCostDetail);
    } catch (e: any) {
      setDetailError(e.message || "Erro ao carregar.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function openFaturamentoDetail() {
    if (isMultiMonth) return;
    setDetailKind("faturamento");
    setDetailLoading(true);
    setDetailError("");
    setFatDetail(null);
    try {
      const qs = new URLSearchParams();
      qs.set("month", startMonth);
      qs.set("channel", channel);
      const res = await fetch(`${API_URL}/api/simulation/gross-revenue?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Falha ao carregar faturamento.");
      setFatDetail(json as GrossRevenueDetail);
    } catch (e: any) {
      setDetailError(e.message || "Erro ao carregar.");
    } finally {
      setDetailLoading(false);
    }
  }

  if (!data && !loading && !message)
    return (
      <div className={cn(UI.bg, "min-h-screen flex items-center justify-center text-slate-500")}>
        Carregando...
      </div>
    );

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className={cn(UI.card, "p-6")}>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:flex-wrap">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-black tracking-tight text-slate-900">Simulação P&L</h2>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">
                  Mês inicial
                </label>
                <input
                  type="month"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                  className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">
                  Mês final
                </label>
                <input
                  type="month"
                  value={endMonth}
                  onChange={(e) => setEndMonth(e.target.value)}
                  className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">
                  Canal
                </label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
                >
                  <option value="all">Todos</option>
                  <option value="shopee">Shopee</option>
                  <option value="tiktok">TikTok</option>
                  <option value="tray">Tray (todos)</option>
                  <option value="tray_atacado">Tray Atacado</option>
                  <option value="tray_varejo">Tray Varejo</option>
                </select>
              </div>
              <button
                onClick={fetchData}
                disabled={loading}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
              >
                {loading ? "..." : "Calcular"}
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-semibold text-slate-600">
              Período:{" "}
              <span className="font-extrabold text-slate-900">
                {monthRange.start}
              </span>{" "}
              {monthRange.start !== monthRange.end ? (
                <>
                  <span className="text-slate-400">→</span>{" "}
                  <span className="font-extrabold text-slate-900">{monthRange.end}</span>{" "}
                  <span className="text-slate-400">·</span>{" "}
                  <span className="font-bold text-slate-700">{monthsInRange.length} meses</span>
                </>
              ) : null}
            </div>
            {isMultiMonth ? (
              <div className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                Detalhes (pedidos / custo de produção) disponíveis apenas para 1 mês.
              </div>
            ) : null}
          </div>
          {message && <div className="mt-3 text-sm font-semibold text-red-600">{message}</div>}
        </div>

        {detailKind && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={closeDetailModal}
            role="presentation"
          >
            <div
              className={cn(UI.card, "max-h-[88vh] w-full max-w-4xl overflow-hidden flex flex-col shadow-xl")}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="sim-detail-title"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 bg-slate-50">
                <h3 id="sim-detail-title" className="text-sm font-extrabold text-slate-900">
                  {detailKind === "custo" ? "Custo de produção — detalhe" : "Faturamento bruto — pedidos"}
                </h3>
                <button
                  type="button"
                  onClick={closeDetailModal}
                  disabled={detailLoading}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  Fechar
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {detailLoading && <p className="text-sm text-slate-600">Carregando...</p>}
                {detailError && <p className="text-sm font-semibold text-red-600">{detailError}</p>}
                {!detailLoading && !detailError && detailKind === "custo" && custoDetail && (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500">
                      {custoDetail.month} — {channelLabel[custoDetail.channel] || custoDetail.channel}
                    </p>
                    <div className="overflow-auto rounded-xl border border-slate-200">
                      <table className="w-full min-w-[520px] text-sm">
                        <thead className="sticky top-0 bg-slate-100 text-left text-xs font-extrabold uppercase tracking-wider text-slate-600">
                          <tr>
                            <th className="px-3 py-2">Produto</th>
                            <th className="px-3 py-2 text-right">Custo unit.</th>
                            <th className="px-3 py-2 text-right">Qtd</th>
                            <th className="px-3 py-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {custoDetail.lines.map((row, idx) => (
                            <tr key={`${row.productCode}-${row.name}-${idx}`} className="hover:bg-slate-50/80">
                              <td className="px-3 py-2 text-slate-800">
                                <span className="font-semibold">{row.name}</span>
                                {row.productCode ? (
                                  <span className="block text-xs font-normal text-slate-500">{row.productCode}</span>
                                ) : null}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(row.unitCost)}</td>
                              <td className="px-3 py-2 text-right font-semibold tabular-nums">{row.quantity}</td>
                              <td className="px-3 py-2 text-right font-bold tabular-nums">{fmtMoney(row.totalCost)}</td>
                            </tr>
                          ))}
                          {custoDetail.lines.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                                Nenhuma linha de pedido no período.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap gap-6 rounded-xl bg-slate-100 px-4 py-3 text-sm">
                      <div>
                        <span className="text-slate-500">Total de unidades: </span>
                        <span className="font-extrabold text-slate-900">{custoDetail.totalQuantity}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Custo total: </span>
                        <span className="font-extrabold text-slate-900">{fmtMoney(custoDetail.totalCost)}</span>
                      </div>
                    </div>
                  </div>
                )}
                {!detailLoading && !detailError && detailKind === "faturamento" && fatDetail && (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500">
                      {fatDetail.month} — {channelLabel[fatDetail.channel] || fatDetail.channel}
                    </p>
                    <div className="space-y-4">
                      {fatDetail.orders.map((o) => (
                        <div
                          key={`${o.source}-${o.orderId}`}
                          className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
                            <div className="text-sm">
                              <span className="font-extrabold text-slate-900">Pedido {o.orderId}</span>
                              <span className="mx-2 text-slate-300">·</span>
                              <span className="font-semibold text-slate-600">{o.source}</span>
                              <span className="mx-2 text-slate-300">·</span>
                              <span className="text-slate-600">{fmtDate(o.orderDate)}</span>
                            </div>
                            <div className="text-sm text-right">
                              <span className="text-slate-500">Valor: </span>
                              <span className="font-extrabold text-slate-900">{fmtMoney(o.totalPrice)}</span>
                              <span className="mx-2 text-slate-300">·</span>
                              <span className="text-slate-500">Unid.: </span>
                              <span className="font-bold text-slate-800">{o.unitsInOrder}</span>
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[400px] text-xs sm:text-sm">
                              <thead className="bg-slate-50 text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                                <tr>
                                  <th className="px-3 py-2">Produto</th>
                                  <th className="px-3 py-2 text-right">Qtd</th>
                                  <th className="px-3 py-2 text-right">Unit.</th>
                                  <th className="px-3 py-2 text-right">Total linha</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {o.items.map((it, i) => (
                                  <tr key={`${it.productCode}-${i}`}>
                                    <td className="px-3 py-1.5 text-slate-800">{it.name}</td>
                                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{it.quantity}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(it.unitPrice)}</td>
                                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                                      {fmtMoney(it.lineTotal)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                      {fatDetail.orders.length === 0 && (
                        <p className="text-sm text-slate-500 text-center py-8">Nenhum pedido no período.</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-6 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm">
                      <div>
                        <span className="text-emerald-800/80">Pedidos: </span>
                        <span className="font-extrabold text-emerald-950">{fatDetail.totalOrders}</span>
                      </div>
                      <div>
                        <span className="text-emerald-800/80">Total de unidades (produtos): </span>
                        <span className="font-extrabold text-emerald-950">{fatDetail.totalProductUnits}</span>
                      </div>
                      <div>
                        <span className="text-emerald-800/80">Faturamento bruto: </span>
                        <span className="font-extrabold text-emerald-950">{fmtMoney(fatDetail.faturamentoBruto)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {data && (
          <div className={cn(UI.card, "overflow-hidden")}>
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-extrabold tracking-wide text-slate-900">
                {data.month} — {channelLabel[data.channel] || data.channel}
              </h3>
            </div>
            <div className="p-6">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        onClick={openFaturamentoDetail}
                        disabled={isMultiMonth}
                        className="text-left font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600"
                      >
                        Faturamento Bruto
                      </button>
                    </td>
                    <td className="py-2 text-right font-extrabold text-slate-900">{fmtMoney(data.faturamentoBruto)}</td>
                    <td className="py-2 w-16 text-right text-slate-500">—</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">
                      <label className="inline-flex items-center gap-2 select-none">
                        <input
                          type="checkbox"
                          checked={include.adsInvestimento}
                          onChange={() => toggleInclude("adsInvestimento")}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span>(-) Investimento em Ads</span>
                      </label>
                    </td>
                    <td className="py-2 text-right font-bold text-slate-900">{fmtMoney(data.adsInvestimento)}</td>
                    <td className="py-2 text-right text-slate-500">{data.adsPercent.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">
                      <label className="inline-flex items-center gap-2 select-none">
                        <input
                          type="checkbox"
                          checked={include.taxasShopee}
                          onChange={() => toggleInclude("taxasShopee")}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span>(-) Taxas Shopee</span>
                      </label>
                    </td>
                    <td className="py-2 text-right font-bold text-slate-900">{fmtMoney(data.taxasShopee)}</td>
                    <td className="py-2 text-right text-slate-500">{data.taxasShopeePercent.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">
                      <label className="inline-flex items-center gap-2 select-none">
                        <input
                          type="checkbox"
                          checked={include.taxasTiktok}
                          onChange={() => toggleInclude("taxasTiktok")}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span>(-) Taxas TikTok</span>
                      </label>
                    </td>
                    <td className="py-2 text-right font-bold text-slate-900">{fmtMoney(data.taxasTiktok)}</td>
                    <td className="py-2 text-right text-slate-500">{data.taxasTiktokPercent.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">
                      <label className="inline-flex items-center gap-2 select-none">
                        <input
                          type="checkbox"
                          checked={include.taxasCartaoPix}
                          onChange={() => toggleInclude("taxasCartaoPix")}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span>(-) Taxas Cartão/PIX</span>
                      </label>
                    </td>
                    <td className="py-2 text-right font-bold text-slate-900">{fmtMoney(data.taxasCartaoPix)}</td>
                    <td className="py-2 text-right text-slate-500">{data.taxasCartaoPixPercent.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">
                      <label className="inline-flex items-center gap-2 select-none">
                        <input
                          type="checkbox"
                          checked={include.frete}
                          onChange={() => toggleInclude("frete")}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span>(-) Frete</span>
                      </label>
                    </td>
                    <td className="py-2 text-right font-bold text-slate-900">{fmtMoney(data.frete)}</td>
                    <td className="py-2 text-right text-slate-500">{data.fretePercent.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        onClick={openCustoDetail}
                        disabled={isMultiMonth}
                        className="text-left text-slate-700 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600"
                      >
                        <span className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={include.custoProducao}
                            onChange={() => toggleInclude("custoProducao")}
                            className="h-4 w-4 rounded border-slate-300"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span>(-) Custo de Produção</span>
                        </span>
                      </button>
                    </td>
                    <td className="py-2 text-right font-bold text-slate-900">{fmtMoney(data.custoProducao)}</td>
                    <td className="py-2 text-right text-slate-500">{data.custoProducaoPercent.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">
                      <label className="inline-flex items-center gap-2 select-none">
                        <input
                          type="checkbox"
                          checked={include.custoFixo}
                          onChange={() => toggleInclude("custoFixo")}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span>(-) Custo Fixo</span>
                      </label>
                    </td>
                    <td className="py-2 text-right font-bold text-slate-900">{fmtMoney(data.custoFixo)}</td>
                    <td className="py-2 text-right text-slate-500">{data.custoFixoPercent.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">
                      <label className="inline-flex items-center gap-2 select-none">
                        <input
                          type="checkbox"
                          checked={include.imposto}
                          onChange={() => toggleInclude("imposto")}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span>(-) Imposto</span>
                      </label>
                    </td>
                    <td className="py-2 text-right font-bold text-slate-900">{fmtMoney(data.imposto)}</td>
                    <td className="py-2 text-right text-slate-500">{data.impostoPercent.toFixed(2)}%</td>
                  </tr>
                  <tr className="bg-emerald-50">
                    <td className="py-3 pr-4 font-extrabold text-slate-900">(=) Lucro Líquido Final</td>
                    <td className="py-3 text-right font-black text-slate-900">{fmtMoney(data.lucroLiquido)}</td>
                    <td className="py-3"></td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td className="py-2 pr-4 font-extrabold text-slate-900">Margem de Lucro</td>
                    <td className="py-2 text-right font-black text-slate-900">{data.margemLucro.toFixed(2)}%</td>
                    <td className="py-2"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
