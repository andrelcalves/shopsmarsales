import React, { useEffect, useState } from "react";

const API_URL = "http://localhost:4000";

type Product = {
  id: number;
  code: string;
  name: string;
  costPrice: number | null;
  source: string;
  _count?: { orderItems: number };
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

const UI = {
  bg: "bg-slate-50",
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

function fmtMoney(v: number | null) {
  if (v == null || v === 0) return "-";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Products() {
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCostPrice, setEditCostPrice] = useState<string>("");

  async function fetchRows() {
    setLoading(true);
    try {
      const qs = search ? `?q=${encodeURIComponent(search)}` : "";
      const res = await fetch(`${API_URL}/api/products${qs}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveCostPrice(id: number, costPriceStr: string) {
    setMessage("Salvando...");
    try {
      const costPrice = costPriceStr ? parseFloat(String(costPriceStr).replace(",", ".")) : null;
      const res = await fetch(`${API_URL}/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costPrice }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao salvar.");
      setMessage("Salvo.");
      setEditingId(null);
      setEditCostPrice("");
      fetchRows();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setEditCostPrice(p.costPrice != null ? String(p.costPrice) : "");
  }

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className={cn(UI.card, "p-6")}>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900">Produtos (preço de custo)</h2>
              <p className="mt-1 text-sm text-slate-500">Cadastre o preço de custo dos produtos. Itens são vinculados automaticamente nas importações.</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchRows()}
                placeholder="Buscar por código ou nome..."
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm w-64"
              />
              <button
                onClick={fetchRows}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-slate-800 transition"
              >
                Buscar
              </button>
            </div>
          </div>

          {message && <div className="mt-3 text-sm font-semibold text-slate-700">{message}</div>}
        </div>

        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="p-6">
            {loading ? (
              <div className="text-sm text-slate-500">Carregando...</div>
            ) : (
              <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                    <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">Origem</th>
                      <th className="px-4 py-3">Preço custo</th>
                      <th className="px-4 py-3">Itens</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-extrabold text-slate-900">{p.code}</td>
                        <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{p.name}</td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-lg px-2 py-1 text-[11px] font-extrabold text-white",
                              p.source === "shopee" ? "bg-orange-600" : p.source === "tiktok" ? "bg-slate-800" : "bg-indigo-700"
                            )}
                          >
                            {p.source || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {editingId === p.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editCostPrice}
                                onChange={(e) => setEditCostPrice(e.target.value)}
                                placeholder="0,00"
                                className="rounded-lg border border-slate-200 px-2 py-1 text-sm w-24"
                                autoFocus
                              />
                              <button
                                onClick={() => saveCostPrice(p.id, editCostPrice)}
                                className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                              >
                                Salvar
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(null);
                                  setEditCostPrice("");
                                }}
                                className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-300"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <span className="font-bold text-slate-900">{fmtMoney(p.costPrice)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{(p as any)._count?.orderItems ?? 0}</td>
                        <td className="px-4 py-3">
                          {editingId !== p.id && (
                            <button
                              onClick={() => startEdit(p)}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-900 hover:bg-slate-50"
                            >
                              Editar custo
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-sm text-slate-500" colSpan={6}>
                          Nenhum produto cadastrado. Importe pedidos (Shopee, TikTok, Tray) ou produtos Tray para popular a lista.
                        </td>
                      </tr>
                    )}
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
