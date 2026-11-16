"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Play, X, FlaskConical, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";

export interface BuiltGraph {
  name: string;
  description: string;
  nodes: { type: string; label: string; config: Record<string, unknown> }[];
  edges: { from: number; to: number; fromPort: string; toPort: string }[];
  warnings: string[];
}

const EXAMPLES = [
  "Pairs trade Coca-Cola and Pepsi on z-score extremes",
  "Breaking news momentum: news to AI sentiment to confidence gate to paper trade",
  "Fed announcement analyzer that trades SPY on hawkish or dovish statements",
];

export function AIBuilderPanel({ onBuild }: {
  onBuild: (graph: BuiltGraph) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BuiltGraph | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (preview && previewRef.current && scrollRef.current) {
      const box = previewRef.current.getBoundingClientRect();
      const parent = scrollRef.current.getBoundingClientRect();
      if (box.bottom > parent.bottom || box.top < parent.top) {
        previewRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [preview]);

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true); setError(null); setPreview(null);
    try {
      const r = await fetch("/api/ai/build", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error ?? "Build failed");
      setPreview(j as BuiltGraph);
    } catch (e: any) {
      setError(e.message ?? "Build failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.07] p-4 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-white" />
          <div className="text-[14px] font-bold text-white">AI protocol builder</div>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-[#9da8b8]">Describe the strategy. The model drafts the nodes, wiring, and config. Everything is validated before it touches your canvas.</p>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate(); }}
          placeholder="e.g. Pairs trade Coca-Cola and Pepsi on z-score extremes…"
          rows={3} className="vp-input min-h-[76px] resize-y text-[13px]" />
        {!preview && (
          <button onClick={generate} disabled={busy || !prompt.trim()} className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-md bg-[#e8edf4] py-2.5 text-[13px] font-bold text-black hover:bg-white disabled:opacity-50">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Designing protocol…</> : <><Sparkles className="h-4 w-4" /> Generate protocol</>}
          </button>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => setPrompt(ex)} className="rounded-full border border-white/10 px-2.5 py-1 text-left text-[11.5px] text-[#9da8b8] hover:border-white/25 hover:text-white">
              {ex.length > 52 ? ex.slice(0, 52) + "…" : ex}
            </button>
          ))}
        </div>
        {error && <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#e5484d]/25 bg-[#e5484d]/10 px-3 py-2 text-[12.5px] text-[#f1999c]"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
        {created && !preview && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#3aa67f]/25 bg-[#3aa67f]/[0.06] px-3 py-2 text-[12.5px] text-[#7fcfae]"><CheckCircle2 className="h-4 w-4 shrink-0" />Created “{created}” on your canvas. Select any node to tune it.</div>
        )}
        {preview && (
          <div ref={previewRef} className="mt-3 rounded-lg border border-[#3aa67f]/25 bg-[#3aa67f]/[0.06] p-3">
            <div className="flex items-center gap-2 text-[13px] font-bold text-white"><CheckCircle2 className="h-4 w-4 text-[#3aa67f]" />{preview.name}</div>
            <div className="mt-0.5 text-[12px] text-[#9da8b8]">{preview.description}</div>
            <div className="mt-2 font-mono text-[11.5px] text-[#c7cfda]">{preview.nodes.length} nodes · {preview.edges.length} wires</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {preview.nodes.map((n, i) => <span key={i} className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10.5px] text-white">{n.label}</span>)}
            </div>
            {preview.warnings.length > 0 && (
              <div className="mt-2 space-y-1">
                {preview.warnings.slice(0, 4).map((w, i) => <div key={i} className="text-[11.5px] text-[#f1999c]">Dropped: {w}</div>)}
              </div>
            )}
            <div className="mt-3">
              <button onClick={() => { onBuild(preview); setCreated(preview.name); setPreview(null); setPrompt(""); }} className="w-full rounded-md bg-[#e8edf4] py-2.5 text-[13px] font-bold text-black hover:bg-white">Add to canvas</button>
            </div>
          </div>
        )}
        <div className="mt-3 border-t border-white/[0.07] pt-2 text-[11.5px] leading-relaxed text-[#525c6c]">
          Tip: click any node to inspect and tune it, or press <span className="rounded border border-white/15 bg-white/[0.05] px-1 font-mono text-[10.5px] text-white">⌘K</span> to add nodes by hand.
        </div>
      </div>
    </div>
  );
}

export interface TestScenario {
  headline: string;
  body: string;
  tickers: string[];
  prices: Record<string, string>;
}

export function TestDialog({ onClose, onRun, graph }: {
  onClose: () => void;
  onRun: (story: { headline: string; body: string; tickers: string[] }, opts: { prices: Record<string, number>; gateOverride: number | null; pairEntryOverride: number | null }) => void;
  graph: { hasNews: boolean; pairs: { legA: string; legB: string; entryZ: number; lookback: number }[] };
}) {
  const [brief, setBrief] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [tickers, setTickers] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scored, setScored] = useState<{ confidence: number; sentiment: string } | null>(null);
  const [scoring, setScoring] = useState(false);
  const [autoTune, setAutoTune] = useState(true);
  const [pairZ, setPairZ] = useState<Record<string, number | null>>({});
  const [synthZ, setSynthZ] = useState<Record<string, number | null>>({});
  const [pairTune, setPairTune] = useState(true);
  const [shocks, setShocks] = useState<Record<string, number> | null>(null);
  const [zLoading, setZLoading] = useState(false);

  const pairKey = (legA: string, legB: string) => `${legA}/${legB}`;

  const computeZFor = useCallback(async (legs: { legA: string; legB: string; lookback: number }[], lastOverrides?: Record<string, number>) => {
    const out: Record<string, number | null> = {};
    await Promise.all(legs.map(async ({ legA, legB, lookback }) => {
      try {
        const lb = Math.max(20, Math.min(250, Math.floor(lookback || 60)));
        const start = new Date(Date.now() - (lb + 10) * 864e5).toISOString();
        const [ra, rb] = await Promise.all([legA, legB].map(async (s) => {
          const r = await fetch(`/api/alpaca/bars?symbol=${encodeURIComponent(s)}&timeframe=1Day&limit=${lb + 10}&start=${encodeURIComponent(start)}`);
          const j = await r.json();
          return ((j.bars ?? []) as { time: string; close: number }[]).map((b) => b.close).filter((c) => c > 0).slice(-lb);
        }));
        const oA = lastOverrides?.[legA];
        const oB = lastOverrides?.[legB];
        if (oA != null && oA > 0 && ra.length) ra[ra.length - 1] = oA;
        if (oB != null && oB > 0 && rb.length) rb[rb.length - 1] = oB;
        if (ra.length < 20 || rb.length < 20) { out[pairKey(legA, legB)] = null; return; }
        const n = Math.min(ra.length, rb.length);
        const a = ra.slice(-n), b = rb.slice(-n);
        const s = a.map((v, i) => Math.log(v) - Math.log(b[i]));
        const mean = s.reduce((x, y) => x + y, 0) / n;
        const sd = Math.sqrt(s.reduce((x, y) => x + (y - mean) ** 2, 0) / n) || 1e-9;
        out[pairKey(legA, legB)] = (s[n - 1] - mean) / sd;
      } catch { out[pairKey(legA, legB)] = null; }
    }));
    return out;
  }, []);

  const computeZ = useCallback(async (legs: { legA: string; legB: string; lookback: number }[]) => {
    if (!legs.length) return;
    setZLoading(true);
    setPairZ(await computeZFor(legs));
    setZLoading(false);
  }, [computeZFor]);

  useEffect(() => { computeZ(graph.pairs); }, [graph.pairs, computeZ]);

  // preview how the seeded (shocked) prices move the spread, debounced after edits
  useEffect(() => {
    if (!graph.pairs.length) { setSynthZ({}); return; }
    const t = setTimeout(async () => {
      const ov: Record<string, number> = {};
      for (const p of graph.pairs) {
        for (const leg of [p.legA, p.legB]) {
          const n = Number(prices[leg]);
          if (Number.isFinite(n) && n > 0) ov[leg] = n;
        }
      }
      if (!Object.keys(ov).length) { setSynthZ({}); return; }
      setSynthZ(await computeZFor(graph.pairs, ov));
    }, 600);
    return () => clearTimeout(t);
  }, [prices, graph.pairs, computeZFor]);

  const fillPrices = async (syms: string[]) => {
    const out: Record<string, string> = {};
    try {
      const r = await fetch(`/api/alpaca/snapshots?symbols=${encodeURIComponent(syms.join(","))}`);
      const j = await r.json();
      for (const s of (Array.isArray(j) ? j : []) as { symbol: string; price: number | null }[]) {
        if (s.price) out[s.symbol] = String(s.price);
      }
    } catch { /* leave blank */ }
    setPrices(out);
    return out;
  };

  const analyze = useCallback(async (h: string, b: string, syms: string[]) => {
    if (!h.trim() || syms.length === 0) { setScored(null); return; }
    setScoring(true);
    try {
      const r = await fetch("/api/ai/analyze?strict=1", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headline: h, body: b, tickersHint: syms.join(",") }),
      });
      const j = await r.json();
      if (r.ok && typeof j.confidence === "number") setScored({ confidence: j.confidence, sentiment: String(j.sentiment ?? "neutral") });
      else setScored(null);
    } catch { setScored(null); }
    finally { setScoring(false); }
  }, []);

  const generate = async () => {
    setBusy(true); setError(null); setScored(null); setShocks(null);
    try {
      const legs = !graph.hasNews && graph.pairs.length
        ? [graph.pairs[0].legA, graph.pairs[0].legB]
        : undefined;
      const r = await fetch("/api/ai/scenario", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, legs, hasNews: graph.hasNews }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error ?? "Generation failed");
      setHeadline(j.headline);
      setBody(j.body);
      const syms: string[] = j.tickers ?? [];
      setTickers(syms.join(", "));
      const live = await fillPrices(syms);
      const sh = (j.shocks ?? null) as Record<string, number> | null;
      if (sh && legs) {
        const shocked: Record<string, string> = { ...live };
        for (const leg of legs) {
          const pct = Number(sh[leg]);
          const base = Number(live[leg]);
          if (Number.isFinite(pct) && pct !== 0 && Number.isFinite(base) && base > 0) {
            shocked[leg] = (base * (1 + pct / 100)).toFixed(2);
          }
        }
        setPrices(shocked);
        setShocks(sh);
      }
      await analyze(j.headline, j.body, syms);
    } catch (e: any) {
      setError(e.message ?? "Generation failed");
    } finally { setBusy(false); }
  };

  const run = () => {
    const syms = tickers.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (graph.hasNews && (!headline.trim() || syms.length === 0)) { setError("Need a headline and at least one ticker."); return; }
    const px: Record<string, number> = {};
    for (const s of syms) {
      const n = Number(prices[s]);
      if (Number.isFinite(n) && n > 0) px[s] = n;
    }
    const gate = autoTune ? 0 : null;
    let pairEntry: number | null = null;
    if (pairTune && graph.pairs.length > 0) {
      pairEntry = 0;
    }
    onRun(
      { headline: headline.trim() || "[TEST] synthetic session", body: body.trim(), tickers: syms },
      { prices: px, gateOverride: gate, pairEntryOverride: pairEntry }
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[86vh] w-[520px] max-w-full overflow-y-auto rounded-xl border border-white/10 bg-[#0c121c] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-white" />
          <div className="text-[15px] font-bold text-white">Test mode <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">SYNTHETIC</span></div>
          <button onClick={onClose} className="ml-auto rounded p-1 text-[#646e7e] hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[#9da8b8]">AI invents a fake headline. Your protocol runs it step by step with paper-safe hypothetical fills. Nothing touches the market.</p>
        {!graph.hasNews && (
          <div className="mt-2.5 rounded-md border border-white/[0.07] bg-black/30 px-3 py-2 text-[12px] leading-relaxed text-[#c7cfda]">
            This graph has no news input, so the story is narrative only. Live prices{graph.pairs.length > 0 ? " and spread math" : ""} drive the run.
          </div>
        )}
        {graph.pairs.length > 0 && (
          <div className="mt-2.5 rounded-md border border-white/[0.07] bg-black/30 px-3 py-2 text-[12px] text-[#c7cfda]">
            <div className="flex items-center justify-between">
              <span className="vp-label">Pairs spread right now</span>
              <button onClick={() => computeZ(graph.pairs)} className="font-mono text-[11px] text-white underline decoration-white/25 underline-offset-4" title="Re-read live bars">refresh</button>
            </div>
            <div className="mt-1.5 space-y-1.5">
              {shocks && graph.pairs.length > 0 && (
                <div className="rounded bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-[#7fcfae]">
                  Synthetic split: {Object.entries(shocks).map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}%`).join(" · ")} (baked into seeded prices)
                </div>
              )}
              {graph.pairs.map((p) => {
                const z = pairZ[pairKey(p.legA, p.legB)];
                const szRaw = synthZ[pairKey(p.legA, p.legB)];
                const sz = szRaw != null && Number.isFinite(szRaw) ? szRaw : null;
                const synthTxt = sz != null && (z == null || Math.abs(sz - z) > 0.05)
                  ? ` → synthetic z=${sz >= 0 ? "+" : ""}${sz.toFixed(2)}`
                  : "";
                return (
                  <div key={pairKey(p.legA, p.legB)}>
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono font-bold text-white">{p.legA}/{p.legB}</span>
                      <span className="font-mono text-[11.5px] text-[#9da8b8]">{zLoading ? "reading…" : z == null && !synthTxt ? "no data" : `live z=${z == null ? "n/a" : `${z >= 0 ? "+" : ""}${z.toFixed(2)}`}${synthTxt} (entry ±${p.entryZ})`}</span>
                    </div>
                    <label className="mt-1 flex cursor-pointer items-center gap-2 text-[12px] text-[#9da8b8]">
                      <input type="checkbox" checked={pairTune} onChange={(e) => setPairTune(e.target.checked)} className="accent-white" />
                      Open entry to 0.00 so this test trades
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <label className="mt-3 block"><span className="vp-label">Scenario brief (optional)</span>
          <input value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={!graph.hasNews && graph.pairs.length > 0 ? `e.g. ${graph.pairs[0].legA} beats, ${graph.pairs[0].legB} warns` : "e.g. NVDA blows out earnings"} className="vp-input mt-1" />
        </label>
        {!graph.hasNews && graph.pairs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[`${graph.pairs[0].legA} beats, ${graph.pairs[0].legB} warns on costs`, `${graph.pairs[0].legB} recall, ${graph.pairs[0].legA} gains share`, "Input-cost squeeze splits the pair"].map((ex) => (
              <button key={ex} onClick={() => setBrief(ex)} className="rounded-full border border-white/10 px-2.5 py-1 text-left text-[11.5px] text-[#9da8b8] hover:border-white/25 hover:text-white">
                {ex.length > 44 ? ex.slice(0, 44) + "…" : ex}
              </button>
            ))}
          </div>
        )}
        <button onClick={generate} disabled={busy} className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-md border border-white/15 py-2 text-[13px] font-bold text-white hover:bg-white/[0.06] disabled:opacity-50">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Inventing story…</> : <><Sparkles className="h-4 w-4" /> {!graph.hasNews && graph.pairs.length > 0 ? "Generate split story" : "Generate fake story"}</>}
        </button>
        {error && <div className="mt-2.5 rounded-md border border-[#e5484d]/25 bg-[#e5484d]/10 px-3 py-2 text-[12.5px] text-[#f1999c]">{error}</div>}
        {(scoring || scored) && (
          <div className="mt-2.5 rounded-md border border-white/[0.07] bg-black/30 px-3 py-2 text-[12px] text-[#c7cfda]">
            {scoring ? "Scoring this story…" : <>AI scored it <b className="font-mono text-white">{scored!.confidence.toFixed(2)}</b> ({scored!.sentiment}).</>}
            {!scoring && scored && (
              <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[12px] text-[#9da8b8]">
                <input type="checkbox" checked={autoTune} onChange={(e) => setAutoTune(e.target.checked)} className="accent-white" />
                Open the confidence gate to 0.00 so this story trades
              </label>
            )}
            {scoring === false && scored === null && (
              <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[12px] text-[#9da8b8]">
                <input type="checkbox" checked={autoTune} onChange={(e) => setAutoTune(e.target.checked)} className="accent-white" />
                Open the confidence gate to 0.00 so this test trades
              </label>
            )}
          </div>
        )}
        <label className="mt-3 block"><span className="vp-label">Headline</span>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} onBlur={() => analyze(headline, body, tickers.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))} className="vp-input mt-1 font-mono text-[12px]" />
        </label>
        <label className="mt-2.5 block"><span className="vp-label">Body</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} onBlur={() => analyze(headline, body, tickers.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))} rows={3} className="vp-input mt-1 min-h-[72px] resize-y font-mono text-[12px]" />
        </label>
        <label className="mt-2.5 block"><span className="vp-label">Tickers (comma separated)</span>
          <input value={tickers} onChange={(e) => setTickers(e.target.value.toUpperCase())} onBlur={() => fillPrices(tickers.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))} className="vp-input mt-1 font-mono" />
        </label>
        <div className="mt-2.5">
          <span className="vp-label">Seeded prices (edit to play what-if)</span>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {tickers.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).map((t) => (
              <label key={t} className="block">
                <span className="font-mono text-[10.5px] font-bold text-white">{t}</span>
                <input value={prices[t] ?? ""} onChange={(e) => setPrices((p) => ({ ...p, [t]: e.target.value }))} placeholder="live" inputMode="decimal" className="vp-input mt-0.5 font-mono" />
              </label>
            ))}
          </div>
        </div>
        <button onClick={run} className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[#e8edf4] py-2.5 text-[13.5px] font-bold text-black hover:bg-white">
          <Play className="h-4 w-4" /> Walk through step by step
        </button>
      </div>
    </div>
  );
}

