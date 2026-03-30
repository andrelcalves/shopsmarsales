import React, { useEffect, useMemo, useState } from "react";

import { API_URL } from './config';

type AdSpendRow = {
  id: number;
  month: string; // ISO
  channel: string;
  amount: number;
  notes: string;
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

const UI = {
  bg: "bg-slate-50",
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

/** Mês civil YYYY-MM alinhado ao backend (datas em UTC). Evita mostrar mês anterior no BR com getMonth() local. */
function monthLabel(iso: string) {
  const s = String(iso ?? "");
  const head = s.match(/^(\d{4})-(\d{2})/);
  if (head) return `${head[1]}-${head[2]}`;
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function AdsSpend() {
  const [rows, setRows] = useState<AdSpendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>("");

  const [month, setMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [channel, setChannel] = useState<string>("meta");
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgePassword, setPurgePassword] = useState("");
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [purgeError, setPurgeError] = useState("");

  const total = useMemo(() => rows.reduce((a, r) => a + (r.amount || 0), 0), [rows]);

  async function fetchRows() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/adspend`);
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
  }, []);

  async function upsert(e: React.FormEvent) {
    e.preventDefault();
    setMessage("Salvando...");
    try {
      const res = await fetch(`${API_URL}/api/adspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          channel,
          amount,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao salvar.");
      setMessage("Salvo com sucesso.");
      setAmount("");
      setNotes("");
      fetchRows();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  async function removeRow(m: string, ch: string) {
    if (!window.confirm(`Remover ADS ${ch} em ${m}?`)) return;
    setMessage("Removendo...");
    try {
      const res = await fetch(`${API_URL}/api/adspend?month=${encodeURIComponent(m)}&channel=${encodeURIComponent(ch)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao remover.");
      setMessage("Removido.");
      fetchRows();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  function openPurgeModal() {
    setPurgePassword("");
    setPurgeError("");
    setPurgeOpen(true);
  }

  function closePurgeModal() {
    if (purgeLoading) return;
    setPurgeOpen(false);
    setPurgePassword("");
    setPurgeError("");
  }

  async function confirmPurgeAll() {
    setPurgeError("");
    setPurgeLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/adspend/delete-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: purgePassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao excluir.");
      setPurgeOpen(false);
      setPurgePassword("");
      setMessage(`Removidos ${data.deleted ?? 0} registro(s) de ADS.`);
      fetchRows();
    } catch (err: any) {
      setPurgeError(err.message || "Erro.");
    } finally {
      setPurgeLoading(false);
    }
  }

  return (
    <div className={cn(UI.bg, "min-h-screen relative")}>
      {purgeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="purge-ads-title"
          onClick={(e) => e.target === e.currentTarget && closePurgeModal()}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="purge-ads-title" className="text-lg font-black text-slate-900">
              Excluir todos os gastos de ADS?
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Esta ação remove <span className="font-bold">todos</span> os registros da tabela de investimento em ADS no
              banco, sem filtrar por mês ou canal. Não pode ser desfeita.
            </p>
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500 mb-2">
                Senha de confirmação
              </label>
              <input
                type="password"
                autoComplete="off"
                value={purgePassword}
                onChange={(e) => setPurgePassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !purgeLoading && purgePassword && confirmPurgeAll()}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
                placeholder="Digite a senha"
              />
            </div>
            {purgeError && <div className="text-sm font-semibold text-red-600">{purgeError}</div>}
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
              <button
                type="button"
                onClick={closePurgeModal}
                disabled={purgeLoading}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmPurgeAll}
                disabled={purgeLoading || !purgePassword.trim()}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {purgeLoading ? "Excluindo…" : "Excluir todos"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className={cn(UI.card, "p-6")}>
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-900">Gastos mensais de ADS</h2>
            <p className="mt-1 text-sm text-slate-500">Cadastre o investimento por mês e por canal (Meta, Google, etc.).</p>
          </div>

          <form onSubmit={upsert} className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-3">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Mês</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Canal</label>
              <input
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="meta | google | shopee | tiktok | tray_atacado | tray_varejo"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Valor (R$)</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="ex: 1234,56"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
              />
            </div>
            <div className="md:col-span-3">
              <button
                type="submit"
                className="w-full rounded-xl px-4 py-2 text-sm font-extrabold shadow-sm transition bg-slate-900 text-white hover:bg-slate-800"
              >
                Salvar
              </button>
            </div>
            <div className="md:col-span-12">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Observações</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="opcional"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
              />
            </div>
          </form>

          {message && <div className="mt-4 text-sm font-semibold text-slate-700">{message}</div>}
        </div>

        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="px-6 pt-6 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Registros</h3>
              <p className="mt-1 text-xs text-slate-500">
                Total cadastrado: <span className="font-extrabold">R$ {total.toFixed(2)}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openPurgeModal}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-extrabold text-red-800 hover:bg-red-100 transition"
              >
                Excluir todos
              </button>
              <button
                onClick={fetchRows}
                className="rounded-xl bg-white px-4 py-2 text-sm font-extrabold text-slate-900 shadow-sm border border-slate-200 hover:bg-slate-50 transition"
              >
                Atualizar
              </button>
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="text-sm text-slate-500">Carregando...</div>
            ) : (
              <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                    <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                      <th className="px-4 py-3">Mês</th>
                      <th className="px-4 py-3">Canal</th>
                      <th className="px-4 py-3">Valor</th>
                      <th className="px-4 py-3">Obs.</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-extrabold text-slate-900">{monthLabel(r.month)}</td>
                        <td className="px-4 py-3 text-slate-700">{r.channel}</td>
                        <td className="px-4 py-3 font-bold text-slate-900">
                          {Number(r.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{r.notes || ""}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() =>
                              removeRow(monthLabel(r.month), String(r.channel ?? "").trim().toLowerCase())
                            }
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-900 hover:bg-slate-50"
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-sm text-slate-500" colSpan={5}>
                          Nenhum gasto cadastrado.
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

