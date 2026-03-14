import React, { useEffect, useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { BarChart3, Calendar, RefreshCcw, GitCompareArrows } from "lucide-react";

import { API_URL } from './config';

type DayRow = {
  date: string;
  name: string;
  shopee: number;
  tiktok: number;
  tray: number;
  total: number;
  shopeeOrders: number;
  tiktokOrders: number;
  trayOrders: number;
  totalOrders: number;
};

type MergedRow = DayRow & {
  day: number;
  dayLabel: string;
  prevTotal?: number;
  prevShopee?: number;
  prevTiktok?: number;
  prevTray?: number;
  prevTotalOrders?: number;
};

const CHANNEL_COLORS: Record<string, string> = {
  shopee: "#FF6B35",
  tiktok: "#1F2937",
  tray: "#0EA5E9",
};

const PREV_MONTH_COLOR = "#A855F7";

const UI = {
  bg: "bg-slate-50",
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function formatMoney(val: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
}

function formatCompact(val: number) {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return `${val.toFixed(0)}`;
}

function getPrevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const prev = new Date(y, m - 2, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

function formatDelta(current: number, previous: number): { text: string; color: string } {
  if (previous === 0) return { text: "—", color: "text-slate-400" };
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return {
    text: `${sign}${pct.toFixed(1)}%`,
    color: pct >= 0 ? "text-emerald-400" : "text-red-400",
  };
}

export default function SalesByDayDashboard() {
  const [rows, setRows] = useState<DayRow[]>([]);
  const [prevRows, setPrevRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [compare, setCompare] = useState(true);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const prevMonth = useMemo(() => getPrevMonth(month), [month]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [res, prevRes] = await Promise.all([
        fetch(`${API_URL}/api/sales-by-day?month=${encodeURIComponent(month)}`),
        compare ? fetch(`${API_URL}/api/sales-by-day?month=${encodeURIComponent(prevMonth)}`) : Promise.resolve(null),
      ]);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
      if (prevRes) {
        const prevData = await prevRes.json();
        setPrevRows(Array.isArray(prevData) ? prevData : []);
      } else {
        setPrevRows([]);
      }
    } catch (e) {
      console.error(e);
      setRows([]);
      setPrevRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [month, compare]);

  const mergedRows: MergedRow[] = useMemo(() => {
    const prevByDay: Record<number, DayRow> = {};
    for (const r of prevRows) {
      const day = new Date(r.date + "T12:00:00").getDate();
      prevByDay[day] = r;
    }

    return rows.map((r) => {
      const day = new Date(r.date + "T12:00:00").getDate();
      const prev = prevByDay[day];
      return {
        ...r,
        day,
        dayLabel: String(day),
        prevTotal: prev?.total,
        prevShopee: prev?.shopee,
        prevTiktok: prev?.tiktok,
        prevTray: prev?.tray,
        prevTotalOrders: prev?.totalOrders,
      };
    });
  }, [rows, prevRows]);

  const totals = rows.reduce(
    (acc, r) => ({
      shopee: acc.shopee + r.shopee,
      tiktok: acc.tiktok + r.tiktok,
      tray: acc.tray + r.tray,
      total: acc.total + r.total,
      shopeeOrders: acc.shopeeOrders + (r.shopeeOrders ?? 0),
      tiktokOrders: acc.tiktokOrders + (r.tiktokOrders ?? 0),
      trayOrders: acc.trayOrders + (r.trayOrders ?? 0),
      totalOrders: acc.totalOrders + (r.totalOrders ?? 0),
    }),
    { shopee: 0, tiktok: 0, tray: 0, total: 0, shopeeOrders: 0, tiktokOrders: 0, trayOrders: 0, totalOrders: 0 }
  );

  const prevTotals = prevRows.reduce(
    (acc, r) => ({
      shopee: acc.shopee + r.shopee,
      tiktok: acc.tiktok + r.tiktok,
      tray: acc.tray + r.tray,
      total: acc.total + r.total,
      shopeeOrders: acc.shopeeOrders + (r.shopeeOrders ?? 0),
      tiktokOrders: acc.tiktokOrders + (r.tiktokOrders ?? 0),
      trayOrders: acc.trayOrders + (r.trayOrders ?? 0),
      totalOrders: acc.totalOrders + (r.totalOrders ?? 0),
    }),
    { shopee: 0, tiktok: 0, tray: 0, total: 0, shopeeOrders: 0, tiktokOrders: 0, trayOrders: 0, totalOrders: 0 }
  );

  const chartData = compare ? mergedRows : rows;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload as MergedRow | undefined;

    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-3 text-xs min-w-[180px]">
        <div className="font-bold text-slate-900 mb-2">Dia {row?.day ?? label}</div>
        {payload
          .filter((p: any) => p.dataKey !== "prevTotal" && p.dataKey !== "total")
          .map((p: any) => (
            <div key={p.dataKey} className="flex justify-between gap-4 py-0.5">
              <span style={{ color: p.color }}>{p.name}</span>
              <span className="font-semibold text-slate-900">{formatMoney(Number(p.value || 0))}</span>
            </div>
          ))}
        {compare && row ? (
          <div className="border-t border-slate-100 mt-1.5 pt-1.5 space-y-1">
            <div className="flex justify-between gap-4 py-0.5">
              <span className="font-bold" style={{ color: "#10B981" }}>Total atual</span>
              <span className="font-bold text-slate-900">{formatMoney(row.total)}</span>
            </div>
            {row.prevTotal !== undefined && (
              <>
                <div className="flex justify-between gap-4 py-0.5">
                  <span className="font-bold" style={{ color: PREV_MONTH_COLOR }}>Total anterior</span>
                  <span className="font-bold text-slate-900">{formatMoney(row.prevTotal)}</span>
                </div>
                {row.prevTotalOrders !== undefined && (
                  <div className="text-slate-500 text-right text-[10px]">{row.prevTotalOrders} pedidos ant.</div>
                )}
                <div className="flex justify-between gap-4 py-0.5 border-t border-slate-100 pt-1">
                  <span className="text-slate-600">Variação</span>
                  <span className={cn("font-bold", formatDelta(row.total, row.prevTotal).color)}>
                    {formatDelta(row.total, row.prevTotal).text}
                  </span>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      <div className="bg-gradient-to-r from-sky-700 via-blue-700 to-indigo-700">
        <div className="max-w-7xl mx-auto px-6 py-7 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-2 opacity-95">
                <BarChart3 className="w-5 h-5" />
                <span className="text-sm font-semibold tracking-wide">VENDAS POR DIA</span>
              </div>
              <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">Vendas diárias por canal</h1>
              <p className="mt-1 text-white/80 text-sm">Shopee + TikTok + Tray • Filtro por mês</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setCompare((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-extrabold transition border",
                  compare
                    ? "bg-purple-500/20 border-purple-400/40 text-white shadow-md shadow-purple-500/10"
                    : "bg-white/10 border-white/15 text-white/80 hover:bg-white/15"
                )}
              >
                <GitCompareArrows className="w-4 h-4" />
                {compare ? `Comparando: ${getMonthLabel(prevMonth)}` : "Comparar mês anterior"}
              </button>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/15">
                <Calendar className="w-4 h-4 text-white/90" />
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="bg-transparent text-white font-bold text-sm outline-none border-none [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
              </div>
              <button
                onClick={fetchData}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-slate-900 text-sm font-extrabold shadow-sm hover:opacity-95 transition"
              >
                <RefreshCcw className="w-4 h-4" />
                Atualizar
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total", value: totals.total, orders: totals.totalOrders, prev: prevTotals.total },
              { label: "Shopee", value: totals.shopee, orders: totals.shopeeOrders, prev: prevTotals.shopee },
              { label: "TikTok", value: totals.tiktok, orders: totals.tiktokOrders, prev: prevTotals.tiktok },
              { label: "Tray", value: totals.tray, orders: totals.trayOrders, prev: prevTotals.tray },
            ].map((card) => {
              const delta = compare ? formatDelta(card.value, card.prev) : null;
              return (
                <div key={card.label} className="rounded-xl bg-white/10 border border-white/15 px-4 py-3">
                  <div className="text-xs text-white/80 font-semibold">{card.label}</div>
                  <div className="text-lg font-black">{formatMoney(card.value)}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/70">{card.orders} pedidos</span>
                    {delta && (
                      <span className={cn("text-xs font-bold", delta.color)}>{delta.text}</span>
                    )}
                  </div>
                  {compare && (
                    <div className="text-[10px] text-white/50 mt-0.5">
                      Anterior: {formatMoney(card.prev)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="px-6 pt-6 flex items-start justify-between">
            <div>
              <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Gráfico de vendas por dia</h3>
              <p className="mt-1 text-xs text-slate-500">
                {compare
                  ? `Barras: ${getMonthLabel(month)} • Linha roxa: ${getMonthLabel(prevMonth)}`
                  : "Valores agrupados por dia e canal de venda"}
              </p>
            </div>
            {compare && (
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-6 h-0.5 rounded" style={{ backgroundColor: "#10B981" }} />
                  <span>Total atual</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-6 h-0.5 rounded" style={{ borderTop: "2px dashed #A855F7" }} />
                  <span>Total anterior</span>
                </div>
              </div>
            )}
          </div>
          <div className="p-6">
            {loading ? (
              <div className="h-80 flex items-center justify-center text-slate-500">Carregando...</div>
            ) : rows.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-slate-500">Nenhuma venda neste mês.</div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      dataKey={compare ? "dayLabel" : "name"}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748B", fontSize: 11 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748B", fontSize: 12 }}
                      tickFormatter={(v) => formatCompact(Number(v))}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      content={() => {
                        const items: { label: string; color: string; type: "square" | "line"; dash?: boolean }[] = [
                          { label: "Shopee", color: CHANNEL_COLORS.shopee, type: "square" },
                          { label: "TikTok", color: CHANNEL_COLORS.tiktok, type: "square" },
                          { label: "Tray", color: CHANNEL_COLORS.tray, type: "square" },
                        ];
                        if (compare) {
                          items.push({ label: `Total ${getMonthLabel(month)}`, color: "#10B981", type: "line" });
                          items.push({ label: `Total ${getMonthLabel(prevMonth)}`, color: PREV_MONTH_COLOR, type: "line", dash: true });
                        }
                        return (
                          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 pt-2">
                            {items.map((it) => (
                              <div key={it.label} className="flex items-center gap-1.5">
                                {it.type === "square" ? (
                                  <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: it.color }} />
                                ) : (
                                  <span className="inline-block w-5 h-0.5 rounded" style={it.dash ? { borderTop: `2px dashed ${it.color}` } : { backgroundColor: it.color }} />
                                )}
                                <span className="text-xs font-semibold text-slate-700">{it.label}</span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="shopee" name="Shopee" stackId="a" fill={CHANNEL_COLORS.shopee} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="tiktok" name="TikTok" stackId="a" fill={CHANNEL_COLORS.tiktok} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="tray" name="Tray" stackId="a" fill={CHANNEL_COLORS.tray} radius={[4, 4, 0, 0]} />
                    <Line
                      dataKey="total"
                      name={`Total ${getMonthLabel(month)}`}
                      type="monotone"
                      stroke="#10B981"
                      strokeWidth={compare ? 2.5 : 0}
                      dot={compare ? { r: 3, fill: "#10B981", strokeWidth: 0 } : false}
                      activeDot={compare ? { r: 5, fill: "#10B981", strokeWidth: 2, stroke: "#fff" } : false}
                      legendType="none"
                    />
                    <Line
                      dataKey="prevTotal"
                      name={`Total ${getMonthLabel(prevMonth)}`}
                      type="monotone"
                      stroke={PREV_MONTH_COLOR}
                      strokeWidth={compare ? 2.5 : 0}
                      strokeDasharray="6 3"
                      dot={compare ? { r: 3, fill: PREV_MONTH_COLOR, strokeWidth: 0 } : false}
                      activeDot={compare ? { r: 5, fill: PREV_MONTH_COLOR, strokeWidth: 2, stroke: "#fff" } : false}
                      legendType="none"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="px-6 pt-6">
            <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Tabela por dia</h3>
            <p className="mt-1 text-xs text-slate-500">
              {compare ? "Detalhamento dia a dia com comparação do mês anterior" : "Detalhamento dia a dia por canal"}
            </p>
          </div>
          <div className="p-6 overflow-auto">
            {loading ? (
              <div className="text-slate-500 py-8">Carregando...</div>
            ) : rows.length === 0 ? (
              <div className="text-slate-500 py-8">Nenhuma venda neste mês.</div>
            ) : (
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 border-b border-slate-200">
                    <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                      <th className="px-4 py-3">Dia</th>
                      <th className="px-4 py-3 text-right">Shopee</th>
                      <th className="px-4 py-3 text-right">TikTok</th>
                      <th className="px-4 py-3 text-right">Tray</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      {compare && (
                        <>
                          <th className="px-4 py-3 text-right text-purple-600">Ant. Total</th>
                          <th className="px-4 py-3 text-right">Variação</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mergedRows.map((r) => {
                      const delta = compare && r.prevTotal !== undefined ? formatDelta(r.total, r.prevTotal) : null;
                      return (
                        <tr key={r.date} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-900">{r.day}</td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            <span className="block">{formatMoney(r.shopee)}</span>
                            <span className="text-xs text-slate-500">{r.shopeeOrders ?? 0} pedidos</span>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            <span className="block">{formatMoney(r.tiktok)}</span>
                            <span className="text-xs text-slate-500">{r.tiktokOrders ?? 0} pedidos</span>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            <span className="block">{formatMoney(r.tray)}</span>
                            <span className="text-xs text-slate-500">{r.trayOrders ?? 0} pedidos</span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
                            <span className="block">{formatMoney(r.total)}</span>
                            <span className="text-xs font-normal text-slate-500">{r.totalOrders ?? 0} pedidos</span>
                          </td>
                          {compare && (
                            <>
                              <td className="px-4 py-3 text-right text-purple-700">
                                <span className="block">{r.prevTotal !== undefined ? formatMoney(r.prevTotal) : "—"}</span>
                                {r.prevTotalOrders !== undefined && (
                                  <span className="text-xs text-purple-400">{r.prevTotalOrders} pedidos</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {delta && (
                                  <span className={cn("font-bold text-sm", delta.color.replace("text-emerald-400", "text-emerald-600").replace("text-red-400", "text-red-600"))}>
                                    {delta.text}
                                  </span>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
