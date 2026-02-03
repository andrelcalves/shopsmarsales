import React, { useEffect, useState } from "react";

const API_URL = "http://localhost:4000";

type PaymentTypeFeeRow = {
  id: number;
  month: string;
  channel: string;
  paymentType: string;
  percent: number;
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

const UI = {
  bg: "bg-slate-50",
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

export default function PaymentTypeFees() {
  const [rows, setRows] = useState<PaymentTypeFeeRow[]>([]);
  const [paymentTypes, setPaymentTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>("");

  const [month, setMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [paymentType, setPaymentType] = useState<string>("");
  const [customPaymentType, setCustomPaymentType] = useState<string>("");
  const [percent, setPercent] = useState<string>("");

  async function fetchRows() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/payment-type-fees?month=${encodeURIComponent(month)}&channel=tray`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPaymentTypes() {
    try {
      const res = await fetch(`${API_URL}/api/payment-types`);
      const data = await res.json();
      setPaymentTypes(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setPaymentTypes([]);
    }
  }

  useEffect(() => {
    fetchRows();
  }, [month]);

  useEffect(() => {
    fetchPaymentTypes();
  }, []);

  async function upsert(e: React.FormEvent) {
    e.preventDefault();
    setMessage("Salvando...");
    try {
      const res = await fetch(`${API_URL}/api/payment-type-fees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          channel: "tray",
          paymentType: (customPaymentType || paymentType || "").trim() || undefined,
          percent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao salvar.");
      setMessage("Salvo com sucesso.");
      setPercent("");
      setCustomPaymentType("");
      fetchRows();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  }

  async function removeRow(m: string, pt: string) {
    if (!window.confirm(`Remover taxa de "${pt}" em ${m}?`)) return;
    setMessage("Removendo...");
    try {
      const res = await fetch(
        `${API_URL}/api/payment-type-fees?month=${encodeURIComponent(m)}&channel=tray&paymentType=${encodeURIComponent(pt)}`,
        { method: "DELETE" }
      );
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
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className={cn(UI.card, "p-6")}>
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-900">Taxas por tipo de pagamento (Tray)</h2>
            <p className="mt-1 text-sm text-slate-500">
              Cadastre o percentual de taxa por tipo de pagamento e mês. Usado na simulação P&L do canal Tray.
            </p>
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
            <div className="md:col-span-4">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Tipo de pagamento</label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
              >
                <option value="">Selecione (ou digite abaixo)</option>
                {paymentTypes.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={customPaymentType}
                onChange={(e) => setCustomPaymentType(e.target.value)}
                placeholder="Ou digite novo tipo"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 shadow-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Taxa (%)</label>
              <input
                type="text"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                placeholder="3.63"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
              />
            </div>
            <div className="md:col-span-3">
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-slate-800 transition"
              >
                Salvar
              </button>
            </div>
          </form>
          {paymentTypes.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Nenhum tipo de pagamento encontrado nos pedidos Tray. Importe pedidos Tray primeiro.
            </p>
          )}
          {message && <div className="mt-3 text-sm font-semibold text-slate-700">{message}</div>}
        </div>

        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Taxas cadastradas — {month}</h3>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="text-sm text-slate-500">Carregando...</div>
            ) : (
              <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                    <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                      <th className="px-4 py-3">Tipo de pagamento</th>
                      <th className="px-4 py-3">Taxa (%)</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900">{r.paymentType}</td>
                        <td className="px-4 py-3 text-slate-900 font-bold">{Number(r.percent).toFixed(2)}%</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => removeRow(month, r.paymentType)}
                            className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50"
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && !loading && (
                      <tr>
                        <td className="px-4 py-6 text-sm text-slate-500" colSpan={3}>
                          Nenhuma taxa cadastrada para este mês.
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
