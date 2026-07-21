import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search, Trash2, CheckCircle2 } from 'lucide-react';

import { API_URL } from './config';
import { parseApiJson } from './api';

const UI = {
  card: 'bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl',
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(' ');
}

function fmtMoney(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FALLBACK_PAYMENT_TYPES = ['Pix', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência'];

const STATUS_OPTIONS = ['Pago', 'Aberto', 'Enviado', 'Entregue'];

type MasterItem = {
  masterProductId: number;
  sku: string;
  name: string;
  current: number;
  costPrice: number | null;
};

type Line = {
  key: string;
  masterProductId: number;
  sku: string;
  name: string;
  stock: number;
  quantity: number;
  unitPrice: string;
};

type CreatedOrder = {
  orderId: string;
  totalPrice: number;
  quantity: number;
  paymentType: string;
  productName: string;
};

export default function AtacadoManualSale() {
  const [orderDate, setOrderDate] = useState(todayISO());
  const [customerName, setCustomerName] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [customPaymentType, setCustomPaymentType] = useState('');
  const [freight, setFreight] = useState('');
  const [status, setStatus] = useState('Pago');
  const [paymentTypes, setPaymentTypes] = useState<string[]>([]);

  const [catalog, setCatalog] = useState<MasterItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [productQuery, setProductQuery] = useState('');
  const [lines, setLines] = useState<Line[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreatedOrder | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/payment-types`)
      .then((r) => r.json())
      .then((json) => {
        const fromApi = Array.isArray(json) ? json.map(String).filter(Boolean) : [];
        const merged = Array.from(new Set([...fromApi, ...FALLBACK_PAYMENT_TYPES])).sort();
        setPaymentTypes(merged);
        if (!paymentType && merged.length > 0) {
          const pix = merged.find((t) => t.toLowerCase().includes('pix'));
          setPaymentType(pix || merged[0]);
        }
      })
      .catch(() => setPaymentTypes(FALLBACK_PAYMENT_TYPES));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/master-products`);
      const data = await parseApiJson<{ items?: MasterItem[] }>(res);
      const items = Array.isArray(data.items) ? data.items : [];
      setCatalog(
        items.map((i) => ({
          masterProductId: i.masterProductId,
          sku: i.sku,
          name: i.name,
          current: Number(i.current) || 0,
          costPrice: i.costPrice ?? null,
        })),
      );
    } catch {
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const suggestions = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q || q.length < 1) return [];
    const selected = new Set(lines.map((l) => l.masterProductId));
    return catalog
      .filter((p) => !selected.has(p.masterProductId))
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [catalog, productQuery, lines]);

  function addProduct(p: MasterItem) {
    setLines((prev) => [
      ...prev,
      {
        key: `${p.masterProductId}-${Date.now()}`,
        masterProductId: p.masterProductId,
        sku: p.sku,
        name: p.name,
        stock: p.current,
        quantity: 1,
        unitPrice: '',
      },
    ]);
    setProductQuery('');
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const itemsSubtotal = useMemo(() => {
    return lines.reduce((sum, l) => {
      const price = Number(String(l.unitPrice).replace(',', '.')) || 0;
      return sum + price * (l.quantity || 0);
    }, 0);
  }, [lines]);

  const freightNum = Number(String(freight).replace(',', '.')) || 0;
  const grandTotal = itemsSubtotal + freightNum;

  const resolvedPayment =
    paymentType === '__custom__' ? customPaymentType.trim() : paymentType.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCreated(null);

    if (!resolvedPayment) {
      setError('Informe a forma de pagamento.');
      return;
    }
    if (lines.length === 0) {
      setError('Adicione ao menos um produto.');
      return;
    }
    for (const l of lines) {
      const price = Number(String(l.unitPrice).replace(',', '.'));
      if (!l.quantity || l.quantity <= 0) {
        setError(`Quantidade inválida em ${l.name}.`);
        return;
      }
      if (!Number.isFinite(price) || price < 0 || String(l.unitPrice).trim() === '') {
        setError(`Informe o preço unitário de ${l.name}.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/orders/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate,
          paymentType: resolvedPayment,
          status,
          customerName: customerName.trim() || undefined,
          freight: freight.trim() === '' ? undefined : freightNum,
          items: lines.map((l) => ({
            masterProductId: l.masterProductId,
            quantity: l.quantity,
            unitPrice: Number(String(l.unitPrice).replace(',', '.')),
          })),
        }),
      });
      const data = await parseApiJson<CreatedOrder & { message?: string }>(res);
      if (!res.ok) {
        throw new Error(data.message || `Erro HTTP ${res.status}`);
      }
      setCreated({
        orderId: data.orderId,
        totalPrice: data.totalPrice,
        quantity: data.quantity,
        paymentType: data.paymentType,
        productName: data.productName,
      });
      setLines([]);
      setCustomerName('');
      setFreight('');
      setProductQuery('');
      loadCatalog();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 space-y-6">
      <div className={cn(UI.card, 'p-5 md:p-6')}>
        <h2 className="text-lg font-black tracking-tight text-slate-900">Venda Atacado (WhatsApp)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Lance pedidos feitos direto pelo WhatsApp, sem passar pela Nuvemshop. O estoque baixa
          automaticamente pelos produtos mestre selecionados.
        </p>
      </div>

      {created && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-900">
            <div className="font-bold">Pedido {created.orderId} criado</div>
            <div className="mt-0.5">
              {created.productName} · {created.quantity} un. · {fmtMoney(created.totalPrice)} ·{' '}
              {created.paymentType}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 font-medium">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <div className={cn(UI.card, 'p-5 md:p-6 space-y-4')}>
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Dados do pedido</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-bold text-slate-500">Data</span>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-500">Cliente (opcional)</span>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome no WhatsApp"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-500">Forma de pagamento</span>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              >
                {paymentTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value="__custom__">Outra…</option>
              </select>
              {paymentType === '__custom__' && (
                <input
                  type="text"
                  value={customPaymentType}
                  onChange={(e) => setCustomPaymentType(e.target.value)}
                  placeholder="Digite a forma de pagamento"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                />
              )}
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-500">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs font-bold text-slate-500">Frete (opcional)</span>
              <input
                type="text"
                inputMode="decimal"
                value={freight}
                onChange={(e) => setFreight(e.target.value)}
                placeholder="0,00"
                className="mt-1 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              />
            </label>
          </div>
        </div>

        <div className={cn(UI.card, 'p-5 md:p-6 space-y-4')}>
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Produtos</h3>

          <div className="relative">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <Search className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder={
                  catalogLoading
                    ? 'Carregando produtos…'
                    : 'Buscar produto mestre por nome ou SKU'
                }
                className="w-full bg-transparent text-sm font-medium text-slate-900 outline-none"
                disabled={catalogLoading}
              />
            </div>
            {suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                {suggestions.map((p) => (
                  <button
                    key={p.masterProductId}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3 border-b border-slate-100 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">{p.name}</div>
                      <div className="text-xs text-slate-500">SKU {p.sku}</div>
                    </div>
                    <div className="text-xs font-semibold text-slate-500 shrink-0">
                      Est. {p.current}
                      <Plus className="inline h-3.5 w-3.5 ml-2 text-sky-600" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">
              Nenhum produto ainda. Busque acima e adicione à venda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    <th className="pb-2 pr-3">Produto</th>
                    <th className="pb-2 pr-3 w-24">Qtd</th>
                    <th className="pb-2 pr-3 w-32">Preço un.</th>
                    <th className="pb-2 pr-3 w-28 text-right">Total</th>
                    <th className="pb-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const price = Number(String(l.unitPrice).replace(',', '.')) || 0;
                    const lineTotal = price * l.quantity;
                    return (
                      <tr key={l.key} className="border-b border-slate-50">
                        <td className="py-3 pr-3">
                          <div className="font-bold text-slate-900">{l.name}</div>
                          <div className="text-xs text-slate-500">
                            SKU {l.sku} · estoque {l.stock}
                          </div>
                        </td>
                        <td className="py-3 pr-3">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={l.quantity}
                            onChange={(e) =>
                              updateLine(l.key, {
                                quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                              })
                            }
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 font-medium"
                          />
                        </td>
                        <td className="py-3 pr-3">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={l.unitPrice}
                            onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                            placeholder="0,00"
                            className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 font-medium"
                          />
                        </td>
                        <td className="py-3 pr-3 text-right font-bold text-slate-900">
                          {fmtMoney(lineTotal)}
                        </td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => removeLine(l.key)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            aria-label="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col items-end gap-1 border-t border-slate-100 pt-4">
            <div className="text-sm text-slate-500">
              Subtotal itens: <span className="font-bold text-slate-800">{fmtMoney(itemsSubtotal)}</span>
            </div>
            {freightNum > 0 && (
              <div className="text-sm text-slate-500">
                Frete: <span className="font-bold text-slate-800">{fmtMoney(freightNum)}</span>
              </div>
            )}
            <div className="text-base font-black text-slate-900">
              Total: {fmtMoney(grandTotal)}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || lines.length === 0}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold transition',
              submitting || lines.length === 0
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-sky-700 text-white hover:bg-sky-800 shadow-sm',
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando…
              </>
            ) : (
              'Lançar venda'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
