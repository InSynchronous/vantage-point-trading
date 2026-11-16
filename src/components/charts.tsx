"use client";
import { useEffect, useRef } from "react";
import { createChart, ColorType, IChartApi, AreaSeries, CandlestickSeries, LineSeries, createSeriesMarkers } from "lightweight-charts";

export function EquityChart({ data, height = 220 }: { data: { t: string; v: number }[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart: IChartApi = createChart(ref.current, {
      height,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#646e7e", fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
      grid: { vertLines: { color: "rgba(214,224,238,.05)" }, horzLines: { color: "rgba(214,224,238,.05)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    });
    const up = data.length > 1 && data[data.length - 1].v >= data[0].v;
    const line = up ? "#3aa67f" : "#e5484d";
    const series = chart.addSeries(AreaSeries, { lineColor: line, topColor: up ? "rgba(58,166,127,.22)" : "rgba(229,72,77,.20)", bottomColor: "rgba(58,166,127,0)", lineWidth: 2, priceFormat: { type: "price", precision: 0, minMove: 1 } });
    // lightweight-charts v5 strictly validates BusinessDay strings (yyyy-mm-dd).
    // Intraday "HH:MM" labels → map to ascending UTCTimestamps (5-min steps ending now).
    const nowSec = Math.floor(Date.now() / 1000);
    series.setData(data.map((d, i) => {
      let time: unknown = d.t;
      if (typeof time === "string" && !/^\d{4}-\d{2}-\d{2}/.test(time)) {
        time = (nowSec - (data.length - 1 - i) * 300) as unknown;
      }
      return { time: time as never, value: d.v };
    }));
    chart.timeScale().fitContent();
    const el = ref.current;
    const ro = new ResizeObserver(() => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }); });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); };
  }, [data, height]);
  return <div ref={ref} className="w-full" />;
}

type Bar = { time: string; open: number; high: number; low: number; close: number; volume?: number };

export function CandleChart({ symbol, seed = 7, height = 260, data }: { symbol: string; seed?: number; height?: number; data?: Bar[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let rows: any[];
    if (data && data.length) {
      // real daily bars: epoch seconds
      rows = data.map((b) => ({ ...b, time: Math.floor(new Date(b.time).getTime() / 1000) as any }));
    } else {
      let s = seed + symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      let p = 150 + (seed % 60);
      rows = [];
      const now = Math.floor(Date.now() / 1000);
      for (let i = 60; i >= 0; i--) {
        const o = p;
        const c = Math.max(1, p + (rnd() - 0.47) * 4);
        rows.push({ time: (now - i * 300) as any, open: o, high: Math.max(o, c) + rnd(), low: Math.min(o, c) - rnd(), close: c });
        p = c;
      }
    }
    const chart = createChart(ref.current, {
      height,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#646e7e", fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
      grid: { vertLines: { color: "rgba(214,224,238,.05)" }, horzLines: { color: "rgba(214,224,238,.05)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
    });
    const cs = chart.addSeries(CandlestickSeries, { upColor: "#3aa67f", downColor: "#e5484d", wickUpColor: "#3aa67f", wickDownColor: "#e5484d", borderVisible: false });
    cs.setData(rows);
    chart.timeScale().fitContent();
    const el = ref.current;
    const ro = new ResizeObserver(() => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }); });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); };
  }, [symbol, seed, height, data]);
  return <div ref={ref} className="w-full" />;
}

const PATH_PALETTE = ["#e8edf4", "#3aa67f", "#e5a13d", "#8b7ff0", "#e5484d", "#4cc3d9", "#e8edf4"];

export function PricePathsChart({ paths, trades, height = 300 }: {
  paths: Record<string, { date: string; close: number }[]>;
  trades: { ticker: string; side: "BUY" | "SELL"; price: number; ts: number; exitDate?: string; exitPrice?: number }[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const syms = Object.keys(paths).filter((s) => (paths[s] ?? []).length > 1).slice(0, 8);
  const key = JSON.stringify({ paths, trades: trades.map((t) => [t.ticker, t.side, t.price, t.ts, t.exitDate, t.exitPrice]) });
  const legend = syms.map((s) => {
    const rows = paths[s];
    const first = rows[0].close, last = rows[rows.length - 1].close;
    return { sym: s, last, chg: ((last - first) / (Math.abs(first) || 1)) * 100 };
  });
  useEffect(() => {
    if (!ref.current || !syms.length) return;
    const chart = createChart(ref.current, {
      height,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#646e7e", fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
      grid: { vertLines: { color: "rgba(214,224,238,.05)" }, horzLines: { color: "rgba(214,224,238,.05)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    });
    syms.forEach((s, i) => {
      const color = PATH_PALETTE[i % PATH_PALETTE.length];
      const series = chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: true });
      series.setData(paths[s].map((r) => ({ time: r.date as never, value: r.close })));
      const marks: { time: string; position: "aboveBar" | "belowBar" | "inBar"; color: string; shape: "arrowUp" | "arrowDown" | "circle"; text: string }[] = [];
      for (const t of trades.filter((x) => x.ticker === s)) {
        const d = new Date(t.ts).toISOString().slice(0, 10);
        marks.push({
          time: d,
          position: t.side === "BUY" ? "belowBar" : "aboveBar",
          color: t.side === "BUY" ? "#3aa67f" : "#e5484d",
          shape: t.side === "BUY" ? "arrowUp" : "arrowDown",
          text: `${t.side}`,
        });
        if (t.exitDate) {
          marks.push({ time: t.exitDate, position: "inBar", color: "#9da8b8", shape: "circle", text: "out" });
        }
      }
      marks.sort((a, b) => String(a.time).localeCompare(String(b.time)));
      if (marks.length) createSeriesMarkers(series, marks);
    });
    chart.timeScale().fitContent();
    const el = ref.current;
    const ro = new ResizeObserver(() => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }); });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, height]);
  if (!syms.length) return <div className="text-[12px] text-[#525c6c]">No price paths in this range.</div>;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        {legend.map((l, i) => (
          <span key={l.sym} className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: PATH_PALETTE[i % PATH_PALETTE.length] }} />
            <span className="font-bold text-white">{l.sym}</span>
            <span className="text-[#9da8b8]">${l.last.toFixed(2)}</span>
            <span className={l.chg >= 0 ? "text-[#3aa67f]" : "text-[#e5484d]"}>{l.chg >= 0 ? "+" : ""}{l.chg.toFixed(1)}%</span>
          </span>
        ))}
      </div>
      <div ref={ref} className="w-full" />
    </div>
  );
}

export function Spark({ values, w = 96, h = 28, up = true }: { values: number[]; w?: number; h?: number; up?: boolean }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 4) - 2}`).join(" ");
  const color = up ? "#3aa67f" : "#e5484d";
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
