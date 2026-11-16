"use client";
export const dynamic = "force-dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useRouter } from "next/navigation";
import { Plus, Square, Trash2, FlaskConical, FileText, Grid3X3, Send, ChevronDown, ChevronRight, Workflow } from "lucide-react";
import { clsx } from "clsx";
import { startJob, listJobs, getJob, cancelJob, deleteJob, researchHealthy, type ResearchJob, type ResearchArtifact } from "@/lib/research";
import { CorrelationHeatmap } from "@/components/corr-heatmap";
import { MultiSeriesChart, RankedBars, HistogramChart } from "@/components/research-charts";
import { useBuilder } from "@/lib/store";
import { NODE_DEFS } from "@/lib/nodes";

const MODELS = ["glm-5.3-flash", "kimi-k3", "deepseek-v4.1-flash", "qwen3.8-flash", "gpt-6-luna"];

export default function ResearchPage() {
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ResearchJob | null>(null);
  const [asking, setAsking] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(MODELS[0]);
  const [online, setOnline] = useState<boolean | null>(null);
  const [artTab, setArtTab] = useState<string | null>(null);
  const pickedTab = useRef<string | null>(null);
  const router = useRouter();

  const refreshList = useCallback(async () => {
    try { setJobs(await listJobs()); } catch { /* worker down */ }
  }, []);

  useEffect(() => {
    researchHealthy().then(setOnline);
    refreshList();
    const t = setInterval(refreshList, 4000);
    return () => clearInterval(t);
  }, [refreshList]);

  useEffect(() => {
    if (!activeId) { setDetail(null); return; }
    pickedTab.current = null;
    let live = true;
    const load = async () => {
      try {
        const d = await getJob(activeId);
        if (live) {
          setDetail(d);
          if (pickedTab.current == null && d.artifacts?.length) {
            const id = d.artifacts[d.artifacts.length - 1].id;
            pickedTab.current = id;
            setArtTab(id);
          }
        }
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 2500);
    return () => { live = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const ask = async () => {
    if (!prompt.trim() || asking) return;
    setAsking(true);
    try {
      const res = await startJob(prompt.trim(), model);
      if ("error" in res) throw new Error(res.error);
      setPrompt("");
      setActiveId(res.id);
      setArtTab(null);
      pickedTab.current = null;
      refreshList();
    } catch (e: any) {
      alert(e.message ?? "Could not start research");
    } finally { setAsking(false); }
  };

  const running = detail?.status === "running" || detail?.status === "queued";
  const activeArtifact = detail?.artifacts?.find((a) => a.id === artTab) ?? detail?.artifacts?.[detail.artifacts.length - 1];

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* conversations */}
      <div className="flex w-[264px] shrink-0 flex-col border-r border-white/[0.07] bg-[#060b16]">
        <div className="border-b border-white/[0.07] p-3">
          <div className="vp-label mb-1.5">AI Researcher {online === false && <span className="text-[#e5484d]">· worker offline</span>}</div>
          <button onClick={() => { setActiveId(null); setArtTab(null); pickedTab.current = null; }} className="flex w-full items-center justify-center gap-2 rounded-md bg-[#e8edf4] py-2 text-[12.5px] font-bold text-black hover:bg-white">
            <Plus className="h-4 w-4" /> New inquiry
          </button>
          {online === false && (
            <div className="mt-2 rounded-md border border-white/[0.07] bg-black/30 p-2.5 text-[11px] leading-relaxed text-[#9da8b8]">
              Start the worker:<br /><span className="font-mono text-[10.5px] text-white">backend/.venv/bin/uvicorn backend.main:app --port 8100</span>
            </div>
          )}
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2.5">
          {jobs.map((j) => (
            <div key={j.id} className={clsx("group rounded-lg border p-2.5 text-left transition-colors", activeId === j.id ? "border-white/20 bg-white/[0.05]" : "border-transparent hover:bg-white/[0.03]")}>
              <button onClick={() => { setActiveId(j.id); setArtTab(null); pickedTab.current = null; }} className="block w-full text-left">
                <div className="flex items-center gap-1.5">
                  <Dot status={j.status} />
                  <span className="truncate text-[12.5px] font-semibold text-white">{j.inquiry.slice(0, 60)}</span>
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-[#525c6c]">{new Date(j.created_at * 1000).toLocaleString()} · {j.status}</div>
              </button>
              <div className="mt-1 hidden justify-end group-hover:flex">
                <button onClick={async () => { if (j.status === "running" || j.status === "queued") await cancelJob(j.id); await deleteJob(j.id); if (activeId === j.id) setActiveId(null); refreshList(); }} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-[#525c6c] hover:bg-white/[0.06] hover:text-[#f1999c]">
                  <Trash2 className="h-3 w-3" /> delete
                </button>
              </div>
            </div>
          ))}
          {jobs.length === 0 && <div className="p-3 text-[12px] leading-relaxed text-[#525c6c]">No inquiries yet. Ask about a sector, a ticker, or a correlation hunt.</div>}
        </div>
      </div>

      {/* thread */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#04070d]">
        {!detail ? (
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6">
            <div className="flex items-center gap-2 text-[15px] font-bold text-white"><FlaskConical className="h-5 w-5" /> What should I research?</div>
            <p className="mt-1 text-[13px] text-[#9da8b8]">The agent plans the work, fans out subagents per workstream, and brings back reports and charts.</p>
            <div className="mt-4 flex gap-2">
              <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()}
                placeholder="e.g. Find biomedical stocks that move together and heatmap their correlation" className="vp-input !py-3 text-[13.5px]" style={{ flex: "1 1 0%", minWidth: 0 }} />
              <select value={model} onChange={(e) => setModel(e.target.value)} className="vp-input" style={{ width: 148, flexShrink: 0 }} title="Model">
                {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <button onClick={ask} disabled={asking || !prompt.trim()} className="flex items-center gap-2 rounded-md bg-[#e8edf4] px-4 text-[13.5px] font-bold text-black hover:bg-white disabled:opacity-50">
                <Send className="h-4 w-4" /> {asking ? "Starting…" : "Ask"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["Which biomedical stocks correlate most over the last year? Heatmap it.", "Plot 6-month normalized price paths for NVDA, AMD and AVGO on one chart.", "Rank the Magnificent 7 by 3-month momentum as bars.", "Compare the distribution of daily returns for SPY vs QQQ over 2 years."].map((ex) => (
                <button key={ex} onClick={() => setPrompt(ex)} className="rounded-full border border-white/10 px-3 py-1.5 text-left text-[12px] text-[#9da8b8] hover:border-white/25 hover:text-white">{ex}</button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-5 py-3">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-bold text-white">{detail.inquiry}</div>
                <div className="flex items-center gap-2 font-mono text-[10.5px] text-[#525c6c]">
                  <Dot status={detail.status} /> {detail.status}
                  {detail.status === "running" && <span className="animate-pulse">working…</span>}
                </div>
              </div>
              <div className="ml-auto flex shrink-0 gap-2">
                {(detail.status === "running" || detail.status === "queued") && (
                  <button onClick={async () => { await cancelJob(detail.id); }} className="flex items-center gap-1.5 rounded-md border border-[#e5484d]/40 bg-[#e5484d]/10 px-3 py-1.5 text-[12px] font-bold text-[#f1999c] hover:bg-[#e5484d]/20">
                    <Square className="h-3.5 w-3.5" /> Stop
                  </button>
                )}
              </div>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[1fr_380px]">
              <div className="min-h-[300px] space-y-3 overflow-y-auto p-5">
                {detail.steps?.filter((s) => s.role !== "tool").map((s, i) => (
                  <div key={i} className={clsx("max-w-[85%] rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed",
                    s.role === "user" ? "ml-auto border-white/10 bg-white/[0.06] text-white" : "border-white/[0.07] bg-[#0a0f17] text-[#c7cfda]")}>
                    {s.role === "assistant" && <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#525c6c]">researcher</div>}
                    <div className="whitespace-pre-wrap">{s.content}</div>
                  </div>
                ))}
                {detail.status === "done" && detail.summary && (
                  <div className="rounded-lg border border-[#3aa67f]/25 bg-[#3aa67f]/[0.06] px-3.5 py-3 text-[13px] leading-relaxed text-white">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7fcfae]">answer</div>
                    {detail.summary}
                  </div>
                )}
                {detail.status === "error" && <div className="rounded-lg border border-[#e5484d]/30 bg-[#e5484d]/10 px-3.5 py-3 text-[13px] text-[#f1999c]">{detail.error || "Run failed."}</div>}
                {/* nested subagent runs */}
                {(detail.children?.length ?? 0) > 0 && (
                  <div className="ml-4 space-y-1.5 border-l border-white/10 pl-3">
                    <div className="vp-label">Subagents · {detail.children!.length}</div>
                    {detail.children!.map((c) => (
                      <ChildRow key={c.id} child={c} />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex min-h-0 flex-col border-t border-white/[0.07] xl:border-l xl:border-t-0">
                <div className="flex items-center gap-1 overflow-x-auto border-b border-white/[0.07] px-3 pt-2">
                  {(detail.artifacts ?? []).map((a) => (
                    <button key={a.id} onClick={() => { pickedTab.current = a.id; setArtTab(a.id); }}
                      className={clsx("whitespace-nowrap rounded-t-md px-3 py-2 text-[12px] font-semibold", artTab === a.id || (!artTab && a === detail.artifacts![detail.artifacts!.length - 1]) ? "bg-white/[0.05] text-white" : "text-[#646e7e] hover:text-white")}>
                      {a.title.slice(0, 26)}
                    </button>
                  ))}
                  {(!detail.artifacts || detail.artifacts.length === 0) && <div className="px-3 py-2 text-[12px] text-[#525c6c]">No artifacts yet</div>}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {activeArtifact && <ArtifactView artifact={activeArtifact} />}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Dot({ status }: { status: string }) {
  return <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full",
    status === "done" ? "bg-[#3aa67f]" : status === "error" ? "bg-[#e5484d]" : status === "cancelled" ? "bg-[#525c6c]" : "animate-pulse bg-white")} />;
}

function ChildRow({ child }: { child: { id: string; label: string; status: string; summary: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-white/[0.07] bg-white/[0.015]">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
        {open ? <ChevronDown className="h-3.5 w-3.5 text-[#646e7e]" /> : <ChevronRight className="h-3.5 w-3.5 text-[#646e7e]" />}
        <Dot status={child.status} />
        <span className="truncate text-[12px] font-semibold text-white">{child.label}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-[#525c6c]">{child.status}</span>
      </button>
      {open && <div className="border-t border-white/[0.06] px-3 py-2 text-[12px] leading-relaxed text-[#9da8b8]">{child.summary || "No summary yet."}</div>}
    </div>
  );
}

function HeatmapArtifact({ artifact }: { artifact: { id: string; title: string; data: any } }) {
  const router = useRouter();
  const [pair, setPair] = useState<{ a: string; b: string; corr: number } | null>(null);
  const d = artifact.data as { tickers?: string[]; matrix?: (number | null)[][] };
  const draft = () => {
    if (!pair) return;
    const { a, b } = pair;
    useBuilder.getState().importGraph(
      `${a}/${b} Pairs`,
      `Auto-built from research: mean-reversion on the ${a}/${b} spread.`,
      [
        { type: "pairsSpread", label: `${a}/${b} Spread`, config: { legA: a, legB: b, hedgeRatio: 1, lookback: 60, entryZ: 2, exitZ: 0.5 } },
        { type: "positionSizing", label: "Risk Check", config: { method: "pct_equity", value: 2, maxUsd: 10000 } },
        { type: "paperTrade", label: "Trade Order", config: { qty: 0, orderType: "market" } },
        { type: "notify", label: "Notification", config: { channel: "in-app", message: "{{action}} {{ticker}}" } },
      ],
      [
        { from: 0, to: 1, fromPort: "signal", toPort: "signal" },
        { from: 1, to: 2, fromPort: "sized", toPort: "in" },
        { from: 2, to: 3, fromPort: "out", toPort: "in" },
      ]
    );
    router.push("/builder");
  };
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[13px] font-bold text-white"><Grid3X3 className="h-4 w-4" /> {artifact.title}</div>
      <CorrelationHeatmap data={{ tickers: d.tickers ?? [], matrix: d.matrix ?? [] }} onPickPair={(a, b, corr) => setPair({ a, b, corr })} />
      <div className="mt-2 text-[11px] text-[#525c6c]">Click a cell to inspect a pair.</div>
      {pair && (
        <button onClick={draft} className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-[#e8edf4] py-2 text-[12.5px] font-bold text-black hover:bg-white">
          <Workflow className="h-3.5 w-3.5" /> Draft {pair.a}/{pair.b} pairs trade (r={pair.corr.toFixed(2)})
        </button>
      )}
    </div>
  );
}

function ArtifactView({ artifact }: { artifact: { id: string; type: string; title: string; data: any } }) {
  if (artifact.type === "heatmap") {
    return <HeatmapArtifact artifact={artifact} />;
  }
  if (artifact.type === "timeseries") {
    return (
      <div>
        <div className="mb-2 text-[13px] font-bold text-white">{artifact.title}</div>
        <MultiSeriesChart data={artifact.data ?? {}} />
      </div>
    );
  }
  if (artifact.type === "bars") {
    return (
      <div>
        <div className="mb-2 text-[13px] font-bold text-white">{artifact.title}</div>
        <RankedBars data={artifact.data ?? {}} />
      </div>
    );
  }
  if (artifact.type === "histogram") {
    return (
      <div>
        <div className="mb-2 text-[13px] font-bold text-white">{artifact.title}</div>
        <HistogramChart data={artifact.data ?? {}} />
      </div>
    );
  }
  if (artifact.type === "table") {
    const cols = Array.isArray(artifact.data?.columns) ? artifact.data.columns : [];
    const rows = Array.isArray(artifact.data?.rows) ? artifact.data.rows : [];
    if (cols.length && rows.length) {
      return (
        <div>
          <div className="mb-2 text-[13px] font-bold text-white">{artifact.title}</div>
          <table className="w-full text-left text-[12px]">
            <thead><tr className="border-b border-white/[0.06] font-mono text-[10.5px] uppercase tracking-wider text-[#525c6c]">
              {cols.map((c: string, i: number) => <th key={i} className="px-2 py-1.5 font-medium">{c}</th>)}
            </tr></thead>
            <tbody>
              {rows.slice(0, 30).map((r: any[], i: number) => (
                <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                  {r.map((v, j) => <td key={j} className="px-2 py-1.5 font-mono text-[#c7cfda]">{String(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }
  if (artifact.type === "report") {
    const md = String(artifact.data?.markdown ?? "");
    return (
      <div>
        <div className="mb-2 flex items-center gap-2 text-[13px] font-bold text-white"><FileText className="h-4 w-4" /> {artifact.title}</div>
        <div className="vp-markdown"><ReactMarkdown>{md}</ReactMarkdown></div>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-2 text-[13px] font-bold text-white">{artifact.title}</div>
      <pre className="max-h-[500px] overflow-auto rounded-md border border-white/[0.07] bg-black/40 p-3 font-mono text-[11px] text-[#9da8b8]">{JSON.stringify(artifact.data, null, 2).slice(0, 8000)}</pre>
    </div>
  );
}
