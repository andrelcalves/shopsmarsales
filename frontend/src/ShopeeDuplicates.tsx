import React, { useCallback, useState } from "react";

import { API_URL } from "./config";

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

const UI = {
  bg: "bg-slate-50",
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

type DupItem = {
  id: number;
  productCode: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  productId: number | null;
  isSuggestedKeep: boolean;
};

type DupGroup = {
  orderId: string;
  orderDate: string;
  orderTotal: number;
  linesSum: number;
  exceedsOrderTotal: boolean;
  suggestedKeepItemId: number;
  suggestedKeepProductCode: string;
  items: DupItem[];
};

type ApiResponse = {
  scannedOrders: number;
  duplicateGroups: number;
  groups: DupGroup[];
};

function fmtMoney(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

export default function ShopeeDuplicates(): JSX.Element {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [allTime, setAllTime] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchDupes = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const qs = new URLSearchParams();
      if (!allTime) qs.set("month", month);
      const res = await fetch(`${API_URL}/api/shopee/duplicate-order-items?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Falha ao carregar.");
      setData(json as ApiResponse);
    } catch (e: any) {
      setData(null);
      setMessage(e.message || "Erro.");
    } finally {
      setLoading(false);
    }
  }, [month, allTime]);

  async function removeItem(itemId: number, name: string) {
    if (
      !window.confirm(
        `Excluir esta linha de item do pedido?\n\n${name}\n\nConfira se não é a linha que deseja manter (variação).`,
      )
    ) {
      return;
    }
    setDeletingId(itemId);
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/api/order-items/${itemId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Falha ao excluir.");
      setMessage("Item excluído. Atualizando lista…");
      await fetchDupes();
      setMessage("Lista atualizada.");
    } catch (e: any) {
      setMessage(`Erro: ${e.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className={cn(UI.card, "p-6")}>
          <h2 className="text-lg font-black tracking-tight text-slate-900">Duplicatas Shopee (itens de pedido)</h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            A planilha da Shopee às vezes gera <strong>duas linhas</strong> para o mesmo produto vendido: uma só com o
            nome base e outra com <strong>nome - cor/tamanho</strong>. Ambas entram no banco, somam custo de produção e
            inflam o detalhe de faturamento. Novos <strong>uploads CSV</strong> já deduplicam automaticamente; use esta
            tela para localizar e remover linhas redundantes já importadas.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Mês</label>
              <input
                type="month"
                value={month}
                disabled={allTime}
                onChange={(e) => setMonth(e.target.value)}
                className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm disabled:opacity-50"
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer select-none">
              <input type="checkbox" checked={allTime} onChange={(e) => setAllTime(e.target.checked)} />
              Buscar em todos os pedidos (limite no servidor)
            </label>
            <button
              type="button"
              onClick={fetchDupes}
              disabled={loading}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Analisando…" : "Analisar"}
            </button>
          </div>
          {message && <p className="mt-3 text-sm font-semibold text-slate-700">{message}</p>}
        </div>

        {data && (
          <div className={cn(UI.card, "p-6")}>
            <p className="text-sm text-slate-600">
              Pedidos analisados: <span className="font-extrabold text-slate-900">{data.scannedOrders}</span>
              {" · "}
              Grupos duplicados: <span className="font-extrabold text-amber-800">{data.duplicateGroups}</span>
            </p>
            {data.duplicateGroups === 0 && (
              <p className="mt-4 text-sm text-emerald-700 font-semibold">
                Nenhum par duplicado encontrado com os critérios atuais.
              </p>
            )}
            <div className="mt-6 space-y-6">
              {data.groups.map((g) => (
                <div
                  key={`${g.orderId}-${g.items.map((i) => i.id).join("-")}`}
                  className="rounded-2xl border border-amber-200/80 bg-amber-50/40 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-amber-200/60 bg-amber-100/50 flex flex-wrap gap-2 justify-between items-baseline">
                    <div className="text-sm">
                      <span className="font-extrabold text-slate-900">Pedido {g.orderId}</span>
                      <span className="text-slate-500 mx-2">·</span>
                      <span>{fmtDate(g.orderDate)}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-slate-600">Total pedido:</span>{" "}
                      <span className="font-bold">{fmtMoney(g.orderTotal)}</span>
                      <span className="text-slate-500 mx-2">·</span>
                      <span className="text-slate-600">Soma das linhas:</span>{" "}
                      <span className={cn("font-bold", g.exceedsOrderTotal && "text-red-700")}>
                        {fmtMoney(g.linesSum)}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="text-left text-xs font-extrabold uppercase tracking-wider text-slate-500">
                          <th className="pb-2 pr-3">Produto</th>
                          <th className="pb-2 pr-3">Código</th>
                          <th className="pb-2 text-right">Qtd</th>
                          <th className="pb-2 text-right">Unit.</th>
                          <th className="pb-2 text-right">Total</th>
                          <th className="pb-2 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100/80">
                        {g.items.map((it) => (
                          <tr key={it.id} className={it.isSuggestedKeep ? "bg-emerald-50/60" : ""}>
                            <td className="py-2 pr-3">
                              <span className="font-medium text-slate-900">{it.name}</span>
                              {it.isSuggestedKeep && (
                                <span className="ml-2 text-[10px] font-extrabold uppercase tracking-wide text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg">
                                  Manter
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-3 font-mono text-xs text-slate-600">{it.productCode}</td>
                            <td className="py-2 text-right tabular-nums">{it.quantity}</td>
                            <td className="py-2 text-right tabular-nums">{fmtMoney(it.unitPrice)}</td>
                            <td className="py-2 text-right font-semibold tabular-nums">{fmtMoney(it.totalPrice)}</td>
                            <td className="py-2 text-right">
                              {!it.isSuggestedKeep && (
                                <button
                                  type="button"
                                  disabled={deletingId !== null}
                                  onClick={() => removeItem(it.id, it.name)}
                                  className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-extrabold text-red-800 hover:bg-red-50 disabled:opacity-50"
                                >
                                  {deletingId === it.id ? "…" : "Excluir linha"}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-3 text-xs text-slate-500">
                      Sugestão: manter a linha com variação (nome completo). Exclua só após conferir o pedido na Shopee.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
