"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState } from "react";
import { fetchNews, type NewsArticle } from "@/lib/alpaca";
import { analyzeNewsClient, type AIAnalysis } from "@/lib/ai";
import { TimeAgo } from "@/components/time-ago";
import { Search, ExternalLink } from "lucide-react";
import { clsx } from "clsx";

const WATCH = ["SPY", "QQQ", "NVDA", "AAPL", "TSLA", "AMD", "MSFT", "AMAT"];

export default function IntelligencePage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "bullish" | "bearish" | "neutral">("all");
  const [feed, setFeed] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchNews(WATCH, 30).then((n) => { if (live) { setFeed(n); setOpenId((id) => id ?? n[0]?.id ?? null); setLoading(false); } }).catch(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  const analyzed = useAnalyzed(feed);

  const list = useMemo(() => feed.filter((n) => {
    const s = analyzed[n.id]?.sentiment;
    return (filter === "all" || s === filter) && (n.headline + n.body + n.tickers.join(" ")).toLowerCase().includes(q.toLowerCase());
  }), [feed, q, filter, analyzed]);

  const open = feed.find((n) => n.id === openId) ?? null;

  return (
    <div className="flex h-[calc(100vh-56px)]">
      <div className="flex w-[400px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0a0f17]">
        <div className="space-y-2.5 border-b border-white/[0.07] p-4">
          <div className="vp-ledger-head">Market intelligence</div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#525c6c]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search headlines, tickers…" className="vp-input pl-8" />
          </div>
          <div className="flex gap-1">
            {(["all", "bullish", "bearish", "neutral"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={clsx("rounded px-2.5 py-1 text-[11.5px] font-semibold capitalize transition-colors", filter === f ? "bg-white/[0.08] text-white" : "text-[#646e7e] hover:text-white")}>{f}</button>
            ))}
          </div>
          <div className="font-mono text-[10.5px] text-[#525c6c]">Alpaca news · {feed.length} stories</div>
        </div>
        <div className="flex-1 divide-y divide-white/[0.06] overflow-y-auto">
          {loading && (
            <div className="space-y-3 p-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="vp-skeleton h-3.5 w-full" />
                  <div className="vp-skeleton h-3.5 w-2/3" />
                </div>
              ))}
            </div>
          )}
          {!loading && list.length === 0 && <div className="p-6 text-center text-[12px] text-[#525c6c]">No stories match.</div>}
          {list.map((n) => {
            const a = analyzed[n.id];
            return (
              <button key={n.id} onClick={() => setOpenId(n.id)} className={clsx("block w-full px-4 py-3.5 text-left transition-colors", open?.id === n.id ? "bg-white/[0.05]" : "hover:bg-white/[0.025]")}>
                <div className="flex items-center gap-2 text-[10.5px] font-mono text-[#525c6c]">
                  <span className="truncate">{n.source}</span><span>·</span><span><TimeAgo ts={n.ts} /></span>
                  <span className="ml-auto flex shrink-0 gap-1">{n.tickers.slice(0, 3).map((t) => <span key={t} className="rounded border border-white/10 bg-white/[0.03] px-1 py-px font-bold text-[#9da8b8]">{t}</span>)}</span>
                </div>
                <div className="mt-1.5 text-[13px] font-semibold leading-snug text-white">{n.headline}</div>
                {a && (
                  <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                    <SentBadge s={a.sentiment} />
                    <span className="font-mono text-[#525c6c]">conf {a.confidence.toFixed(2)} · impact {a.impact.toFixed(2)}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto bg-[#070b12] p-6">
        {!open && <div className="text-[#646e7e]">{loading ? "Connecting to wire…" : "Select an article."}</div>}
        {open && <ArticleView key={open.id} article={open} analysis={analyzed[open.id] ?? null} />}
      </div>
    </div>
  );
}

// Analyze the top stories once the feed lands (bounded concurrency).
function useAnalyzed(feed: NewsArticle[]) {
  const [map, setMap] = useState<Record<string, AIAnalysis>>({});
  useEffect(() => {
    if (!feed.length) return;
    let live = true;
    const top = feed.slice(0, 8);
    (async () => {
      for (const n of top) {
        if (!live) return;
        try {
          const a = await analyzeNewsClient(n.headline, n.body || n.headline, n.tickers.join(",") || "SPY", true);
          if (!live) return;
          setMap((m) => ({ ...m, [n.id]: a }));
        } catch { /* AI down. Story still readable. */ }
        await new Promise((r) => setTimeout(r, 150));
      }
    })();
    return () => { live = false; };
  }, [feed]);
  return map;
}

function ArticleView({ article: n, analysis }: { article: NewsArticle; analysis: AIAnalysis | null }) {
  const [full, setFull] = useState<AIAnalysis | null>(analysis);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (analysis) { setFull(analysis); return; }
    let live = true;
    setBusy(true);
    analyzeNewsClient(n.headline, n.body || n.headline, n.tickers.join(",") || "SPY", true)
      .then((a) => live && setFull(a))
      .catch(() => {})
      .finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [n.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2 font-mono text-[11.5px] text-[#525c6c]">
        <span>{n.source}</span><span>·</span><span>{new Date(n.ts).toISOString().slice(0, 16).replace("T", " ")} UTC</span>
        {n.author && <><span>·</span><span className="truncate">{n.author}</span></>}
        <a href={n.url} target="_blank" rel="noreferrer" className="ml-auto flex shrink-0 items-center gap-1 text-white underline decoration-white/20 underline-offset-4 hover:decoration-white/60">Source <ExternalLink className="h-3 w-3" /></a>
      </div>
      <h2 className="max-w-[34ch] text-[26px] font-bold leading-[1.15] tracking-tight text-white">{n.headline}</h2>
      {full && (
        <div className="flex flex-wrap items-center gap-2">
          <SentBadge s={full.sentiment} big />
          {n.tickers.slice(0, 6).map((t) => <span key={t} className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[12px] font-bold text-white">{t}</span>)}
          <span className="font-mono text-[12px] text-[#646e7e]">confidence {full.confidence.toFixed(2)} · impact {full.impact.toFixed(2)} · {full.time_horizon.replace(/_/g, " ")}</span>
        </div>
      )}
      <p className="max-w-[68ch] text-[14px] leading-relaxed text-[#c7cfda]">{n.body || "No summary provided."}</p>

      <div className="vp-card p-5">
        <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.09em] text-[#9da8b8]">
          AI Analysis
          <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] font-medium normal-case tracking-normal text-[#9da8b8]">
            {full ? "live model" : busy ? "analyzing…" : "unavailable"}
          </span>
        </div>
        {full ? (
          <>
            <div className="mt-3 rounded-md border border-white/[0.07] bg-black/40 p-3 text-[13px] leading-relaxed text-[#c7cfda]"><span className="text-[#646e7e]">Reasoning: </span>{full.reasoning}</div>
            <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-white/[0.07] bg-black/50 p-3 font-mono text-[11.5px] leading-relaxed text-[#9da8b8]">{JSON.stringify({ ...full }, null, 2)}</pre>
            <div className="mt-2 text-[11px] leading-relaxed text-[#646e7e]">Treated as untrusted input. Threshold and price confirmation required before any order.</div>
          </>
        ) : (
          <div className="mt-3 text-[13px] text-[#646e7e]">{busy ? "Reading with the model…" : "Model unreachable. Summary above is from the wire."}</div>
        )}
      </div>

      <div className="vp-card p-5">
        <div className="vp-ledger-head">Related assets</div>
        <div className="mt-2 flex flex-wrap gap-2">{n.tickers.slice(0, 8).concat(["SPY"]).map((t) => <span key={t} className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 font-mono text-[12px] text-white">{t}</span>)}</div>
      </div>
    </div>
  );
}

function SentBadge({ s, big }: { s: string; big?: boolean }) {
  return <span className={clsx("rounded border font-mono font-bold uppercase",
    big ? "px-2.5 py-1 text-[12px]" : "px-1.5 py-0.5 text-[10px]",
    s === "bullish" ? "border-[#3aa67f]/25 bg-[#3aa67f]/10 text-[#7fcfae]" : s === "bearish" ? "border-[#e5484d]/25 bg-[#e5484d]/10 text-[#f1999c]" : "border-white/10 bg-white/[0.04] text-[#9da8b8]")}>{s}</span>;
}
