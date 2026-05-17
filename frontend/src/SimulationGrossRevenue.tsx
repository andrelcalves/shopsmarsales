import React, { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";

import { API_URL } from "./config";

const UI = {
  bg: "bg-slate-50",
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function fmtMoney(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const channelLabel: Record<string, string> = {
  all: "Todos os canais",
  shopee: "Shopee",
  tiktok: "TikTok",
  tray: "Site Tray (atacado + varejo)",
  tray_atacado: "Tray Atacado",
  tray_varejo: "Tray Varejo",
};

const sourceBadge: Record<string, string> = {
  shopee: "bg-orange-100 text-orange-800",
  tiktok: "bg-slate-800 text-white",
  tray: "bg-blue-100 text-blue-800",
  tray_atacado: "bg-sky-900 text-white",
  tray_varejo: "bg-sky-400 text-slate-900",
};

type GrossRevenueItem = {
  productCode: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineGross: number;
  sellerDiscount: number;
  lineTotal: number;
};

type GrossRevenueOrder = {
  orderId: string;
  source: string;
  orderDate: string;
  status: string;
  paymentId: string | null;
  grossProductSales: number;
  sellerDiscount: number;
  commissionFee: number;
  serviceFee: number;
  partnerCommission: number;
  amountToReceive: number;
  amountReceived: number | null;
  isSettled: boolean;
  orderTotal: number;
  items: GrossRevenueItem[];
  unitsInOrder: number;
};

type GrossRevenueResponse = {
  month: string;
  startMonth: string;
  endMonth: string;
  channel: string;
  orders: GrossRevenueOrder[];
  totalOrders: number;
  totalProductUnits: number;
  faturamentoBruto: number;
  totals: {
    grossProductSales: number;
    sellerDiscount: number;
    commissionFee: number;
    serviceFee: number;
    partnerCommission: number;
    amountToReceive: number;
    amountReceived: number;
  };
};

export type GrossRevenueNavParams = {
  startMonth: string;
  endMonth: string;
  channel: string;
};

function defaultMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type Props = {
  initialParams?: GrossRevenueNavParams | null;
  onBack?: () => void;
};

function hasFees(o: GrossRevenueOrder) {
  return o.commissionFee > 0 || o.serviceFee > 0 || o.partnerCommission > 0;
}

export default function SimulationGrossRevenue({ initialParams, onBack }: Props) {
  const [startMonth, setStartMonth] = useState(initialParams?.startMonth ?? defaultMonth());
  const [endMonth, setEndMonth] = useState(initialParams?.endMonth ?? defaultMonth());
  const [channel, setChannel] = useState(initialParams?.channel ?? "all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<GrossRevenueResponse | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (initialParams) {
      setStartMonth(initialParams.startMonth);
      setEndMonth(initialParams.endMonth);
      setChannel(initialParams.channel);
    }
  }, [initialParams]);

  const periodLabel =
    startMonth === endMonth ? startMonth : `${startMonth} → ${endMonth}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      setExpanded({});
      try {
        const qs = new URLSearchParams();
        qs.set("start", startMonth);
        qs.set("end", endMonth);
        qs.set("channel", channel);
        const res = await fetch(`${API_URL}/api/simulation/gross-revenue?${qs.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || "Falha ao carregar pedidos.");
        if (!cancelled) setData(json as GrossRevenueResponse);
      } catch (e: unknown) {
        if (!cancelled) {
          setData(null);
          setError(e instanceof Error ? e.message : "Erro ao carregar.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startMonth, endMonth, channel]);

  function toggleOrder(key: string) {
    setExpanded((s) => ({ ...s, [key]: !s[key] }));
  }

  const settledCount = data?.orders.filter((o) => o.isSettled).length ?? 0;

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-extrabold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar à simulação
            </button>
          ) : null}
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-900">
              Faturamento bruto — pedidos
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Pedidos que compõem o faturamento bruto por período e canal
            </p>
          </div>
        </div>

        <div className={cn(UI.card, "p-5")}>
          <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Mês inicial</label>
              <input
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Mês final</label>
              <input
                type="month"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Canal</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm min-w-[160px]"
              >
                <option value="all">Todos</option>
                <option value="shopee">Shopee</option>
                <option value="tiktok">TikTok</option>
                <option value="tray">Tray (todos)</option>
                <option value="tray_atacado">Tray Atacado</option>
                <option value="tray_varejo">Tray Varejo</option>
              </select>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Exibindo: <span className="font-bold text-slate-700">{periodLabel}</span>
            {" · "}
            <span className="font-bold text-slate-700">{channelLabel[channel] || channel}</span>
            {startMonth !== endMonth ? (
              <span className="text-slate-400"> — use o mesmo mês nos dois campos para um único mês</span>
            ) : null}
          </p>
        </div>

        {loading && (
          <div className={cn(UI.card, "p-8 text-center text-slate-500")}>Carregando pedidos...</div>
        )}
        {error && (
          <div className={cn(UI.card, "p-6 text-sm font-semibold text-red-600")}>{error}</div>
        )}

        {!loading && !error && data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { label: "Pedidos", value: String(data.totalOrders), accent: false },
                { label: "Faturamento bruto", value: fmtMoney(data.faturamentoBruto), accent: true },
                { label: "Venda produtos", value: fmtMoney(data.totals.grossProductSales), accent: false },
                { label: "Desc. vendedor", value: fmtMoney(data.totals.sellerDiscount), accent: false },
                { label: "Comissão", value: fmtMoney(data.totals.commissionFee), accent: false },
                { label: "Tarifa plataforma", value: fmtMoney(data.totals.serviceFee), accent: false },
                { label: "Comissão parceiro", value: fmtMoney(data.totals.partnerCommission), accent: false },
                { label: "Valor a receber", value: fmtMoney(data.totals.amountToReceive), accent: false },
                { label: "Valor recebido", value: fmtMoney(data.totals.amountReceived), accent: false },
              ].map((s) => (
                <div
                  key={s.label}
                  className={cn(
                    UI.card,
                    "px-4 py-3",
                    s.accent && "ring-2 ring-emerald-200 bg-emerald-50/50",
                  )}
                >
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    {s.label}
                  </div>
                  <div className="mt-1 text-sm font-extrabold text-slate-900 tabular-nums">
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            <div className={cn(UI.card, "px-4 py-3 flex flex-wrap gap-4 text-sm")}>
              <span>
                <span className="text-slate-500">Liquidados: </span>
                <span className="font-extrabold text-emerald-700">{settledCount}</span>
                <span className="text-slate-400"> / {data.totalOrders}</span>
              </span>
              <span>
                <span className="text-slate-500">Unidades vendidas: </span>
                <span className="font-extrabold text-slate-900">{data.totalProductUnits}</span>
              </span>
            </div>

            <div className={cn(UI.card, "overflow-hidden")}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-xs sm:text-sm">
                  <thead className="bg-slate-100 text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="px-3 py-2 w-8" />
                      <th className="px-3 py-2">Pedido</th>
                      <th className="px-3 py-2">ID pagamento</th>
                      <th className="px-3 py-2">Canal</th>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2 text-right">Venda produtos</th>
                      <th className="px-3 py-2 text-right">Desc. vendedor</th>
                      <th className="px-3 py-2 text-right">Comissão</th>
                      <th className="px-3 py-2 text-right">Tarifa plat.</th>
                      <th className="px-3 py-2 text-right">Com. parceiro</th>
                      <th className="px-3 py-2 text-right">A receber</th>
                      <th className="px-3 py-2 text-right">Recebido</th>
                      <th className="px-3 py-2 text-center">Liquidado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.orders.map((o) => {
                      const key = `${o.source}-${o.orderId}`;
                      const isOpen = !!expanded[key];
                      return (
                        <React.Fragment key={key}>
                          <tr className="hover:bg-slate-50/80">
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                onClick={() => toggleOrder(key)}
                                className="rounded p-0.5 text-slate-500 hover:bg-slate-200"
                                aria-label={isOpen ? "Recolher itens" : "Expandir itens"}
                              >
                                {isOpen ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            </td>
                            <td className="px-3 py-2 font-extrabold text-slate-900">{o.orderId}</td>
                            <td className="px-3 py-2 text-slate-600 font-mono text-[11px] max-w-[140px] truncate" title={o.paymentId ?? undefined}>
                              {o.paymentId || "—"}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={cn(
                                  "inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase",
                                  sourceBadge[o.source] || "bg-slate-100 text-slate-700",
                                )}
                              >
                                {o.source}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-600 tabular-nums">{fmtDate(o.orderDate)}</td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums">
                              {fmtMoney(o.grossProductSales)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-amber-800">
                              {o.sellerDiscount > 0 ? fmtMoney(o.sellerDiscount) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {o.commissionFee > 0 ? fmtMoney(o.commissionFee) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {o.serviceFee > 0 ? fmtMoney(o.serviceFee) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {o.partnerCommission > 0 ? fmtMoney(o.partnerCommission) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-bold tabular-nums">
                              {fmtMoney(o.amountToReceive)}
                            </td>
                            <td className="px-3 py-2 text-right font-bold tabular-nums text-emerald-800">
                              {o.amountReceived != null ? fmtMoney(o.amountReceived) : "—"}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {o.isSettled ? (
                                <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                                  Sim
                                </span>
                              ) : (
                                <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-600">
                                  Não
                                </span>
                              )}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-slate-50/60">
                              <td colSpan={14} className="px-4 py-3">
                                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
                                  Itens do pedido · total pedido {fmtMoney(o.orderTotal)}
                                  {hasFees(o) ? null : (
                                    <span className="ml-2 font-normal normal-case text-amber-700">
                                      (taxas não importadas — faça upload do income TikTok)
                                    </span>
                                  )}
                                </div>
                                <table className="w-full min-w-[600px] text-xs">
                                  <thead>
                                    <tr className="text-slate-500">
                                      <th className="text-left py-1 pr-2">Produto</th>
                                      <th className="text-right py-1 px-2">Qtd</th>
                                      <th className="text-right py-1 px-2">Unit.</th>
                                      <th className="text-right py-1 px-2">Bruto linha</th>
                                      <th className="text-right py-1 px-2">Desc. vendedor</th>
                                      <th className="text-right py-1 pl-2">Total linha</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200/80">
                                    {o.items.map((it, i) => (
                                      <tr key={`${it.productCode}-${i}`}>
                                        <td className="py-1 pr-2 text-slate-800">{it.name}</td>
                                        <td className="py-1 px-2 text-right font-semibold">{it.quantity}</td>
                                        <td className="py-1 px-2 text-right tabular-nums">
                                          {fmtMoney(it.unitPrice)}
                                        </td>
                                        <td className="py-1 px-2 text-right tabular-nums">
                                          {fmtMoney(it.lineGross)}
                                        </td>
                                        <td className="py-1 px-2 text-right tabular-nums">
                                          {it.sellerDiscount > 0 ? fmtMoney(it.sellerDiscount) : "—"}
                                        </td>
                                        <td className="py-1 pl-2 text-right font-semibold tabular-nums">
                                          {fmtMoney(it.lineTotal)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {data.orders.length === 0 && (
                      <tr>
                        <td colSpan={14} className="px-4 py-10 text-center text-slate-500">
                          Nenhum pedido no período selecionado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
