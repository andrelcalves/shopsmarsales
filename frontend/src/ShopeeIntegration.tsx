import React, { useEffect, useState, useCallback } from "react";
import {
  Plug,
  Unplug,
  RefreshCcw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Calendar,
  Download,
  ShieldCheck,
  Clock,
} from "lucide-react";

import { API_URL } from './config';

const UI = {
  bg: "bg-slate-50",
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

interface IntegrationStatus {
  configured: boolean;
  status: string;
  shopId?: string;
  shopName?: string;
  partnerId?: string;
  lastSyncAt?: string;
  tokenExpiresAt?: string;
  refreshExpiresAt?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  disconnected: { label: "Desconectado", color: "text-slate-500 bg-slate-100", icon: <Unplug className="w-4 h-4" /> },
  connected: { label: "Conectado", color: "text-emerald-700 bg-emerald-50", icon: <CheckCircle2 className="w-4 h-4" /> },
  token_expired: { label: "Token expirado", color: "text-amber-700 bg-amber-50", icon: <AlertTriangle className="w-4 h-4" /> },
  expired: { label: "Expirado (reconectar)", color: "text-red-700 bg-red-50", icon: <XCircle className="w-4 h-4" /> },
};

export default function ShopeeIntegration() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [partnerId, setPartnerId] = useState("");
  const [partnerKey, setPartnerKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [daysBack, setDaysBack] = useState(30);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/shopee/status`);
      const data = await res.json();
      setStatus(data);
      if (data.partnerId) setPartnerId(data.partnerId);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("shopee_connected") === "1") {
      setMessage({ type: "success", text: "Loja Shopee conectada com sucesso!" });
      window.history.replaceState({}, document.title, window.location.pathname);
      fetchStatus();
    }
  }, [fetchStatus]);

  const handleSaveConfig = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/shopee/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId, partnerKey }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Credenciais salvas com sucesso!" });
        await fetchStatus();
      } else {
        setMessage({ type: "error", text: data.message || "Erro ao salvar." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro de conexão." });
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    try {
      const res = await fetch(`${API_URL}/api/shopee/auth-url`);
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      } else {
        setMessage({ type: "error", text: data.message || "Erro ao gerar URL." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro de conexão." });
    }
  };

  const handleRefreshToken = async () => {
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/shopee/refresh-token`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Token renovado com sucesso!" });
        await fetchStatus();
      } else {
        setMessage({ type: "error", text: data.message || "Erro ao renovar token." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro de conexão." });
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Tem certeza que deseja desconectar a loja Shopee?")) return;
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/shopee/disconnect`, { method: "POST" });
      if (res.ok) {
        setMessage({ type: "success", text: "Loja desconectada." });
        setPartnerKey("");
        await fetchStatus();
      }
    } catch {
      setMessage({ type: "error", text: "Erro de conexão." });
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/shopee/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(`${data.synced} pedidos sincronizados de ${data.total} encontrados.`);
        setMessage({ type: "success", text: "Sincronização concluída!" });
        await fetchStatus();
      } else {
        setMessage({ type: "error", text: data.message || "Erro na sincronização." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro de conexão." });
    } finally {
      setSyncing(false);
    }
  };

  const statusInfo = STATUS_CONFIG[status?.status ?? "disconnected"] ?? STATUS_CONFIG.disconnected;
  const isConnected = status?.status === "connected" || status?.status === "token_expired";

  if (loading) {
    return (
      <div className={cn(UI.bg, "min-h-screen flex items-center justify-center")}>
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Alert */}
        {message && (
          <div
            className={cn(
              "rounded-2xl border px-5 py-4 text-sm font-semibold flex items-center gap-3",
              message.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-red-50 border-red-200 text-red-800"
            )}
          >
            {message.type === "success" ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <XCircle className="w-5 h-5 flex-shrink-0" />}
            {message.text}
          </div>
        )}

        {/* Status Card */}
        <div className={cn(UI.card, "p-6")}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900 flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center">
                  <Plug className="w-4 h-4 text-white" />
                </div>
                Integração Shopee
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Conecte sua loja via Shopee Open Platform para sincronizar pedidos automaticamente.
              </p>
            </div>
            <div className={cn("inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold", statusInfo.color)}>
              {statusInfo.icon}
              {statusInfo.label}
            </div>
          </div>

          {/* Shop info (when connected) */}
          {isConnected && status?.shopName && (
            <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Loja</div>
                  <div className="mt-1 font-bold text-slate-900">{status.shopName}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Shop ID</div>
                  <div className="mt-1 font-mono text-slate-700">{status.shopId}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Token expira
                  </div>
                  <div className="mt-1 text-slate-700">
                    {status.tokenExpiresAt
                      ? new Date(status.tokenExpiresAt).toLocaleString("pt-BR")
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Última sync</div>
                  <div className="mt-1 text-slate-700">
                    {status.lastSyncAt
                      ? new Date(status.lastSyncAt).toLocaleString("pt-BR")
                      : "Nunca"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Credentials Card */}
        <div className={cn(UI.card, "p-6")}>
          <h3 className="text-sm font-extrabold tracking-wide text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-400" />
            Credenciais do App
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Cadastre seu app na{" "}
            <a
              href="https://open.shopee.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-600 hover:underline inline-flex items-center gap-0.5"
            >
              Shopee Open Platform <ExternalLink className="w-3 h-3" />
            </a>{" "}
            e copie o Partner ID e Partner Key.
          </p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">
                Partner ID
              </label>
              <input
                type="text"
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
                placeholder="Ex: 1234567"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              />
            </div>
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">
                Partner Key
              </label>
              <input
                type="password"
                value={partnerKey}
                onChange={(e) => setPartnerKey(e.target.value)}
                placeholder="Chave secreta do app"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleSaveConfig}
              disabled={!partnerId || !partnerKey || saving}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-extrabold shadow-sm transition",
                partnerId && partnerKey && !saving
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "bg-slate-200 text-slate-500 cursor-not-allowed"
              )}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Salvar credenciais
            </button>
          </div>
        </div>

        {/* Connect / Disconnect Card */}
        {status?.configured && (
          <div className={cn(UI.card, "p-6")}>
            <h3 className="text-sm font-extrabold tracking-wide text-slate-900 flex items-center gap-2">
              <Plug className="w-4 h-4 text-slate-400" />
              Conexão OAuth
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {isConnected
                ? "Sua loja está conectada. Você pode renovar o token ou desconectar."
                : "Autorize o acesso à sua loja Shopee para buscar pedidos via API."}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {!isConnected ? (
                <button
                  onClick={handleConnect}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-extrabold shadow-sm hover:bg-orange-600 transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  Conectar loja Shopee
                </button>
              ) : (
                <>
                  <button
                    onClick={handleRefreshToken}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-extrabold shadow-sm hover:bg-sky-700 transition"
                  >
                    <RefreshCcw className="w-4 h-4" />
                    Renovar token
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-red-200 text-red-600 text-sm font-extrabold shadow-sm hover:bg-red-50 transition"
                  >
                    <Unplug className="w-4 h-4" />
                    Desconectar
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Sync Card */}
        {isConnected && (
          <div className={cn(UI.card, "p-6")}>
            <h3 className="text-sm font-extrabold tracking-wide text-slate-900 flex items-center gap-2">
              <Download className="w-4 h-4 text-slate-400" />
              Sincronizar Pedidos
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Busca pedidos da Shopee via API e salva no sistema. Os pedidos existentes serão atualizados.
            </p>

            <div className="mt-4 flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  Período (últimos N dias)
                </label>
                <select
                  value={daysBack}
                  onChange={(e) => setDaysBack(Number(e.target.value))}
                  className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                >
                  <option value={7}>7 dias</option>
                  <option value={15}>15 dias</option>
                  <option value={30}>30 dias</option>
                  <option value={60}>60 dias</option>
                  <option value={90}>90 dias</option>
                </select>
              </div>

              <button
                onClick={handleSync}
                disabled={syncing}
                className={cn(
                  "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-extrabold shadow-sm transition",
                  syncing
                    ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                )}
              >
                {syncing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Sincronizar agora
                  </>
                )}
              </button>
            </div>

            {syncResult && (
              <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                {syncResult}
              </div>
            )}
          </div>
        )}

        {/* How it works */}
        <div className={cn(UI.card, "p-6")}>
          <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Como funciona</h3>
          <div className="mt-3 space-y-3">
            {[
              {
                step: "1",
                title: "Crie um app na Shopee Open Platform",
                desc: 'Acesse open.shopee.com, crie um app e obtenha o Partner ID e Partner Key.',
              },
              {
                step: "2",
                title: "Configure as credenciais acima",
                desc: "Cole o Partner ID e a Partner Key nos campos acima e salve.",
              },
              {
                step: "3",
                title: "Conecte sua loja",
                desc: "Clique em 'Conectar loja Shopee' para autorizar o acesso via OAuth.",
              },
              {
                step: "4",
                title: "Sincronize os pedidos",
                desc: "Use o botão de sincronizar para buscar pedidos diretamente da API da Shopee.",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center text-xs font-black">
                  {item.step}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">{item.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
