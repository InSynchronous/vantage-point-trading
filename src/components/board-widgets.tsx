"use client";
import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw, Settings2 } from "lucide-react";
import { clsx } from "clsx";
import { useBoards, type BoardWidget, type WidgetConfig, type WidgetType } from "@/lib/boards";
import { parseTickers, fetchDailyBars, correlationMatrix, monthlyReturns, histogramBins, logReturns } from "@/lib/market-data";
import { MultiSeriesChart, RankedBars, HistogramChart } from "@/components/research-charts";
import { CandleChart } from "@/components/charts";
import { Surface3D } from "@/components/surface-3d";

export const WIDGET_DEFS: { type: WidgetType; label: string; blurb: string }[] = [
  { type: "surface", label: "3D Surface", blurb: "Correlation or monthly-return terrain. Height + color = value." },
  { type: "prices", label: "Price Paths", blurb: "Overlaid closes, optionally rebased to 100." },
  { type: "candles", label: "Candles", blurb: "Daily OHLCV chart for one ticker." },
  { type: "momentum", label: "Momentum Rank", blurb: "Ranked N-day returns across the universe." },
  { type: "dist", label: "Return Mix", blurb: "Daily-return histograms, up to 3 tickers." },
  { type: "stats", label: "Account Tiles", blurb: "Equity, cash, buying power, open positions." },
];

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true); setError(null);
    fn().then((d) => { if (live) { setData(d); setLoading(false); } })
      .catch((e) => { if (live) { setError(e?.message ?? "load failed"); setLoading(false); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}

function WidgetShell({ title, sub, settings, onReload, loading, children }: {
  title: string; sub?: string; settings?: ReactNode; onReload?: () => void; loading?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-white">{title}</div>
          {sub && <div className="truncate font-mono text-[10.5px] text-[#525c6c]">{sub}</div>}
        </div>
        {settings && (
          <button onClick={() => setOpen(!open)} className={clsx("rounded p-1.5 hover:bg-white/[0.06]", open ? "text-white" : "text-[#646e7e]")} title="Widget settings">
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        )}
        {onReload && (
          <button onClick={onReload} className={clsx("rounded p-1.5 text-[#646e7e] hover:bg-white/[0.06] hover:text-white", loading && "animate-spin")} title="Reload data">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && settings && (
        <div className="mb-2.5 flex flex-wrap items-end gap-2 rounded-md border border-white/[0.07] bg-black/30 p-2.5">
          {settings}
        </div>
      )}
      {children}
    </div>
  );
}

function Status({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <div className="grid h-40 place-items-center font-mono text-[12px] text-[#525c6c]">loading market data…</div>;
  if (error) return <div className="rounded-md border border-[#e5484d]/25 bg-[#e5484d]/10 px-3 py-2.5 text-[12.5px] text-[#f1999c]">{error}</div>;
  return null;
}

function TickersInput({ value, onChange, single }: { value: string; onChange: (v: string) => void; single?: boolean }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="vp-label">Tickers{single ? " (first used)" : ""}</span>
      <input value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} spellCheck={false}
        className="vp-input mt-1 font-mono !text-[12px]" placeholder="NVDA, AMD, AVGO" />
    </label>
  );
}

function NumInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="block"><span className="vp-label">{label}</span>
      <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value) || value)} className="vp-input mt-1 w-24 font-mono !text-[12px]" />
    </label>
  );
}

function SurfaceWidget({ config, onConfig }: { config: WidgetConfig; onConfig: (p: Partial<WidgetConfig>) => void }) {
  const syms = parseTickers(config.tickers);
  const dataset = config.dataset ?? "correlation";
  const days = config.days ?? 252;
  const months = config.months ?? 8;
  const { data, error, loading, reload } = useAsync(async () => {
    if (dataset === "correlation") return { kind: "corr" as const, c: await correlationMatrix(syms, days) };
    const m = await monthlyReturns(syms, months);
    return { kind: "monthly" as const, m };
  }, [config.tickers, dataset, days, months]);
  return (
    <WidgetShell
      title={dataset === "correlation" ? "Correlation terrain" : "Monthly returns terrain"}
      sub={`${syms.length} symbols · ${dataset === "correlation" ? `${days}d · height + color = r` : `${months} months · height + color = %`}`}
      onReload={reload} loading={loading}
      settings={<>
        <TickersInput value={config.tickers} onChange={(v) => onConfig({ tickers: v })} />
        <label className="block"><span className="vp-label">Dataset</span>
          <select value={dataset} onChange={(e) => onConfig({ dataset: e.target.value as WidgetConfig["dataset"] })} className="vp-input mt-1 !text-[12px]">
            <option value="correlation">Correlation</option>
            <option value="monthly">Monthly returns</option>
          </select>
        </label>
        {dataset === "correlation"
          ? <NumInput label="Window (d)" value={days} min={20} max={750} onChange={(v) => onConfig({ days: v })} />
          : <NumInput label="Months" value={months} min={3} max={24} onChange={(v) => onConfig({ months: v })} />}
      </>}
    >
      {loading || error ? <Status loading={loading} error={error} /> : data?.kind === "corr" ? (
        <Surface3D rows={data.c.tickers} cols={data.c.tickers} values={data.c.matrix} height={360} />
      ) : data ? (
        <Surface3D rows={data.m.tickers} cols={data.m.labels} values={data.m.matrix} unit="%" height={360} />
      ) : null}
    </WidgetShell>
  );
}

function PricesWidget({ config, onConfig }: { config: WidgetConfig; onConfig: (p: Partial<WidgetConfig>) => void }) {
  const syms = parseTickers(config.tickers);
  const days = config.days ?? 180;
  const { data, error, loading, reload } = useAsync(async () => {
    const series = await Promise.all(syms.map(async (t) => {
      const bars = await fetchDailyBars(t, days);
      return { name: t, points: bars.map((b) => [b.date, b.close] as [string, number]) };
    }));
    return series.filter((s) => s.points.length > 1);
  }, [config.tickers, days, config.normalize]);
  return (
    <WidgetShell title={`Price paths${config.normalize ? " (rebased)" : ""}`} sub={`${syms.join(" · ")} · ${days}d`} onReload={reload} loading={loading}
      settings={<>
        <TickersInput value={config.tickers} onChange={(v) => onConfig({ tickers: v })} />
        <NumInput label="Window (d)" value={days} min={20} max={750} onChange={(v) => onConfig({ days: v })} />
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-[12px] text-[#9da8b8]">
          <input type="checkbox" checked={!!config.normalize} onChange={(e) => onConfig({ normalize: e.target.checked })} className="accent-white" /> Rebase to 100
        </label>
      </>}>
      {loading || error ? <Status loading={loading} error={error} /> : <MultiSeriesChart data={{ series: data ?? [], normalize: !!config.normalize }} height={260} />}
    </WidgetShell>
  );
}

function CandlesWidget({ config, onConfig }: { config: WidgetConfig; onConfig: (p: Partial<WidgetConfig>) => void }) {
  const sym = parseTickers(config.tickers)[0] ?? "NVDA";
  const days = Math.min(config.days ?? 90, 180);
  const { data, error, loading, reload } = useAsync(async () => {
    const bars = await fetchDailyBars(sym, days);
    return bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close }));
  }, [config.tickers, days]);
  return (
    <WidgetShell title={`${sym} daily`} sub={`${data?.length ?? 0} bars`} onReload={reload} loading={loading}
      settings={<>
        <TickersInput value={config.tickers} onChange={(v) => onConfig({ tickers: v })} single />
        <NumInput label="Window (d)" value={days} min={20} max={180} onChange={(v) => onConfig({ days: v })} />
      </>}>
      {loading || error ? <Status loading={loading} error={error} /> : <CandleChart symbol={sym} height={260} data={data ?? []} />}
    </WidgetShell>
  );
}

function MomentumWidget({ config, onConfig }: { config: WidgetConfig; onConfig: (p: Partial<WidgetConfig>) => void }) {
  const syms = parseTickers(config.tickers);
  const days = config.days ?? 63;
  const { data, error, loading, reload } = useAsync(async () => {
    const rows = await Promise.all(syms.map(async (t) => {
      try {
        const bars = await fetchDailyBars(t, days + 5);
        if (bars.length < 5) return null;
        const first = bars[0].close, last = bars[bars.length - 1].close;
        return { label: t, value: Math.round(((last - first) / first) * 10000) / 100, sub: `$${last.toFixed(2)}` };
      } catch { return null; }
    }));
    return rows.filter((r): r is NonNullable<typeof r> => r != null);
  }, [config.tickers, days]);
  return (
    <WidgetShell title={`${days}-day momentum rank`} sub={syms.join(" · ")} onReload={reload} loading={loading}
      settings={<>
        <TickersInput value={config.tickers} onChange={(v) => onConfig({ tickers: v })} />
        <NumInput label="Window (d)" value={days} min={5} max={750} onChange={(v) => onConfig({ days: v })} />
      </>}>
      {loading || error ? <Status loading={loading} error={error} /> : <RankedBars data={{ items: data ?? [], unit: "%" }} />}
    </WidgetShell>
  );
}

function DistWidget({ config, onConfig }: { config: WidgetConfig; onConfig: (p: Partial<WidgetConfig>) => void }) {
  const syms = parseTickers(config.tickers).slice(0, 3);
  const days = config.days ?? 504;
  const { data, error, loading, reload } = useAsync(async () => {
    const series = await Promise.all(syms.map(async (t) => {
      const bars = await fetchDailyBars(t, days);
      const rets = logReturns(bars.map((b) => b.close));
      const h = histogramBins(rets, 16);
      return { name: `${t} (n=${rets.length})`, bins: h.bins, counts: h.counts };
    }));
    return series.filter((s) => s.counts.length > 0);
  }, [config.tickers, days]);
  return (
    <WidgetShell title="Daily return mix" sub={`${syms.join(" vs ") || "none"} · ${days}d`} onReload={reload} loading={loading}
      settings={<>
        <TickersInput value={config.tickers} onChange={(v) => onConfig({ tickers: v })} />
        <NumInput label="Window (d)" value={days} min={60} max={750} onChange={(v) => onConfig({ days: v })} />
      </>}>
      {loading || error ? <Status loading={loading} error={error} /> : <HistogramChart data={{ series: data ?? [] }} height={220} />}
    </WidgetShell>
  );
}

function StatsWidget() {
  const { data, error, loading, reload } = useAsync(async () => {
    const acct = await fetch("/api/alpaca/account", { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error("account unavailable");
      return r.json() as Promise<{ equity: number; cash: number; buyingPower: number }>;
    });
    const pos = await fetch("/api/alpaca/positions", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => []) as Array<Record<string, string>>;
    const list = (Array.isArray(pos) ? pos : []).map((p) => ({
      sym: String(p.symbol ?? "?"),
      qty: Number(p.qty ?? 0),
      value: Number(p.market_value ?? 0),
      upl: Number(p.unrealized_pl ?? 0),
      uplPct: Number(p.unrealized_plpc ?? 0) * 100,
    })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    return { acct, list };
  }, []);
  const tiles = data ? [
    { label: "Equity", value: `$${Number(data.acct.equity ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
    { label: "Cash", value: `$${Number(data.acct.cash ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
    { label: "Buying power", value: `$${Number(data.acct.buyingPower ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
    { label: "Open positions", value: String(data.list.length) },
  ] : [];
  return (
    <WidgetShell title="Account" sub="live paper account" onReload={reload} loading={loading}>
      {loading || error ? <Status loading={loading} error={error} /> : (
        <div>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-lg border border-white/[0.07] bg-black/30 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#525c6c]">{t.label}</div>
                <div className="mt-1 font-mono text-[17px] font-bold text-white">{t.value}</div>
              </div>
            ))}
          </div>
          {data!.list.length > 0 && (
            <div className="mt-2 space-y-1">
              {data!.list.slice(0, 6).map((p) => (
                <div key={p.sym} className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 font-mono text-[11.5px]">
                  <span className="font-bold text-white">{p.sym}</span>
                  <span className="text-[#9da8b8]">{p.qty}× ${p.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                  <span className={clsx("ml-auto font-bold", p.upl >= 0 ? "text-[#3aa67f]" : "text-[#e5484d]")}>{p.upl >= 0 ? "+" : ""}${Math.round(p.upl).toLocaleString()} ({p.uplPct.toFixed(1)}%)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </WidgetShell>
  );
}

export function BoardWidgetView({ widget, boardId }: { widget: BoardWidget; boardId: string }) {
  const setConfig = useBoards((s) => s.setConfig);
  const onConfig = (patch: Partial<WidgetConfig>) => setConfig(boardId, widget.id, patch);
  switch (widget.type) {
    case "surface": return <SurfaceWidget config={widget.config} onConfig={onConfig} />;
    case "prices": return <PricesWidget config={widget.config} onConfig={onConfig} />;
    case "candles": return <CandlesWidget config={widget.config} onConfig={onConfig} />;
    case "momentum": return <MomentumWidget config={widget.config} onConfig={onConfig} />;
    case "dist": return <DistWidget config={widget.config} onConfig={onConfig} />;
    case "stats": return <StatsWidget />;
  }
}
