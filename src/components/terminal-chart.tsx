"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, ColorType, CandlestickSeries, HistogramSeries,
  type IChartApi, type ISeriesApi,
} from "lightweight-charts";
import { clsx } from "clsx";
import { MousePointer2, TrendingUp, Minus, Trash2 } from "lucide-react";

export interface Bar { time: string; open: number; high: number; low: number; close: number; volume?: number }
export interface Marker { time: number; position: "belowBar" | "aboveBar"; color: string; shape: "arrowUp" | "arrowDown"; text: string }
export interface Drawing { id: string; kind: "trend" | "hline"; a: { t: number; p: number }; b?: { t: number; p: number } }

interface Props {
  symbol: string;
  viewKey: string;
  bars: Bar[];
  markers: Marker[];
  avgCost: number | null;
  tpPrice: number | null;
  slPrice: number | null;
  onTpChange: (p: number) => void;
  onSlChange: (p: number) => void;
}

const GRID = "rgba(214,224,238,.05)";

export function TerminalChart({ symbol, viewKey, bars, markers, avgCost, tpPrice, slPrice, onTpChange, onSlChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const barsRef = useRef<Bar[]>([]);
  const [tool, setTool] = useState<"select" | "trend" | "hline">("select");
  const [drawings, setDrawings] = useState<Drawing[]>(() => loadDrawings(symbol));
  const [selId, setSelId] = useState<string | null>(null);
  const [legend, setLegend] = useState<{ o: number; h: number; l: number; c: number; v?: number } | null>(null);
  const [showLatest, setShowLatest] = useState(false);
  const pendingAnchor = useRef<{ t: number; p: number } | null>(null);
  const preview = useRef<{ t: number; p: number } | null>(null);
  const dragLine = useRef<"tp" | "sl" | null>(null);
  const lastKey = useRef<string | null>(null);
  const lastBars = useRef<Bar[] | null>(null);
  const avgLine = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]> | null>(null);
  const tpLine = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]> | null>(null);
  const slLine = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]> | null>(null);

  // persist drawings per symbol
  useEffect(() => { setDrawings(loadDrawings(symbol)); setSelId(null); pendingAnchor.current = null; }, [symbol]);
  useEffect(() => { try { localStorage.setItem(`vp-draw-${symbol}`, JSON.stringify(drawings)); } catch {} }, [drawings, symbol]);

  /* ---------- chart lifecycle ---------- */
  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      height: ref.current.clientHeight || 560,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#646e7e", fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, rightOffset: 4 },
      crosshair: { mode: 1, vertLine: { labelVisible: true }, horzLine: { labelVisible: true } },
    });
    const cs = chart.addSeries(CandlestickSeries, { upColor: "#3aa67f", downColor: "#e5484d", wickUpColor: "#3aa67f", wickDownColor: "#e5484d", borderVisible: false, priceLineVisible: true, lastValueVisible: true });
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.86, bottom: 0 }, visible: false });
    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.06, bottom: 0.22 } });
    cs.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.22 } });
    chartRef.current = chart; seriesRef.current = cs; volRef.current = vol;

    const onRange = () => {
      drawOverlay();
      const tl = chartRef.current?.timeScale();
      const list = barsRef.current;
      if (!tl || list.length < 2) return;
      const last = Math.floor(new Date(list[list.length - 1].time).getTime() / 1000);
      const r = tl.getVisibleRange();
      if (!r) return;
      setShowLatest((r.to as number) < last - 60);
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(onRange);
    chart.subscribeCrosshairMove((param) => {
      const d = param.seriesData.get(cs) as { open: number; high: number; low: number; close: number } | undefined;
      const vv = seriesRef.current && volRef.current ? param.seriesData.get(volRef.current) as { value: number } | undefined : undefined;
      if (d && typeof d.open === "number") setLegend({ o: d.open, h: d.high, l: d.low, c: d.close, v: typeof vv?.value === "number" ? vv.value : undefined });
      else setLegend(null);
      drawOverlay();
    });
    const el = ref.current;
    const ro = new ResizeObserver(() => {
      if (ref.current && chartRef.current) {
        chartRef.current.applyOptions({ width: ref.current.clientWidth, height: ref.current.clientHeight });
        sizeOverlay(); drawOverlay();
      }
    });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- data ---------- */
  useEffect(() => {
    const cs = seriesRef.current;
    if (!cs || !bars.length) return;
    const freshView = lastKey.current !== viewKey;
    const newBars = lastBars.current !== bars;
    const keepView = !freshView && lastKey.current !== null;
    const prevRange = keepView ? chartRef.current?.timeScale().getVisibleRange() ?? null : null;
    if (freshView && newBars) lastKey.current = viewKey;
    lastBars.current = bars;
    barsRef.current = bars;
    cs.setData(bars.map((b) => ({ ...b, time: Math.floor(new Date(b.time).getTime() / 1000) as never })));
    try { (cs as unknown as { setMarkers: (m: unknown[]) => void }).setMarkers(markers); } catch { /* noop */ }
    volRef.current?.setData(bars.map((b) => ({
      time: Math.floor(new Date(b.time).getTime() / 1000) as never,
      value: b.volume ?? 0,
      color: b.close >= b.open ? "rgba(58,166,127,.35)" : "rgba(229,72,77,.35)",
    })));
    for (const [lr, price, title, color] of [
      [avgLine, avgCost, avgCost != null ? `AVG ${avgCost.toFixed(2)}` : "", "#e8edf4"],
      [tpLine, tpPrice, tpPrice != null ? `TP ${tpPrice.toFixed(2)} · drag` : "", "#3aa67f"],
      [slLine, slPrice, slPrice != null ? `SL ${slPrice.toFixed(2)} · drag` : "", "#e5484d"],
    ] as const) {
      if (lr.current) { try { cs.removePriceLine(lr.current); } catch { /* noop */ } lr.current = null; }
      if (price != null) {
        lr.current = cs.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title });
      }
    }
    if (!keepView) chartRef.current?.timeScale().fitContent();
    else if (prevRange) chartRef.current?.timeScale().setVisibleRange(prevRange);
    drawOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, markers, avgCost, tpPrice, slPrice, viewKey]);

  /* ---------- overlay drawings ---------- */
  const sizeOverlay = useCallback(() => {
    const c = overlayRef.current;
    const host = ref.current;
    if (!c || !host) return;
    const r = host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.floor(r.width * dpr));
    c.height = Math.max(1, Math.floor(r.height * dpr));
    c.style.width = `${r.width}px`;
    c.style.height = `${r.height}px`;
  }, []);

  const drawOverlay = useCallback(() => {
    const c = overlayRef.current;
    const chart = chartRef.current;
    const cs = seriesRef.current;
    if (!c || !chart || !cs) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.width / dpr, h = c.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1.5;
    const tl = chart.timeScale();
    const X = (t: number) => tl.timeToCoordinate(t as never) as number | null;
    const Y = (p: number) => cs.priceToCoordinate(p);
    const drawSeg = (a: { t: number; p: number }, b: { t: number; p: number }, color: string, dashed = false) => {
      const x1 = X(a.t), y1 = Y(a.p), x2 = X(b.t), y2 = Y(b.p);
      if (x1 == null || y1 == null || x2 == null || y2 == null) return;
      ctx.strokeStyle = color;
      ctx.setLineDash(dashed ? [5, 4] : []);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      for (const [x, y] of [[x1, y1], [x2, y2]]) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
    };
    for (const d of drawingsRef.current) {
      const sel = d.id === selRef.current;
      const color = sel ? "#ffffff" : d.kind === "trend" ? "#e8edf4" : "#9da8b8";
      if (d.kind === "trend" && d.b) drawSeg(d.a, d.b, color);
      else if (d.kind === "hline") {
        const y = Y(d.a.p);
        if (y == null) continue;
        const r = tl.getVisibleRange();
        const t0 = r ? (r.from as number) : d.a.t - 86400;
        const t1 = r ? (r.to as number) : d.a.t + 86400;
        const x0 = X(t0) ?? 0, x1 = X(t1) ?? w;
        ctx.strokeStyle = color;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(Math.min(x0, x1), y); ctx.lineTo(Math.max(x0, x1), y); ctx.stroke();
        ctx.setLineDash([]);
        if (sel) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc((x0 + x1) / 2, y, 3, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    const pv = preview.current;
    const an = pendingAnchor.current;
    if (an && pv) drawSeg(an, pv, "rgba(232,237,244,.6)", true);
  }, []);
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;
  const selRef = useRef(selId);
  selRef.current = selId;

  const pointFromEvent = (e: React.MouseEvent) => {
    const chart = chartRef.current, cs = seriesRef.current;
    const host = ref.current;
    if (!chart || !cs || !host) return null;
    const r = host.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const t = chart.timeScale().coordinateToTime(x) as number | null;
    const p = cs.coordinateToPrice(y);
    if (t == null || p == null) return null;
    return { x, y, t, p };
  };

  const yFromEvent = (e: React.MouseEvent) => {
    const host = ref.current;
    if (!host) return null;
    return e.clientY - host.getBoundingClientRect().top;
  };

  const nearLineY = (y: number, kind: "tp" | "sl") => {
    const cs = seriesRef.current;
    const price = kind === "tp" ? tpRef.current : slRef.current;
    if (!cs || price == null) return false;
    const ly = cs.priceToCoordinate(price);
    return ly != null && Math.abs(ly - y) < 11;
  };

  const tpRef = useRef(tpPrice);
  tpRef.current = tpPrice;
  const slRef = useRef(slPrice);
  slRef.current = slPrice;

  useEffect(() => {
    if (!dragLine.current) chartRef.current?.applyOptions({ handleScroll: tool === "select", handleScale: tool === "select" });
    if (tool === "select") { pendingAnchor.current = null; preview.current = null; drawOverlay(); }
  }, [tool, drawOverlay]);

  useEffect(() => {
    (window as unknown as { __vpchart?: unknown }).__vpchart = {
      tpY: () => seriesRef.current?.priceToCoordinate(tpRef.current ?? NaN) ?? null,
      slY: () => seriesRef.current?.priceToCoordinate(slRef.current ?? NaN) ?? null,
      top: () => ref.current?.getBoundingClientRect().top ?? null,
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    // bracket lines first: Y-only hit test works even past the last bar
    const yy = yFromEvent(e);
    if (yy != null && nearLineY(yy, "tp")) { dragLine.current = "tp"; chartRef.current?.applyOptions({ handleScroll: false, handleScale: false }); return; }
    if (yy != null && nearLineY(yy, "sl")) { dragLine.current = "sl"; chartRef.current?.applyOptions({ handleScroll: false, handleScale: false }); return; }
    const pt = pointFromEvent(e);
    if (!pt) return;
    if (tool === "trend") {
      if (!pendingAnchor.current) pendingAnchor.current = { t: pt.t, p: pt.p };
      else {
        const a = pendingAnchor.current;
        pendingAnchor.current = null; preview.current = null;
        setDrawings((d) => [...d, { id: `d_${Date.now().toString(36)}`, kind: "trend", a, b: { t: pt.t, p: pt.p } }]);
      }
      return;
    }
    if (tool === "hline") {
      setDrawings((d) => [...d, { id: `d_${Date.now().toString(36)}`, kind: "hline", a: { t: pt.t, p: pt.p } }]);
      return;
    }
    // select tool: pick a drawing
    const hit = hitTest(pt.x, pt.y);
    setSelId(hit);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const yy = yFromEvent(e);
    if (dragLine.current && yy != null && seriesRef.current) {
      const p = seriesRef.current.coordinateToPrice(yy);
      if (p != null && p > 0) {
        if (dragLine.current === "tp") onTpChange(Number(p.toFixed(2)));
        else onSlChange(Number(p.toFixed(2)));
      }
      return;
    }
    const pt = pointFromEvent(e);
    if (pendingAnchor.current && pt && tool === "trend") {
      preview.current = { t: pt.t, p: pt.p };
      drawOverlay();
      return;
    }
    // hover cursor
    const host = ref.current;
    if (host && yy != null) host.style.cursor = nearLineY(yy, "tp") || nearLineY(yy, "sl") ? "ns-resize" : "";
  };

  const onMouseUp = () => {
    if (dragLine.current) {
      dragLine.current = null;
      chartRef.current?.applyOptions({ handleScroll: tool === "select", handleScale: tool === "select" });
    }
  };

  const hitTest = (x: number, y: number): string | null => {
    const chart = chartRef.current, cs = seriesRef.current;
    if (!chart || !cs) return null;
    const tl = chart.timeScale();
    const X = (t: number) => tl.timeToCoordinate(t as never) as number | null;
    const Y = (p: number) => cs.priceToCoordinate(p);
    for (let i = drawingsRef.current.length - 1; i >= 0; i--) {
      const d = drawingsRef.current[i];
      if (d.kind === "trend" && d.b) {
        const x1 = X(d.a.t), y1 = Y(d.a.p), x2 = X(d.b.t), y2 = Y(d.b.p);
        if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
        if (distToSeg(x, y, x1, y1, x2, y2) < 8) return d.id;
      } else if (d.kind === "hline") {
        const ly = Y(d.a.p);
        if (ly != null && Math.abs(ly - y) < 8) return d.id;
      }
    }
    return null;
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selId && document.activeElement?.tagName !== "INPUT") {
        setDrawings((d) => d.filter((x) => x.id !== selId));
        setSelId(null);
      }
      if (e.key === "Escape") { pendingAnchor.current = null; preview.current = null; setSelId(null); drawOverlay(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selId, drawOverlay]);

  const last = bars.length ? bars[bars.length - 1] : null;

  return (
    <div className="relative h-full w-full">
      {/* drawing toolbar */}
      <div className="absolute left-2 top-2 z-10 flex gap-1 rounded-md border border-white/10 bg-black/70 p-1 backdrop-blur">
        {([
          { id: "select", icon: MousePointer2, tip: "Select (Del removes)" },
          { id: "trend", icon: TrendingUp, tip: "Trend line: click two points" },
          { id: "hline", icon: Minus, tip: "Horizontal ray: click a price" },
        ] as const).map((t) => (
          <button key={t.id} title={t.tip} onClick={() => { setTool(t.id); pendingAnchor.current = null; }}
            className={clsx("rounded p-1.5", tool === t.id ? "bg-white/15 text-white" : "text-[#646e7e] hover:text-white")}>
            <t.icon className="h-3.5 w-3.5" />
          </button>
        ))}
        <button title="Clear all drawings" onClick={() => { setDrawings([]); setSelId(null); }} className="rounded p-1.5 text-[#646e7e] hover:text-[#f1999c]">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* OHLC legend */}
      <div className="pointer-events-none absolute left-2 top-11 z-10 font-mono text-[11px] text-[#9da8b8]">
        <span className="font-bold text-white">{symbol}</span>
        {legend ? (
          <span> O <b className="text-white">{legend.o.toFixed(2)}</b> H <b className="text-white">{legend.h.toFixed(2)}</b> L <b className="text-white">{legend.l.toFixed(2)}</b> C <b className={legend.c >= legend.o ? "text-[#3aa67f]" : "text-[#e5484d]"}>{legend.c.toFixed(2)}</b>{legend.v != null ? <span> Vol <b className="text-white">{legend.v >= 1e6 ? `${(legend.v / 1e6).toFixed(1)}M` : `${Math.round(legend.v / 1e3)}K`}</b></span> : null}</span>
        ) : last ? (
          <span> O <b className="text-white">{last.open.toFixed(2)}</b> H <b className="text-white">{last.high.toFixed(2)}</b> L <b className="text-white">{last.low.toFixed(2)}</b> C <b className={last.close >= last.open ? "text-[#3aa67f]" : "text-[#e5484d]"}>{last.close.toFixed(2)}</b></span>
        ) : null}
      </div>
      {showLatest && (
        <button onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
          className="absolute bottom-8 right-14 z-10 rounded-md border border-white/20 bg-black/80 px-2.5 py-1.5 font-mono text-[11px] font-bold text-white hover:bg-white/10">
          → Latest
        </button>
      )}
      <div
        ref={ref} className="h-full w-full"
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onDoubleClick={() => chartRef.current?.timeScale().fitContent()}
        title="Double-click to reset view"
      >
        {!bars.length && (
          <div className="grid h-full grid-rows-[1fr_auto] gap-2 p-6">
            <div className="vp-skeleton h-full min-h-[280px]" />
            <div className="flex gap-2"><div className="vp-skeleton h-8 w-24" /><div className="vp-skeleton h-8 w-24" /><div className="vp-skeleton h-8 w-24" /></div>
          </div>
        )}
      </div>
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute bottom-2 left-3 font-mono text-[10px] text-[#525c6c]">drag to pan · scroll to zoom · double-click resets</div>
    </div>
  );
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function loadDrawings(symbol: string): Drawing[] {
  try {
    const raw = localStorage.getItem(`vp-draw-${symbol}`);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((d) => d && d.a) : [];
  } catch { return []; }
}
