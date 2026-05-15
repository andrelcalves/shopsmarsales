import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { BarChart3, Calendar, RefreshCcw, GitCompareArrows } from "lucide-react";

import { API_URL } from "./config";

type DayRow = {
  date: string;
  name: string;
  shopee: number;
  tiktok: number;
  trayAtacado: number;
  trayVarejo: number;
  tray: number;
  total: number;
  shopeeOrders: number;
  tiktokOrders: number;
  trayAtacadoOrders: number;
  trayVarejoOrders: number;
  trayOrders: number;
  totalOrders: number;
};

type PeriodMode = "month_full" | "month_mtd" | "custom";

const CHANNEL_IDS = ["shopee", "tiktok", "trayAtacado", "trayVarejo"] as const;
type ChannelId = (typeof CHANNEL_IDS)[number];

type PairRow = { current: DayRow; previous?: DayRow };

type DisplayRow = DayRow & {
  day: number;
  dayLabel: string;
  chartXLabel: string;
  previousRow?: DayRow;
  prevTotal?: number;
  prevShopee?: number;
  prevTiktok?: number;
  prevTrayAtacado?: number;
  prevTrayVarejo?: number;
  prevTray?: number;
  prevTotalOrders?: number;
  previousDate?: string;
};

function normalizeDayRow(r: Record<string, unknown>): DayRow {
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    date: String(r.date ?? ""),
    name: String(r.name ?? ""),
    shopee: n("shopee"),
    tiktok: n("tiktok"),
    trayAtacado: n("trayAtacado"),
    trayVarejo: n("trayVarejo"),
    tray: n("tray"),
    total: n("total"),
    shopeeOrders: n("shopeeOrders"),
    tiktokOrders: n("tiktokOrders"),
    trayAtacadoOrders: n("trayAtacadoOrders"),
    trayVarejoOrders: n("trayVarejoOrders"),
    trayOrders: n("trayOrders"),
    totalOrders: n("totalOrders"),
  };
}

const CHANNEL_COLORS: Record<ChannelId, string> = {
  shopee: "#FF6B35",
  tiktok: "#1F2937",
  trayAtacado: "#0369A1",
  trayVarejo: "#38BDF8",
};

const CHANNEL_LABELS: Record<ChannelId, string> = {
  shopee: "Shopee",
  tiktok: "TikTok",
  trayAtacado: "Tray Atacado",
  trayVarejo: "Tray Varejo",
};

const PREV_MONTH_COLOR = "#A855F7";

const UI = {
  bg: "bg-slate-50",
  card: "bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl",
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function formatMoney(val: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
}

function formatCompact(val: number) {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return `${val.toFixed(0)}`;
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayLocal(): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

function shiftMonthsYmd(ymd: string, delta: number): string {
  const d0 = parseYmd(ymd);
  if (!d0) return ymd;
  const day = d0.getDate();
  const nd = new Date(d0.getFullYear(), d0.getMonth() + delta, 1);
  const last = new Date(nd.getFullYear(), nd.getMonth() + 1, 0).getDate();
  nd.setDate(Math.min(day, last));
  return toYmd(nd);
}

function shiftYearsYmd(ymd: string, delta: number): string {
  const d0 = parseYmd(ymd);
  if (!d0) return ymd;
  const res = new Date(d0);
  res.setFullYear(res.getFullYear() + delta);
  return toYmd(res);
}

function formatShortDate(ymd: string): string {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatDelta(current: number, previous: number): { text: string; color: string } {
  if (previous === 0) return { text: "—", color: "text-slate-400" };
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return {
    text: `${sign}${pct.toFixed(1)}%`,
    color: pct >= 0 ? "text-emerald-400" : "text-red-400",
  };
}

function salesByDayUrl(start: string, end: string): string {
  return `${API_URL}/api/sales-by-day?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
}

function filterRow(row: DayRow, sel: ReadonlySet<ChannelId>): DayRow {
  const shopee = sel.has("shopee") ? row.shopee : 0;
  const tiktok = sel.has("tiktok") ? row.tiktok : 0;
  const trayAtacado = sel.has("trayAtacado") ? row.trayAtacado : 0;
  const trayVarejo = sel.has("trayVarejo") ? row.trayVarejo : 0;
  const shopeeOrders = sel.has("shopee") ? row.shopeeOrders : 0;
  const tiktokOrders = sel.has("tiktok") ? row.tiktokOrders : 0;
  const trayAtacadoOrders = sel.has("trayAtacado") ? row.trayAtacadoOrders : 0;
  const trayVarejoOrders = sel.has("trayVarejo") ? row.trayVarejoOrders : 0;
  const tray = trayAtacado + trayVarejo;
  const trayOrders = trayAtacadoOrders + trayVarejoOrders;
  const total = shopee + tiktok + trayAtacado + trayVarejo;
  const totalOrders = shopeeOrders + tiktokOrders + trayAtacadoOrders + trayVarejoOrders;
  return {
    ...row,
    shopee,
    tiktok,
    trayAtacado,
    trayVarejo,
    tray,
    total,
    totalOrders,
    shopeeOrders,
    tiktokOrders,
    trayAtacadoOrders,
    trayVarejoOrders,
    trayOrders,
  };
}

function mergeCalendar(rows: DayRow[], prevRows: DayRow[]): PairRow[] {
  const prevByDay = new Map<number, DayRow>();
  for (const r of prevRows) {
    const day = new Date(r.date + "T12:00:00").getDate();
    prevByDay.set(day, r);
  }
  return rows.map((current) => ({
    current,
    previous: prevByDay.get(new Date(current.date + "T12:00:00").getDate()),
  }));
}

function mergeByIndex(rows: DayRow[], prevRows: DayRow[]): PairRow[] {
  const a = [...rows].sort((x, y) => x.date.localeCompare(y.date));
  const b = [...prevRows].sort((x, y) => x.date.localeCompare(y.date));
  const out: PairRow[] = [];
  const paired = Math.min(a.length, b.length);
  for (let i = 0; i < paired; i++) out.push({ current: a[i], previous: b[i] });
  for (let i = paired; i < a.length; i++) out.push({ current: a[i], previous: undefined });
  return out;
}

function pairRowToDisplay(row: PairRow, periodMode: PeriodMode): DisplayRow {
  const cur = row.current;
  const prev = row.previous;
  const day = new Date(cur.date + "T12:00:00").getDate();
  const chartXLabel = periodMode === "custom" ? formatShortDate(cur.date) : String(day);
  return {
    ...cur,
    day,
    dayLabel: String(day),
    chartXLabel,
    previousRow: prev,
    prevTotal: prev?.total,
    prevShopee: prev?.shopee,
    prevTiktok: prev?.tiktok,
    prevTrayAtacado: prev?.trayAtacado,
    prevTrayVarejo: prev?.trayVarejo,
    prevTray: prev?.tray,
    prevTotalOrders: prev?.totalOrders,
    previousDate: prev?.date,
  };
}

export default function SalesByDayDashboard() {
  const [rows, setRows] = useState<DayRow[]>([]);
  const [prevRows, setPrevRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [compare, setCompare] = useState(true);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month_full");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [customStart, setCustomStart] = useState(() => toYmd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(() => toYmd(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)));
  const [compareCustomStart, setCompareCustomStart] = useState(() =>
    shiftMonthsYmd(toYmd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), -1)
  );
  const [compareCustomEnd, setCompareCustomEnd] = useState(() =>
    shiftMonthsYmd(toYmd(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)), -1)
  );

  const [selectedChannels, setSelectedChannels] = useState<Set<ChannelId>>(
    () => new Set([...CHANNEL_IDS])
  );

  const currentRange = useMemo((): { start: string; end: string } => {
    const [y, m] = month.split("-").map(Number);
    const monthIdx = m - 1;
    const first = new Date(y, monthIdx, 1);
    const last = new Date(y, monthIdx + 1, 0);
    const t = todayLocal();
    const isCurrentMonth = t.getFullYear() === y && t.getMonth() === monthIdx;

    if (periodMode === "custom") {
      const ds = parseYmd(customStart);
      const de = parseYmd(customEnd);
      if (ds && de && ds <= de) return { start: customStart, end: customEnd };
      return { start: toYmd(first), end: toYmd(last) };
    }

    if (periodMode === "month_mtd") {
      const endCur = isCurrentMonth ? t : last;
      return { start: toYmd(first), end: toYmd(endCur) };
    }

    return { start: toYmd(first), end: toYmd(last) };
  }, [periodMode, month, customStart, customEnd]);

  const compareRange = useMemo((): { start: string; end: string } | null => {
    if (!compare) return null;
    const [y, m] = month.split("-").map(Number);
    const monthIdx = m - 1;
    const lastCur = new Date(y, monthIdx + 1, 0);
    const t = todayLocal();
    const isCurrentMonth = t.getFullYear() === y && t.getMonth() === monthIdx;

    if (periodMode === "custom") {
      const ds = parseYmd(compareCustomStart);
      const de = parseYmd(compareCustomEnd);
      if (ds && de && ds <= de) return { start: compareCustomStart, end: compareCustomEnd };
      return null;
    }

    if (periodMode === "month_full") {
      const startPrev = new Date(y, monthIdx - 1, 1);
      const endPrev = new Date(y, monthIdx, 0);
      return { start: toYmd(startPrev), end: toYmd(endPrev) };
    }

    const endCur = isCurrentMonth ? t : lastCur;
    const lastDayPrevMonth = new Date(y, monthIdx, 0).getDate();
    const endDay = Math.min(endCur.getDate(), lastDayPrevMonth);
    const startPrev = new Date(y, monthIdx - 1, 1);
    const endPrev = new Date(y, monthIdx - 1, endDay);
    return { start: toYmd(startPrev), end: toYmd(endPrev) };
  }, [compare, periodMode, month, compareCustomStart, compareCustomEnd]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const cur = currentRange;
      const cmp = compareRange;
      const [res, prevRes] = await Promise.all([
        fetch(salesByDayUrl(cur.start, cur.end)),
        cmp ? fetch(salesByDayUrl(cmp.start, cmp.end)) : Promise.resolve(null),
      ]);
      const data = await res.json();
      setRows(Array.isArray(data) ? data.map((x: Record<string, unknown>) => normalizeDayRow(x)) : []);
      if (prevRes) {
        const prevData = await prevRes.json();
        setPrevRows(Array.isArray(prevData) ? prevData.map((x: Record<string, unknown>) => normalizeDayRow(x)) : []);
      } else {
        setPrevRows([]);
      }
    } catch (e) {
      console.error(e);
      setRows([]);
      setPrevRows([]);
    } finally {
      setLoading(false);
    }
  }, [currentRange, compareRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const mergedPairs: PairRow[] = useMemo(() => {
    if (!compare || prevRows.length === 0) {
      return rows.map((current) => ({ current, previous: undefined }));
    }
    return periodMode === "custom" ? mergeByIndex(rows, prevRows) : mergeCalendar(rows, prevRows);
  }, [rows, prevRows, compare, periodMode]);

  const displayRows: DisplayRow[] = useMemo(() => {
    return mergedPairs.map((p) => pairRowToDisplay(p, periodMode));
  }, [mergedPairs, periodMode]);

  const filteredRows: DisplayRow[] = useMemo(() => {
    return displayRows.map((r) => {
      const cur = filterRow(r, selectedChannels);
      const prevSource = r.previousRow;
      const prevF = prevSource ? filterRow(prevSource, selectedChannels) : undefined;
      return {
        ...cur,
        day: r.day,
        dayLabel: r.dayLabel,
        chartXLabel: r.chartXLabel,
        prevTotal: prevF?.total,
        prevShopee: prevF?.shopee,
        prevTiktok: prevF?.tiktok,
        prevTrayAtacado: prevF?.trayAtacado,
        prevTrayVarejo: prevF?.trayVarejo,
        prevTray: prevF?.tray,
        prevTotalOrders: prevF?.totalOrders,
        previousDate: r.previousDate,
        previousRow: undefined,
      };
    });
  }, [displayRows, selectedChannels]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => ({
        shopee: acc.shopee + r.shopee,
        tiktok: acc.tiktok + r.tiktok,
        trayAtacado: acc.trayAtacado + r.trayAtacado,
        trayVarejo: acc.trayVarejo + r.trayVarejo,
        tray: acc.tray + r.tray,
        total: acc.total + r.total,
        shopeeOrders: acc.shopeeOrders + (r.shopeeOrders ?? 0),
        tiktokOrders: acc.tiktokOrders + (r.tiktokOrders ?? 0),
        trayAtacadoOrders: acc.trayAtacadoOrders + (r.trayAtacadoOrders ?? 0),
        trayVarejoOrders: acc.trayVarejoOrders + (r.trayVarejoOrders ?? 0),
        trayOrders: acc.trayOrders + (r.trayOrders ?? 0),
        totalOrders: acc.totalOrders + (r.totalOrders ?? 0),
      }),
      {
        shopee: 0,
        tiktok: 0,
        trayAtacado: 0,
        trayVarejo: 0,
        tray: 0,
        total: 0,
        shopeeOrders: 0,
        tiktokOrders: 0,
        trayAtacadoOrders: 0,
        trayVarejoOrders: 0,
        trayOrders: 0,
        totalOrders: 0,
      }
    );
  }, [filteredRows]);

  const prevTotals = useMemo(() => {
    if (!compare || prevRows.length === 0) {
      return {
        shopee: 0,
        tiktok: 0,
        trayAtacado: 0,
        trayVarejo: 0,
        tray: 0,
        total: 0,
        shopeeOrders: 0,
        tiktokOrders: 0,
        trayAtacadoOrders: 0,
        trayVarejoOrders: 0,
        trayOrders: 0,
        totalOrders: 0,
      };
    }
    const prevFiltered = prevRows.map((row) => filterRow(row, selectedChannels));
    return prevFiltered.reduce(
      (acc, r) => ({
        shopee: acc.shopee + r.shopee,
        tiktok: acc.tiktok + r.tiktok,
        trayAtacado: acc.trayAtacado + r.trayAtacado,
        trayVarejo: acc.trayVarejo + r.trayVarejo,
        tray: acc.tray + r.tray,
        total: acc.total + r.total,
        shopeeOrders: acc.shopeeOrders + (r.shopeeOrders ?? 0),
        tiktokOrders: acc.tiktokOrders + (r.tiktokOrders ?? 0),
        trayAtacadoOrders: acc.trayAtacadoOrders + (r.trayAtacadoOrders ?? 0),
        trayVarejoOrders: acc.trayVarejoOrders + (r.trayVarejoOrders ?? 0),
        trayOrders: acc.trayOrders + (r.trayOrders ?? 0),
        totalOrders: acc.totalOrders + (r.totalOrders ?? 0),
      }),
      {
        shopee: 0,
        tiktok: 0,
        trayAtacado: 0,
        trayVarejo: 0,
        tray: 0,
        total: 0,
        shopeeOrders: 0,
        tiktokOrders: 0,
        trayAtacadoOrders: 0,
        trayVarejoOrders: 0,
        trayOrders: 0,
        totalOrders: 0,
      }
    );
  }, [compare, prevRows, selectedChannels]);

  const selectedCount = selectedChannels.size;
  const singleChannelMode = selectedCount === 1;

  const periodDescription =
    periodMode === "month_full"
      ? "Mês completo"
      : periodMode === "month_mtd"
        ? "Do 1º dia até hoje"
        : "Intervalo personalizado";

  const compareLineLabel = compareRange ? `${compareRange.start} → ${compareRange.end}` : "";

  const toggleChannel = (id: ChannelId) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return next;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllChannels = () => setSelectedChannels(new Set([...CHANNEL_IDS]));

  const applyBaselinePreset = (kind: "month" | "year") => {
    if (kind === "month") {
      setCompareCustomStart(shiftMonthsYmd(customStart, -1));
      setCompareCustomEnd(shiftMonthsYmd(customEnd, -1));
    } else {
      setCompareCustomStart(shiftYearsYmd(customStart, -1));
      setCompareCustomEnd(shiftYearsYmd(customEnd, -1));
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload as DisplayRow | undefined;

    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-3 text-xs min-w-[180px]">
        <div className="font-bold text-slate-900 mb-2">
          {periodMode === "custom" ? formatShortDate(row?.date ?? "") : `Dia ${row?.day}`}
          {row?.previousDate && compare ? (
            <span className="block text-[10px] font-normal text-slate-500">
              Anterior: {formatShortDate(row.previousDate)}
            </span>
          ) : null}
        </div>
        {payload
          .filter((p: any) => p.dataKey !== "prevTotal" && p.dataKey !== "total")
          .map((p: any) => (
            <div key={String(p.dataKey)} className="flex justify-between gap-4 py-0.5">
              <span style={{ color: p.color }}>{p.name}</span>
              <span className="font-semibold text-slate-900">{formatMoney(Number(p.value || 0))}</span>
            </div>
          ))}
        {compare && row ? (
          <div className="border-t border-slate-100 mt-1.5 pt-1.5 space-y-1">
            <div className="flex justify-between gap-4 py-0.5">
              <span className="font-bold" style={{ color: "#10B981" }}>
                Total período atual
              </span>
              <span className="font-bold text-slate-900">{formatMoney(row.total)}</span>
            </div>
            {row.prevTotal !== undefined && (
              <>
                <div className="flex justify-between gap-4 py-0.5">
                  <span className="font-bold" style={{ color: PREV_MONTH_COLOR }}>
                    Total período comp.
                  </span>
                  <span className="font-bold text-slate-900">{formatMoney(row.prevTotal)}</span>
                </div>
                {row.prevTotalOrders !== undefined && (
                  <div className="text-slate-500 text-right text-[10px]">{row.prevTotalOrders} pedidos comp.</div>
                )}
                <div className="flex justify-between gap-4 py-0.5 border-t border-slate-100 pt-1">
                  <span className="text-slate-600">Variação</span>
                  <span className={cn("font-bold", formatDelta(row.total, row.prevTotal).color)}>
                    {formatDelta(row.total, row.prevTotal).text}
                  </span>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const cardItems = useMemo(() => {
    const base: { label: string; value: number; orders: number; prev: number; channel?: ChannelId }[] = [
      { label: "Total", value: totals.total, orders: totals.totalOrders, prev: prevTotals.total },
    ];
    for (const id of CHANNEL_IDS) {
      if (!selectedChannels.has(id)) continue;
      base.push({
        label: CHANNEL_LABELS[id],
        value: totals[id],
        orders: totals[`${id}Orders` as keyof typeof totals] as number,
        prev: prevTotals[id],
        channel: id,
      });
    }
    return base;
  }, [totals, prevTotals, selectedChannels]);

  const xAxisKey = compare ? (periodMode === "custom" ? "chartXLabel" : "dayLabel") : periodMode === "custom" ? "chartXLabel" : "name";

  return (
    <div className={cn(UI.bg, "min-h-screen")}>
      <div className="bg-gradient-to-r from-sky-700 via-blue-700 to-indigo-700">
        <div className="max-w-7xl mx-auto px-6 py-7 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
            <div className="shrink-0 lg:max-w-[min(100%,280px)]">
              <div className="flex items-center gap-2 opacity-95">
                <BarChart3 className="w-5 h-5" />
                <span className="text-sm font-semibold tracking-wide">VENDAS POR DIA</span>
              </div>
              <h1 className="mt-2 text-2xl sm:text-3xl md:text-4xl font-black tracking-tight leading-tight">
                Vendas diárias por canal
              </h1>
              <p className="mt-1 text-white/80 text-sm leading-snug">
                Shopee + TikTok + Tray • {periodDescription}
                {compare && compareRange ? ` • vs ${compareLineLabel}` : ""}
              </p>
            </div>

            <div className="flex-1 min-w-0">
              <div className="rounded-2xl bg-white/10 border border-white/15 p-3 sm:p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 lg:gap-4">
                  <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCompare((v) => !v)}
                      className={cn(
                        "inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-extrabold transition border",
                        compare
                          ? "bg-purple-500/20 border-purple-400/40 text-white shadow-md shadow-purple-500/10"
                          : "bg-white/10 border-white/15 text-white/80 hover:bg-white/15"
                      )}
                    >
                      <GitCompareArrows className="w-4 h-4 shrink-0" />
                      {compare ? "Comparação ligada" : "Comparar período"}
                    </button>
                    <button
                      type="button"
                      onClick={fetchData}
                      className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-white text-slate-900 text-sm font-extrabold shadow-sm hover:opacity-95 transition"
                    >
                      <RefreshCcw className="w-4 h-4 shrink-0" />
                      Atualizar
                    </button>
                  </div>

                  <div className="lg:col-span-3 flex flex-col gap-1 min-w-0">
                    <label className="text-[10px] font-bold text-white/70 uppercase tracking-wide">Período</label>
                    <select
                      value={periodMode}
                      onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}
                      className="w-full rounded-lg bg-white/15 border border-white/20 text-white text-sm font-bold px-2 py-2 outline-none"
                    >
                      <option value="month_full" className="text-slate-900">
                        Mês completo
                      </option>
                      <option value="month_mtd" className="text-slate-900">
                        Do 1º até hoje
                      </option>
                      <option value="custom" className="text-slate-900">
                        Personalizado
                      </option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 lg:col-span-5 min-w-0">
                    {periodMode !== "custom" && (
                      <div className="flex flex-col gap-1 h-full">
                        <span className="text-[10px] font-bold uppercase text-white/70 tracking-wide">Mês referência</span>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/15 min-h-[42px]">
                          <Calendar className="w-4 h-4 text-white/90 shrink-0" />
                          <input
                            type="month"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="flex-1 min-w-0 bg-transparent text-white font-bold text-sm outline-none border-none [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                          />
                        </div>
                      </div>
                    )}
                    {periodMode === "custom" && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase text-white/70 tracking-wide">Datas</span>
                        <div className="flex flex-wrap items-end gap-2 sm:gap-3 text-sm">
                          <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                            <span className="text-[10px] font-bold uppercase text-white/70">De</span>
                            <input
                              type="date"
                              value={customStart}
                              onChange={(e) => setCustomStart(e.target.value)}
                              className="w-full rounded-lg bg-white/15 border border-white/20 text-white px-2 py-2 font-bold"
                            />
                          </div>
                          <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                            <span className="text-[10px] font-bold uppercase text-white/70">Até</span>
                            <input
                              type="date"
                              value={customEnd}
                              onChange={(e) => setCustomEnd(e.target.value)}
                              className="w-full rounded-lg bg-white/15 border border-white/20 text-white px-2 py-2 font-bold"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {periodMode === "custom" && compare && (
                  <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
                    <div className="text-xs font-bold text-white/90">Período de comparação</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => applyBaselinePreset("month")}
                        className="text-xs font-bold px-2 py-1 rounded-lg bg-white/15 hover:bg-white/25"
                      >
                        −1 mês
                      </button>
                      <button
                        type="button"
                        onClick={() => applyBaselinePreset("year")}
                        className="text-xs font-bold px-2 py-1 rounded-lg bg-white/15 hover:bg-white/25"
                      >
                        −1 ano
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="date"
                        value={compareCustomStart}
                        onChange={(e) => setCompareCustomStart(e.target.value)}
                        className="rounded-lg bg-white/15 border border-white/20 text-white px-2 py-1.5 text-xs font-bold min-w-0 flex-1 sm:flex-none"
                      />
                      <input
                        type="date"
                        value={compareCustomEnd}
                        onChange={(e) => setCompareCustomEnd(e.target.value)}
                        className="rounded-lg bg-white/15 border border-white/20 text-white px-2 py-1.5 text-xs font-bold min-w-0 flex-1 sm:flex-none"
                      />
                    </div>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-white/15">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold uppercase text-white/80">Canais no gráfico</span>
                    <button
                      type="button"
                      onClick={selectAllChannels}
                      className="text-[10px] font-bold underline text-white/80 hover:text-white"
                    >
                      Todos
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {CHANNEL_IDS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleChannel(id)}
                        className={cn(
                          "text-xs font-bold px-2.5 py-1.5 rounded-lg border transition",
                          selectedChannels.has(id)
                            ? "bg-white text-slate-900 border-white"
                            : "bg-white/5 text-white/60 border-white/20 line-through"
                        )}
                      >
                        {CHANNEL_LABELS[id]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className={cn(
              "mt-5 grid gap-3",
              cardItems.length <= 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
            )}
          >
            {cardItems.map((card) => {
              const delta = compare ? formatDelta(card.value, card.prev) : null;
              return (
                <div key={card.label} className="rounded-xl bg-white/10 border border-white/15 px-4 py-3">
                  <div className="text-xs text-white/80 font-semibold">{card.label}</div>
                  <div className="text-lg font-black">{formatMoney(card.value)}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-white/70">{card.orders} pedidos</span>
                    {delta && <span className={cn("text-xs font-bold", delta.color)}>{delta.text}</span>}
                  </div>
                  {compare && (
                    <div className="text-[10px] text-white/50 mt-0.5">Anterior: {formatMoney(card.prev)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="px-6 pt-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Gráfico de vendas por dia</h3>
              <p className="mt-1 text-xs text-slate-500">
                {compare
                  ? `Barras: canais selecionados • Linha verde: total filtrado • Roxo tracejado: comparação`
                  : "Valores por dia e canal (filtrado)"}
              </p>
            </div>
            {compare && (
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-6 h-0.5 rounded" style={{ backgroundColor: "#10B981" }} />
                  <span>Total atual</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-6 h-0.5 rounded" style={{ borderTop: "2px dashed #A855F7" }} />
                  <span>Total comparação</span>
                </div>
              </div>
            )}
          </div>
          <div className="p-6">
            {loading ? (
              <div className="h-80 flex items-center justify-center text-slate-500">Carregando...</div>
            ) : filteredRows.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-slate-500">Nenhuma venda neste período.</div>
            ) : selectedCount === 0 ? (
              <div className="h-80 flex items-center justify-center text-slate-500">Selecione ao menos um canal.</div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={filteredRows} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      dataKey={xAxisKey}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748B", fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748B", fontSize: 12 }}
                      tickFormatter={(v) => formatCompact(Number(v))}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      content={() => {
                        const items: { label: string; color: string; type: "square" | "line"; dash?: boolean }[] = [];
                        for (const id of CHANNEL_IDS) {
                          if (!selectedChannels.has(id)) continue;
                          items.push({
                            label: CHANNEL_LABELS[id],
                            color: CHANNEL_COLORS[id],
                            type: "square",
                          });
                        }
                        if (compare) {
                          items.push({ label: "Total atual", color: "#10B981", type: "line" });
                          items.push({ label: "Total comparação", color: PREV_MONTH_COLOR, type: "line", dash: true });
                        }
                        return (
                          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 pt-2">
                            {items.map((it) => (
                              <div key={it.label} className="flex items-center gap-1.5">
                                {it.type === "square" ? (
                                  <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: it.color }} />
                                ) : (
                                  <span
                                    className="inline-block w-5 h-0.5 rounded"
                                    style={
                                      it.dash ? { borderTop: `2px dashed ${it.color}` } : { backgroundColor: it.color }
                                    }
                                  />
                                )}
                                <span className="text-xs font-semibold text-slate-700">{it.label}</span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                    {selectedChannels.has("shopee") && (
                      <Bar
                        dataKey="shopee"
                        name="Shopee"
                        stackId={singleChannelMode ? undefined : "a"}
                        fill={CHANNEL_COLORS.shopee}
                        radius={[0, 0, 0, 0]}
                      />
                    )}
                    {selectedChannels.has("tiktok") && (
                      <Bar
                        dataKey="tiktok"
                        name="TikTok"
                        stackId={singleChannelMode ? undefined : "a"}
                        fill={CHANNEL_COLORS.tiktok}
                        radius={[0, 0, 0, 0]}
                      />
                    )}
                    {selectedChannels.has("trayAtacado") && (
                      <Bar
                        dataKey="trayAtacado"
                        name="Tray Atacado"
                        stackId={singleChannelMode ? undefined : "a"}
                        fill={CHANNEL_COLORS.trayAtacado}
                        radius={[0, 0, 0, 0]}
                      />
                    )}
                    {selectedChannels.has("trayVarejo") && (
                      <Bar
                        dataKey="trayVarejo"
                        name="Tray Varejo"
                        stackId={singleChannelMode ? undefined : "a"}
                        fill={CHANNEL_COLORS.trayVarejo}
                        radius={singleChannelMode ? [4, 4, 4, 4] : [4, 4, 0, 0]}
                      />
                    )}
                    <Line
                      dataKey="total"
                      name="Total atual"
                      type="monotone"
                      stroke="#10B981"
                      strokeWidth={compare ? 2.5 : 0}
                      dot={compare ? { r: 3, fill: "#10B981", strokeWidth: 0 } : false}
                      activeDot={compare ? { r: 5, fill: "#10B981", strokeWidth: 2, stroke: "#fff" } : false}
                      legendType="none"
                    />
                    <Line
                      dataKey="prevTotal"
                      name="Total comparação"
                      type="monotone"
                      stroke={PREV_MONTH_COLOR}
                      strokeWidth={compare ? 2.5 : 0}
                      strokeDasharray="6 3"
                      dot={compare ? { r: 3, fill: PREV_MONTH_COLOR, strokeWidth: 0 } : false}
                      activeDot={compare ? { r: 5, fill: PREV_MONTH_COLOR, strokeWidth: 2, stroke: "#fff" } : false}
                      legendType="none"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className={cn(UI.card, "overflow-hidden")}>
          <div className="px-6 pt-6">
            <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Tabela por dia</h3>
            <p className="mt-1 text-xs text-slate-500">
              {compare ? "Período atual com comparação (canais selecionados)" : "Detalhamento por canal filtrado"}
            </p>
          </div>
          <div className="p-6 overflow-auto">
            {loading ? (
              <div className="text-slate-500 py-8">Carregando...</div>
            ) : filteredRows.length === 0 ? (
              <div className="text-slate-500 py-8">Nenhuma venda neste período.</div>
            ) : selectedCount === 0 ? (
              <div className="text-slate-500 py-8">Selecione ao menos um canal.</div>
            ) : (
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 border-b border-slate-200">
                    <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                      <th className="px-4 py-3">{periodMode === "custom" ? "Data" : "Dia"}</th>
                      {selectedChannels.has("shopee") && (
                        <th className="px-4 py-3 text-right">Shopee</th>
                      )}
                      {selectedChannels.has("tiktok") && (
                        <th className="px-4 py-3 text-right">TikTok</th>
                      )}
                      {selectedChannels.has("trayAtacado") && (
                        <th className="px-4 py-3 text-right">Tray Atac.</th>
                      )}
                      {selectedChannels.has("trayVarejo") && (
                        <th className="px-4 py-3 text-right">Tray Var.</th>
                      )}
                      <th className="px-4 py-3 text-right">Total</th>
                      {compare && (
                        <>
                          <th className="px-4 py-3 text-right text-purple-600">Total comp.</th>
                          <th className="px-4 py-3 text-right">Variação</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((r) => {
                      const delta =
                        compare && r.prevTotal !== undefined ? formatDelta(r.total, r.prevTotal) : null;
                      return (
                        <tr key={r.date} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                            {periodMode === "custom" ? formatShortDate(r.date) : r.day}
                          </td>
                          {selectedChannels.has("shopee") && (
                            <td className="px-4 py-3 text-right text-slate-700">
                              <span className="block">{formatMoney(r.shopee)}</span>
                              <span className="text-xs text-slate-500">{r.shopeeOrders ?? 0} pedidos</span>
                            </td>
                          )}
                          {selectedChannels.has("tiktok") && (
                            <td className="px-4 py-3 text-right text-slate-700">
                              <span className="block">{formatMoney(r.tiktok)}</span>
                              <span className="text-xs text-slate-500">{r.tiktokOrders ?? 0} pedidos</span>
                            </td>
                          )}
                          {selectedChannels.has("trayAtacado") && (
                            <td className="px-4 py-3 text-right text-slate-700">
                              <span className="block">{formatMoney(r.trayAtacado)}</span>
                              <span className="text-xs text-slate-500">{r.trayAtacadoOrders ?? 0} pedidos</span>
                            </td>
                          )}
                          {selectedChannels.has("trayVarejo") && (
                            <td className="px-4 py-3 text-right text-slate-700">
                              <span className="block">{formatMoney(r.trayVarejo)}</span>
                              <span className="text-xs text-slate-500">{r.trayVarejoOrders ?? 0} pedidos</span>
                            </td>
                          )}
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
                            <span className="block">{formatMoney(r.total)}</span>
                            <span className="text-xs font-normal text-slate-500">{r.totalOrders ?? 0} pedidos</span>
                          </td>
                          {compare && (
                            <>
                              <td className="px-4 py-3 text-right text-purple-700">
                                <span className="block">{r.prevTotal !== undefined ? formatMoney(r.prevTotal) : "—"}</span>
                                {r.prevTotalOrders !== undefined && (
                                  <span className="text-xs text-purple-400">{r.prevTotalOrders} pedidos</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {delta && (
                                  <span
                                    className={cn(
                                      "font-bold text-sm",
                                      delta.color
                                        .replace("text-emerald-400", "text-emerald-600")
                                        .replace("text-red-400", "text-red-600")
                                    )}
                                  >
                                    {delta.text}
                                  </span>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
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
