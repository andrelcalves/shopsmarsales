import React, { useEffect, useState } from "react";

const API_URL = "http://localhost:4000";

type InventoryConfig = { stockStartDate: string | null };
type ProductStockRow = { productId: number; product: { id: number; code: string; name: string }; quantity: number };
type StockCurrentItem = {
  type?: "product" | "group";
  productId: number | null;
  productGroupId?: number | null;
  code: string | null;
  name: string;
  opening: number;
  sold: number;
  current: number;
  costPrice: number | null;
  productNames?: string[];
};
type StockCurrent = { stockStartDate: string | null; items: StockCurrentItem[] };
type StockProjection = {
  stockStartDate: string | null;
  projectedRevenue: number;
  projectedCost: number;
  details: { type?: "product" | "group"; productId?: number | null; productGroupId?: number | null; name: string; current: number; unitPrice: number; revenue: number }[];
};
type Product = { id: number; code: string; name: string };
type ProductGroupItem = { productId: number; product: Product };
type ProductGroup = {
  id: number;
  name: string;
  items: ProductGroupItem[];
  stock: { quantity: number } | null;
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

export default function Stock() {
  const [config, setConfig] = useState<InventoryConfig | null>(null);
  const [stockStartDate, setStockStartDate] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [productStockRows, setProductStockRows] = useState<ProductStockRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockCurrent, setStockCurrent] = useState<StockCurrent | null>(null);
  const [projection, setProjection] = useState<StockProjection | null>(null);
  const [editingQty, setEditingQty] = useState<Record<string, string>>({});
  const [productFilter, setProductFilter] = useState("");
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupProductIds, setNewGroupProductIds] = useState<number[]>([]);
  const [showNewGroup, setShowNewGroup] = useState(false);

  async function fetchConfig() {
    try {
      const res = await fetch(`${API_URL}/api/inventory-config`);
      const data = await res.json();
      setConfig(data);
      setStockStartDate(data.stockStartDate || "");
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchProductStock() {
    try {
      const res = await fetch(`${API_URL}/api/product-stock`);
      const data = await res.json();
      setProductStockRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setProductStockRows([]);
    }
  }

  async function fetchProducts() {
    try {
      const res = await fetch(`${API_URL}/api/products`);
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setProducts([]);
    }
  }

  async function fetchStockCurrent() {
    try {
      const res = await fetch(`${API_URL}/api/stock-current`);
      const data = await res.json();
      setStockCurrent(data);
    } catch (e) {
      console.error(e);
      setStockCurrent(null);
    }
  }

  async function fetchProjection() {
    try {
      const res = await fetch(`${API_URL}/api/stock-projection`);
      const data = await res.json();
      setProjection(data);
    } catch (e) {
      console.error(e);
      setProjection(null);
    }
  }

  async function fetchProductGroups() {
    try {
      const res = await fetch(`${API_URL}/api/product-groups`);
      const data = await res.json();
      setProductGroups(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setProductGroups([]);
    }
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchConfig(),
      fetchProductStock(),
      fetchProducts(),
      fetchStockCurrent(),
      fetchProjection(),
      fetchProductGroups(),
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    setMessage("Salvando...");
    try {
      const res = await fetch(`${API_URL}/api/inventory-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockStartDate: stockStartDate || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao salvar.");
      setMessage("Data inicial do estoque salva.");
      setConfig({ stockStartDate: data.stockStartDate });
      fetchStockCurrent();
      fetchProjection();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  async function saveProductQuantity(productId: number, quantityStr: string) {
    const quantity = parseInt(quantityStr, 10) || 0;
    setMessage("Salvando...");
    try {
      const res = await fetch(`${API_URL}/api/product-stock`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.message || "Falha ao salvar.");
      }
      setMessage("Estoque salvo.");
      setEditingQty((prev) => ({ ...prev, [`p-${productId}`]: "" }));
      fetchProductStock();
      fetchStockCurrent();
      fetchProjection();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  async function saveGroupStock(productGroupId: number, quantityStr: string) {
    const quantity = parseInt(quantityStr, 10) || 0;
    setMessage("Salvando...");
    try {
      const res = await fetch(`${API_URL}/api/product-group-stock`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productGroupId, quantity }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.message || "Falha ao salvar.");
      }
      setMessage("Estoque do grupo salvo.");
      setEditingQty((prev) => ({ ...prev, [`g-${productGroupId}`]: "" }));
      fetchProductGroups();
      fetchStockCurrent();
      fetchProjection();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim() || newGroupProductIds.length < 2) {
      setMessage("Informe um nome e selecione pelo menos 2 produtos.");
      return;
    }
    setMessage("Criando grupo...");
    try {
      const res = await fetch(`${API_URL}/api/product-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim(), productIds: newGroupProductIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao criar grupo.");
      setMessage("Grupo criado. Defina a quantidade em estoque abaixo.");
      setNewGroupName("");
      setNewGroupProductIds([]);
      setShowNewGroup(false);
      fetchProductGroups();
      fetchStockCurrent();
      fetchProjection();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  async function deleteGroup(id: number) {
    if (!window.confirm("Excluir este grupo? Os produtos continuarão existindo, apenas deixarão de ser consolidados.")) return;
    try {
      const res = await fetch(`${API_URL}/api/product-groups/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao excluir.");
      setMessage("Grupo excluído.");
      fetchProductGroups();
      fetchStockCurrent();
      fetchProjection();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  function refreshAll() {
    setLoading(true);
    Promise.all([
      fetchConfig(),
      fetchProductStock(),
      fetchProducts(),
      fetchStockCurrent(),
      fetchProjection(),
      fetchProductGroups(),
    ]).finally(() => setLoading(false));
  }

  const productIdsInGroup = new Set(productGroups.flatMap((g) => g.items.map((i) => i.productId)));
  const standaloneProducts = products.filter((p) => !productIdsInGroup.has(p.id));

  if (loading)
    return (
      <div className={cn(UI.bg, "min-h-screen flex items-center justify-center text-slate-500")}>Carregando...</div>
    );

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Data inicial do estoque */}
        <div className={cn(UI.card, "p-6")}>
          <h2 className="text-lg font-black tracking-tight text-slate-900">Data inicial do estoque</h2>
          <p className="mt-1 text-sm text-slate-500">
            A partir desta data, as vendas passam a contabilizar baixa no estoque. Defina a data e cadastre a
            quantidade inicial por produto abaixo.
          </p>
          <form onSubmit={saveConfig} className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Data</label>
              <input
                type="date"
                value={stockStartDate}
                onChange={(e) => setStockStartDate(e.target.value)}
                className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-slate-800"
            >
              Salvar data
            </button>
            <button
              type="button"
              onClick={refreshAll}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-extrabold text-slate-900 shadow-sm hover:bg-slate-50"
            >
              Atualizar
            </button>
          </form>
          {message && <div className="mt-3 text-sm font-semibold text-slate-700">{message}</div>}
          {config?.stockStartDate && (
            <div className="mt-2 text-xs text-slate-500">Estoque ativo a partir de: {config.stockStartDate}</div>
          )}
        </div>

        {/* Projeção de faturamento */}
        {projection && (
          <div className={cn(UI.card, "p-6")}>
            <h2 className="text-lg font-black tracking-tight text-slate-900">Projeção com estoque atual</h2>
            <p className="mt-1 text-sm text-slate-500">
              Faturamento projetado se todo o estoque atual for vendido ao preço médio de venda.
            </p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-emerald-50 p-5">
                <div className="text-xs font-bold tracking-widest uppercase text-slate-500">Faturamento projetado</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{fmtMoney(projection.projectedRevenue)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs font-bold tracking-widest uppercase text-slate-500">Custo do estoque</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{fmtMoney(projection.projectedCost)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Estoque atual (abertura, vendido, atual) */}
        {stockCurrent && stockCurrent.items.length > 0 && (
          <div className={cn(UI.card, "overflow-hidden")}>
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Estoque atual por produto</h3>
              <p className="text-xs text-slate-500 mt-1">
                Abertura (data inicial) − vendas desde então = atual
              </p>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr className="text-left text-xs font-extrabold uppercase text-slate-600">
                    <th className="px-4 py-3">Produto</th>
                    <th className="px-4 py-3">Abertura</th>
                    <th className="px-4 py-3">Vendido</th>
                    <th className="px-4 py-3">Atual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stockCurrent.items.map((item) => (
                    <tr key={item.type === "group" ? `g-${item.productGroupId}` : `p-${item.productId}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        {item.type === "group" && item.productNames && item.productNames.length > 0 ? (
                          <div className="text-xs text-slate-500 mt-0.5">
                            Consolidado: {item.productNames.join(" · ")}
                          </div>
                        ) : (
                          item.code && <div className="text-xs text-slate-500">{item.code}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">{item.opening}</td>
                      <td className="px-4 py-3 text-slate-700">{item.sold}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "font-extrabold",
                            item.current <= 0 ? "text-red-600" : "text-emerald-700"
                          )}
                        >
                          {item.current}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Consolidar produtos (mesmo produto, nomes diferentes nos canais) */}
        <div className={cn(UI.card, "p-6")}>
          <h2 className="text-lg font-black tracking-tight text-slate-900">Consolidar produtos</h2>
          <p className="mt-1 text-sm text-slate-500">
            Produtos com nomes diferentes nos canais (ex.: &quot;Calça Legging Fitness Empina Bumbum...&quot; e &quot;Legging Empina Bumbum Wave...&quot;) podem ser tratados como um só no estoque. Crie um grupo e selecione os produtos que são o mesmo item.
          </p>
          {!showNewGroup ? (
            <button
              type="button"
              onClick={() => setShowNewGroup(true)}
              className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              + Criar grupo
            </button>
          ) : (
            <form onSubmit={createGroup} className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600">Nome do grupo (ex.: Legging Empina Bumbum)</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="mt-1 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
                  placeholder="Nome consolidado"
                />
              </div>
              <div>
                <span className="block text-xs font-bold uppercase text-slate-600 mb-2">Selecione 2 ou mais produtos (apenas os que não estão em outro grupo)</span>
                <div className="max-h-48 overflow-auto space-y-1 border border-slate-200 rounded-lg bg-white p-2">
                  {standaloneProducts
                    .filter(
                      (p) =>
                        !productFilter.trim() ||
                        p.name.toLowerCase().includes(productFilter.trim().toLowerCase()) ||
                        (p.code?.toLowerCase().includes(productFilter.trim().toLowerCase()))
                    )
                    .map((p) => (
                      <label key={p.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-slate-50 rounded px-2">
                        <input
                          type="checkbox"
                          checked={newGroupProductIds.includes(p.id)}
                          onChange={(e) =>
                            setNewGroupProductIds((prev) =>
                              e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                            )
                          }
                        />
                        <span className="text-sm font-medium text-slate-800 truncate">{p.name}</span>
                        <span className="text-xs text-slate-500">{p.code}</span>
                      </label>
                    ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
                  Salvar grupo
                </button>
                <button type="button" onClick={() => { setShowNewGroup(false); setNewGroupName(""); setNewGroupProductIds([]); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">
                  Cancelar
                </button>
              </div>
            </form>
          )}
          {productGroups.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-bold uppercase text-slate-500 mb-2">Grupos existentes</div>
              <ul className="space-y-2">
                {productGroups.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-4 py-2 border-b border-slate-100">
                    <div>
                      <div className="font-semibold text-slate-900">{g.name}</div>
                      <div className="text-xs text-slate-500">{g.items.map((i) => i.product.name).join(" · ")}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteGroup(g.id)}
                      className="text-xs font-bold text-red-600 hover:underline"
                    >
                      Excluir grupo
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Cadastro de quantidade por produto / grupo */}
        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Cadastrar quantidade em estoque (abertura)</h3>
            <p className="text-xs text-slate-500 mt-1">
              Defina a quantidade inicial por grupo (produtos consolidados) ou por produto avulso.
            </p>
          </div>
          <div className="p-6">
            <div className="mb-4">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500 mb-1">
                Buscar por nome ou código
              </label>
              <input
                type="text"
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                placeholder="Digite o nome ou código da peça..."
                className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm placeholder:text-slate-400"
              />
            </div>
            {productGroups.length > 0 && (
              <div className="mb-6">
                <div className="text-xs font-bold uppercase text-slate-500 mb-2">Grupos (estoque consolidado)</div>
                <div className="space-y-2">
                  {productGroups.map((g) => {
                    const qtyKey = `g-${g.id}`;
                    const qty = editingQty[qtyKey] !== undefined ? editingQty[qtyKey] : (g.stock?.quantity ?? "");
                    return (
                      <div key={g.id} className="flex items-center gap-4 py-2 border-b border-slate-100">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900">{g.name}</div>
                          <div className="text-xs text-slate-500">{g.items.map((i) => i.product.name).join(" · ")}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            value={qty}
                            onChange={(e) => setEditingQty((prev) => ({ ...prev, [qtyKey]: e.target.value }))}
                            placeholder="0"
                            className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-semibold text-slate-900"
                          />
                          <button
                            type="button"
                            onClick={() => saveGroupStock(g.id, String(qty))}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                          >
                            Salvar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <div className="text-xs font-bold uppercase text-slate-500 mb-2">Produtos avulsos (fora de grupos)</div>
              {standaloneProducts.length === 0 && productGroups.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum produto cadastrado. Importe pedidos para popular os produtos.</p>
              ) : standaloneProducts.length === 0 ? (
                <p className="text-sm text-slate-500">Todos os produtos estão em grupos ou não há produtos.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-auto">
                  {standaloneProducts
                    .filter(
                      (p) =>
                        !productFilter.trim() ||
                        p.name.toLowerCase().includes(productFilter.trim().toLowerCase()) ||
                        (p.code && p.code.toLowerCase().includes(productFilter.trim().toLowerCase()))
                    )
                    .map((p) => {
                      const qtyKey = `p-${p.id}`;
                      const row = productStockRows.find((r) => r.productId === p.id);
                      const qty = editingQty[qtyKey] !== undefined ? editingQty[qtyKey] : (row?.quantity ?? "");
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-4 py-2 border-b border-slate-100 last:border-0"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                            <div className="text-xs text-slate-500">{p.code}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              value={qty}
                              onChange={(e) => setEditingQty((prev) => ({ ...prev, [qtyKey]: e.target.value }))}
                              placeholder="0"
                              className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-semibold text-slate-900"
                            />
                            <button
                              type="button"
                              onClick={() => saveProductQuantity(p.id, String(qty))}
                              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                            >
                              Salvar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
