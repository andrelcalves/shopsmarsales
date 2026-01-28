import React, { useEffect, useMemo, useState } from "react";

const API_URL = "http://localhost:4000";

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

function monthLabel(iso: string) {
  const d = new Date(iso);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return ym;
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

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
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
                placeholder="meta | google | shopee | tiktok | tray"
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
            <button
              onClick={fetchRows}
              className="rounded-xl bg-white px-4 py-2 text-sm font-extrabold text-slate-900 shadow-sm border border-slate-200 hover:bg-slate-50 transition"
            >
              Atualizar
            </button>
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
                            onClick={() => removeRow(monthLabel(r.month), r.channel)}
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

