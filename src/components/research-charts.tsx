"use client";
import { useEffect, useRef } from "react";
import { createChart, ColorType, LineSeries } from "lightweight-charts";
import { clsx } from "clsx";

const PALETTE = ["#e8edf4", "#3aa67f", "#e5a13d", "#8b7ff0", "#e5484d", "#4cc3d9"];

function toTime(t: string): unknown {
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t;
  const ms = Date.parse(t);
  if (Number.isFinite(ms)) return Math.floor(ms / 1000) as unknown;
  return t as unknown;
}

export function MultiSeriesChart({ data, height = 280 }: {
  data: { series?: { name?: string; color?: string; points?: [string, number][] }[]; normalize?: boolean; ylabel?: string };
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const series = (data.series ?? []).filter((s) => Array.isArray(s.points) && s.points.length > 1).slice(0, 6);
  const normalized = series.map((s) => {
    const pts = s.points!;
    if (!data.normalize) return pts;
    const base = pts[0][1] || 1;
    return pts.map(([t, v]) => [t, (v / base) * 100] as [string, number]);
  });
  const last = series.map((s, i) => {
    const pts = normalized[i];
    const first = pts[0][1], end = pts[pts.length - 1][1];
    const chg = data.normalize ? end - 100 : ((end - first) / (Math.abs(first) || 1)) * 100;
    return { name: s.name ?? `s${i + 1}`, color: s.color ?? PALETTE[i % PALETTE.length], end, chg };
  });
  useEffect(() => {
    if (!ref.current || !series.length) return;
    const chart = createChart(ref.current, {
      height,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#646e7e", fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
      grid: { vertLines: { color: "rgba(214,224,238,.05)" }, horzLines: { color: "rgba(214,224,238,.05)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    });
    series.forEach((s, i) => {
      const line = chart.addSeries(LineSeries, { color: s.color ?? PALETTE[i % PALETTE.length], lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: true });
      line.setData(normalized[i].map(([t, v]) => ({ time: toTime(t) as never, value: v })));
    });
    chart.timeScale().fitContent();
    const el = ref.current;
    const ro = new ResizeObserver(() => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }); });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data), height]);
  if (!series.length) return <div className="text-[12px] text-[#525c6c]">No series data.</div>;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        {last.map((l) => (
          <span key={l.name} className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.color }} />
            <span className="font-bold text-white">{l.name}</span>
            <span className="text-[#9da8b8]">{l.end.toFixed(data.normalize ? 1 : 2)}</span>
            <span className={clsx(l.chg >= 0 ? "text-[#3aa67f]" : "text-[#e5484d]")}>{l.chg >= 0 ? "+" : ""}{l.chg.toFixed(1)}%</span>
          </span>
        ))}
      </div>
      <div ref={ref} className="w-full" />
    </div>
  );
}

export function RankedBars({ data }: {
  data: { items?: { label?: string; value?: number; sub?: string }[]; unit?: string };
}) {
  const items = [...(data.items ?? [])].filter((d) => d && typeof d.value === "number").sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 15);
  if (!items.length) return <div className="text-[12px] text-[#525c6c]">No bar data.</div>;
  const max = Math.max(...items.map((d) => Math.abs(d.value ?? 0))) || 1;
  const mixed = items.some((d) => (d.value ?? 0) < 0) && items.some((d) => (d.value ?? 0) > 0);
  return (
    <div className="space-y-1.5">
      {items.map((d, i) => {
        const v = d.value ?? 0;
        const w = Math.max(2, (Math.abs(v) / max) * 100);
        const color = mixed ? (v >= 0 ? "#3aa67f" : "#e5484d") : PALETTE[i % PALETTE.length];
        return (
          <div key={`${d.label}-${i}`} className="flex items-center gap-2.5">
            <span className="w-20 shrink-0 truncate text-right font-mono text-[11px] font-bold text-white">{d.label}</span>
            <div className="h-5 min-w-0 flex-1 rounded bg-white/[0.04]">
              <div className="flex h-full items-center justify-end rounded px-1.5 font-mono text-[10.5px] font-bold text-black" style={{ width: `${w}%`, background: color, minWidth: 44 }}>
                {v.toFixed(2)}{data.unit ?? ""}
              </div>
            </div>
            {d.sub && <span className="hidden w-28 shrink-0 truncate font-mono text-[10.5px] text-[#525c6c]">{d.sub}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function HistogramChart({ data, height = 240 }: {
  data: { bins?: string[]; series?: { name?: string; color?: string; bins?: string[]; counts?: number[] }[] };
  height?: number;
}) {
  const shared = Array.isArray(data.bins) ? data.bins : [];
  let series = (data.series ?? []).map((s) => ({ ...s, bins: Array.isArray(s.bins) && s.bins.length ? s.bins : shared }))
    .filter((s) => Array.isArray(s.bins) && Array.isArray(s.counts) && s.bins!.length === s.counts!.length && s.bins!.length > 0).slice(0, 3);
  if (!series.length && shared.length && Array.isArray((data as { counts?: unknown }).counts)) {
    const counts = (data as { counts: unknown }).counts as number[];
    if (counts.length === shared.length && counts.every((c) => typeof c === "number")) {
      series = [{ name: "distribution", bins: shared, counts }];
    }
  }
  if (!series.length) return <div className="text-[12px] text-[#525c6c]">No distribution data.</div>;
  const bins = series[0].bins!;
  const max = Math.max(...series.flatMap((s) => s.counts!)) || 1;
  const W = 560, H = height, padL = 8, padB = 22;
  const bw = (W - padL * 2) / bins.length;
  const gw = Math.min(26, bw * 0.8) / series.length;
  const totals = series.map((s) => (s.counts ?? []).reduce((a, b) => a + b, 0));
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color ?? PALETTE[i % PALETTE.length] }} />
            <span className="font-bold text-white">{s.name ?? `s${i + 1}`}</span>
            <span className="text-[#9da8b8]">n={totals[i]}</span>
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {bins.map((b, bi) => (
          <g key={bi}>
            {series.map((s, si) => {
              const c = s.counts![bi] ?? 0;
              const h = (c / max) * (H - padB - 12);
              return (
                <rect key={si} x={padL + bi * bw + (bw - gw * series.length) / 2 + si * gw} y={H - padB - h}
                  width={Math.max(1, gw - 1)} height={Math.max(0, h)} rx={1.5}
                  fill={s.color ?? PALETTE[si % PALETTE.length]} opacity={series.length > 1 ? 0.85 : 0.95}>
                  <title>{s.name}: {b} = {c}</title>
                </rect>
              );
            })}
            {bi % Math.ceil(bins.length / 8) === 0 && (
              <text x={padL + bi * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="#525c6c" fontFamily="ui-monospace, monospace">{b}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
