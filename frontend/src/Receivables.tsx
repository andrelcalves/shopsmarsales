import React, { useEffect, useState } from "react";

import BankStatementImport from "./BankStatementImport";
import { API_URL } from "./config";

type ReceivableReceipt = {
  id: number;
  receivableId: number;
  amount: number;
  dueDate: string;
  receivedAt: string | null;
  notes: string;
};

type Receivable = {
  id: number;
  supplier: string;
  description: string;
  invoiceNumber: string | null;
  totalAmount: number;
  dueDate: string | null;
  status: string;
  receipts: ReceivableReceipt[];
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

const UI = {
  bg: "bg-slate-50",
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

function dateLabel(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day}/${m}/${y}`;
}

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Receivables() {
  const [items, setItems] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterReceiptStatus, setFilterReceiptStatus] = useState("");
  const [filterDescription, setFilterDescription] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");

  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [receiptAmount, setReceiptAmount] = useState("");
  const [receiptDueDate, setReceiptDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiptReceivedAt, setReceiptReceivedAt] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");
  const [receiveDateById, setReceiveDateById] = useState<Record<number, string>>({});
  const [importOpen, setImportOpen] = useState(false);

  async function fetchItems() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterStatus) qs.set("status", filterStatus);
      if (filterMonth) qs.set("month", filterMonth);
      if (filterReceiptStatus) qs.set("receiptStatus", filterReceiptStatus);
      if (filterDescription.trim()) qs.set("description", filterDescription.trim());
      if (filterSupplier.trim()) qs.set("supplier", filterSupplier.trim());
      const q = qs.toString();
      const res = await fetch(`${API_URL}/api/receivables${q ? `?${q}` : ""}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchItems();
  }, [filterStatus, filterMonth, filterReceiptStatus, filterDescription, filterSupplier]);

  async function createReceivable(e: React.FormEvent) {
    e.preventDefault();
    setMessage("Salvando...");
    try {
      const res = await fetch(`${API_URL}/api/receivables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier,
          description,
          invoiceNumber: invoiceNumber || null,
          totalAmount,
          dueDate: dueDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao salvar.");
      setMessage("Conta a receber cadastrada.");
      setSupplier("");
      setDescription("");
      setInvoiceNumber("");
      setTotalAmount("");
      setDueDate("");
      fetchItems();
    } catch (err: unknown) {
      setMessage(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function deleteReceivable(id: number) {
    if (!window.confirm("Remover esta conta e todos os recebimentos?")) return;
    try {
      const res = await fetch(`${API_URL}/api/receivables/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao remover.");
      setMessage("Removido.");
      if (selectedId === id) setSelectedId(null);
      fetchItems();
    } catch (err: unknown) {
      setMessage(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function addReceipt(e: React.FormEvent) {
    e.preventDefault();
    if (selectedId == null) return;
    try {
      const res = await fetch(`${API_URL}/api/receivables/${selectedId}/receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: receiptAmount,
          dueDate: receiptDueDate,
          receivedAt: receiptReceivedAt || null,
          notes: receiptNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao registrar recebimento.");
      setMessage("Recebimento registrado.");
      setReceiptAmount("");
      setReceiptDueDate(new Date().toISOString().slice(0, 10));
      setReceiptReceivedAt("");
      setReceiptNotes("");
      fetchItems();
    } catch (err: unknown) {
      setMessage(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function markAsReceived(receivableId: number, receiptId: number, receivedAt: string) {
    if (!receivedAt) return;
    try {
      const res = await fetch(`${API_URL}/api/receivables/${receivableId}/receipts/${receiptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receivedAt }),
      });
      if (!res.ok) throw new Error("Falha ao marcar como recebido.");
      setMessage("Marcado como recebido.");
      fetchItems();
    } catch (err: unknown) {
      setMessage(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function deleteReceipt(receivableId: number, receiptId: number) {
    if (!window.confirm("Remover este recebimento?")) return;
    try {
      const res = await fetch(`${API_URL}/api/receivables/${receivableId}/receipts/${receiptId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao remover.");
      setMessage("Recebimento removido.");
      fetchItems();
    } catch (err: unknown) {
      setMessage(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const selected = items.find((r) => r.id === selectedId);

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className={cn(UI.card, "p-6")}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900">Contas a receber</h2>
              <p className="mt-1 text-sm text-slate-500">Cadastre recebíveis e registre recebimentos.</p>
            </div>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-extrabold text-emerald-800 hover:bg-emerald-100"
            >
              Importar extrato Nubank
            </button>
          </div>

          <form onSubmit={createReceivable} className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Cliente</label>
              <input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="ex: Cliente X"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Descrição</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ex: Venda serviço"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Nota fiscal</label>
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="opcional"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Valor total (R$)</label>
              <input
                type="text"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="ex: 1500,00"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Vencimento</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
              />
            </div>
            <div className="md:col-span-1">
              <button
                type="submit"
                className="w-full rounded-xl px-4 py-2 text-sm font-extrabold shadow-sm transition bg-slate-900 text-white hover:bg-slate-800"
              >
                Cadastrar
              </button>
            </div>
          </form>

          {message && <div className="mt-4 text-sm font-semibold text-slate-700">{message}</div>}
        </div>

        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="px-6 pt-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Lista de contas</h3>
              <button
                onClick={fetchItems}
                className="rounded-xl bg-white px-4 py-2 text-sm font-extrabold text-slate-900 shadow-sm border border-slate-200 hover:bg-slate-50 transition"
              >
                Atualizar
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Mês</label>
                <input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Status recebimento</label>
                <select
                  value={filterReceiptStatus}
                  onChange={(e) => setFilterReceiptStatus(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                >
                  <option value="">Todos</option>
                  <option value="pending">Pendente</option>
                  <option value="received">Recebido</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Status conta</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                >
                  <option value="">Todas</option>
                  <option value="pending">Pendentes</option>
                  <option value="partial">Parcial</option>
                  <option value="paid">Recebidas</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Cliente</label>
                <input
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  placeholder="Buscar..."
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Descrição</label>
                <input
                  value={filterDescription}
                  onChange={(e) => setFilterDescription(e.target.value)}
                  placeholder="Buscar..."
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                />
              </div>
            </div>
          </div>

          <div className="p-6 flex flex-col lg:flex-row gap-6">
            <div className="flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white">
              {loading ? (
                <div className="p-6 text-sm text-slate-500">Carregando...</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                    <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Descrição</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Venc.</th>
                      <th className="px-4 py-3">Recebido</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((r) => {
                      const received = (r.receipts || []).reduce(
                        (s, p) => s + (p.receivedAt != null ? p.amount : 0),
                        0,
                      );
                      return (
                        <tr
                          key={r.id}
                          className={cn("hover:bg-slate-50 cursor-pointer", selectedId === r.id && "bg-sky-50")}
                          onClick={() => setSelectedId(r.id)}
                        >
                          <td className="px-4 py-3 font-semibold text-slate-800">{r.supplier || "—"}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{r.description}</td>
                          <td className="px-4 py-3 font-bold text-slate-900">{formatMoney(r.totalAmount)}</td>
                          <td className="px-4 py-3 text-slate-700">{dateLabel(r.dueDate)}</td>
                          <td className="px-4 py-3 text-slate-700">{formatMoney(received)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs font-bold",
                                r.status === "paid" && "bg-emerald-100 text-emerald-800",
                                r.status === "partial" && "bg-amber-100 text-amber-800",
                                r.status === "pending" && "bg-slate-100 text-slate-700",
                              )}
                            >
                              {r.status === "paid" ? "Recebido" : r.status === "partial" ? "Parcial" : "Pendente"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                            <button
                              onClick={() => deleteReceivable(r.id)}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-900 hover:bg-slate-50"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {items.length === 0 && !loading && (
                      <tr>
                        <td className="px-4 py-6 text-slate-500" colSpan={7}>
                          Nenhuma conta cadastrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {selected && (
              <div className={cn(UI.card, "p-6 w-full lg:w-[28rem] shrink-0 overflow-auto")}>
                <h4 className="text-sm font-extrabold text-slate-900">{selected.description}</h4>
                {selected.supplier ? (
                  <p className="mt-0.5 text-xs text-slate-500">Cliente: {selected.supplier}</p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">
                  Total: {formatMoney(selected.totalAmount)} • Recebido:{" "}
                  {formatMoney(
                    (selected.receipts || []).reduce((s, p) => s + (p.receivedAt != null ? p.amount : 0), 0),
                  )}
                </p>

                <div className="mt-4 border-t border-slate-200 pt-4">
                  <p className="text-xs font-bold uppercase text-slate-500 mb-2">Novo recebimento</p>
                  <form onSubmit={addReceipt} className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-500">Vencimento</label>
                        <input
                          type="date"
                          value={receiptDueDate}
                          onChange={(e) => setReceiptDueDate(e.target.value)}
                          className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500">Valor (R$)</label>
                        <input
                          type="text"
                          value={receiptAmount}
                          onChange={(e) => setReceiptAmount(e.target.value)}
                          className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500">Recebido em (opcional)</label>
                      <input
                        type="date"
                        value={receiptReceivedAt}
                        onChange={(e) => setReceiptReceivedAt(e.target.value)}
                        className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <input
                      value={receiptNotes}
                      onChange={(e) => setReceiptNotes(e.target.value)}
                      placeholder="Observação"
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    />
                    <button
                      type="submit"
                      className="w-full rounded-xl px-4 py-2 text-sm font-extrabold bg-slate-900 text-white hover:bg-slate-800"
                    >
                      Adicionar recebimento
                    </button>
                  </form>
                </div>

                <div className="mt-4 border-t border-slate-200 pt-4">
                  <p className="text-xs font-bold uppercase text-slate-500 mb-2">Recebimentos</p>
                  <ul className="space-y-2">
                    {(selected.receipts || []).map((p) => (
                      <li
                        key={p.id}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2",
                          p.receivedAt ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-100",
                        )}
                      >
                        <span>
                          {formatMoney(p.amount)} • venc. {dateLabel(p.dueDate)}
                          {p.receivedAt ? ` • recebido em ${dateLabel(p.receivedAt)}` : " • pendente"}
                        </span>
                        <span className="flex items-center gap-1">
                          {!p.receivedAt && (
                            <>
                              <input
                                type="date"
                                value={receiveDateById[p.id] ?? ""}
                                onChange={(e) =>
                                  setReceiveDateById((prev) => ({ ...prev, [p.id]: e.target.value }))
                                }
                                className="rounded border border-slate-200 px-2 py-1 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const d = receiveDateById[p.id];
                                  if (d) {
                                    markAsReceived(selected.id, p.id, d);
                                    setReceiveDateById((prev) => ({ ...prev, [p.id]: "" }));
                                  } else setMessage("Informe a data do recebimento.");
                                }}
                                className="text-xs font-bold text-emerald-600 hover:underline"
                              >
                                Marcar recebido
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => deleteReceipt(selected.id, p.id)}
                            className="text-xs font-bold text-red-600 hover:underline"
                          >
                            Excluir
                          </button>
                        </span>
                      </li>
                    ))}
                    {(selected.receipts || []).length === 0 && (
                      <li className="text-sm text-slate-500">Nenhum recebimento registrado.</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        <BankStatementImport open={importOpen} onClose={() => setImportOpen(false)} onSuccess={fetchItems} />
      </div>
    </div>
  );
}
