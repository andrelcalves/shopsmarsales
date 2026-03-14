import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Package,
  Search,
  Link2,
  Unlink,
  CheckCircle2,
  Loader2,
  Layers,
  Tag,
  Sparkles,
  Pencil,
} from "lucide-react";

import { API_URL } from './config';

type Product = {
  id: number;
  code: string;
  name: string;
  sku: string | null;
  variationName: string | null;
  parentCode: string | null;
  costPrice: number | null;
  source: string;
  _count?: { orderItems: number };
  totalQtySold?: number;
  productGroupItem?: { productGroup: { id: number; name: string } } | null;
};

type MatchSuggestion = {
  matchKey: string;
  products: Array<{
    id: number;
    code: string;
    name: string;
    source: string;
    sku: string | null;
    variationName: string | null;
  }>;
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

const UI = {
  bg: "bg-slate-50",
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

function fmtMoney(v: number | null) {
  if (v == null || v === 0) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const SOURCE_BADGE: Record<string, string> = {
  shopee: "bg-orange-600",
  tiktok: "bg-slate-800",
  tray: "bg-indigo-700",
};

function SourceBadge({ source }: { source: string }) {
  return (
    <span className={cn("inline-flex rounded-lg px-2 py-1 text-[11px] font-extrabold text-white", SOURCE_BADGE[source] || "bg-slate-500")}>
      {source || "—"}
    </span>
  );
}

type Tab = "list" | "consolidate";

export default function Products() {
  const [tab, setTab] = useState<Tab>("list");
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCostPrice, setEditCostPrice] = useState("");
  const [editSkuId, setEditSkuId] = useState<number | null>(null);
  const [editSku, setEditSku] = useState("");
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const [consolidating, setConsolidating] = useState<string | null>(null);
  const [selectedForGroup, setSelectedForGroup] = useState<number[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [editGroupId, setEditGroupId] = useState<number | null>(null);
  const [editGroupName, setEditGroupName] = useState("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/products/by-channel`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    setLoadingSugg(true);
    try {
      const res = await fetch(`${API_URL}/api/products/suggest-matches`);
      const data = await res.json();
      setSuggestions(Array.isArray(data) ? data : []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSugg(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    if (tab === "consolidate") fetchSuggestions();
  }, [tab, fetchSuggestions]);

  const filteredRows = useMemo(() => {
    let r = rows;
    if (sourceFilter !== "all") r = r.filter((p) => p.source === sourceFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.variationName && p.variationName.toLowerCase().includes(q))
      );
    }
    return r;
  }, [rows, sourceFilter, search]);

  // Group products by parentCode to show variation summary
  const parentGroups = useMemo(() => {
    const groups = new Map<string, { baseName: string; products: Product[]; totalQty: number }>();
    for (const p of filteredRows) {
      if (!p.parentCode) continue;
      if (!groups.has(p.parentCode)) {
        const baseName = p.variationName ? p.name.replace(` - ${p.variationName}`, "") : p.name;
        groups.set(p.parentCode, { baseName, products: [], totalQty: 0 });
      }
      const g = groups.get(p.parentCode)!;
      g.products.push(p);
      g.totalQty += p.totalQtySold ?? 0;
    }
    return groups;
  }, [filteredRows]);

  async function saveCostPrice(id: number, val: string) {
    setMessage("Salvando...");
    try {
      const costPrice = val ? parseFloat(val.replace(",", ".")) : null;
      const res = await fetch(`${API_URL}/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costPrice }),
      });
      if (!res.ok) throw new Error("Falha ao salvar.");
      setMessage("Salvo.");
      setEditingId(null);
      fetchRows();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  async function saveSku(id: number, sku: string) {
    setMessage("Salvando SKU...");
    try {
      const res = await fetch(`${API_URL}/api/products/${id}/sku`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      if (!res.ok) throw new Error("Falha ao salvar SKU.");
      setMessage("SKU salvo.");
      setEditSkuId(null);
      fetchRows();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  async function handleConsolidate(matchKey: string, productIds: number[], groupName: string) {
    setConsolidating(matchKey);
    try {
      const res = await fetch(`${API_URL}/api/products/consolidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds, groupName }),
      });
      if (!res.ok) throw new Error("Falha ao consolidar.");
      setMessage("Produtos consolidados!");
      fetchSuggestions();
      fetchRows();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    } finally {
      setConsolidating(null);
    }
  }

  async function handleManualGroup() {
    if (selectedForGroup.length < 2) {
      setMessage("Selecione pelo menos 2 produtos para agrupar.");
      return;
    }
    setConsolidating("manual");
    try {
      const names = rows
        .filter((r) => selectedForGroup.includes(r.id))
        .map((r) => r.variationName ? r.name.replace(` - ${r.variationName}`, "") : r.name);
      const groupName = names[0] || "Grupo consolidado";
      const res = await fetch(`${API_URL}/api/products/consolidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: selectedForGroup, groupName }),
      });
      if (!res.ok) throw new Error("Falha ao agrupar.");
      setMessage("Produtos agrupados!");
      setSelectedForGroup([]);
      fetchRows();
      fetchSuggestions();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    } finally {
      setConsolidating(null);
    }
  }

  async function handleUngroup(productId: number) {
    try {
      await fetch(`${API_URL}/api/products/${productId}/ungroup`, { method: "DELETE" });
      setMessage("Produto removido do grupo.");
      fetchRows();
    } catch {
      setMessage("Erro ao remover do grupo.");
    }
  }

  async function saveGroupName(groupId: number, name: string) {
    if (!name.trim()) { setEditGroupId(null); return; }
    setMessage("Salvando nome do grupo...");
    try {
      const res = await fetch(`${API_URL}/api/product-groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error("Falha ao renomear grupo.");
      setMessage("Nome do grupo atualizado.");
      setEditGroupId(null);
      fetchRows();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedForGroup((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("list")}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-extrabold transition",
              tab === "list" ? "bg-slate-900 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            )}
          >
            <Package className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Produtos
          </button>
          <button
            onClick={() => setTab("consolidate")}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-extrabold transition",
              tab === "consolidate" ? "bg-slate-900 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            )}
          >
            <Link2 className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Consolidar canais
          </button>
        </div>

        {message && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            {message}
          </div>
        )}

        {tab === "list" && (
          <>
            {/* Filters */}
            <div className={cn(UI.card, "p-6")}>
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-lg font-black tracking-tight text-slate-900">Produtos</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Preço de custo, SKU universal e variações. Itens são vinculados automaticamente nas importações.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
                  >
                    <option value="all">Todos canais</option>
                    <option value="shopee">Shopee</option>
                    <option value="tiktok">TikTok</option>
                    <option value="tray">Tray</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar nome, código ou SKU..."
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm w-64"
                    />
                  </div>
                </div>
              </div>

              {/* Manual group bar */}
              {selectedForGroup.length > 0 && (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-sky-50 border border-sky-200 px-4 py-3">
                  <Layers className="w-4 h-4 text-sky-600" />
                  <span className="text-sm font-bold text-sky-800">
                    {selectedForGroup.length} produto(s) selecionado(s)
                  </span>
                  <button
                    onClick={handleManualGroup}
                    disabled={selectedForGroup.length < 2 || consolidating === "manual"}
                    className={cn(
                      "ml-auto inline-flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-extrabold transition",
                      selectedForGroup.length >= 2
                        ? "bg-sky-600 text-white hover:bg-sky-700"
                        : "bg-slate-200 text-slate-500 cursor-not-allowed"
                    )}
                  >
                    {consolidating === "manual" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                    Agrupar selecionados
                  </button>
                  <button
                    onClick={() => setSelectedForGroup([])}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    Limpar
                  </button>
                </div>
              )}
            </div>

            {/* Table */}
            <div className={cn(UI.card, "overflow-hidden")}>
              <div className="p-6">
                {loading ? (
                  <div className="text-sm text-slate-500 py-8 text-center">Carregando...</div>
                ) : (
                  <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                        <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                          <th className="px-3 py-3 w-10"></th>
                          <th className="px-4 py-3">Produto</th>
                          <th className="px-4 py-3">Canal</th>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">Variação</th>
                          <th className="px-4 py-3">Grupo</th>
                          <th className="px-4 py-3">Custo</th>
                          <th className="px-4 py-3 text-right">Vendidos</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(() => {
                          const renderedParents = new Set<string>();
                          const tableRows: React.ReactNode[] = [];

                          for (const p of filteredRows) {
                            // If product has a parentCode and belongs to a group with 2+ variations
                            if (p.parentCode && parentGroups.has(p.parentCode) && (parentGroups.get(p.parentCode)?.products.length ?? 0) >= 2) {
                              if (renderedParents.has(p.parentCode)) continue;
                              renderedParents.add(p.parentCode);

                              const group = parentGroups.get(p.parentCode)!;
                              const isExpanded = expandedParents.has(p.parentCode);

                              // Parent header row
                              tableRows.push(
                                <tr
                                  key={`parent-${p.parentCode}`}
                                  className="bg-violet-50/50 cursor-pointer hover:bg-violet-50 transition"
                                  onClick={() => setExpandedParents((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(p.parentCode!)) next.delete(p.parentCode!);
                                    else next.add(p.parentCode!);
                                    return next;
                                  })}
                                >
                                  <td className="px-3 py-3">
                                    <span className="text-violet-500 text-xs font-bold">{isExpanded ? "▼" : "▶"}</span>
                                  </td>
                                  <td className="px-4 py-3" colSpan={6}>
                                    <div className="flex items-center gap-2">
                                      <Layers className="w-4 h-4 text-violet-500 flex-shrink-0" />
                                      <span className="font-black text-slate-900">{group.baseName}</span>
                                      <span className="text-xs bg-violet-100 text-violet-700 rounded-lg px-2 py-0.5 font-bold">
                                        {group.products.length} variações
                                      </span>
                                      <SourceBadge source={p.source || ""} />
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span className="font-black text-slate-900">{group.totalQty}</span>
                                    <span className="text-xs text-slate-400 ml-1">un total</span>
                                  </td>
                                  <td className="px-4 py-3"></td>
                                </tr>
                              );

                              // Variation rows (expanded)
                              if (isExpanded) {
                                for (const vp of group.products) {
                                  tableRows.push(
                                    <tr
                                      key={vp.id}
                                      className={cn(
                                        "hover:bg-slate-50 transition bg-white",
                                        selectedForGroup.includes(vp.id) && "bg-sky-50"
                                      )}
                                    >
                                      <td className="px-3 py-2.5">
                                        <input
                                          type="checkbox"
                                          checked={selectedForGroup.includes(vp.id)}
                                          onChange={() => toggleSelect(vp.id)}
                                          className="w-4 h-4 rounded border-slate-300 text-sky-600"
                                        />
                                      </td>
                                      <td className="px-4 py-2.5 pl-10">
                                        <div className="flex items-center gap-2">
                                          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                                          <div>
                                            <div className="font-semibold text-slate-700 text-xs">{vp.name}</div>
                                            <div className="text-[10px] text-slate-400 font-mono">{vp.code}</div>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-4 py-2.5"><SourceBadge source={vp.source || ""} /></td>
                                      <td className="px-4 py-2.5">
                                        {editSkuId === vp.id ? (
                                          <div className="flex items-center gap-1">
                                            <input type="text" value={editSku} onChange={(e) => setEditSku(e.target.value)} placeholder="SKU" className="rounded-lg border border-slate-200 px-2 py-1 text-xs w-24" autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveSku(vp.id, editSku); if (e.key === "Escape") setEditSkuId(null); }} />
                                            <button onClick={() => saveSku(vp.id, editSku)} className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">OK</button>
                                          </div>
                                        ) : (
                                          <button onClick={() => { setEditSkuId(vp.id); setEditSku(vp.sku || ""); }} className={cn("text-xs font-mono px-2 py-0.5 rounded-lg border transition", vp.sku ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-dashed border-slate-300 text-slate-400 hover:border-slate-400")}>
                                            {vp.sku || <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> Definir</span>}
                                          </button>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <span className="text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-lg px-2 py-0.5 font-semibold">
                                          {vp.variationName || "—"}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2.5">
                                        {vp.productGroupItem ? (
                                          editGroupId === vp.productGroupItem.productGroup.id ? (
                                            <div className="flex items-center gap-1">
                                              <input type="text" value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} className="rounded-lg border border-sky-300 px-2 py-1 text-xs w-36 focus:outline-none focus:ring-2 focus:ring-sky-400/40" autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveGroupName(vp.productGroupItem!.productGroup.id, editGroupName); if (e.key === "Escape") setEditGroupId(null); }} />
                                              <button onClick={() => saveGroupName(vp.productGroupItem!.productGroup.id, editGroupName)} className="rounded-lg bg-sky-600 px-2 py-1 text-[10px] font-bold text-white">OK</button>
                                              <button onClick={() => setEditGroupId(null)} className="rounded-lg bg-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600">X</button>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-1">
                                              <button onClick={() => { setEditGroupId(vp.productGroupItem!.productGroup.id); setEditGroupName(vp.productGroupItem!.productGroup.name); }} className="text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded-lg px-2 py-0.5 font-semibold max-w-[140px] truncate hover:bg-sky-100 transition flex items-center gap-1" title="Clique para renomear o grupo">
                                                {vp.productGroupItem.productGroup.name} <Pencil className="w-2.5 h-2.5 opacity-50" />
                                              </button>
                                              <button onClick={() => handleUngroup(vp.id)} className="text-slate-400 hover:text-red-500 transition" title="Remover do grupo"><Unlink className="w-3 h-3" /></button>
                                            </div>
                                          )
                                        ) : <span className="text-xs text-slate-300">—</span>}
                                      </td>
                                      <td className="px-4 py-2.5">
                                        {editingId === vp.id ? (
                                          <div className="flex items-center gap-1">
                                            <input type="text" value={editCostPrice} onChange={(e) => setEditCostPrice(e.target.value)} placeholder="0,00" className="rounded-lg border border-slate-200 px-2 py-1 text-xs w-20" autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveCostPrice(vp.id, editCostPrice); if (e.key === "Escape") setEditingId(null); }} />
                                            <button onClick={() => saveCostPrice(vp.id, editCostPrice)} className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">OK</button>
                                          </div>
                                        ) : (
                                          <button onClick={() => { setEditingId(vp.id); setEditCostPrice(vp.costPrice != null ? String(vp.costPrice) : ""); }} className="text-xs font-bold text-slate-900 hover:text-sky-600 transition">
                                            {fmtMoney(vp.costPrice)}
                                          </button>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 text-right">
                                        <span className="font-bold text-slate-900">{vp.totalQtySold ?? 0}</span>
                                        <span className="text-xs text-slate-400 ml-1">un</span>
                                      </td>
                                      <td className="px-4 py-2.5"></td>
                                    </tr>
                                  );
                                }
                              }
                              continue;
                            }

                            // Regular product row (no parent group)
                            tableRows.push(
                              <tr
                                key={p.id}
                                className={cn("hover:bg-slate-50 transition", selectedForGroup.includes(p.id) && "bg-sky-50")}
                              >
                                <td className="px-3 py-3">
                                  <input type="checkbox" checked={selectedForGroup.includes(p.id)} onChange={() => toggleSelect(p.id)} className="w-4 h-4 rounded border-slate-300 text-sky-600" />
                                </td>
                                <td className="px-4 py-3">
                                  <div className="font-bold text-slate-900 max-w-xs truncate">{p.name}</div>
                                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">{p.code}</div>
                                </td>
                                <td className="px-4 py-3"><SourceBadge source={p.source || ""} /></td>
                                <td className="px-4 py-3">
                                  {editSkuId === p.id ? (
                                    <div className="flex items-center gap-1">
                                      <input type="text" value={editSku} onChange={(e) => setEditSku(e.target.value)} placeholder="SKU" className="rounded-lg border border-slate-200 px-2 py-1 text-xs w-24" autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveSku(p.id, editSku); if (e.key === "Escape") setEditSkuId(null); }} />
                                      <button onClick={() => saveSku(p.id, editSku)} className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">OK</button>
                                      <button onClick={() => setEditSkuId(null)} className="rounded-lg bg-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600">X</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => { setEditSkuId(p.id); setEditSku(p.sku || ""); }} className={cn("text-xs font-mono px-2 py-0.5 rounded-lg border transition", p.sku ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-dashed border-slate-300 text-slate-400 hover:border-slate-400")}>
                                      {p.sku || <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> Definir</span>}
                                    </button>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {p.variationName ? (
                                    <span className="text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-lg px-2 py-0.5 font-semibold">{p.variationName}</span>
                                  ) : <span className="text-xs text-slate-300">—</span>}
                                </td>
                                <td className="px-4 py-3">
                                  {p.productGroupItem ? (
                                    editGroupId === p.productGroupItem.productGroup.id ? (
                                      <div className="flex items-center gap-1">
                                        <input type="text" value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} className="rounded-lg border border-sky-300 px-2 py-1 text-xs w-36 focus:outline-none focus:ring-2 focus:ring-sky-400/40" autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveGroupName(p.productGroupItem!.productGroup.id, editGroupName); if (e.key === "Escape") setEditGroupId(null); }} />
                                        <button onClick={() => saveGroupName(p.productGroupItem!.productGroup.id, editGroupName)} className="rounded-lg bg-sky-600 px-2 py-1 text-[10px] font-bold text-white">OK</button>
                                        <button onClick={() => setEditGroupId(null)} className="rounded-lg bg-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600">X</button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <button onClick={() => { setEditGroupId(p.productGroupItem!.productGroup.id); setEditGroupName(p.productGroupItem!.productGroup.name); }} className="text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded-lg px-2 py-0.5 font-semibold max-w-[140px] truncate hover:bg-sky-100 transition flex items-center gap-1" title="Clique para renomear o grupo">
                                          {p.productGroupItem.productGroup.name} <Pencil className="w-2.5 h-2.5 opacity-50" />
                                        </button>
                                        <button onClick={() => handleUngroup(p.id)} className="text-slate-400 hover:text-red-500 transition" title="Remover do grupo"><Unlink className="w-3 h-3" /></button>
                                      </div>
                                    )
                                  ) : <span className="text-xs text-slate-300">—</span>}
                                </td>
                                <td className="px-4 py-3">
                                  {editingId === p.id ? (
                                    <div className="flex items-center gap-1">
                                      <input type="text" value={editCostPrice} onChange={(e) => setEditCostPrice(e.target.value)} placeholder="0,00" className="rounded-lg border border-slate-200 px-2 py-1 text-xs w-20" autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveCostPrice(p.id, editCostPrice); if (e.key === "Escape") setEditingId(null); }} />
                                      <button onClick={() => saveCostPrice(p.id, editCostPrice)} className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">OK</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => { setEditingId(p.id); setEditCostPrice(p.costPrice != null ? String(p.costPrice) : ""); }} className="text-xs font-bold text-slate-900 hover:text-sky-600 transition">
                                      {fmtMoney(p.costPrice)}
                                    </button>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="font-bold text-slate-900">{p.totalQtySold ?? 0}</span>
                                  <span className="text-xs text-slate-400 ml-1">un</span>
                                </td>
                                <td className="px-4 py-3"></td>
                              </tr>
                            );
                          }

                          if (tableRows.length === 0) {
                            tableRows.push(
                              <tr key="empty">
                                <td className="px-4 py-8 text-sm text-slate-500 text-center" colSpan={9}>
                                  Nenhum produto encontrado.
                                </td>
                              </tr>
                            );
                          }

                          return tableRows;
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-3 text-xs text-slate-400">
                  {filteredRows.length} produto(s) {sourceFilter !== "all" && `(${sourceFilter})`}
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "consolidate" && (
          <>
            <div className={cn(UI.card, "p-6")}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-tight text-slate-900">Consolidar produtos entre canais</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    O sistema analisa os nomes dos produtos e sugere quais são o mesmo produto em canais diferentes
                    (Shopee, TikTok, Tray). Ao consolidar, eles são agrupados e o SKU é compartilhado.
                  </p>
                </div>
              </div>
            </div>

            {loadingSugg ? (
              <div className="flex items-center justify-center py-12 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Buscando sugestões...
              </div>
            ) : suggestions.length === 0 ? (
              <div className={cn(UI.card, "p-8 text-center")}>
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <div className="text-sm font-bold text-slate-700">Nenhuma sugestão de consolidação encontrada.</div>
                <div className="text-xs text-slate-500 mt-1">
                  Todos os produtos com nomes semelhantes entre canais já foram consolidados, ou não há produtos em múltiplos canais.
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {suggestions.map((s) => {
                  const bySource: Record<string, typeof s.products> = {};
                  for (const p of s.products) {
                    const src = p.source || "other";
                    if (!bySource[src]) bySource[src] = [];
                    bySource[src].push(p);
                  }
                  const channels = Object.keys(bySource);
                  const baseName = s.products[0]?.name?.replace(/ - .*$/, "") || s.matchKey;

                  return (
                    <div key={s.matchKey} className={cn(UI.card, "p-5")}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-sm font-extrabold text-slate-900">{baseName}</h3>
                          <div className="mt-1 flex items-center gap-2">
                            {channels.map((ch) => (
                              <SourceBadge key={ch} source={ch} />
                            ))}
                            <span className="text-xs text-slate-500">
                              {s.products.length} produto(s) em {channels.length} canais
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            handleConsolidate(
                              s.matchKey,
                              s.products.map((p) => p.id),
                              baseName
                            )
                          }
                          disabled={consolidating === s.matchKey}
                          className={cn(
                            "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition flex-shrink-0",
                            consolidating === s.matchKey
                              ? "bg-slate-200 text-slate-500"
                              : "bg-violet-600 text-white hover:bg-violet-700"
                          )}
                        >
                          {consolidating === s.matchKey ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Link2 className="w-3 h-3" />
                          )}
                          Consolidar
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                        {channels.map((ch) => (
                          <div key={ch} className="rounded-xl border border-slate-200 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <SourceBadge source={ch} />
                              <span className="text-xs font-bold text-slate-500">{bySource[ch].length} produto(s)</span>
                            </div>
                            <div className="space-y-1">
                              {bySource[ch].map((p) => (
                                <div key={p.id} className="text-xs text-slate-700 flex items-center gap-1.5">
                                  <span className="font-medium truncate max-w-[200px]">{p.name}</span>
                                  {p.variationName && (
                                    <span className="text-[10px] bg-violet-50 text-violet-600 border border-violet-200 rounded px-1 py-0.5 flex-shrink-0">
                                      {p.variationName}
                                    </span>
                                  )}
                                  {p.sku && (
                                    <span className="text-[10px] bg-emerald-50 text-emerald-600 rounded px-1 py-0.5 flex-shrink-0">
                                      SKU: {p.sku}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
