import React, { useEffect, useState } from "react";

const API_URL = "http://localhost:4000";

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

const channelLabel: Record<string, string> = {
  all: "Todos os canais",
  shopee: "Shopee",
  tiktok: "TikTok",
  tray: "Site Tray",
};

export default function Simulation(): JSX.Element {
  const [data, setData] = useState<SimulationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [channel, setChannel] = useState<string>("all");
  const [fixedCost, setFixedCost] = useState<string>("2459");
  const [cardPixPercent, setCardPixPercent] = useState<string>("3.63");

  async function fetchData() {
    setLoading(true);
    setMessage("");
    try {
      const qs = new URLSearchParams();
      qs.set("month", month);
      qs.set("channel", channel);
      if (fixedCost) qs.set("fixedCost", fixedCost);
      if (cardPixPercent) qs.set("cardPixPercent", cardPixPercent);
      const res = await fetch(`${API_URL}/api/simulation?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Falha ao carregar simulação.");
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
  }, [month, channel]);

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
              <p className="mt-1 text-sm text-slate-500">
                Resultado por mês e canal. Custo fixo proporcional ao faturamento. Taxas Cartão/PIX (Tray) vêm da tela Taxas Tray.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">
                  Mês
                </label>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
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
                  <option value="tray">Tray</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">
                  Custo fixo (R$)
                </label>
                <input
                  type="text"
                  value={fixedCost}
                  onChange={(e) => setFixedCost(e.target.value)}
                  placeholder="2459"
                  className="mt-2 w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">
                  Taxa Cartão/PIX (%)
                </label>
                <input
                  type="text"
                  value={cardPixPercent}
                  onChange={(e) => setCardPixPercent(e.target.value)}
                  placeholder="3.63"
                  className="mt-2 w-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
                />
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
          {message && <div className="mt-3 text-sm font-semibold text-red-600">{message}</div>}
        </div>

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
                    <td className="py-2 pr-4 font-semibold text-slate-900">Faturamento Bruto</td>
                    <td className="py-2 text-right font-extrabold text-slate-900">{fmtMoney(data.faturamentoBruto)}</td>
                    <td className="py-2 w-16 text-right text-slate-500">—</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">(-) Investimento em Ads</td>
                    <td className="py-2 text-right font-bold text-slate-900">{fmtMoney(data.adsInvestimento)}</td>
                    <td className="py-2 text-right text-slate-500">{data.adsPercent.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">(-) Taxas Shopee</td>
                    <td className="py-2 text-right font-bold text-slate-900">{fmtMoney(data.taxasShopee)}</td>
                    <td className="py-2 text-right text-slate-500">{data.taxasShopeePercent.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">(-) Taxas TikTok</td>
                    <td className="py-2 text-right font-bold text-slate-900">{fmtMoney(data.taxasTiktok)}</td>
                    <td className="py-2 text-right text-slate-500">{data.taxasTiktokPercent.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">(-) Taxas Cartão/PIX</td>
                    <td className="py-2 text-right font-bold text-slate-900">{fmtMoney(data.taxasCartaoPix)}</td>
                    <td className="py-2 text-right text-slate-500">{data.taxasCartaoPixPercent.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">(-) Frete</td>
                    <td className="py-2 text-right font-bold text-slate-900">{fmtMoney(data.frete)}</td>
                    <td className="py-2 text-right text-slate-500">{data.fretePercent.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">(-) Custo de Produção</td>
                    <td className="py-2 text-right font-bold text-slate-900">{fmtMoney(data.custoProducao)}</td>
                    <td className="py-2 text-right text-slate-500">{data.custoProducaoPercent.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">(-) Custo Fixo</td>
                    <td className="py-2 text-right font-bold text-slate-900">{fmtMoney(data.custoFixo)}</td>
                    <td className="py-2 text-right text-slate-500">{data.custoFixoPercent.toFixed(2)}%</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">(-) Imposto ({data.impostoPercent}%)</td>
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
