import React, { useEffect, useMemo, useState } from "react";

const API_URL = "http://localhost:4000";

type ChannelRow = { channel: string; revenue: number; spend: number; roas: number | null };
type MonthRow = { month: string; revenue: number; spend: number; roas: number | null; byChannel: ChannelRow[] };
type AdsDashboardData = { kpis: { revenue: number; spend: number; roas: number | null }; channels: string[]; byMonth: MonthRow[] };

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

export default function AdsDashboard() {
  const [data, setData] = useState<AdsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const totalsByChannel = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { revenue: number; spend: number }>();
    for (const m of data.byMonth) {
      for (const c of m.byChannel) {
        const prev = map.get(c.channel) || { revenue: 0, spend: 0 };
        map.set(c.channel, { revenue: prev.revenue + c.revenue, spend: prev.spend + c.spend });
      }
    }
    return [...map.entries()]
      .map(([channel, v]) => ({ channel, revenue: v.revenue, spend: v.spend, roas: v.spend > 0 ? v.revenue / v.spend : null }))
      .sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
  }, [data]);

  async function fetchData() {
    setLoading(true);
    setMessage("");
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const url = `${API_URL}/api/ads-dashboard${qs.toString() ? `?${qs.toString()}` : ""}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Falha ao carregar dashboard ADS.");
      setData(json);
    } catch (e: any) {
      console.error(e);
      setData(null);
      setMessage(`Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className={cn(UI.bg, "min-h-screen flex items-center justify-center text-slate-500")}>Carregando...</div>;
  if (!data) return <div className={cn(UI.bg, "min-h-screen flex items-center justify-center text-red-600")}>{message || "Erro."}</div>;

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className={cn(UI.card, "p-6")}>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900">Dashboard ADS (ROAS)</h2>
              <p className="mt-1 text-sm text-slate-500">ROAS total e por canal, mês a mês.</p>
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
                <div className="text-xs font-bold tracking-widest uppercase text-slate-500">Até</div>
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

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={cn(UI.card, "p-5")}>
              <div className="text-xs font-bold tracking-widest uppercase text-slate-500">Receita</div>
              <div className="mt-2 text-2xl font-black text-slate-900">{fmtMoney(data.kpis.revenue)}</div>
            </div>
            <div className={cn(UI.card, "p-5")}>
              <div className="text-xs font-bold tracking-widest uppercase text-slate-500">Investimento ADS</div>
              <div className="mt-2 text-2xl font-black text-slate-900">{fmtMoney(data.kpis.spend)}</div>
            </div>
            <div className={cn(UI.card, "p-5")}>
              <div className="text-xs font-bold tracking-widest uppercase text-slate-500">ROAS</div>
              <div className="mt-2 text-2xl font-black text-slate-900">{data.kpis.roas === null ? "-" : data.kpis.roas.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="px-6 pt-6">
            <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Mês a mês</h3>
          </div>
          <div className="p-6">
            <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                  <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                    <th className="px-4 py-3">Mês</th>
                    <th className="px-4 py-3">Receita</th>
                    <th className="px-4 py-3">ADS</th>
                    <th className="px-4 py-3">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byMonth.map((m) => (
                    <tr key={m.month} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-extrabold text-slate-900">{m.month}</td>
                      <td className="px-4 py-3 text-slate-900 font-bold">{fmtMoney(m.revenue)}</td>
                      <td className="px-4 py-3 text-slate-900 font-bold">{fmtMoney(m.spend)}</td>
                      <td className="px-4 py-3 text-slate-900 font-extrabold">{m.roas === null ? "-" : m.roas.toFixed(2)}</td>
                    </tr>
                  ))}
                  {data.byMonth.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-500" colSpan={4}>
                        Sem dados no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="px-6 pt-6">
            <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Total por canal</h3>
          </div>
          <div className="p-6">
            <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                  <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                    <th className="px-4 py-3">Canal</th>
                    <th className="px-4 py-3">Receita</th>
                    <th className="px-4 py-3">ADS</th>
                    <th className="px-4 py-3">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {totalsByChannel.map((c) => (
                    <tr key={c.channel} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-extrabold text-slate-900">{c.channel}</td>
                      <td className="px-4 py-3 text-slate-900 font-bold">{fmtMoney(c.revenue)}</td>
                      <td className="px-4 py-3 text-slate-900 font-bold">{fmtMoney(c.spend)}</td>
                      <td className="px-4 py-3 text-slate-900 font-extrabold">{c.roas === null ? "-" : c.roas.toFixed(2)}</td>
                    </tr>
                  ))}
                  {totalsByChannel.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-500" colSpan={4}>
                        Sem dados por canal.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

