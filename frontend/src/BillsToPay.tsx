import React, { useEffect, useState } from "react";

import BankStatementImport from "./BankStatementImport";
import { API_URL } from './config';

type BillPayment = {
  id: number;
  billId: number;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  notes: string;
};

type Bill = {
  id: number;
  supplier: string;
  description: string;
  invoiceNumber: string | null;
  totalAmount: number;
  dueDate: string | null;
  status: string;
  isFixedCost?: boolean;
  payments: BillPayment[];
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

export default function BillsToPay() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>("");
  const [filterFixedCost, setFilterFixedCost] = useState<string>("");
  const [filterDescription, setFilterDescription] = useState<string>("");
  const [filterSupplier, setFilterSupplier] = useState<string>("");

  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isFixedCost, setIsFixedCost] = useState(false);

  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [paymentPaidAt, setPaymentPaidAt] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const [installments, setInstallments] = useState<{ dueDate: string; amount: string }[]>([
    { dueDate: "", amount: "" },
  ]);
  const [payDateByPaymentId, setPayDateByPaymentId] = useState<Record<number, string>>({});
  const [importOpen, setImportOpen] = useState(false);

  async function fetchBills() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterStatus) qs.set("status", filterStatus);
      if (filterMonth) qs.set("month", filterMonth);
      if (filterPaymentStatus) qs.set("paymentStatus", filterPaymentStatus);
      if (filterFixedCost) qs.set("isFixedCost", filterFixedCost);
      if (filterDescription.trim()) qs.set("description", filterDescription.trim());
      if (filterSupplier.trim()) qs.set("supplier", filterSupplier.trim());
      const q = qs.toString();
      const url = `${API_URL}/api/bills${q ? `?${q}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      setBills(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setBills([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBills();
  }, [filterStatus, filterMonth, filterPaymentStatus, filterFixedCost, filterDescription, filterSupplier]);

  async function createBill(e: React.FormEvent) {
    e.preventDefault();
    setMessage("Salvando...");
    try {
      const res = await fetch(`${API_URL}/api/bills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier,
          description,
          invoiceNumber: invoiceNumber || null,
          totalAmount,
          dueDate: dueDate || null,
          isFixedCost,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao salvar.");
      setMessage("Conta cadastrada com sucesso.");
      setSupplier("");
      setDescription("");
      setInvoiceNumber("");
      setTotalAmount("");
      setDueDate("");
      setIsFixedCost(false);
      fetchBills();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  async function deleteBill(id: number) {
    if (!window.confirm("Remover esta conta e todos os pagamentos?")) return;
    setMessage("Removendo...");
    try {
      const res = await fetch(`${API_URL}/api/bills/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao remover.");
      setMessage("Removido.");
      if (selectedBillId === id) setSelectedBillId(null);
      fetchBills();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    if (selectedBillId == null) return;
    setMessage("Registrando parcela...");
    try {
      const res = await fetch(`${API_URL}/api/bills/${selectedBillId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: paymentAmount,
          dueDate: paymentDueDate,
          paidAt: paymentPaidAt || null,
          notes: paymentNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao registrar parcela.");
      setMessage("Parcela registrada.");
      setPaymentAmount("");
      setPaymentDueDate(new Date().toISOString().slice(0, 10));
      setPaymentPaidAt("");
      setPaymentNotes("");
      fetchBills();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  async function generateInstallments(e: React.FormEvent) {
    e.preventDefault();
    if (selectedBillId == null) return;
    const list = installments.filter((i) => i.dueDate && i.amount && parseFloat(String(i.amount).replace(",", ".")) > 0);
    if (list.length === 0) {
      setMessage("Informe ao menos uma parcela com data e valor.");
      return;
    }
    setMessage("Gerando parcelas...");
    try {
      const res = await fetch(`${API_URL}/api/bills/${selectedBillId}/installments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installments: list.map((i) => ({
            dueDate: i.dueDate,
            amount: i.amount,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao gerar parcelas.");
      setMessage(`${list.length} parcela(s) criada(s).`);
      setInstallments([{ dueDate: "", amount: "" }]);
      fetchBills();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  async function markAsPaid(billId: number, paymentId: number, paidAt: string) {
    if (!paidAt) return;
    try {
      const res = await fetch(`${API_URL}/api/bills/${billId}/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAt }),
      });
      if (!res.ok) throw new Error("Falha ao marcar como pago.");
      setMessage("Marcado como pago.");
      fetchBills();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  async function updateBillFixedCost(billId: number, nextFixedCost: boolean) {
    try {
      const res = await fetch(`${API_URL}/api/bills/${billId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFixedCost: nextFixedCost }),
      });
      if (!res.ok) throw new Error("Falha ao atualizar custo fixo.");
      setMessage(nextFixedCost ? "Marcada como custo fixo." : "Removida de custo fixo.");
      fetchBills();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  async function deletePayment(billId: number, paymentId: number) {
    if (!window.confirm("Remover este pagamento?")) return;
    try {
      const res = await fetch(`${API_URL}/api/bills/${billId}/payments/${paymentId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao remover.");
      setMessage("Pagamento removido.");
      fetchBills();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  const selectedBill = bills.find((b) => b.id === selectedBillId);

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className={cn(UI.card, "p-6")}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900">Contas a pagar</h2>
              <p className="mt-1 text-sm text-slate-500">
                Cadastre contas/faturas e registre pagamentos em várias datas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-extrabold text-emerald-800 hover:bg-emerald-100"
            >
              Importar extrato Nubank
            </button>
          </div>

          <form onSubmit={createBill} className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Fornecedor</label>
              <input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="ex: Fornecedor X"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Descrição</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ex: Fornecedor X - Lote Março"
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
            <div className="md:col-span-2 flex flex-col gap-2">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Custo fixo</label>
              <label className="flex items-center gap-2 cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={isFixedCost}
                  onChange={(e) => setIsFixedCost(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                />
                <span className="text-sm font-semibold text-slate-700">Conta é custo fixo</span>
              </label>
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
                onClick={fetchBills}
                className="rounded-xl bg-white px-4 py-2 text-sm font-extrabold text-slate-900 shadow-sm border border-slate-200 hover:bg-slate-50 transition"
              >
                Atualizar
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Mês</label>
                <input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                />
                {filterMonth && (
                  <button
                    type="button"
                    onClick={() => setFilterMonth("")}
                    className="mt-1 text-xs font-bold text-sky-600 hover:underline"
                  >
                    Limpar mês
                  </button>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">
                  Status parcela
                </label>
                <select
                  value={filterPaymentStatus}
                  onChange={(e) => setFilterPaymentStatus(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                >
                  <option value="">Todas</option>
                  <option value="pending">Pendente</option>
                  <option value="paid">Pago</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">
                  Status conta
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                >
                  <option value="">Todas</option>
                  <option value="pending">Pendentes</option>
                  <option value="partial">Parcialmente pagas</option>
                  <option value="paid">Pagas</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Custo fixo</label>
                <select
                  value={filterFixedCost}
                  onChange={(e) => setFilterFixedCost(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                >
                  <option value="">Todos</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Fornecedor</label>
                <input
                  type="text"
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  placeholder="Buscar..."
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Descrição</label>
                <input
                  type="text"
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
                      <th className="px-4 py-3">Fornecedor</th>
                      <th className="px-4 py-3">Descrição</th>
                      <th className="px-4 py-3">NF</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Venc.</th>
                      <th className="px-4 py-3">Pago</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Fix.</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bills.map((b) => {
                      const paid = (b.payments || []).reduce((s, p) => s + (p.paidAt != null ? p.amount : 0), 0);
                      return (
                        <tr
                          key={b.id}
                          className={cn(
                            "hover:bg-slate-50 cursor-pointer",
                            selectedBillId === b.id && "bg-sky-50"
                          )}
                          onClick={() => setSelectedBillId(b.id)}
                        >
                          <td className="px-4 py-3 font-semibold text-slate-800">{b.supplier || "—"}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{b.description}</td>
                          <td className="px-4 py-3 text-slate-600">{b.invoiceNumber || "—"}</td>
                          <td className="px-4 py-3 font-bold text-slate-900">{formatMoney(b.totalAmount)}</td>
                          <td className="px-4 py-3 text-slate-700">{dateLabel(b.dueDate)}</td>
                          <td className="px-4 py-3 text-slate-700">{formatMoney(paid)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs font-bold",
                                b.status === "paid" && "bg-emerald-100 text-emerald-800",
                                b.status === "partial" && "bg-amber-100 text-amber-800",
                                b.status === "pending" && "bg-slate-100 text-slate-700"
                              )}
                            >
                              {b.status === "paid" ? "Pago" : b.status === "partial" ? "Parcial" : "Pendente"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {b.isFixedCost === true ? (
                              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800" title="Custo fixo">Sim</span>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                            <button
                              onClick={() => deleteBill(b.id)}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-900 hover:bg-slate-50"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {bills.length === 0 && !loading && (
                      <tr>
                        <td className="px-4 py-6 text-slate-500" colSpan={9}>
                          Nenhuma conta cadastrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {selectedBill && (
              <div className={cn(UI.card, "p-6 w-full lg:w-[28rem] shrink-0 overflow-auto")}>
                <h4 className="text-sm font-extrabold text-slate-900">{selectedBill.description}</h4>
                {selectedBill.supplier ? (
                  <p className="mt-0.5 text-xs text-slate-500">Fornecedor: {selectedBill.supplier}</p>
                ) : null}
                {selectedBill.invoiceNumber && (
                  <p className="mt-0.5 text-xs text-slate-500">Nota fiscal: {selectedBill.invoiceNumber}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Total: {formatMoney(selectedBill.totalAmount)} • Pago:{" "}
                  {formatMoney(
                    (selectedBill.payments || []).reduce((s, p) => s + (p.paidAt != null ? p.amount : 0), 0)
                  )}
                </p>
                <label className="mt-3 flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedBill.isFixedCost === true}
                    onChange={(e) => updateBillFixedCost(selectedBill.id, e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  />
                  <span className="text-sm font-semibold text-slate-700">Conta é custo fixo</span>
                </label>

                <div className="mt-4 border-t border-slate-200 pt-4">
                  <p className="text-xs font-bold uppercase text-slate-500 mb-2">Gerar parcelas (até 4 vencimentos)</p>
                  <form onSubmit={generateInstallments} className="space-y-2">
                    {installments.map((inst, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="date"
                          value={inst.dueDate}
                          onChange={(e) => {
                            const next = [...installments];
                            next[idx] = { ...next[idx], dueDate: e.target.value };
                            setInstallments(next);
                          }}
                          className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          placeholder="Venc."
                        />
                        <input
                          type="text"
                          value={inst.amount}
                          onChange={(e) => {
                            const next = [...installments];
                            next[idx] = { ...next[idx], amount: e.target.value };
                            setInstallments(next);
                          }}
                          placeholder="R$"
                          className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                        />
                        {installments.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setInstallments((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-red-600 text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    {installments.length < 4 && (
                      <button
                        type="button"
                        onClick={() => setInstallments((prev) => [...prev, { dueDate: "", amount: "" }])}
                        className="text-xs font-bold text-sky-600 hover:underline"
                      >
                        + Adicionar parcela
                      </button>
                    )}
                    <button
                      type="submit"
                      className="w-full rounded-xl px-4 py-2 text-sm font-extrabold bg-indigo-600 text-white hover:bg-indigo-700 mt-2"
                    >
                      Gerar parcelas
                    </button>
                  </form>
                </div>

                <div className="mt-4 border-t border-slate-200 pt-4">
                  <p className="text-xs font-bold uppercase text-slate-500 mb-2">Nova parcela manual</p>
                  <form onSubmit={addPayment} className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-500">Vencimento</label>
                        <input
                          type="date"
                          value={paymentDueDate}
                          onChange={(e) => setPaymentDueDate(e.target.value)}
                          className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500">Valor (R$)</label>
                        <input
                          type="text"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          placeholder="0,00"
                          className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500">Pago em (opcional)</label>
                      <input
                        type="date"
                        value={paymentPaidAt}
                        onChange={(e) => setPaymentPaidAt(e.target.value)}
                        className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <input
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      placeholder="Observação"
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    />
                    <button
                      type="submit"
                      className="w-full rounded-xl px-4 py-2 text-sm font-extrabold bg-slate-900 text-white hover:bg-slate-800"
                    >
                      Adicionar parcela
                    </button>
                  </form>
                </div>

                <div className="mt-4 border-t border-slate-200 pt-4">
                  <p className="text-xs font-bold uppercase text-slate-500 mb-2">Parcelas</p>
                  <ul className="space-y-2">
                    {(selectedBill.payments || []).map((p) => (
                      <li
                        key={p.id}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2",
                          p.paidAt ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-100"
                        )}
                      >
                        <span>
                          {formatMoney(p.amount)} • venc. {dateLabel(p.dueDate)}
                          {p.paidAt ? ` • pago em ${dateLabel(p.paidAt)}` : " • pendente"}
                          {p.notes ? ` — ${p.notes}` : ""}
                        </span>
                        <span className="flex items-center gap-1">
                          {!p.paidAt && (
                            <>
                              <input
                                type="date"
                                value={payDateByPaymentId[p.id] ?? ""}
                                onChange={(e) => setPayDateByPaymentId((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                className="rounded border border-slate-200 px-2 py-1 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const d = payDateByPaymentId[p.id];
                                  if (d) {
                                    markAsPaid(selectedBill.id, p.id, d);
                                    setPayDateByPaymentId((prev) => ({ ...prev, [p.id]: "" }));
                                  } else setMessage("Informe a data do pagamento.");
                                }}
                                className="text-xs font-bold text-emerald-600 hover:underline"
                              >
                                Marcar pago
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => deletePayment(selectedBill.id, p.id)}
                            className="text-xs font-bold text-red-600 hover:underline"
                          >
                            Excluir
                          </button>
                        </span>
                      </li>
                    ))}
                    {(selectedBill.payments || []).length === 0 && (
                      <li className="text-sm text-slate-500">Nenhuma parcela. Use &quot;Gerar parcelas&quot; ou adicione manualmente.</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        <BankStatementImport open={importOpen} onClose={() => setImportOpen(false)} onSuccess={fetchBills} />
      </div>
    </div>
  );
}