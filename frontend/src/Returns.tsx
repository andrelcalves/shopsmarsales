import React, { useState, useEffect, useCallback } from 'react';
import { Search, RotateCcw, Trash2, ChevronDown, ChevronUp, PackageX, AlertTriangle } from 'lucide-react';

import { API_URL } from './config';

const UI = {
  card: 'bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl',
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(' ');
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const RETURN_REASONS = [
  'Endereço não encontrado',
  'Não Serviu',
  'Produto com defeito',
  'Desistência do comprador',
  'Produto diferente do anunciado',
  'Outro',
];

interface OrderSearch {
  id: number;
  orderId: string;
  orderDate: string;
  productName: string;
  quantity: number;
  totalPrice: number;
  source: string;
  status: string;
  returnRecord?: { id: number } | null;
}

interface ReturnRecord {
  id: number;
  orderId: string;
  source: string;
  reason: string;
  notes: string;
  returnDate: string;
  createdAt: string;
  order: {
    productName: string;
    totalPrice: number;
    quantity: number;
    orderDate: string;
    status: string;
  };
}

const sourceLabel: Record<string, string> = {
  shopee: 'Shopee',
  tiktok: 'TikTok',
  tray: 'Tray',
};

const sourceBadge: Record<string, string> = {
  shopee: 'bg-orange-100 text-orange-700',
  tiktok: 'bg-slate-100 text-slate-800',
  tray: 'bg-blue-100 text-blue-700',
};

export default function Returns() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OrderSearch[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<OrderSearch | null>(null);
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [notes, setNotes] = useState('');
  const [returnDate, setReturnDate] = useState(now.toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState('');

  const [month, setMonth] = useState(currentMonth);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [loadingReturns, setLoadingReturns] = useState(false);

  const [showForm, setShowForm] = useState(true);

  const searchOrders = useCallback(async () => {
    const q = query.trim();
    if (!q) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/api/orders/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearchResults(data);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => { searchOrders(); }, 400);
    return () => clearTimeout(timer);
  }, [searchOrders]);

  const fetchReturns = useCallback(async () => {
    setLoadingReturns(true);
    try {
      const res = await fetch(`${API_URL}/api/returns?month=${month}`);
      const data = await res.json();
      setReturns(data);
    } catch {
      setReturns([]);
    } finally {
      setLoadingReturns(false);
    }
  }, [month]);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setSubmitting(true);
    setFormMsg('');
    try {
      const res = await fetch(`${API_URL}/api/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrder.orderId,
          source: selectedOrder.source,
          reason,
          notes,
          returnDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erro ao registrar devolução.');
      setFormMsg('Devolução registrada com sucesso!');
      setSelectedOrder(null);
      setQuery('');
      setSearchResults([]);
      setNotes('');
      setReturnDate(now.toISOString().slice(0, 10));
      fetchReturns();
    } catch (err: any) {
      setFormMsg(err.message || 'Erro inesperado.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (orderId: string, source: string) => {
    if (!window.confirm('Deseja remover esta devolução? O pedido voltará para vendas válidas.')) return;
    try {
      const res = await fetch(`${API_URL}/api/returns/${encodeURIComponent(orderId)}/${encodeURIComponent(source)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.message || 'Erro ao remover.');
        return;
      }
      fetchReturns();
    } catch {
      alert('Erro ao remover devolução.');
    }
  };

  const totalDevolvido = returns.reduce((s, r) => s + (r.order?.totalPrice || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cn(UI.card, 'p-5')}>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Devoluções no mês</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{returns.length}</p>
        </div>
        <div className={cn(UI.card, 'p-5')}>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Total devolvido</p>
          <p className="mt-1 text-2xl font-black text-red-600">{fmt(totalDevolvido)}</p>
        </div>
        <div className={cn(UI.card, 'p-5')}>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Mês de referência</p>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
          />
        </div>
      </div>

      {/* Form: Register Return */}
      <div className={cn(UI.card, 'p-6')}>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 text-lg font-black tracking-tight text-slate-900"
        >
          <PackageX size={20} />
          Registrar devolução
          {showForm ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {/* Search */}
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500 mb-1">
                Buscar pedido (número ou produto)
              </label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Digite o número do pedido ou nome do produto…"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
              </div>

              {/* Search results */}
              {query.trim() && (
                <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-md">
                  {searching ? (
                    <p className="p-3 text-sm text-slate-400">Buscando…</p>
                  ) : searchResults.length === 0 ? (
                    <p className="p-3 text-sm text-slate-400">Nenhum pedido encontrado.</p>
                  ) : (
                    searchResults.map((o) => {
                      const alreadyReturned = !!o.returnRecord || o.status === 'Devolvido';
                      return (
                        <button
                          key={`${o.orderId}-${o.source}`}
                          type="button"
                          disabled={alreadyReturned}
                          onClick={() => {
                            setSelectedOrder(o);
                            setQuery('');
                            setSearchResults([]);
                          }}
                          className={cn(
                            'w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 transition',
                            alreadyReturned
                              ? 'opacity-50 cursor-not-allowed bg-red-50'
                              : selectedOrder?.orderId === o.orderId && selectedOrder?.source === o.source
                                ? 'bg-sky-50'
                                : 'hover:bg-slate-50'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-sm font-bold text-slate-900">#{o.orderId}</span>
                              <span className={cn('ml-2 text-xs font-bold px-2 py-0.5 rounded-full', sourceBadge[o.source] || 'bg-slate-100 text-slate-600')}>
                                {sourceLabel[o.source] || o.source}
                              </span>
                              {alreadyReturned && (
                                <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                  Devolvido
                                </span>
                              )}
                            </div>
                            <span className="text-sm font-bold text-slate-700">{fmt(o.totalPrice)}</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{o.productName}</p>
                          <p className="text-xs text-slate-400">{new Date(o.orderDate).toLocaleDateString('pt-BR')} · {o.quantity} un.</p>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Selected order */}
            {selectedOrder && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Pedido #{selectedOrder.orderId}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{selectedOrder.productName}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(selectedOrder.orderDate).toLocaleDateString('pt-BR')} ·{' '}
                      {sourceLabel[selectedOrder.source] || selectedOrder.source} · {selectedOrder.quantity} un. · {fmt(selectedOrder.totalPrice)}
                    </p>
                  </div>
                  <button type="button" onClick={() => setSelectedOrder(null)} className="text-xs text-slate-400 hover:text-slate-600">
                    ✕ Remover
                  </button>
                </div>
              </div>
            )}

            {/* Reason + Notes + Date */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500 mb-1">
                  Motivo da devolução
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                >
                  {RETURN_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500 mb-1">
                  Data da devolução
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
              </div>
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500 mb-1">
                  Observação
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observação opcional…"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
              </div>
            </div>

            {formMsg && (
              <div className={cn(
                'flex items-center gap-2 p-3 rounded-xl text-sm font-semibold',
                formMsg.includes('sucesso') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              )}>
                {formMsg.includes('sucesso') ? <RotateCcw size={14} /> : <AlertTriangle size={14} />}
                {formMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={!selectedOrder || submitting}
              className={cn(
                'px-6 py-2.5 rounded-xl text-sm font-extrabold transition shadow-sm',
                selectedOrder && !submitting
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              )}
            >
              {submitting ? 'Registrando…' : 'Registrar devolução'}
            </button>
          </form>
        )}
      </div>

      {/* List of returns */}
      <div className={cn(UI.card, 'p-6')}>
        <h3 className="text-lg font-black tracking-tight text-slate-900 mb-4">
          Pedidos devolvidos
        </h3>

        {loadingReturns ? (
          <p className="text-sm text-slate-400">Carregando…</p>
        ) : returns.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma devolução registrada neste mês.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="pb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Pedido</th>
                  <th className="pb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Canal</th>
                  <th className="pb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Produto</th>
                  <th className="pb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Valor</th>
                  <th className="pb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Motivo</th>
                  <th className="pb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Obs.</th>
                  <th className="pb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Data devol.</th>
                  <th className="pb-2 text-xs font-bold uppercase tracking-widest text-slate-400 text-center">Ação</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-2.5 font-bold text-slate-900">#{r.orderId}</td>
                    <td className="py-2.5">
                      <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', sourceBadge[r.source] || 'bg-slate-100 text-slate-600')}>
                        {sourceLabel[r.source] || r.source}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-700 max-w-[200px] truncate" title={r.order?.productName}>
                      {r.order?.productName}
                    </td>
                    <td className="py-2.5 font-bold text-red-600">{fmt(r.order?.totalPrice || 0)}</td>
                    <td className="py-2.5 text-slate-700">{r.reason}</td>
                    <td className="py-2.5 text-slate-500 max-w-[150px] truncate" title={r.notes}>
                      {r.notes || '—'}
                    </td>
                    <td className="py-2.5 text-slate-600">
                      {new Date(r.returnDate).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-2.5 text-center">
                      <button
                        onClick={() => handleDelete(r.orderId, r.source)}
                        className="text-slate-400 hover:text-red-600 transition"
                        title="Remover devolução"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
