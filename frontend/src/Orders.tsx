import React, { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";

import { API_URL } from "./config";

const UI = {
  bg: "bg-slate-50",
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function fmtMoney(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function defaultMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type OrderRow = {
  id: number;
  orderId: string;
  orderDate: string;
  productName: string;
  quantity: number;
  totalPrice: number;
  source: string;
  status: string;
  paymentType: string;
  freight: number | null;
};

type OrdersResponse = {
  orders: OrderRow[];
  total: number;
  limit: number;
  offset: number;
};

const channelLabel: Record<string, string> = {
  all: "Todos",
  shopee: "Shopee",
  tiktok: "TikTok",
  tray: "Tray (todos)",
  atacado: "Atacado",
  tray_varejo: "Tray Varejo",
};

const sourceBadge: Record<string, string> = {
  shopee: "bg-orange-100 text-orange-800",
  tiktok: "bg-slate-800 text-white",
  tray: "bg-blue-100 text-blue-800",
  atacado: "bg-sky-900 text-white",
  tray_varejo: "bg-sky-400 text-slate-900",
};

export default function Orders() {
  const [startMonth, setStartMonth] = useState(defaultMonth());
  const [endMonth, setEndMonth] = useState(defaultMonth());
  const [channel, setChannel] = useState("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(0);
  const limit = 50;

  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentTypes, setPaymentTypes] = useState<string[]>([]);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(0);
  }, [startMonth, endMonth, channel, debouncedQuery]);

  useEffect(() => {
    fetch(`${API_URL}/api/payment-types`)
      .then((r) => r.json())
      .then((json) => setPaymentTypes(Array.isArray(json) ? json : []))
      .catch(() => setPaymentTypes([]));
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      qs.set("start", startMonth);
      qs.set("end", endMonth);
      qs.set("channel", channel);
      qs.set("limit", String(limit));
      qs.set("offset", String(page * limit));
      if (debouncedQuery) qs.set("q", debouncedQuery);
      const res = await fetch(`${API_URL}/api/orders?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Falha ao carregar pedidos.");
      setData(json as OrdersResponse);
    } catch (e: unknown) {
      setData(null);
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [startMonth, endMonth, channel, debouncedQuery, page]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  function rowKey(o: OrderRow) {
    return `${o.source}-${o.orderId}`;
  }

  function startEdit(o: OrderRow) {
    const key = rowKey(o);
    setEditingKey(key);
    setEditValue(o.paymentType || "");
    setSaveMsg("");
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditValue("");
  }

  async function savePaymentType(o: OrderRow) {
    const key = rowKey(o);
    setSavingKey(key);
    setSaveMsg("");
    try {
      const res = await fetch(
        `${API_URL}/api/orders/${encodeURIComponent(o.orderId)}/${encodeURIComponent(o.source)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentType: editValue.trim() }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Falha ao salvar.");
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          orders: prev.orders.map((row) =>
            rowKey(row) === key ? { ...row, paymentType: String(json.paymentType ?? "") } : row,
          ),
        };
      });
      const pt = editValue.trim();
      if (pt && !paymentTypes.includes(pt)) {
        setPaymentTypes((prev) => [...prev, pt].sort((a, b) => a.localeCompare(b, "pt-BR")));
      }
      setEditingKey(null);
      setEditValue("");
      setSaveMsg("Forma de pagamento atualizada.");
    } catch (e: unknown) {
      setSaveMsg(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSavingKey(null);
    }
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-900">Pedidos</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Liste pedidos por canal e período; edite a forma de pagamento quando necessário.
          </p>
        </div>

        <div className={cn(UI.card, "p-5 space-y-4")}>
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">
                Mês inicial
              </label>
              <input
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">
                Mês final
              </label>
              <input
                type="month"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
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
                className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm min-w-[160px]"
              >
                <option value="all">Todos</option>
                <option value="shopee">Shopee</option>
                <option value="tiktok">TikTok</option>
                <option value="tray">Tray (todos)</option>
                <option value="atacado">Atacado</option>
                <option value="tray_varejo">Tray Varejo</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">
                Buscar pedido
              </label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ID do pedido ou produto..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-semibold text-slate-900 shadow-sm"
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            {channelLabel[channel] || channel}
            {" · "}
            {startMonth === endMonth ? startMonth : `${startMonth} → ${endMonth}`}
            {total > 0 ? ` · ${total} pedido(s)` : null}
          </p>
        </div>

        {saveMsg ? (
          <div
            className={cn(
              UI.card,
              "px-4 py-3 text-sm font-semibold",
              saveMsg.includes("Erro") || saveMsg.includes("Falha")
                ? "text-red-600"
                : "text-emerald-700",
            )}
          >
            {saveMsg}
          </div>
        ) : null}

        {loading ? (
          <div className={cn(UI.card, "p-8 text-center text-slate-500")}>Carregando pedidos...</div>
        ) : error ? (
          <div className={cn(UI.card, "p-6 text-sm font-semibold text-red-600")}>{error}</div>
        ) : (
          <div className={cn(UI.card, "overflow-hidden")}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-xs sm:text-sm">
                <thead className="bg-slate-100 text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Pedido</th>
                    <th className="px-3 py-2">Canal</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Produto</th>
                    <th className="px-3 py-2 text-right">Qtd</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 min-w-[220px]">Forma de pagamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.orders ?? []).map((o) => {
                    const key = rowKey(o);
                    const isEditing = editingKey === key;
                    const isSaving = savingKey === key;
                    return (
                      <tr key={key} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2 font-extrabold text-slate-900">{o.orderId}</td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase",
                              sourceBadge[o.source] || "bg-slate-100 text-slate-700",
                            )}
                          >
                            {o.source}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-600 tabular-nums">{fmtDate(o.orderDate)}</td>
                        <td className="px-3 py-2 text-slate-800 max-w-[240px] truncate" title={o.productName}>
                          {o.productName}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{o.quantity}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {fmtMoney(o.totalPrice)}
                        </td>
                        <td className="px-3 py-2 text-slate-600 max-w-[140px] truncate" title={o.status}>
                          {o.status || "—"}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <div className="flex flex-wrap items-center gap-1">
                              <input
                                list="payment-type-options"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="min-w-[160px] flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
                                placeholder="Ex.: Pix - Vindi"
                              />
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => savePaymentType(o)}
                                className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700 disabled:opacity-50"
                                title="Salvar"
                              >
                                {isSaving ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={cancelEdit}
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                                title="Cancelar"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(o)}
                              className="text-left text-xs font-semibold text-slate-800 hover:text-sky-700 underline decoration-dotted underline-offset-2"
                            >
                              {o.paymentType?.trim() ? o.paymentType : "— (clique para definir)"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(data?.orders.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                        Nenhum pedido encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
                <span className="text-slate-500">
                  Página {page + 1} de {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="rounded-lg border border-slate-200 px-3 py-1 font-semibold disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1 font-semibold disabled:opacity-40"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        <datalist id="payment-type-options">
          {paymentTypes.map((pt) => (
            <option key={pt} value={pt} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
