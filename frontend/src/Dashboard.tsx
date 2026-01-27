import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import {
  DollarSign,
  Package,
  TrendingUp,
  Award,
  RefreshCcw,
  CalendarRange,
  BarChart3,
  PieChart as PieIcon,
  LayoutDashboard,
} from "lucide-react";

// Interfaces
interface ProductRank {
  name: string;
  quantity: number;
  total: number;
}
interface DashboardData {
  kpis: { revenue: number; orders: number; ticketMedio: number };
  byChannel: { name: string; value: number }[];
  byMonth: { name: string; shopee: number; tiktok: number; total: number; totalCount: number }[];
  topProducts: ProductRank[];
}

type RangeKey = "7d" | "30d" | "90d";
type BarMode = "total" | "shopee" | "tiktok";

const ranges: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
];

const CHANNEL_COLORS = ["#FF6B35", "#1F2937"]; // Shopee / TikTok
const UI = {
  bg: "bg-slate-50",
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
  soft: "bg-white/70 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
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

function Card({
  title,
  icon: Icon,
  right,
  children,
  className,
}: {
  title: string;
  icon?: any;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (

    <div className={cn(UI.card, className)}>
      <div className="px-6 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-slate-600" />}
          <h3 className="text-sm font-extrabold tracking-wide text-slate-900">{title}</h3>
        </div>
        {right}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Kpi({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: any;
  accent: string;
}) {
  return (
    <div className={cn(UI.card, "overflow-hidden")}>
      <div className={cn("h-1.5 w-full", accent)} />
      <div className="p-6 flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</div>
          <div className="mt-2 text-3xl font-black tracking-tight text-slate-900">{value}</div>
          <div className="mt-2 text-xs text-slate-500">{subtitle}</div>
        </div>
        <div className={cn("p-3 rounded-2xl text-white shadow-sm", accent)}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardBI() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("30d");
  const [barMode, setBarMode] = useState<BarMode>("total");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // se quiser: /api/dashboard?range=30d
      const res = await axios.get("http://localhost:4000/api/dashboard");
      setData(res.data);
      setLastUpdate(new Date());
    } catch (e) {
      console.error(e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const totals = useMemo(() => {
    if (!data) return null;
    const shopee = data.byMonth.reduce((a, m) => a + (m.shopee || 0), 0);
    const tiktok = data.byMonth.reduce((a, m) => a + (m.tiktok || 0), 0);
    const total = data.byMonth.reduce((a, m) => a + (m.total || 0), 0);
    return { shopee, tiktok, total };
  }, [data]);

  if (loading) return <div className={cn(UI.bg, "min-h-screen flex items-center justify-center text-slate-500")}>Carregando...</div>;
  if (!data) return <div className={cn(UI.bg, "min-h-screen flex items-center justify-center text-red-500")}>Erro ao carregar dados.</div>;

  const barKey = barMode; // "total" | "shopee" | "tiktok"

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      {/* Header com gradiente estilo BI */}
      <div className="bg-gradient-to-r from-sky-700 via-blue-700 to-indigo-700">
        <div className="max-w-7xl mx-auto px-6 py-7 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-2 opacity-95">
                <LayoutDashboard className="w-5 h-5" />
                <span className="text-sm font-semibold tracking-wide">DASHBOARD DE VENDAS</span>
              </div>
              <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">Visão Geral</h1>
              <p className="mt-1 text-white/80 text-sm">Shopee + TikTok • KPIs, evolução mensal e produtos campeões</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/15">
                <CalendarRange className="w-4 h-4 text-white/90" />
                <div className="flex gap-1">
                  {ranges.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setRange(r.key)}
                      className={cn(
                        "text-xs font-bold px-2 py-1 rounded-lg transition",
                        range === r.key ? "bg-white text-slate-900" : "text-white/85 hover:bg-white/10"
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={fetchData}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-slate-900 text-sm font-extrabold shadow-sm hover:opacity-95 transition"
              >
                <RefreshCcw className="w-4 h-4" />
                Atualizar
              </button>

              <div className="text-xs text-white/85 px-3 py-2 rounded-xl bg-white/10 border border-white/15">
                Última atualização:{" "}
                <span className="font-extrabold">{lastUpdate ? lastUpdate.toLocaleTimeString() : "-"}</span>
              </div>
            </div>
          </div>

          {/* Mini resumo do período */}
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/10 border border-white/15 px-4 py-3">
              <div className="text-xs text-white/80 font-semibold">Total no período</div>
              <div className="text-lg font-black">{totals ? formatMoney(totals.total) : "-"}</div>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/15 px-4 py-3">
              <div className="text-xs text-white/80 font-semibold">Shopee</div>
              <div className="text-lg font-black">{totals ? formatMoney(totals.shopee) : "-"}</div>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/15 px-4 py-3">
              <div className="text-xs text-white/80 font-semibold">TikTok</div>
              <div className="text-lg font-black">{totals ? formatMoney(totals.tiktok) : "-"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Kpi
            title="Faturamento"
            value={formatMoney(data.kpis.revenue)}
            subtitle="Receita bruta acumulada"
            icon={DollarSign}
            accent="bg-emerald-500"
          />
          <Kpi
            title="Pedidos"
            value={String(data.kpis.orders)}
            subtitle="Quantidade de pedidos"
            icon={Package}
            accent="bg-sky-500"
          />
          <Kpi
            title="Ticket médio"
            value={formatMoney(data.kpis.ticketMedio)}
            subtitle="Média por pedido"
            icon={TrendingUp}
            accent="bg-violet-500"
          />
        </div>

        {/* Gráficos principais */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* BarChart Total por mês */}
          <Card
            title="Total de Vendas por Mês"
            icon={BarChart3}
            className="lg:col-span-8"
            right={
              <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 border border-slate-200">
                {([
                  { key: "total", label: "Total" },
                  { key: "shopee", label: "Shopee" },
                  { key: "tiktok", label: "TikTok" },
                ] as const).map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setBarMode(m.key)}
                    className={cn(
                      "text-xs font-extrabold px-3 py-1.5 rounded-lg transition",
                      barMode === m.key ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            }
          >
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byMonth} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
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
                  <Bar
                    dataKey={barKey}
                    name={barKey === "total" ? "Total" : barKey === "shopee" ? "Shopee" : "TikTok"}
                    radius={[12, 12, 4, 4]}
                    fill={barKey === "shopee" ? CHANNEL_COLORS[0] : barKey === "tiktok" ? CHANNEL_COLORS[1] : "#2563EB"}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Donut market share */}
          <Card title="Market Share" icon={PieIcon} className="lg:col-span-4">
            <div className="h-80 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.byChannel} cx="50%" cy="45%" innerRadius={62} outerRadius={92} paddingAngle={4} dataKey="value">
                    {data.byChannel.map((_, idx) => (
                      <Cell key={idx} fill={CHANNEL_COLORS[idx % CHANNEL_COLORS.length]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any, name: any) => [formatMoney(Number(value || 0)), name]} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>

              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="text-3xl font-black text-slate-900">{data.byChannel.length}</div>
                  <div className="text-[11px] font-bold tracking-widest uppercase text-slate-400">canais</div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Gráfico secundário: tendência por canal (Area) + Ranking */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card title="Tendência por Canal" icon={TrendingUp} className="lg:col-span-7">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.byMonth} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sh" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHANNEL_COLORS[0]} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={CHANNEL_COLORS[0]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="tt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHANNEL_COLORS[1]} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={CHANNEL_COLORS[1]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748B", fontSize: 12 }} tickFormatter={(v) => formatCompact(Number(v))} />
                  <Tooltip formatter={(value: any, name: any) => [formatMoney(Number(value || 0)), name === "shopee" ? "Shopee" : "TikTok"]} />
                  <Area type="monotone" dataKey="shopee" stroke={CHANNEL_COLORS[0]} strokeWidth={3} fill="url(#sh)" dot={false} />
                  <Area type="monotone" dataKey="tiktok" stroke={CHANNEL_COLORS[1]} strokeWidth={3} fill="url(#tt)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Top 5 Produtos (Curva A)" icon={Award} className="lg:col-span-5">
            <div className="space-y-3">
              {data.topProducts.map((p, i) => {
                const pct = data.kpis.revenue > 0 ? (p.total / data.kpis.revenue) * 100 : 0;
                return (
                  <div key={i} className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-extrabold text-slate-900 line-clamp-2">{p.name}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          <span className="font-bold">{p.quantity}</span> un • {formatMoney(p.total)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-black text-slate-900">{pct.toFixed(1)}%</div>
                        <div className="text-[11px] text-slate-500">do total</div>
                      </div>
                    </div>

                    <div className="mt-3 h-2 w-full bg-white rounded-full overflow-hidden border border-slate-200">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
