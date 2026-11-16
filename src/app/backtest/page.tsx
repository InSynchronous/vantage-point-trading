"use client";
import { useEffect, useRef, useState } from "react";
import { useBuilder } from "@/lib/store";
import { useBacktests, isValidSavedRun } from "@/lib/backtests";
import { runHistoricalBacktest, type BacktestParams, type BacktestResult } from "@/lib/engine";
import { EquityChart, PricePathsChart } from "@/components/charts";
import { fmtMoney, fmtPct } from "@/lib/mock-data";
import { FlaskConical, Play, Info } from "lucide-react";
import { clsx } from "clsx";

export const dynamic = "force-dynamic";

function isoNDaysAgo(n: number) {
  return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
}

// Validated demo stack. Do not retune casually: 60d news replay is green
// across independent runs at gate 0.65 + 5% stop / 4% take-profit / 5d hold.
// Reset buttons and the initializer below all reference this single source.
const DEFAULT_BACKTEST_PARAMS = {
  from: isoNDaysAgo(59), to: isoNDaysAgo(0), capital: 100000, feeBps: 5, slippageBps: 8, delayBars: 1,
  gateOverride: undefined as number | undefined,
  pairEntryOverride: undefined as number | undefined,
  stopPct: 0.05, takeProfitPct: 0.04, maxHoldDays: 5,
};

export default function BacktestPage() {
  const protocols = useBuilder((s) => s.protocols);
  const activeId = useBuilder((s) => s.activeId);
  const [pid, setPid] = useState(activeId ?? protocols[0]?.id);
  const [params, setParams] = useState<BacktestParams & { gateOverride: number | undefined; pairEntryOverride: number | undefined }>({
    ...DEFAULT_BACKTEST_PARAMS,
  });
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useBacktests((s) => s.hydrated);
  const saveRun = useBacktests((s) => s.saveRun);

  const protocol = protocols.find((p) => p.id === pid) ?? protocols[0];
  const hasNews = protocol.nodes.some((n) => ["newsFeed", "rssFeed", "secFilings"].includes(n.type));
  const pairsNode = protocol.nodes.find((n) => n.type === "pairsSpread");
  const hasPairs = !!pairsNode;
  const pairDefault = hasPairs ? Number(((pairsNode!.data.config as Record<string, any>).entryZ ?? 2)) : 2;
  const tickers = [...new Set(
    protocol.nodes.filter((n) => ["newsFeed", "rssFeed", "secFilings"].includes(n.type)).flatMap((n) =>
      String((n.data.config as Record<string, any>).tickers ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))
  )];
  const universe = tickers.length ? tickers : [...new Set(protocol.nodes.flatMap((n) => {
    if (n.type !== "pairsSpread") return [];
    const c = n.data.config as Record<string, any>;
    return [String(c.legA ?? "").trim().toUpperCase(), String(c.legB ?? "").trim().toUpperCase()].filter(Boolean);
  }))];
  const tradables = universe.length ? universe : ["SPY"];

  const set = (k: keyof BacktestParams | "gateOverride" | "pairEntryOverride", v: number | string) => {
    setParams((p) => ({ ...p, [k]: v }));
    setResult(null);
  };

  const run = async () => {
    setRunning(true); setError(null); setResult(null);
    setProgress({ done: 0, total: 1, label: "loading history" });
    try {
      const r = await runHistoricalBacktest(protocol, params, (done, total, label) => setProgress({ done, total, label }));
      setResult(r);
      saveRun(pid ?? protocol.id, params, r);
    } catch (e: any) {
      setError(e?.message ?? "Replay failed");
    } finally {
      setRunning(false); setProgress(null);
    }
  };

  // Restore the last completed run for the selected protocol (survives reloads
  // and navigation), then auto-manage the date range for the graph kind.
  // The selected protocol id itself is restored, falling back to the
  // workspace active protocol when the saved one no longer exists.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (!hydrated) return;
    const store = useBacktests.getState();
    if (!didInitRef.current) {
      didInitRef.current = true;
      const savedPid = store.lastPid && protocols.some((p) => p.id === store.lastPid) ? store.lastPid : null;
      if (savedPid && savedPid !== pid) { setPid(savedPid); return; }
    }
    let id = pid;
    if (!id || !protocols.some((p) => p.id === id)) {
      id = activeId ?? protocols[0]?.id;
    }
    if (id !== pid) { setPid(id); return; }
    if (!id) { setResult(null); return; }
    store.setLastPid(id);
    const saved = store.runs[id];
    if (saved && isValidSavedRun(saved)) {
      setParams({ ...saved.params });
      setResult(saved.result);
      return;
    }
    setResult(null);
    const sel = protocols.find((p) => p.id === id) ?? protocols[0];
    if (!sel) return;
    const news = sel.nodes.some((n) => ["newsFeed", "rssFeed", "secFilings"].includes(n.type));
    const pairs = sel.nodes.some((n) => n.type === "pairsSpread");
    // Auto-adjust the range to the selected graph: pairs widen to 90d for
    // spread math; news clamps back to the 60d replay cap.
    if (!news && pairs) {
      setParams((p) => {
        const spanDays = Math.round((Date.parse(p.to) - Date.parse(p.from)) / 864e5);
        if (spanDays >= 80) return p;
        return { ...p, from: isoNDaysAgo(90), pairEntryOverride: undefined };
      });
    } else if (news) {
      setParams((p) => {
        const spanDays = Math.round((Date.parse(p.to) - Date.parse(p.from)) / 864e5);
        if (spanDays <= 60) return p;
        return { ...p, from: isoNDaysAgo(59) };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, hydrated]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-extrabold text-white"><FlaskConical className="h-5 w-5" /> Backtesting</h1>
          <p className="mt-1 max-w-[70ch] text-[13px] text-[#9da8b8]">
            Replays this protocol day by day through {hasNews ? "archived Alpaca headlines, historical closes, and live AI reads" : "historical closes with live spread math"}.
            Fills are hypothetical and marked to market. {hasNews ? "News protocols cap at 60 days" : "Price-only graphs run up to 2 years"}.
          </p>
        </div>
        <button onClick={run} disabled={running} className="flex items-center gap-2 rounded-md bg-[#e8edf4] px-4 py-2 text-[13px] font-bold text-black hover:bg-white disabled:opacity-50">
          <Play className="h-4 w-4" /> {running ? "Replaying…" : "Run replay"}
        </button>
      </div>

      {progress && (
        <div className="vp-card p-4">
          <div className="flex justify-between font-mono text-[11.5px] text-[#9da8b8]"><span>Replaying {progress.label}</span><span>{progress.done}/{progress.total}</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-[#e8edf4] transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}
      {error && <div className="rounded-md border border-[#e5484d]/25 bg-[#e5484d]/10 px-4 py-3 text-[13px] text-[#f1999c]">{error}</div>}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[300px_1fr]">
        <div className="vp-card space-y-3.5 p-5">
          <div>
            <div className="vp-label mb-1.5">Protocol</div>
            <select value={pid} onChange={(e) => setPid(e.target.value)} className="vp-input">
              {protocols.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.nodes.length} nodes)</option>)}
            </select>
          </div>
          <div className="rounded-md border border-white/[0.07] bg-black/30 p-3">
            <div className="vp-label mb-1.5">{hasNews ? "News universe (from graph)" : "Pair legs (from graph)"}</div>
            <div className="flex flex-wrap gap-1.5">
              {tradables.map((t) => <span key={t} className="rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[11.5px] font-bold text-white">{t}</span>)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block"><span className="vp-label">From</span><input type="date" value={params.from} onChange={(e) => set("from", e.target.value)} className="vp-input mt-1 font-mono" /></label>
            <label className="block"><span className="vp-label">To</span><input type="date" value={params.to} onChange={(e) => set("to", e.target.value)} className="vp-input mt-1 font-mono" /></label>
          </div>
          <label className="block"><span className="vp-label">Starting capital ($)</span><input type="number" value={params.capital} onChange={(e) => set("capital", Number(e.target.value))} className="vp-input mt-1 font-mono" /></label>
          <label className="block"><span className="vp-label">Fee (bps): {params.feeBps}</span><input type="range" min={0} max={20} value={params.feeBps} onChange={(e) => set("feeBps", Number(e.target.value))} className="mt-1 w-full accent-white" /></label>
          <label className="block"><span className="vp-label">Slippage (bps): {params.slippageBps}</span><input type="range" min={0} max={30} value={params.slippageBps} onChange={(e) => set("slippageBps", Number(e.target.value))} className="mt-1 w-full accent-white" /></label>
          <div>
            <div className="flex items-baseline justify-between"><span className="vp-label">Stop loss (%)</span><span className="font-mono text-[11px] text-white">{params.stopPct != null && params.stopPct > 0 ? (params.stopPct * 100).toFixed(1) : "off"}</span></div>
            <input type="range" min={0} max={15} step={0.5} value={(params.stopPct ?? 0) * 100} onChange={(e) => set("stopPct", Number(e.target.value) / 100)} className="mt-1 w-full accent-white" />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[11px] text-[#525c6c]">Cut losers per group of legs.</span>
              {params.stopPct !== DEFAULT_BACKTEST_PARAMS.stopPct && <button onClick={() => setParams((p) => ({ ...p, stopPct: DEFAULT_BACKTEST_PARAMS.stopPct }))} className="text-[11px] font-semibold text-white underline decoration-white/25 underline-offset-4">reset</button>}
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between"><span className="vp-label">Take profit (%)</span><span className="font-mono text-[11px] text-white">{params.takeProfitPct != null && params.takeProfitPct > 0 ? (params.takeProfitPct * 100).toFixed(1) : "off"}</span></div>
            <input type="range" min={0} max={20} step={0.5} value={(params.takeProfitPct ?? 0) * 100} onChange={(e) => set("takeProfitPct", Number(e.target.value) / 100)} className="mt-1 w-full accent-white" />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[11px] text-[#525c6c]">Bank winners per group of legs.</span>
              {params.takeProfitPct !== DEFAULT_BACKTEST_PARAMS.takeProfitPct && <button onClick={() => setParams((p) => ({ ...p, takeProfitPct: DEFAULT_BACKTEST_PARAMS.takeProfitPct }))} className="text-[11px] font-semibold text-white underline decoration-white/25 underline-offset-4">reset</button>}
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between"><span className="vp-label">Max hold (days)</span><span className="font-mono text-[11px] text-white">{params.maxHoldDays != null && params.maxHoldDays > 0 ? params.maxHoldDays : "off"}</span></div>
            <input type="range" min={0} max={30} step={1} value={params.maxHoldDays ?? 0} onChange={(e) => set("maxHoldDays", Number(e.target.value))} className="mt-1 w-full accent-white" />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[11px] text-[#525c6c]">Expire stale positions.</span>
              {params.maxHoldDays !== DEFAULT_BACKTEST_PARAMS.maxHoldDays && <button onClick={() => setParams((p) => ({ ...p, maxHoldDays: DEFAULT_BACKTEST_PARAMS.maxHoldDays }))} className="text-[11px] font-semibold text-white underline decoration-white/25 underline-offset-4">reset</button>}
            </div>
          </div>
          {hasNews && (
          <div>
            <div className="flex items-baseline justify-between"><span className="vp-label">Confidence gate override</span><span className="font-mono text-[11px] text-white">{params.gateOverride != null ? params.gateOverride.toFixed(2) : "graph default"}</span></div>
            <input type="range" min={0} max={1} step={0.05} value={params.gateOverride ?? 0.65} onChange={(e) => set("gateOverride", Number(e.target.value))} className="mt-1 w-full accent-white" />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[11px] text-[#525c6c]">Lower it to let more stories through.</span>
              {params.gateOverride != null && <button onClick={() => setParams((p) => ({ ...p, gateOverride: undefined }))} className="text-[11px] font-semibold text-white underline decoration-white/25 underline-offset-4">reset</button>}
            </div>
          </div>
          )}
          {hasPairs && (
          <div>
            <div className="flex items-baseline justify-between"><span className="vp-label">Spread entry override</span><span className="font-mono text-[11px] text-white">{params.pairEntryOverride != null ? params.pairEntryOverride.toFixed(2) : `graph default ${pairDefault.toFixed(2)}`}</span></div>
            <input type="range" min={0} max={4} step={0.1} value={params.pairEntryOverride ?? pairDefault} onChange={(e) => set("pairEntryOverride", Number(e.target.value))} className="mt-1 w-full accent-white" />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[11px] text-[#525c6c]">Lower it to let smaller spreads trade.</span>
              {params.pairEntryOverride != null && <button onClick={() => setParams((p) => ({ ...p, pairEntryOverride: undefined }))} className="text-[11px] font-semibold text-white underline decoration-white/25 underline-offset-4">reset</button>}
            </div>
          </div>
          )}
          <div className="flex gap-2 rounded-md border border-white/[0.07] bg-black/30 p-3 text-[11.5px] leading-relaxed text-[#9da8b8]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{hasNews ? `Each day with news runs your full graph. 10% of equity per idea. Exits on opposite signals${(params.stopPct ?? 0) > 0 ? `, ${(params.stopPct! * 100).toFixed(0)}% stops` : ""}${(params.takeProfitPct ?? 0) > 0 ? `, ${(params.takeProfitPct! * 100).toFixed(0)}% profit targets` : ""}${(params.maxHoldDays ?? 0) > 0 ? `, ${params.maxHoldDays}d holds` : ""} or range end.` : `Each trading day runs your full graph on that day's closes. 10% of equity per idea. Exits on opposite signals${(params.stopPct ?? 0) > 0 ? `, ${(params.stopPct! * 100).toFixed(0)}% stops` : ""}${(params.takeProfitPct ?? 0) > 0 ? `, ${(params.takeProfitPct! * 100).toFixed(0)}% profit targets` : ""}${(params.maxHoldDays ?? 0) > 0 ? `, ${params.maxHoldDays}d holds` : ""} or range end.`}</span>
          </div>
        </div>

        <div className="space-y-3">
          {!result && !running && !error && (
            <div className="vp-card grid place-items-center p-16 text-center">
              <div><div className="text-[14px] font-bold text-white">Pick a range, run the replay</div>
              <p className="mx-auto mt-1 max-w-md text-[12.5px] text-[#646e7e]">Real headlines, real closes, your protocol's logic. No fabricated price paths.</p></div>
            </div>
          )}
          {result && (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
                <Metric label="Total return" value={fmtPct(result.metrics.totalReturn)} good={result.metrics.totalReturn >= 0} />
                <Metric label="P&L" value={`${result.metrics.profit >= 0 ? "+" : ""}${fmtMoney(result.metrics.profit)}`} good={result.metrics.profit >= 0} />
                <Metric label="Win rate" value={`${result.metrics.winRate.toFixed(1)}%`} good={result.metrics.winRate >= 50} />
                <Metric label="Max drawdown" value={`${result.metrics.maxDD.toFixed(2)}%`} good={result.metrics.maxDD > -12} />
                <Metric label="Sharpe" value={result.metrics.sharpe.toFixed(2)} good={result.metrics.sharpe >= 1} />
              </div>
              <div className="vp-card p-5">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-bold text-white">Equity · hypothetical · {protocol.name}</div>
                  <div className="font-mono text-[11px] text-[#646e7e]">{result.metrics.numTrades} closed trades · {params.from} → {params.to}</div>
                </div>
                <div className="mt-2"><EquityChart data={result.equity} height={260} /></div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {result.days.filter((d) => d.stories > 0).slice(-14).map((d) => (
                    <span key={d.date} title={`${d.date}: ${d.stories} stories, ${d.signals} signals`} className={clsx("rounded px-1.5 py-0.5 font-mono text-[10px]", d.signals > 0 ? "bg-[#3aa67f]/15 text-[#7fcfae]" : "bg-white/[0.04] text-[#646e7e]")}>{d.date.slice(5)}</span>
                  ))}
                  {result.days.every((d) => d.stories === 0) && <span className="font-mono text-[10px] text-[#525c6c]">price-driven replay, no news days</span>}
                  {result.days.some((d) => d.stories > 0) && <span className="font-mono text-[10px] text-[#525c6c]">green = day with a signal</span>}
                </div>
              </div>
              <div className="vp-card overflow-hidden p-5">
                <div className="flex items-baseline justify-between">
                  <div className="text-[13px] font-bold text-white">Underlying prices <span className="ml-1 font-mono text-[11px] font-normal text-[#525c6c]">closes with trade entries, exits marked out</span></div>
                  <div className="font-mono text-[11px] text-[#646e7e]">{params.from} → {params.to}</div>
                </div>
                <div className="mt-2"><PricePathsChart paths={result.pricePaths ?? {}} trades={result.trades} height={300} /></div>
              </div>
              <div className="vp-card overflow-hidden">
                <div className="border-b border-white/[0.06] px-5 py-3 text-[13px] font-bold text-white">Trades <span className="ml-1 font-mono text-[11px] font-normal text-[#525c6c]">hypothetical fills at historical closes</span></div>
                {result.trades.length === 0 ? (
                  <div className="px-5 py-6 text-[13px] leading-relaxed text-[#646e7e]">
                    {hasNews ? (
                      <>No signals fired in this range. The model read {result.verdicts.length} top {result.verdicts.length === 1 ? "story" : "stories"}
                      {result.verdicts.length > 0 && <>: highest confidence <span className="font-mono font-bold text-white">{result.maxConfidence.toFixed(2)}</span> vs your {result.gateUsed.toFixed(2)} gate</>}.</>
                    ) : (
                      <>No spread extremes in this range. Evaluated {result.verdicts.length} daily {result.verdicts.length === 1 ? "read" : "reads"}, none cleared the entry gate{result.pairEntryUsed != null && <> (entry {result.pairEntryUsed.toFixed(2)}, widest spread |z| {result.maxAbsZ.toFixed(2)})</>}.</>
                    )}
                    {result.verdicts.length > 0 ? (hasNews ? " Each story died somewhere honest:" : " Each day stayed inside the bands:") : " Widen the window or lower the threshold."}
                    {result.verdicts.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {result.verdicts.slice(0, 6).map((v) => (
                          <div key={v.date + v.headline.slice(0, 20)} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="shrink-0 font-mono text-[11px] text-[#525c6c]">{v.date.slice(5)}</span>
                              <span className="min-w-0 flex-1 truncate text-[12px] text-[#c7cfda]">{v.headline}</span>
                              <span className={clsx("shrink-0 font-mono text-[11px] font-bold uppercase", v.sentiment === "bullish" ? "text-[#3aa67f]" : v.sentiment === "bearish" ? "text-[#e5484d]" : "text-[#9da8b8]")}>{v.sentiment}</span>
                              <span className="shrink-0 font-mono text-[11px] text-[#9da8b8]">{v.confidence.toFixed(2)}</span>
                            </div>
                            <div className="mt-1 font-mono text-[10.5px] text-[#525c6c]">
                              {v.stage === "signal" ? "→ signal fired" : v.stage === "filtered" ? `× below ${result.gateUsed.toFixed(2)} confidence gate` : v.stage === "no-confirm" ? "× passed gate, price did not confirm" : "× passed checks, no order (risk or hold)"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-left text-[12px]">
                    <thead><tr className="border-b border-white/[0.06] font-mono text-[10.5px] uppercase tracking-wider text-[#525c6c]">
                      <th className="px-5 py-2 font-medium">Entry</th><th className="px-2 py-2">Side</th><th className="px-2 py-2">Ticker</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Entry</th><th className="px-2 py-2 text-right">Exit</th><th className="px-5 py-2 text-right">P&L</th>
                    </tr></thead>
                    <tbody>
                      {result.trades.filter((t) => t.exitDate).map((t) => (
                        <tr key={t.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                          <td className="px-5 py-2 font-mono text-[#9da8b8]">{new Date(t.ts).toLocaleDateString()} → {t.exitDate}</td>
                          <td className="px-2 py-2"><span className={clsx("rounded border px-1.5 py-0.5 font-mono text-[11px] font-bold", t.side === "BUY" ? "border-[#3aa67f]/25 bg-[#3aa67f]/10 text-[#7fcfae]" : "border-[#e5484d]/25 bg-[#e5484d]/10 text-[#f1999c]")}>{t.side}</span></td>
                          <td className="px-2 py-2 font-mono font-bold text-white">{t.ticker}</td>
                          <td className="px-2 py-2 text-right font-mono text-[#c7cfda]">{t.qty}</td>
                          <td className="px-2 py-2 text-right font-mono text-[#c7cfda]">${t.price.toFixed(2)}</td>
                          <td className="px-2 py-2 text-right font-mono text-[#c7cfda]">${(t.exitPrice ?? 0).toFixed(2)}</td>
                          <td className={clsx("px-5 py-2 text-right font-mono font-bold", t.pnl >= 0 ? "text-[#3aa67f]" : "text-[#e5484d]")}>{t.pnl >= 0 ? "+" : ""}{fmtMoney(t.pnl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="vp-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#525c6c]">{label}</div>
      <div className={clsx("mt-1 font-mono text-[19px] font-bold", good ? "text-[#3aa67f]" : "text-[#e5484d]")}>{value}</div>
    </div>
  );
}
