import React, { useEffect, useMemo, useState } from "react";
import { API_URL } from "./config";

type Member = {
  productId: number;
  code: string;
  name: string;
  sku: string | null;
  source: string;
  sold: number;
};

type MasterStockItem = {
  type: "master";
  masterProductId: number;
  sku: string;
  name: string;
  opening: number;
  sold: number;
  current: number;
  costPrice: number | null;
  effectiveCostDate: string | null;
  costSource: "stock" | null;
  sources: string[];
  members: Member[];
};

type StockResponse = {
  stockStartDate: string | null;
  items: MasterStockItem[];
};

const UI = {
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

function cn(...cls: Array<string | false | undefined | null>) {
  return cls.filter(Boolean).join(" ");
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtMoney(v: number | null) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function StockLaunch() {
  const [data, setData] = useState<StockResponse | null>(null);
  const [filterName, setFilterName] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [editing, setEditing] = useState<Record<number, { qty: string; cost: string; date: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [stockStartInput, setStockStartInput] = useState<string>("");
  const [savingStartDate, setSavingStartDate] = useState(false);

  const reload = async () => {
    setMsg(null);
    const url = new URL(`${API_URL}/api/stock-current`);
    if (filterName) url.searchParams.set("name", filterName);
    if (filterSku) url.searchParams.set("sku", filterSku);
    const r = await fetch(url.toString());
    if (!r.ok) {
      setMsg("Erro ao carregar mestres.");
      return;
    }
    const json: StockResponse = await r.json();
    setData(json);
    if (json.stockStartDate) setStockStartInput(json.stockStartDate);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = data?.items ?? [];

  const saveStockStartDate = async () => {
    if (!stockStartInput) {
      setMsg("Informe a data inicial do estoque.");
      return;
    }
    setSavingStartDate(true);
    setMsg(null);
    try {
      const r = await fetch(`${API_URL}/api/inventory-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockStartDate: stockStartInput }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Erro ao salvar data inicial.");
      }
      setMsg("Data inicial salva com sucesso.");
      reload();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setSavingStartDate(false);
    }
  };

  const setRow = (id: number, patch: Partial<{ qty: string; cost: string; date: string }>) => {
    setEditing((prev) => {
      const cur = prev[id] ?? { qty: "", cost: "", date: todayISO() };
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  };

  const ensureRow = (item: MasterStockItem) => {
    if (editing[item.masterProductId]) return editing[item.masterProductId];
    return {
      qty: String(item.opening ?? 0),
      cost: item.costPrice != null ? String(item.costPrice).replace(".", ",") : "",
      date: item.effectiveCostDate ?? todayISO(),
    };
  };

  const launch = async (item: MasterStockItem) => {
    const row = ensureRow(item);
    const qty = parseInt(row.qty, 10);
    if (!Number.isFinite(qty) || qty < 0) {
      setMsg("Quantidade inválida.");
      return;
    }
    if (qty > 0 && !row.cost.trim()) {
      setMsg("Informe o custo quando a quantidade for maior que zero.");
      return;
    }
    setSavingId(item.masterProductId);
    setMsg(null);
    try {
      const r = await fetch(`${API_URL}/api/master-product-stock`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterProductId: item.masterProductId,
          quantity: qty,
          unitCost: row.cost || undefined,
          effectiveDate: row.date || undefined,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Erro ao salvar lançamento.");
      }
      setMsg(`Lançamento salvo para ${item.sku}.`);
      setEditing((prev) => {
        const copy = { ...prev };
        delete copy[item.masterProductId];
        return copy;
      });
      reload();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setSavingId(null);
    }
  };

  const filteredCount = useMemo(() => items.length, [items]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className={cn(UI.card, "p-6")}>
        <h2 className="text-lg font-black tracking-tight text-slate-900">Data inicial do estoque</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pedidos a partir desta data são descontados da abertura para chegar no estoque atual.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Data inicial</label>
            <input
              type="date"
              value={stockStartInput}
              onChange={(e) => setStockStartInput(e.target.value)}
              className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
            />
          </div>
          <button
            onClick={saveStockStartDate}
            disabled={savingStartDate}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
          >
            {savingStartDate ? "Salvando..." : "Salvar"}
          </button>
          {data?.stockStartDate && (
            <span className="text-xs text-slate-500">
              Atual: <strong>{fmtDateBR(data.stockStartDate)}</strong>
            </span>
          )}
        </div>
      </div>

      <div className={cn(UI.card, "p-6")}>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-900">Lançar abertura por produto mestre</h2>
            <p className="mt-1 text-sm text-slate-500">
              Informe abertura, custo e data de vigência. Custo é obrigatório quando a quantidade for &gt; 0.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Nome</label>
              <input
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && reload()}
                className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                placeholder="contém..."
              />
            </div>
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">SKU mestre</label>
              <input
                value={filterSku}
                onChange={(e) => setFilterSku(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && reload()}
                className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                placeholder="contém..."
              />
            </div>
            <button onClick={reload} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-slate-800">
              Atualizar
            </button>
          </div>
        </div>
        {msg && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">{msg}</div>
        )}
      </div>

      <div className={cn(UI.card, "overflow-hidden")}>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                <th className="px-3 py-3">SKU mestre</th>
                <th className="px-3 py-3">Produto</th>
                <th className="px-3 py-3 text-right">Atual</th>
                <th className="px-3 py-3">Abertura</th>
                <th className="px-3 py-3">Custo</th>
                <th className="px-3 py-3">Vigência</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCount === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">Nenhum produto mestre encontrado.</td>
                </tr>
              )}
              {items.map((it) => {
                const row = ensureRow(it);
                const isSaving = savingId === it.masterProductId;
                return (
                  <tr key={it.masterProductId} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs font-extrabold text-slate-900">{it.sku}</td>
                    <td className="px-3 py-2 text-slate-800">
                      <div className="font-semibold">{it.name}</div>
                      <div className="text-[11px] text-slate-500">{it.sources.join(", ")}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-extrabold text-slate-900">{it.current}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={row.qty}
                        onChange={(e) => setRow(it.masterProductId, { qty: e.target.value })}
                        className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.cost}
                        onChange={(e) => setRow(it.masterProductId, { cost: e.target.value })}
                        className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                        placeholder="0,00"
                      />
                      <div className="text-[10px] text-slate-500 mt-1">Atual: {fmtMoney(it.costPrice)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) => setRow(it.masterProductId, { date: e.target.value })}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => launch(it)}
                        disabled={isSaving}
                        className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-extrabold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {isSaving ? "..." : "Salvar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
