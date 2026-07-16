import React, { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { API_URL } from "./config";

type ChannelRow = {
  channel: string;
  faturamentoBruto: number;
  adsInvestimento: number;
  taxas: number;
  taxasCartaoPix: number;
  frete: number;
  custoProducao: number;
  margemContribuicao: number;
  margemContribuicaoPercent: number;
  lucroLiquido: number;
  margemLucro: number;
};

type MonthRow = { month: string; byChannel: ChannelRow[] };

type ContributionDashboardData = {
  from: string;
  to: string;
  channels: string[];
  byMonth: MonthRow[];
};

const CHANNEL_LABELS: Record<string, string> = {
  shopee: "Shopee",
  tiktok: "TikTok",
  atacado: "Atacado",
  tray_varejo: "Tray Varejo",
};

const CHANNEL_COLORS: Record<string, string> = {
  shopee: "#ee4d2d",
  tiktok: "#111827",
  atacado: "#2563eb",
  tray_varejo: "#7c3aed",
};

const METRIC_KEYS = ["ADS", "Taxas", "Custo prod.", "Margem"] as const;

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

function pctOfRevenue(value: number, revenue: number): number {
  return revenue > 0 ? Number(((value / revenue) * 100).toFixed(2)) : 0;
}

function fmtPct(v: number) {
  return `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function channelLabel(ch: string) {
  return CHANNEL_LABELS[ch] || ch;
}

function MoneyWithPct({
  value,
  revenue,
  percent,
  accent,
}: {
  value: number;
  revenue: number;
  percent?: number;
  accent?: "positive" | "negative" | "neutral";
}) {
  const pct = percent ?? pctOfRevenue(value, revenue);
  const valueClass =
    accent === "positive"
      ? "text-emerald-700 font-extrabold"
      : accent === "negative"
        ? "text-red-600 font-extrabold"
        : "text-slate-900";
  return (
    <div className="tabular-nums">
      <div className={valueClass}>{fmtMoney(value)}</div>
      <div className="text-[11px] text-slate-500 font-semibold">{fmtPct(pct)}</div>
    </div>
  );
}

function defaultMonthRange() {
  const now = new Date();
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const fromDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}`;
  return { from, to };
}

export default function ContributionDashboard(): JSX.Element {
  const defaults = useMemo(() => defaultMonthRange(), []);
  const [data, setData] = useState<ContributionDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([
    "shopee",
    "tiktok",
    "atacado",
    "tray_varejo",
  ]);
  const [chartMonth, setChartMonth] = useState<string>("");

  async function fetchData() {
    setLoading(true);
    setMessage("");
    try {
      const qs = new URLSearchParams({ from, to });
      const res = await fetch(`${API_URL}/api/contribution-dashboard?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Falha ao carregar dashboard de margem.");
      setData(json);
      if (json.byMonth?.length) {
        setChartMonth((prev) => {
          if (prev && json.byMonth.some((m: MonthRow) => m.month === prev)) return prev;
          return json.byMonth[json.byMonth.length - 1].month;
        });
      }
    } catch (e: unknown) {
      console.error(e);
      setData(null);
      setMessage(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeChannels = useMemo(() => {
    const all = data?.channels || ["shopee", "tiktok", "atacado", "tray_varejo"];
    return all.filter((ch) => selectedChannels.includes(ch));
  }, [data, selectedChannels]);

  const tableRows = useMemo(() => {
    if (!data) return [] as Array<ChannelRow & { month: string }>;
    const rows: Array<ChannelRow & { month: string }> = [];
    for (const m of data.byMonth) {
      for (const c of m.byChannel) {
        if (!selectedChannels.includes(c.channel)) continue;
        rows.push({ month: m.month, ...c });
      }
    }
    return rows;
  }, [data, selectedChannels]);

  const chartData = useMemo(() => {
    if (!data || !chartMonth) return [];
    const monthRow = data.byMonth.find((m) => m.month === chartMonth);
    if (!monthRow) return [];

    return METRIC_KEYS.map((metric) => {
      const point: Record<string, string | number> = { metric };
      for (const ch of activeChannels) {
        const row = monthRow.byChannel.find((c) => c.channel === ch);
        if (!row) {
          point[ch] = 0;
          continue;
        }
        const rev = row.faturamentoBruto;
        if (metric === "ADS") point[ch] = pctOfRevenue(row.adsInvestimento, rev);
        else if (metric === "Taxas") point[ch] = pctOfRevenue(row.taxas, rev);
        else if (metric === "Custo prod.") point[ch] = pctOfRevenue(row.custoProducao, rev);
        else point[ch] = row.margemContribuicaoPercent;
      }
      return point;
    });
  }, [data, chartMonth, activeChannels]);

  const chartAbsByChannel = useMemo(() => {
    if (!data || !chartMonth) return new Map<string, ChannelRow>();
    const monthRow = data.byMonth.find((m) => m.month === chartMonth);
    const map = new Map<string, ChannelRow>();
    for (const ch of activeChannels) {
      const row = monthRow?.byChannel.find((c) => c.channel === ch);
      if (row) map.set(ch, row);
    }
    return map;
  }, [data, chartMonth, activeChannels]);

  function toggleChannel(ch: string) {
    setSelectedChannels((prev) =>
      prev.includes(ch) ? prev.filter((x) => x !== ch) : [...prev, ch],
    );
  }

  if (loading) {
    return (
      <div className={cn(UI.bg, "min-h-screen flex items-center justify-center text-slate-500")}>
        Carregando...
      </div>
    );
  }

  if (!data) {
    return (
      <div className={cn(UI.bg, "min-h-screen flex items-center justify-center text-red-600")}>
        {message || "Erro."}
      </div>
    );
  }

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className={cn(UI.card, "p-6")}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900">
                Margem por Canal
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                ADS, taxas (Tray inclui frete), custo de produção e margem de contribuição — mês a
                mês.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="text-xs font-bold tracking-widest uppercase text-slate-500">De</div>
                <input
                  type="month"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
                />
              </div>
              <div>
                <div className="text-xs font-bold tracking-widest uppercase text-slate-500">
                  Até
                </div>
                <input
                  type="month"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
                />
              </div>
              <button
                onClick={fetchData}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-slate-800 transition"
              >
                Atualizar
              </button>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-xs font-bold tracking-widest uppercase text-slate-500">Canais</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(data.channels || []).map((ch) => {
                const active = selectedChannels.includes(ch);
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => toggleChannel(ch)}
                    className={cn(
                      "rounded-xl px-3 py-1.5 text-sm font-extrabold border transition",
                      active
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300",
                    )}
                    style={active ? { borderColor: CHANNEL_COLORS[ch] || undefined } : undefined}
                  >
                    {channelLabel(ch)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className={cn(UI.card, "p-6")}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-extrabold tracking-wide text-slate-900">
              Componentes por canal (% do faturamento)
            </h3>
            <div>
              <div className="text-xs font-bold tracking-widest uppercase text-slate-500">
                Mês do gráfico
              </div>
              <select
                value={chartMonth}
                onChange={(e) => setChartMonth(e.target.value)}
                className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
              >
                {data.byMonth.map((m) => (
                  <option key={m.month} value={m.month}>
                    {m.month}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 h-80">
            {activeChannels.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Selecione ao menos um canal.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="metric" tick={{ fontSize: 12, fontWeight: 700 }} />
                  <YAxis
                    tickFormatter={(v) => fmtPct(Number(v))}
                    tick={{ fontSize: 11 }}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    formatter={(v, name, item) => {
                      const ch = String(name);
                      const row = chartAbsByChannel.get(ch);
                      const metric = String(item?.payload?.metric ?? "");
                      if (!row) return fmtPct(Number(v ?? 0));
                      let abs = 0;
                      if (metric === "ADS") abs = row.adsInvestimento;
                      else if (metric === "Taxas") abs = row.taxas;
                      else if (metric === "Custo prod.") abs = row.custoProducao;
                      else abs = row.margemContribuicao;
                      return [`${fmtPct(Number(v ?? 0))} (${fmtMoney(abs)})`, channelLabel(ch)];
                    }}
                  />
                  <Legend formatter={(v) => channelLabel(String(v))} />
                  {activeChannels.map((ch) => (
                    <Line
                      key={ch}
                      type="monotone"
                      dataKey={ch}
                      name={ch}
                      stroke={CHANNEL_COLORS[ch] || "#64748b"}
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="px-6 pt-6">
            <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Detalhe mês a mês</h3>
          </div>
          <div className="p-6">
            <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                  <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                    <th className="px-4 py-3">Mês</th>
                    <th className="px-4 py-3">Canal</th>
                    <th className="px-4 py-3">Faturamento</th>
                    <th className="px-4 py-3">ADS</th>
                    <th className="px-4 py-3">Taxas</th>
                    <th className="px-4 py-3">Custo prod.</th>
                    <th className="px-4 py-3">Margem</th>
                    <th className="px-4 py-3">Lucro líquido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tableRows.map((row) => (
                    <tr key={`${row.month}-${row.channel}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-extrabold text-slate-900">{row.month}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">
                        {channelLabel(row.channel)}
                      </td>
                      <td className="px-4 py-3 text-slate-900 tabular-nums">
                        {fmtMoney(row.faturamentoBruto)}
                      </td>
                      <td className="px-4 py-3">
                        <MoneyWithPct value={row.adsInvestimento} revenue={row.faturamentoBruto} />
                      </td>
                      <td className="px-4 py-3">
                        <MoneyWithPct value={row.taxas} revenue={row.faturamentoBruto} />
                      </td>
                      <td className="px-4 py-3">
                        <MoneyWithPct value={row.custoProducao} revenue={row.faturamentoBruto} />
                      </td>
                      <td className="px-4 py-3">
                        <MoneyWithPct
                          value={row.margemContribuicao}
                          revenue={row.faturamentoBruto}
                          percent={row.margemContribuicaoPercent}
                          accent={row.margemContribuicao >= 0 ? "positive" : "negative"}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <MoneyWithPct
                          value={row.lucroLiquido ?? 0}
                          revenue={row.faturamentoBruto}
                          percent={row.margemLucro ?? pctOfRevenue(row.lucroLiquido ?? 0, row.faturamentoBruto)}
                          accent={(row.lucroLiquido ?? 0) >= 0 ? "positive" : "negative"}
                        />
                      </td>
                    </tr>
                  ))}
                  {tableRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        Nenhum dado para os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {message && <div className="text-sm text-red-600">{message}</div>}
      </div>
    </div>
  );
}
