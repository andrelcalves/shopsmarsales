import React, { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { BarChart3, Calendar, RefreshCcw } from "lucide-react";

const API_URL = "http://localhost:4000";

type DayRow = {
  date: string;
  name: string;
  shopee: number;
  tiktok: number;
  tray: number;
  total: number;
};

const CHANNEL_COLORS: Record<string, string> = {
  shopee: "#FF6B35",
  tiktok: "#1F2937",
  tray: "#0EA5E9",
};

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

export default function SalesByDayDashboard() {
  const [rows, setRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/sales-by-day?month=${encodeURIComponent(month)}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [month]);

  const totals = rows.reduce(
    (acc, r) => ({
      shopee: acc.shopee + r.shopee,
      tiktok: acc.tiktok + r.tiktok,
      tray: acc.tray + r.tray,
      total: acc.total + r.total,
    }),
    { shopee: 0, tiktok: 0, tray: 0, total: 0 }
  );

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
            <div className="rounded-xl bg-white/10 border border-white/15 px-4 py-3">
              <div className="text-xs text-white/80 font-semibold">Total</div>
              <div className="text-lg font-black">{formatMoney(totals.total)}</div>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/15 px-4 py-3">
              <div className="text-xs text-white/80 font-semibold">Shopee</div>
              <div className="text-lg font-black">{formatMoney(totals.shopee)}</div>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/15 px-4 py-3">
              <div className="text-xs text-white/80 font-semibold">TikTok</div>
              <div className="text-lg font-black">{formatMoney(totals.tiktok)}</div>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/15 px-4 py-3">
              <div className="text-xs text-white/80 font-semibold">Tray</div>
              <div className="text-lg font-black">{formatMoney(totals.tray)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="px-6 pt-6">
            <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Gráfico de vendas por dia</h3>
            <p className="mt-1 text-xs text-slate-500">Valores agrupados por dia e canal de venda</p>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="h-80 flex items-center justify-center text-slate-500">Carregando...</div>
            ) : rows.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-slate-500">Nenhuma venda neste mês.</div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      dataKey="name"
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
                    <Tooltip
                      formatter={(value: any) => formatMoney(Number(value || 0))}
                      contentStyle={{
                        borderRadius: 14,
                        border: "1px solid #E2E8F0",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="shopee" name="Shopee" stackId="a" fill={CHANNEL_COLORS.shopee} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="tiktok" name="TikTok" stackId="a" fill={CHANNEL_COLORS.tiktok} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="tray" name="Tray" stackId="a" fill={CHANNEL_COLORS.tray} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="px-6 pt-6">
            <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Tabela por dia</h3>
            <p className="mt-1 text-xs text-slate-500">Detalhamento dia a dia por canal</p>
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
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3 text-right">Shopee</th>
                      <th className="px-4 py-3 text-right">TikTok</th>
                      <th className="px-4 py-3 text-right">Tray</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.date} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900">{r.name}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{formatMoney(r.shopee)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{formatMoney(r.tiktok)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{formatMoney(r.tray)}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">{formatMoney(r.total)}</td>
                      </tr>
                    ))}
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
