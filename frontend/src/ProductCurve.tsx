import React, { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { RefreshCcw, TrendingUp, Package, Search, ChevronDown, ChevronUp, Layers } from "lucide-react";

import { API_URL as API } from './config';

function cn(...c: Array<string | false | undefined | null>) {
  return c.filter(Boolean).join(" ");
}
function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const CURVE_COLORS: Record<string, { bg: string; text: string; border: string; bar: string }> = {
  A: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", bar: "#10B981" },
  B: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", bar: "#F59E0B" },
  C: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", bar: "#EF4444" },
};

const CHANNEL_COLORS: Record<string, string> = {
  shopee: "bg-orange-600",
  tiktok: "bg-slate-800",
  tray: "bg-sky-600",
  tray_atacado: "bg-sky-900",
  tray_varejo: "bg-sky-500",
};

interface CurveRow {
  name: string;
  quantity: number;
  total: number;
  channels: string[];
  pct: number;
  cumPct: number;
  curve: "A" | "B" | "C";
  rank: number;
  groupId?: number | null;
  products?: string[];
}

interface CurveData {
  grandTotal: number;
  totalProducts: number;
  countA: number;
  countB: number;
  countC: number;
  rows: CurveRow[];
}

const UI = {
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

function getMonthOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [{ value: "", label: "Todos os meses" }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    opts.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return opts;
}

export default function ProductCurve() {
  const [data, setData] = useState<CurveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState("");
  const [search, setSearch] = useState("");
  const [filterCurve, setFilterCurve] = useState<"" | "A" | "B" | "C">("");
  const [expanded, setExpanded] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  const toggleGroup = (rank: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(rank)) next.delete(rank); else next.add(rank);
      return next;
    });
  };

  const monthOptions = useMemo(getMonthOptions, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = month ? { month } : {};
      const res = await axios.get<CurveData>(`${API}/api/product-curve`, { params });
      setData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data.rows;
    if (filterCurve) rows = rows.filter(r => r.curve === filterCurve);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.products && r.products.some(p => p.toLowerCase().includes(q)))
      );
    }
    return rows;
  }, [data, filterCurve, search]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.rows.slice(0, 30).map(r => ({
      name: r.name.length > 25 ? r.name.slice(0, 22) + "..." : r.name,
      total: r.total,
      cumPct: r.cumPct,
      curve: r.curve,
    }));
  }, [data]);

  const cumData = useMemo(() => {
    if (!data) return [];
    return data.rows.map(r => ({
      rank: r.rank,
      cumPct: r.cumPct,
      curve: r.curve,
    }));
  }, [data]);

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12 text-center text-slate-500 text-sm">
        Carregando curva de produtos...
      </div>
    );
  }

  if (!data) return null;

  const displayRows = expanded ? filtered : filtered.slice(0, 50);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Curva ABC de Produtos</h2>
          <p className="mt-1 text-sm text-slate-500">
            Classificação de todos os produtos por participação no faturamento
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm"
          >
            {monthOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-extrabold shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
          >
            <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
            Atualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className={cn(UI.card, "p-5")}>
          <div className="text-xs font-bold tracking-widest uppercase text-slate-500">Faturamento</div>
          <div className="mt-2 text-xl font-black text-slate-900">{fmt(data.grandTotal)}</div>
        </div>
        <div className={cn(UI.card, "p-5")}>
          <div className="text-xs font-bold tracking-widest uppercase text-slate-500">Total Produtos</div>
          <div className="mt-2 text-xl font-black text-slate-900">{data.totalProducts}</div>
        </div>
        {(["A", "B", "C"] as const).map(curve => {
          const count = curve === "A" ? data.countA : curve === "B" ? data.countB : data.countC;
          const c = CURVE_COLORS[curve];
          return (
            <button
              key={curve}
              onClick={() => setFilterCurve(filterCurve === curve ? "" : curve)}
              className={cn(
                "p-5 rounded-2xl border transition text-left",
                filterCurve === curve ? cn(c.bg, c.border, "ring-2 ring-offset-1", curve === "A" ? "ring-emerald-400" : curve === "B" ? "ring-amber-400" : "ring-red-400") : cn(UI.card)
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black", c.bg, c.text)}>
                  {curve}
                </span>
                <span className="text-xs font-bold tracking-widest uppercase text-slate-500">
                  {curve === "A" ? "≤80%" : curve === "B" ? "80-95%" : ">95%"}
                </span>
              </div>
              <div className="mt-2 text-xl font-black text-slate-900">
                {count} <span className="text-sm font-semibold text-slate-500">produtos</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart – top 30 */}
        <div className={cn(UI.card, "p-6")}>
          <h3 className="text-sm font-extrabold tracking-wide text-slate-900 mb-4">Top 30 Produtos — Faturamento</h3>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tickFormatter={v => fmt(v)} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v: any) => fmt(Number(v))}
                labelStyle={{ fontWeight: 800 }}
              />
              <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={CURVE_COLORS[entry.curve]?.bar ?? "#94A3B8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cumulative % curve */}
        <div className={cn(UI.card, "p-6")}>
          <h3 className="text-sm font-extrabold tracking-wide text-slate-900 mb-4">Curva Acumulada (%)</h3>
          <ResponsiveContainer width="100%" height={380}>
            <AreaChart data={cumData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <defs>
                <linearGradient id="gradCum" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366F1" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="rank" tick={{ fontSize: 11 }} label={{ value: "Produto #", position: "insideBottom", offset: -2, fontSize: 11 }} />
              <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} labelFormatter={(l: any) => `Produto #${l}`} />
              {/* Reference lines for 80% and 95% */}
              <Area type="monotone" dataKey="cumPct" stroke="#6366F1" strokeWidth={2} fill="url(#gradCum)" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-6 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold text-slate-600">A (0–80%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-xs font-semibold text-slate-600">B (80–95%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-xs font-semibold text-slate-600">C (&gt;95%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={cn(UI.card, "overflow-hidden")}>
        <div className="px-6 pt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h3 className="text-sm font-extrabold tracking-wide text-slate-900">
            Ranking Completo
            {filterCurve && <span className={cn("ml-2 px-2 py-0.5 rounded-md text-xs font-black", CURVE_COLORS[filterCurve].bg, CURVE_COLORS[filterCurve].text)}>Curva {filterCurve}</span>}
            <span className="ml-2 text-xs font-semibold text-slate-400">({filtered.length} produtos)</span>
          </h3>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar produto..."
              className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm w-64 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
        </div>

        <div className="p-6">
          <div className="max-h-[600px] overflow-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 z-10">
                <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3 w-16">Curva</th>
                  <th className="px-4 py-3">Produto / Grupo</th>
                  <th className="px-4 py-3 text-right">Qtd.</th>
                  <th className="px-4 py-3 text-right">Faturamento</th>
                  <th className="px-4 py-3 text-right">%</th>
                  <th className="px-4 py-3 text-right">Acum. %</th>
                  <th className="px-4 py-3">Canais</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayRows.map(row => {
                  const c = CURVE_COLORS[row.curve];
                  const isGroup = row.groupId != null && row.products && row.products.length > 1;
                  const isExpanded = expandedGroups.has(row.rank);
                  return (
                    <React.Fragment key={row.rank}>
                      <tr className={cn("hover:bg-slate-50", isGroup && "cursor-pointer")} onClick={() => isGroup && toggleGroup(row.rank)}>
                        <td className="px-4 py-3 font-bold text-slate-500">{row.rank}</td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black", c.bg, c.text, c.border, "border")}>
                            {row.curve}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {isGroup && (
                              <span className="shrink-0 text-slate-400">
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </span>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                {isGroup && <Layers size={13} className="shrink-0 text-sky-500" />}
                                <span className="font-semibold text-slate-900 truncate max-w-xs" title={row.name}>{row.name}</span>
                              </div>
                              {isGroup && (
                                <div className="text-[11px] text-slate-400 mt-0.5">{row.products!.length} produtos no grupo</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">{row.quantity}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">{fmt(row.total)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{row.pct.toFixed(1)}%</td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn("font-bold", row.cumPct <= 80 ? "text-emerald-600" : row.cumPct <= 95 ? "text-amber-600" : "text-red-600")}>
                            {row.cumPct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {row.channels.map(ch => (
                              <span key={ch} className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-extrabold text-white", CHANNEL_COLORS[ch] ?? "bg-slate-500")}>
                                {ch}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                      {isGroup && isExpanded && row.products!.map((pName, pi) => (
                        <tr key={`${row.rank}-sub-${pi}`} className="bg-sky-50/50">
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2 pl-12 text-xs text-slate-600 truncate max-w-xs" title={pName}>
                            <span className="text-slate-400 mr-1.5">↳</span>{pName}
                          </td>
                          <td className="px-4 py-2" colSpan={5} />
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length > 50 && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setExpanded(!expanded)}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition"
              >
                {expanded ? <><ChevronUp size={14} /> Mostrar menos</> : <><ChevronDown size={14} /> Mostrar todos ({filtered.length} produtos)</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
