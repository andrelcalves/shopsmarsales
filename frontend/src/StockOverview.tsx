import React, { useEffect, useMemo, useState } from "react";
import { API_URL } from "./config";

type Member = {
  productId: number;
  code: string;
  name: string;
  sku: string | null;
  source: string;
  variationName: string | null;
  sold: number;
};

type MasterStockItem = {
  type: "master";
  masterProductId: number;
  sku: string;
  name: string;
  opening: number;
  sold: number;
  current: number;
  costPrice: number | null;
  effectiveCostDate: string | null;
  costSource: "stock" | null;
  sources: string[];
  members: Member[];
};

type StockCurrentResponse = {
  stockStartDate: string | null;
  items: MasterStockItem[];
};

type StockProjection = {
  stockStartDate: string | null;
  projectedRevenue: number;
  projectedCost: number;
  details: Array<{
    type: string;
    masterProductId?: number;
    sku?: string;
    name: string;
    current: number;
    unitPrice: number;
    revenue: number;
  }>;
};

const UI = {
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function fmtMoney(v: number | null) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function channelBadgeClass(src: string) {
  const s = src.toLowerCase();
  if (s.includes("shopee")) return "bg-orange-600 text-white";
  if (s.includes("tiktok")) return "bg-slate-800 text-white";
  if (s.includes("tray")) return "bg-indigo-700 text-white";
  return "bg-slate-200 text-slate-700";
}

export default function StockOverview() {
  const [data, setData] = useState<StockCurrentResponse | null>(null);
  const [projection, setProjection] = useState<StockProjection | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`${API_URL}/api/stock-current`);
      if (filterName) url.searchParams.set("name", filterName);
      if (filterSku) url.searchParams.set("sku", filterSku);
      const [r1, r2] = await Promise.all([
        fetch(url.toString()),
        fetch(`${API_URL}/api/stock-projection`),
      ]);
      if (!r1.ok) throw new Error("Erro ao carregar estoque atual.");
      const json: StockCurrentResponse = await r1.json();
      setData(json);
      if (r2.ok) {
        const p: StockProjection = await r2.json();
        setProjection(p);
      }
    } catch (e: any) {
      setError(e?.message || "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = data?.items ?? [];

  const totals = useMemo(() => {
    let opening = 0;
    let sold = 0;
    let current = 0;
    let costAtCurrent = 0;
    for (const i of items) {
      opening += i.opening;
      sold += i.sold;
      current += i.current;
      if (i.costPrice != null) costAtCurrent += i.costPrice * i.current;
    }
    return { opening, sold, current, costAtCurrent };
  }, [items]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className={cn(UI.card, "p-6")}>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-900">Consulta de estoque</h2>
            <p className="mt-1 text-sm text-slate-500">
              Posição agregada por <strong>produto mestre (SKU)</strong>. Para lançar abertura e custos, use{" "}
              <span className="font-semibold">Cadastros → Lançar estoque</span>.
            </p>
            {data?.stockStartDate && (
              <p className="mt-1 text-xs text-slate-500">
                Data inicial do estoque: <strong>{fmtDateBR(data.stockStartDate)}</strong>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Nome</label>
              <input
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") reload();
                }}
                className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                placeholder="contém..."
              />
            </div>
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">SKU mestre</label>
              <input
                value={filterSku}
                onChange={(e) => setFilterSku(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") reload();
                }}
                className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                placeholder="contém..."
              />
            </div>
            <button
              onClick={reload}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-slate-800"
              disabled={loading}
            >
              {loading ? "Carregando..." : "Atualizar"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>
        )}

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div className="text-[11px] font-bold uppercase text-slate-500">Abertura total</div>
            <div className="mt-1 text-lg font-black text-slate-900">{totals.opening}</div>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div className="text-[11px] font-bold uppercase text-slate-500">Vendido</div>
            <div className="mt-1 text-lg font-black text-slate-900">{totals.sold}</div>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div className="text-[11px] font-bold uppercase text-slate-500">Estoque atual</div>
            <div className="mt-1 text-lg font-black text-slate-900">{totals.current}</div>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div className="text-[11px] font-bold uppercase text-slate-500">Valor de custo (atual)</div>
            <div className="mt-1 text-lg font-black text-slate-900">{fmtMoney(totals.costAtCurrent)}</div>
          </div>
        </div>

        {projection && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
              <div className="text-[11px] font-bold uppercase text-emerald-700">Faturamento projetado (estoque atual)</div>
              <div className="mt-1 text-lg font-black text-emerald-900">{fmtMoney(projection.projectedRevenue)}</div>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
              <div className="text-[11px] font-bold uppercase text-amber-700">Custo projetado</div>
              <div className="mt-1 text-lg font-black text-amber-900">{fmtMoney(projection.projectedCost)}</div>
            </div>
            <div className="rounded-xl bg-sky-50 border border-sky-200 p-3">
              <div className="text-[11px] font-bold uppercase text-sky-700">Margem bruta projetada</div>
              <div className="mt-1 text-lg font-black text-sky-900">
                {fmtMoney((projection.projectedRevenue || 0) - (projection.projectedCost || 0))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={cn(UI.card, "overflow-hidden")}>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                <th className="px-3 py-3"></th>
                <th className="px-3 py-3">SKU mestre</th>
                <th className="px-3 py-3">Produto</th>
                <th className="px-3 py-3">Canais</th>
                <th className="px-3 py-3 text-right">Abertura</th>
                <th className="px-3 py-3 text-right">Vendido</th>
                <th className="px-3 py-3 text-right">Atual</th>
                <th className="px-3 py-3 text-right">Custo vigente</th>
                <th className="px-3 py-3">Vigente desde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-500">Nenhum produto mestre encontrado.</td>
                </tr>
              )}
              {items.map((row) => {
                const open = !!expanded[row.masterProductId];
                return (
                  <React.Fragment key={row.masterProductId}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-3">
                        <button
                          onClick={() => setExpanded((p) => ({ ...p, [row.masterProductId]: !open }))}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-extrabold text-slate-700 hover:bg-slate-100"
                        >
                          {open ? "▾" : "▸"}
                        </button>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs font-extrabold text-slate-900">{row.sku}</td>
                      <td className="px-3 py-3 text-slate-800">{row.name}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {row.sources.map((s) => (
                            <span key={s} className={cn("inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold", channelBadgeClass(s))}>
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">{row.opening}</td>
                      <td className="px-3 py-3 text-right text-slate-700">{row.sold}</td>
                      <td className="px-3 py-3 text-right font-extrabold text-slate-900">{row.current}</td>
                      <td className="px-3 py-3 text-right text-slate-800">{fmtMoney(row.costPrice)}</td>
                      <td className="px-3 py-3 text-slate-600">{fmtDateBR(row.effectiveCostDate)}</td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50">
                        <td></td>
                        <td colSpan={8} className="px-3 py-3">
                          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Membros vinculados</div>
                          {row.members.length === 0 ? (
                            <div className="text-xs text-slate-500">Nenhum produto vinculado a este mestre.</div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-[10px] font-bold text-slate-500 uppercase">
                                  <th className="py-1 pr-3">Canal</th>
                                  <th className="py-1 pr-3">Código</th>
                                  <th className="py-1 pr-3">Nome marketing</th>
                                  <th className="py-1 pr-3">SKU canal</th>
                                  <th className="py-1 pr-3">Variação</th>
                                  <th className="py-1 pr-3 text-right">Vendido</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.members.map((m) => (
                                  <tr key={m.productId}>
                                    <td className="py-1 pr-3">
                                      <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold", channelBadgeClass(m.source))}>
                                        {m.source || "—"}
                                      </span>
                                    </td>
                                    <td className="py-1 pr-3 font-mono text-[11px] text-slate-600">{m.code}</td>
                                    <td className="py-1 pr-3 text-slate-700">{m.name}</td>
                                    <td className="py-1 pr-3 text-slate-600">{m.sku ?? "—"}</td>
                                    <td className="py-1 pr-3 text-slate-600">{m.variationName ?? "—"}</td>
                                    <td className="py-1 pr-3 text-right font-bold text-slate-800">{m.sold}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
