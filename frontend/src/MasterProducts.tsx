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

type StockResponse = {
  stockStartDate: string | null;
  items: MasterStockItem[];
};

type PendingProduct = {
  id: number;
  code: string;
  name: string;
  sku: string | null;
  variationName: string | null;
  source: string | null;
};

const UI = {
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

function cn(...cls: Array<string | false | undefined | null>) {
  return cls.filter(Boolean).join(" ");
}

function channelBadgeClass(src: string | null) {
  const s = (src || "").toLowerCase();
  if (s.includes("shopee")) return "bg-orange-600 text-white";
  if (s.includes("tiktok")) return "bg-slate-800 text-white";
  if (s.includes("tray")) return "bg-indigo-700 text-white";
  return "bg-slate-200 text-slate-700";
}

export default function MasterProducts() {
  const [tab, setTab] = useState<"masters" | "pending">("masters");
  const [masters, setMasters] = useState<MasterStockItem[]>([]);
  const [pending, setPending] = useState<PendingProduct[]>([]);
  const [filterName, setFilterName] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [editingMaster, setEditingMaster] = useState<{ id: number; sku: string; name: string } | null>(null);
  const [mergingMasterId, setMergingMasterId] = useState<number | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<number | "">("");
  const [mergeBusy, setMergeBusy] = useState(false);
  const [expandedMasters, setExpandedMasters] = useState<Record<number, boolean>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [createSku, setCreateSku] = useState("");
  const [createName, setCreateName] = useState("");
  const [selectedPending, setSelectedPending] = useState<Record<number, boolean>>({});
  const [linkTargetMasterId, setLinkTargetMasterId] = useState<number | "">("");

  const reloadMasters = async () => {
    const url = new URL(`${API_URL}/api/master-products`);
    if (filterName) url.searchParams.set("name", filterName);
    if (filterSku) url.searchParams.set("sku", filterSku);
    const r = await fetch(url.toString());
    if (!r.ok) {
      setMsg("Erro ao carregar produtos mestre.");
      return;
    }
    const json: StockResponse = await r.json();
    setMasters(json.items);
  };

  const reloadPending = async () => {
    const url = new URL(`${API_URL}/api/master-products/pending`);
    if (filterName) url.searchParams.set("name", filterName);
    if (filterSku) url.searchParams.set("sku", filterSku);
    if (filterSource) url.searchParams.set("source", filterSource);
    const r = await fetch(url.toString());
    if (!r.ok) {
      setMsg("Erro ao carregar pendentes.");
      return;
    }
    const json: PendingProduct[] = await r.json();
    setPending(json);
  };

  useEffect(() => {
    reloadMasters();
    reloadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedIds = useMemo(
    () => Object.entries(selectedPending).filter(([, v]) => v).map(([k]) => Number(k)),
    [selectedPending],
  );

  const createMasterFromSelection = async () => {
    if (!createSku.trim() || !createName.trim()) {
      setMsg("Informe SKU mestre e nome canônico.");
      return;
    }
    setMsg(null);
    try {
      const r = await fetch(`${API_URL}/api/master-products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: createSku.trim(), name: createName.trim(), productIds: selectedIds }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Erro ao criar mestre.");
      }
      setMsg("Mestre criado.");
      setShowCreate(false);
      setCreateSku("");
      setCreateName("");
      setSelectedPending({});
      reloadMasters();
      reloadPending();
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const linkSelectedToMaster = async () => {
    if (!linkTargetMasterId || selectedIds.length === 0) {
      setMsg("Selecione produtos pendentes e o mestre destino.");
      return;
    }
    setMsg(null);
    try {
      const r = await fetch(`${API_URL}/api/master-products/${linkTargetMasterId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: selectedIds }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Erro ao vincular.");
      }
      setMsg(`${selectedIds.length} produto(s) vinculado(s).`);
      setSelectedPending({});
      setLinkTargetMasterId("");
      reloadMasters();
      reloadPending();
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const saveMasterEdit = async () => {
    if (!editingMaster) return;
    setMsg(null);
    try {
      const r = await fetch(`${API_URL}/api/master-products/${editingMaster.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: editingMaster.sku, name: editingMaster.name }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Erro ao atualizar mestre.");
      }
      setEditingMaster(null);
      reloadMasters();
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const confirmMerge = async (sourceId: number) => {
    if (mergeTargetId === "") {
      setMsg("Selecione o mestre destino.");
      return;
    }
    const source = masters.find((x) => x.masterProductId === sourceId);
    const target = masters.find((x) => x.masterProductId === mergeTargetId);
    if (!source || !target) {
      setMsg("Mestre origem ou destino não encontrado.");
      return;
    }
    const ok = window.confirm(
      `Mover todos os membros, somar estoque (${source.current} + ${target.current}) e copiar histórico de custo de ${source.sku} para ${target.sku}? Esta ação remove o mestre de origem.`,
    );
    if (!ok) return;
    setMergeBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`${API_URL}/api/master-products/${sourceId}/merge-into`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMasterId: mergeTargetId }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Erro ao mesclar mestres.");
      }
      setMsg(`Mestre ${source.sku} mesclado em ${target.sku}.`);
      setMergingMasterId(null);
      setMergeTargetId("");
      reloadMasters();
      reloadPending();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setMergeBusy(false);
    }
  };

  const unlinkMember = async (productId: number) => {
    if (!window.confirm("Desvincular este produto do mestre?")) return;
    setMsg(null);
    try {
      const r = await fetch(`${API_URL}/api/products/${productId}/unlink-master`, { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Erro ao desvincular.");
      }
      reloadMasters();
      reloadPending();
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className={cn(UI.card, "p-6")}>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-900">Produtos mestre (SKU)</h2>
            <p className="mt-1 text-sm text-slate-500">
              Defina SKU mestre e nome canônico, e vincule manualmente listagens dos canais.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Nome</label>
              <input
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (tab === "masters" ? reloadMasters() : reloadPending())}
                className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                placeholder="contém..."
              />
            </div>
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">SKU</label>
              <input
                value={filterSku}
                onChange={(e) => setFilterSku(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (tab === "masters" ? reloadMasters() : reloadPending())}
                className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                placeholder="contém..."
              />
            </div>
            {tab === "pending" && (
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Canal</label>
                <input
                  value={filterSource}
                  onChange={(e) => setFilterSource(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && reloadPending()}
                  className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                  placeholder="ex.: shopee"
                />
              </div>
            )}
            <button
              onClick={() => (tab === "masters" ? reloadMasters() : reloadPending())}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-slate-800"
            >
              Atualizar
            </button>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={() => setTab("masters")}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-extrabold border",
              tab === "masters" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
            )}
          >
            Lista mestre ({masters.length})
          </button>
          <button
            onClick={() => setTab("pending")}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-extrabold border",
              tab === "pending" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
            )}
          >
            Pendentes ({pending.length})
          </button>
        </div>

        {msg && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">{msg}</div>
        )}
      </div>

      {tab === "masters" ? (
        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 border-b border-slate-200">
                <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                  <th className="px-3 py-3">SKU mestre</th>
                  <th className="px-3 py-3">Nome canônico</th>
                  <th className="px-3 py-3 text-right">Membros</th>
                  <th className="px-3 py-3 text-right">Estoque atual</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {masters.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Nenhum mestre cadastrado.</td></tr>
                )}
                {masters.map((m) => {
                  const isEditing = editingMaster?.id === m.masterProductId;
                  const isExpanded = !!expandedMasters[m.masterProductId];
                  const canExpand = m.members.length > 0;
                  return (
                    <React.Fragment key={m.masterProductId}>
                      <tr className="hover:bg-slate-50 align-top">
                        <td className="px-3 py-3 font-mono text-xs font-extrabold text-slate-900">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                canExpand &&
                                setExpandedMasters((prev) => ({
                                  ...prev,
                                  [m.masterProductId]: !prev[m.masterProductId],
                                }))
                              }
                              disabled={!canExpand}
                              className={cn(
                                "inline-flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-bold transition",
                                canExpand
                                  ? "border-slate-300 text-slate-700 hover:bg-slate-100"
                                  : "border-slate-200 text-slate-300 cursor-not-allowed",
                              )}
                              title={canExpand ? (isExpanded ? "Recolher membros" : "Expandir membros") : "Sem membros vinculados"}
                              aria-label={isExpanded ? "Recolher membros" : "Expandir membros"}
                            >
                              {isExpanded ? "▾" : "▸"}
                            </button>
                            {isEditing ? (
                              <input
                                value={editingMaster!.sku}
                                onChange={(e) => setEditingMaster({ ...editingMaster!, sku: e.target.value })}
                                className="rounded-lg border border-slate-200 px-2 py-1 text-xs w-32"
                              />
                            ) : (
                              <span>{m.sku}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-800">
                          {isEditing ? (
                            <input
                              value={editingMaster!.name}
                              onChange={(e) => setEditingMaster({ ...editingMaster!, name: e.target.value })}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs w-full"
                            />
                          ) : (
                            <>
                              <div className="font-semibold">{m.name}</div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {m.sources.map((s) => (
                                  <span key={s} className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold", channelBadgeClass(s))}>{s}</span>
                                ))}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-700">{m.members.length}</td>
                        <td className="px-3 py-3 text-right font-extrabold text-slate-900">{m.current}</td>
                        <td className="px-3 py-3 text-right">
                          {isEditing ? (
                            <div className="flex justify-end gap-2">
                              <button onClick={saveMasterEdit} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-extrabold text-white">Salvar</button>
                              <button onClick={() => setEditingMaster(null)} className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-extrabold text-slate-700">Cancelar</button>
                            </div>
                          ) : mergingMasterId === m.masterProductId ? (
                            <div className="flex flex-wrap justify-end items-center gap-2">
                              <select
                                value={mergeTargetId}
                                onChange={(e) => setMergeTargetId(e.target.value === "" ? "" : Number(e.target.value))}
                                className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                                disabled={mergeBusy}
                              >
                                <option value="">Mestre destino...</option>
                                {masters
                                  .filter((x) => x.masterProductId !== m.masterProductId)
                                  .map((x) => (
                                    <option key={x.masterProductId} value={x.masterProductId}>
                                      {x.sku} — {x.name}
                                    </option>
                                  ))}
                              </select>
                              <button
                                onClick={() => confirmMerge(m.masterProductId)}
                                disabled={mergeBusy || mergeTargetId === ""}
                                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-extrabold text-white disabled:opacity-50"
                              >
                                {mergeBusy ? "..." : "Confirmar"}
                              </button>
                              <button
                                onClick={() => {
                                  setMergingMasterId(null);
                                  setMergeTargetId("");
                                }}
                                disabled={mergeBusy}
                                className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-extrabold text-slate-700"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setEditingMaster({ id: m.masterProductId, sku: m.sku, name: m.name })}
                                className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700 hover:bg-slate-200"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => {
                                  setMergingMasterId(m.masterProductId);
                                  setMergeTargetId("");
                                }}
                                className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-800 hover:bg-amber-200"
                                title="Mover todos os membros, somar estoque e copiar histórico de custo para outro mestre"
                              >
                                Mover para mestre…
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {canExpand && isExpanded && (
                        <tr className="bg-slate-50">
                          <td colSpan={5} className="px-3 py-2">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Membros vinculados</div>
                            <table className="w-full text-xs">
                              <tbody>
                                {m.members.map((mem) => (
                                  <tr key={mem.productId}>
                                    <td className="py-1 pr-2 w-24">
                                      <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold", channelBadgeClass(mem.source))}>{mem.source || "—"}</span>
                                    </td>
                                    <td className="py-1 pr-2 font-mono text-[11px] text-slate-600 w-32">{mem.code}</td>
                                    <td className="py-1 pr-2 text-slate-700">{mem.name}</td>
                                    <td className="py-1 pr-2 text-slate-500 w-32">SKU canal: {mem.sku ?? "—"}</td>
                                    <td className="py-1 pr-2 text-right">
                                      <button onClick={() => unlinkMember(mem.productId)} className="rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-700 hover:bg-rose-200">
                                        Desvincular
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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
      ) : (
        <>
          <div className={cn(UI.card, "p-4 flex flex-wrap items-end gap-3")}>
            <div className="text-sm font-semibold text-slate-700">
              {selectedIds.length} selecionado(s)
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <button
                onClick={() => {
                  setShowCreate((v) => !v);
                  setLinkTargetMasterId("");
                }}
                disabled={selectedIds.length === 0}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white disabled:opacity-50 hover:bg-emerald-500"
              >
                Criar mestre com selecionados
              </button>
              <select
                value={linkTargetMasterId}
                onChange={(e) => {
                  setLinkTargetMasterId(e.target.value === "" ? "" : Number(e.target.value));
                  setShowCreate(false);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
              >
                <option value="">Vincular a mestre existente...</option>
                {masters.map((m) => (
                  <option key={m.masterProductId} value={m.masterProductId}>
                    {m.sku} — {m.name}
                  </option>
                ))}
              </select>
              <button
                onClick={linkSelectedToMaster}
                disabled={!linkTargetMasterId || selectedIds.length === 0}
                className="rounded-xl bg-sky-600 px-3 py-2 text-xs font-extrabold text-white disabled:opacity-50 hover:bg-sky-500"
              >
                Vincular
              </button>
            </div>
          </div>

          {showCreate && (
            <div className={cn(UI.card, "p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end")}>
              <div className="md:col-span-3">
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">SKU mestre</label>
                <input
                  value={createSku}
                  onChange={(e) => setCreateSku(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="ex.: MAC-EMP-AVELA"
                />
              </div>
              <div className="md:col-span-7">
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Nome canônico</label>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="Macacão Empina Bumbum Wave Avelã"
                />
              </div>
              <div className="md:col-span-2">
                <button
                  onClick={createMasterFromSelection}
                  className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-extrabold text-white"
                >
                  Criar
                </button>
              </div>
            </div>
          )}

          <div className={cn(UI.card, "overflow-hidden")}>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                    <th className="px-3 py-3 w-12"></th>
                    <th className="px-3 py-3">Canal</th>
                    <th className="px-3 py-3">Código</th>
                    <th className="px-3 py-3">Nome</th>
                    <th className="px-3 py-3">SKU canal</th>
                    <th className="px-3 py-3">Variação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pending.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Nenhum pendente.</td></tr>
                  )}
                  {pending.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={!!selectedPending[p.id]}
                          onChange={(e) => setSelectedPending((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold", channelBadgeClass(p.source))}>
                          {p.source || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{p.code}</td>
                      <td className="px-3 py-2 text-slate-800">{p.name}</td>
                      <td className="px-3 py-2 text-slate-600">{p.sku ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{p.variationName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
