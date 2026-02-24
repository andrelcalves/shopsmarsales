import React, { useEffect, useState, useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from "recharts";
import { RefreshCcw, CreditCard } from "lucide-react";

const API_URL = "http://localhost:4000";

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
  description: string;
  invoiceNumber: string | null;
  totalAmount: number;
  dueDate: string | null;
  status: string;
  payments: BillPayment[];
};

const UI = {
  bg: "bg-slate-50",
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateLabel(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day}/${m}/${y}`;
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(parseInt(y!, 10), parseInt(m!, 10) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

type PaymentWithBill = BillPayment & { billDescription: string };

export default function BillsDashboard() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBills = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/bills`);
      const data = await res.json();
      setBills(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setBills([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
  }, []);

  const { byMonth, chartData, monthsSorted } = useMemo(() => {
    const byMonth = new Map<string, { total: number; pending: number; paid: number; payments: PaymentWithBill[] }>();
    for (const bill of bills) {
      for (const p of bill.payments || []) {
        const key = monthKey(p.dueDate);
        if (!byMonth.has(key)) {
          byMonth.set(key, { total: 0, pending: 0, paid: 0, payments: [] });
        }
        const row = byMonth.get(key)!;
        row.total += p.amount;
        if (p.paidAt) row.paid += p.amount;
        else row.pending += p.amount;
        row.payments.push({ ...p, billDescription: bill.description });
      }
    }
    const monthsSorted = Array.from(byMonth.keys()).sort();
    const chartData = monthsSorted.map((key) => {
      const r = byMonth.get(key)!;
      return {
        name: monthLabel(key),
        monthKey: key,
        total: Number(r.total.toFixed(2)),
        pending: Number(r.pending.toFixed(2)),
        paid: Number(r.paid.toFixed(2)),
        count: r.payments.length,
      };
    });
    return { byMonth, chartData, monthsSorted };
  }, [bills]);

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      <div className="bg-gradient-to-r from-sky-700 via-blue-700 to-indigo-700">
        <div className="max-w-7xl mx-auto px-6 py-7 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-2 opacity-95">
                <CreditCard className="w-5 h-5" />
                <span className="text-sm font-semibold tracking-wide">CONTAS A PAGAR</span>
              </div>
              <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">Contas a pagar por mês</h1>
              <p className="mt-1 text-white/80 text-sm">Valores por mês (parcelas por data de vencimento)</p>
            </div>
            <button
              onClick={fetchBills}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-slate-900 text-sm font-extrabold shadow-sm hover:opacity-95 transition"
            >
              <RefreshCcw className="w-4 h-4" />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="px-6 pt-6">
            <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Valores por mês</h3>
            <p className="mt-1 text-xs text-slate-500">Total, pendente e pago por mês de vencimento</p>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="h-80 flex items-center justify-center text-slate-500">Carregando...</div>
            ) : chartData.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-slate-500">Nenhuma parcela cadastrada.</div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 32, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748B", fontSize: 11 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748B", fontSize: 12 }}
                      tickFormatter={(v) => (Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}k` : String(v))}
                    />
                    <Tooltip
                      formatter={(value: unknown) => formatMoney(Number(value ?? 0))}
                      contentStyle={{
                        borderRadius: 14,
                        border: "1px solid #E2E8F0",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
                      }}
                      labelFormatter={(label, payload) => payload?.[0]?.payload?.monthKey ? `${monthLabel(payload[0].payload.monthKey)} • ${payload[0].payload.count} parcela(s)` : label}
                    />
                    <Bar dataKey="pending" name="Pendente" fill="#F59E0B" radius={[0, 0, 0, 0]} stackId="a" />
                    <Bar dataKey="paid" name="Pago" fill="#10B981" radius={[4, 4, 0, 0]} stackId="a">
                      <LabelList
                        dataKey="total"
                        position="top"
                        formatter={(value: unknown) => formatMoney(Number(value ?? 0))}
                        style={{ fill: "#0F172A", fontSize: 11, fontWeight: 700 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="px-6 pt-6">
            <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Contas por mês</h3>
            <p className="mt-1 text-xs text-slate-500">Parcelas agrupadas pelo mês de vencimento</p>
          </div>
          <div className="p-6 overflow-auto">
            {loading ? (
              <div className="text-slate-500 py-8">Carregando...</div>
            ) : monthsSorted.length === 0 ? (
              <div className="text-slate-500 py-8">Nenhuma parcela cadastrada.</div>
            ) : (
              <div className="space-y-8">
                {monthsSorted.map((key) => {
                  const row = byMonth.get(key)!;
                  return (
                    <div key={key} className="rounded-2xl border border-slate-200 overflow-hidden">
                      <div className="bg-slate-100 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-extrabold text-slate-900 capitalize">{monthLabel(key)}</span>
                        <span className="text-sm text-slate-600">
                          Total: {formatMoney(row.total)} • Pendente: {formatMoney(row.pending)} • Pago: {formatMoney(row.paid)}
                        </span>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                            <th className="px-4 py-2">Conta</th>
                            <th className="px-4 py-2">Vencimento</th>
                            <th className="px-4 py-2 text-right">Valor</th>
                            <th className="px-4 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {row.payments
                            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                            .map((p) => (
                              <tr key={p.id} className="hover:bg-slate-50">
                                <td className="px-4 py-2 font-medium text-slate-900">{p.billDescription}</td>
                                <td className="px-4 py-2 text-slate-600">{dateLabel(p.dueDate)}</td>
                                <td className="px-4 py-2 text-right font-medium text-slate-900">{formatMoney(p.amount)}</td>
                                <td className="px-4 py-2">
                                  {p.paidAt ? (
                                    <span className="text-emerald-600 font-semibold">Pago</span>
                                  ) : (
                                    <span className="text-amber-600 font-semibold">Pendente</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
