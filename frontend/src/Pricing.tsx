import React, { useEffect, useState, useMemo } from "react";
import { Tag, RefreshCcw } from "lucide-react";

const API_URL = "http://localhost:4000";

type Product = {
  id: number;
  code: string;
  name: string;
  costPrice: number | null;
  source: string;
  _count?: { orderItems: number };
};

type ChannelConfig = {
  commissionPercent: number;
  adsPercent: number;
  fixedCostPercent: number;
  taxPercent: number;
  profitPercent: number;
};

const CHANNELS = [
  { id: "shopee", label: "Shopee" },
  { id: "tiktok", label: "TikTok" },
  { id: "tray", label: "Tray" },
] as const;

const DEFAULT_CONFIG: Record<string, ChannelConfig> = {
  shopee: { commissionPercent: 15, adsPercent: 10, fixedCostPercent: 5, taxPercent: 0, profitPercent: 15 },
  tiktok: { commissionPercent: 12, adsPercent: 8, fixedCostPercent: 5, taxPercent: 0, profitPercent: 18 },
  tray: { commissionPercent: 0, adsPercent: 0, fixedCostPercent: 5, taxPercent: 0, profitPercent: 20 },
};

const UI = {
  bg: "bg-slate-50",
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Preço de venda tal que, após descontar os % sobre o preço (comissão, ADS, custo fixo, imposto),
 * reste o % de lucro líquido desejado.
 * P * (1 - commission - ads - fixed - tax - profit) = C  =>  P = C / (1 - total%)
 */
function suggestedSalePrice(cost: number, config: ChannelConfig): number | null {
  const totalPercent =
    config.commissionPercent +
    config.adsPercent +
    config.fixedCostPercent +
    config.taxPercent +
    config.profitPercent;
  const divisor = 1 - totalPercent / 100;
  if (divisor <= 0) return null;
  return cost / divisor;
}

export default function Pricing() {
  const [channel, setChannel] = useState<string>("shopee");
  const [config, setConfig] = useState<Record<string, ChannelConfig>>(() => ({ ...DEFAULT_CONFIG }));
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const cfg = config[channel] ?? DEFAULT_CONFIG[channel] ?? DEFAULT_CONFIG.shopee;

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const qs = search ? `?q=${encodeURIComponent(search)}` : "";
      const res = await fetch(`${API_URL}/api/products${qs}`);
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const updateChannelConfig = (field: keyof ChannelConfig, value: number) => {
    setConfig((prev) => ({
      ...prev,
      [channel]: { ...(prev[channel] ?? DEFAULT_CONFIG[channel]), [field]: value },
    }));
  };

  const rowsWithPrice = useMemo(() => {
    return products
      .filter((p) => p.costPrice != null && p.costPrice > 0)
      .map((p) => {
        const cost = p.costPrice!;
        const price = suggestedSalePrice(cost, cfg);
        return {
          ...p,
          cost,
          suggestedPrice: price,
          totalPercent:
            cfg.commissionPercent +
            cfg.adsPercent +
            cfg.fixedCostPercent +
            cfg.taxPercent +
            cfg.profitPercent,
        };
      });
  }, [products, cfg]);

  const totalPercent = cfg.commissionPercent + cfg.adsPercent + cfg.fixedCostPercent + cfg.taxPercent + cfg.profitPercent;
  const isValid = totalPercent < 100;

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      <div className="bg-gradient-to-r from-sky-700 via-blue-700 to-indigo-700">
        <div className="max-w-7xl mx-auto px-6 py-7 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-2 opacity-95">
                <Tag className="w-5 h-5" />
                <span className="text-sm font-semibold tracking-wide">PRECIFICAÇÃO</span>
              </div>
              <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">Precificar produtos por canal</h1>
              <p className="mt-1 text-white/80 text-sm">Custo + percentuais sobre o preço de venda → preço sugerido e % de lucro líquido</p>
            </div>
            <button
              onClick={fetchProducts}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-slate-900 text-sm font-extrabold shadow-sm hover:opacity-95 transition"
            >
              <RefreshCcw className="w-4 h-4" />
              Atualizar produtos
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className={cn(UI.card, "p-6")}>
          <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Canal e variáveis</h3>
          <p className="mt-1 text-xs text-slate-500 mb-4">Todos os percentuais são sobre o preço final de venda. O preço sugerido garante o lucro líquido desejado.</p>

          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Canal</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              >
                {CHANNELS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Comissão (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={cfg.commissionPercent}
                onChange={(e) => updateChannelConfig("commissionPercent", Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Custo ADS (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={cfg.adsPercent}
                onChange={(e) => updateChannelConfig("adsPercent", Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Custo fixo (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={cfg.fixedCostPercent}
                onChange={(e) => updateChannelConfig("fixedCostPercent", Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Imposto (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={cfg.taxPercent}
                onChange={(e) => updateChannelConfig("taxPercent", Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Lucro líquido (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={cfg.profitPercent}
                onChange={(e) => updateChannelConfig("profitPercent", Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>

          {!isValid && (
            <p className="mt-3 text-sm font-semibold text-amber-600">
              A soma dos percentuais não pode ser 100% ou mais. Reduza algum valor para calcular o preço.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Fórmula: Preço sugerido = Custo ÷ (1 − soma dos % em decimal). Ex.: custo R$ 50 e soma 55% → preço = 50 ÷ 0,45 ≈ R$ 111,11.
          </p>
        </div>

        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="px-6 pt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Produtos e preço sugerido</h3>
              <p className="mt-1 text-xs text-slate-500">Apenas produtos com preço de custo cadastrado. Canal: {CHANNELS.find((c) => c.id === channel)?.label}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchProducts()}
                placeholder="Buscar..."
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-48"
              />
              <button
                onClick={fetchProducts}
                className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold text-white hover:bg-slate-700"
              >
                Buscar
              </button>
            </div>
          </div>
          <div className="p-6 overflow-auto">
            {loading ? (
              <div className="text-slate-500 py-8">Carregando produtos...</div>
            ) : rowsWithPrice.length === 0 ? (
              <div className="text-slate-500 py-8">
                {products.length === 0
                  ? "Nenhum produto encontrado. Cadastre produtos e preço de custo na tela Produtos."
                  : "Nenhum produto com preço de custo. Informe o custo na tela Produtos."}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 border-b border-slate-200">
                    <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Produto</th>
                      <th className="px-4 py-3 text-right">Custo</th>
                      <th className="px-4 py-3 text-right">Preço sugerido</th>
                      <th className="px-4 py-3 text-right">Margem (custo→preço)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rowsWithPrice.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-slate-700">{r.code}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{formatMoney(r.cost)}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                          {r.suggestedPrice != null ? formatMoney(r.suggestedPrice) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {r.suggestedPrice != null && r.cost > 0
                            ? `${(((r.suggestedPrice - r.cost) / r.suggestedPrice) * 100).toFixed(1)}%`
                            : "—"}
                        </td>
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
