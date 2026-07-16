import React, { useMemo, useRef, useState } from "react";
import { Upload, X } from "lucide-react";

import { API_URL } from "./config";

export type BankStatementDraft = {
  externalId: string;
  date: string;
  amount: number;
  type: "payable" | "receivable";
  supplier: string;
  description: string;
  settled: boolean;
  included: boolean;
  isFixedCost?: boolean;
};

type ParseResponse = {
  payables: BankStatementDraft[];
  receivables: BankStatementDraft[];
  errors: string[];
  duplicateExternalIds: string[];
};

const UI = {
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

function DraftTable({
  title,
  rows,
  onChange,
  duplicateIds,
  showFixedCost = false,
}: {
  title: string;
  rows: BankStatementDraft[];
  onChange: (next: BankStatementDraft[]) => void;
  duplicateIds: Set<string>;
  showFixedCost?: boolean;
}) {
  const updateRow = (idx: number, patch: Partial<BankStatementDraft>) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
        Nenhuma linha em {title}.
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-sm font-extrabold text-slate-900 mb-2">{title}</h4>
      <div className="overflow-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[980px] text-xs">
          <thead className="bg-slate-100 text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
            <tr>
              <th className="px-2 py-2">Incluir</th>
              <th className="px-2 py-2">Data</th>
              <th className="px-2 py-2">Fornecedor / Cliente</th>
              <th className="px-2 py-2">Descrição</th>
              <th className="px-2 py-2">Valor</th>
              {showFixedCost ? <th className="px-2 py-2 text-center">Custo fixo</th> : null}
              <th className="px-2 py-2 text-center">Quitado</th>
              <th className="px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, idx) => {
              const isDup = duplicateIds.has(row.externalId);
              return (
                <tr key={row.externalId} className={cn(!row.included && "opacity-50", isDup && "bg-amber-50")}>
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={row.included}
                      onChange={(e) => updateRow(idx, { included: e.target.checked })}
                      className="rounded border-slate-300"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="date"
                      value={row.date}
                      onChange={(e) => updateRow(idx, { date: e.target.value })}
                      className="rounded border border-slate-200 px-2 py-1"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.supplier}
                      onChange={(e) => updateRow(idx, { supplier: e.target.value })}
                      className="w-full min-w-[140px] rounded border border-slate-200 px-2 py-1"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.description}
                      onChange={(e) => updateRow(idx, { description: e.target.value })}
                      className="w-full min-w-[200px] rounded border border-slate-200 px-2 py-1"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.amount}
                      onChange={(e) => updateRow(idx, { amount: Number(e.target.value) || 0 })}
                      className="w-24 rounded border border-slate-200 px-2 py-1 tabular-nums"
                    />
                  </td>
                  {showFixedCost ? (
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.isFixedCost === true}
                        onChange={(e) => updateRow(idx, { isFixedCost: e.target.checked })}
                        className="rounded border-slate-300"
                        title="Conta é custo fixo (simulação)"
                      />
                    </td>
                  ) : null}
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.settled}
                      onChange={(e) => updateRow(idx, { settled: e.target.checked })}
                      className="rounded border-slate-300"
                    />
                  </td>
                  <td className="px-2 py-2 text-slate-600">
                    {isDup ? (
                      <span className="text-amber-700 font-bold">Já importado</span>
                    ) : (
                      formatMoney(row.amount)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function BankStatementImport({ open, onClose, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [tab, setTab] = useState<"payable" | "receivable">("payable");
  const [payables, setPayables] = useState<BankStatementDraft[]>([]);
  const [receivables, setReceivables] = useState<BankStatementDraft[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [duplicateIds, setDuplicateIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const duplicateSet = useMemo(() => new Set(duplicateIds), [duplicateIds]);

  const summary = useMemo(() => {
    const pay = payables.filter((p) => p.included && !duplicateSet.has(p.externalId));
    const rec = receivables.filter((r) => r.included && !duplicateSet.has(r.externalId));
    return { payCount: pay.length, recCount: rec.length };
  }, [payables, receivables, duplicateSet]);

  function reset() {
    setStep("upload");
    setTab("payable");
    setPayables([]);
    setReceivables([]);
    setErrors([]);
    setDuplicateIds([]);
    setMessage("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    setLoading(true);
    setMessage("");
    try {
      const csv = await file.text();
      const res = await fetch(`${API_URL}/api/bank-statement/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = (await res.json()) as ParseResponse & { message?: string };
      if (!res.ok) throw new Error(data?.message || "Falha ao ler extrato.");
      setPayables(data.payables ?? []);
      setReceivables(data.receivables ?? []);
      setErrors(data.errors ?? []);
      setDuplicateIds(data.duplicateExternalIds ?? []);
      setStep("review");
      setTab((data.payables?.length ?? 0) > 0 ? "payable" : "receivable");
    } catch (e: unknown) {
      setMessage(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setLoading(true);
    setMessage("Importando...");
    try {
      const res = await fetch(`${API_URL}/api/bank-statement/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payables, receivables }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Falha ao importar.");
      setMessage(data.message || "Importação concluída.");
      onSuccess();
      handleClose();
    } catch (e: unknown) {
      setMessage(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className={cn(UI.card, "w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col")}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-black text-slate-900">Importar extrato Nubank</h3>
            <p className="text-sm text-slate-500">CSV com colunas Data, Valor, Identificador, Descrição</p>
          </div>
          <button type="button" onClick={handleClose} className="rounded-lg p-2 hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-600" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-4">
          {step === "upload" && (
            <div className="flex flex-col items-center justify-center gap-4 py-12 border-2 border-dashed border-slate-200 rounded-2xl">
              <Upload className="h-10 w-10 text-slate-400" />
              <p className="text-sm text-slate-600">Selecione o arquivo CSV exportado do Nubank</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => fileRef.current?.click()}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {loading ? "Lendo..." : "Escolher arquivo"}
              </button>
            </div>
          )}

          {step === "review" && (
            <>
              {errors.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
                  {errors.map((err) => (
                    <div key={err}>{err}</div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTab("payable")}
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm font-extrabold",
                    tab === "payable" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700",
                  )}
                >
                  A pagar ({payables.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab("receivable")}
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm font-extrabold",
                    tab === "receivable" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700",
                  )}
                >
                  A receber ({receivables.length})
                </button>
              </div>

              {tab === "payable" ? (
                <DraftTable
                  title="Contas a pagar"
                  rows={payables}
                  onChange={setPayables}
                  duplicateIds={duplicateSet}
                  showFixedCost
                />
              ) : (
                <DraftTable
                  title="Contas a receber"
                  rows={receivables}
                  onChange={setReceivables}
                  duplicateIds={duplicateSet}
                />
              )}

              <p className="text-sm text-slate-600">
                Serão importadas: <strong>{summary.payCount}</strong> a pagar,{" "}
                <strong>{summary.recCount}</strong> a receber.
                {duplicateIds.length > 0 ? (
                  <span className="text-amber-700"> {duplicateIds.length} linha(s) já existem no sistema.</span>
                ) : null}
              </p>
            </>
          )}

          {message && <div className="text-sm font-semibold text-slate-700">{message}</div>}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
          >
            Cancelar
          </button>
          {step === "review" && (
            <button
              type="button"
              disabled={loading || (summary.payCount === 0 && summary.recCount === 0)}
              onClick={handleConfirm}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? "Importando..." : "Confirmar importação"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
