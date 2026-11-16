"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, ArrowUpRight, ArrowDownRight, Workflow, FlaskConical,
  Newspaper, ShieldCheck, Radio, Play, Plus, Beaker, BookOpen, Compass,
} from "lucide-react";
import { NEWS_FEED, genCandles } from "@/lib/mock-data";
import { TimeAgo } from "@/components/time-ago";
import { fetchSnapshots, fetchAccount, type Snapshot } from "@/lib/alpaca";

export const dynamic = "force-dynamic";

const FALLBACK = [
  { s: "SPY", p: "587.30", c: 0.42 }, { s: "QQQ", p: "512.80", c: 0.61 },
  { s: "NVDA", p: "187.60", c: 2.34 }, { s: "AAPL", p: "232.40", c: 0.74 },
  { s: "TSLA", p: "241.30", c: -1.1 }, { s: "MSFT", p: "428.90", c: 0.55 },
];
const WATCH = ["SPY", "QQQ", "NVDA", "AAPL", "TSLA", "MSFT"];

const PROTOCOLS = [
  { name: "Breaking News Momentum", desc: "News → AI read → confidence gate → price confirmation → sized order. The house recipe.", nodes: 8, wr: "61.4%", ret: "+18.2%", sharpe: "1.42", trades: "132 trades", seed: 11, featured: true },
  { name: "Semiconductor Tracker", desc: "Watches NVDA, AMD, AMAT and tool orders for memory-cycle turns.", nodes: 6, wr: "58.1%", ret: "+12.6%", sharpe: "1.18", trades: "94 trades", seed: 23, featured: false },
  { name: "Earnings Drift", desc: "Guidance surprises with AI-scored transcripts, entered on next-bar confirmation.", nodes: 5, wr: "55.9%", ret: "+9.8%", sharpe: "1.04", trades: "61 trades", seed: 37, featured: false },
  { name: "Fed-Day Filter", desc: "Sits out chop, then follows the first confirmed move after the statement.", nodes: 4, wr: "52.3%", ret: "+6.4%", sharpe: "0.87", trades: "48 trades", seed: 51, featured: false },
  { name: "Dip-Buy Mean Reversion", desc: "Oversold bounces in quality names, hard 3% day-loss guard attached.", nodes: 5, wr: "57.2%", ret: "+8.1%", sharpe: "0.95", trades: "77 trades", seed: 67, featured: false },
];

const PHASES = [
  {
    name: "Sense", title: "The wire never sleeps",
    body: "A News Feed node polls Reuters, Bloomberg and CNBC every 30 seconds for your tickers, scoring each story for novelty so recycled headlines never fire twice.",
    config: ['tickers: "NVDA, TSLA, AAPL"', "sources: Reuters · Bloomberg · CNBC", "minNovelty: 0.50 · poll: 30s"],
    out: "NVIDIA raises Q4 guidance on AI datacenter demand",
  },
  {
    name: "Reason", title: "An analyst that reads everything",
    body: "The AI News Analyzer turns prose into a position: ticker, event, sentiment, impact and confidence as structured data you can gate on.",
    config: ['model: glm-5.3-flash', "confidenceThreshold: 0.70", "returns: ticker · sentiment · impact · confidence"],
    out: "NVDA · bullish · impact 0.87 · confidence 0.92",
  },
  {
    name: "Confirm", title: "Price gets a vote",
    body: "A confidence filter plus a 5-minute price check kill most ideas before they cost anything. Only momentum-confirmed signals reach sizing.",
    config: ["field: confidence ≥ 0.75", "method: momentum_5m · min move 0.30%", "lookback: 20 bars"],
    out: "NVDA +0.34% in 5m · confirmed",
  },
  {
    name: "Execute", title: "Sized and guarded",
    body: "Position sizing risks 2% of equity per idea inside a 3% day-loss guard, then routes a market order to Alpaca with an in-app receipt.",
    config: ["risk: 2% equity · max $10,000", "day-loss guard: 3%", "venue: Alpaca · market"],
    out: "BUY 26× NVDA @ 187.60 · filled",
  },
];

function sparkPoints(seed: number, n = 42, w = 560, h = 120): string {
  const candles = genCandles(seed, n, 200);
  const closes = candles.map((c) => c.close);
  const min = Math.min(...closes), max = Math.max(...closes);
  const span = Math.max(1e-6, max - min);
  return closes.map((v, i) => `${((i / (n - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * (h - 14) - 7).toFixed(1)}`).join(" ");
}

function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll(".lp-reveal"));
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
}

export default function FrontPage() {
  const [phase, setPhase] = useState(1);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [equity, setEquity] = useState<string | null>(null);
  const heroSpark = useMemo(() => sparkPoints(7, 48, 560, 132), []);
  const heroEquity = useMemo(() => {
    const pts = heroSpark.split(" ").map((p) => p.split(",").map(Number));
    const first = pts[0][1], last = pts[pts.length - 1][1];
    return { pts, up: last < first };
  }, [heroSpark]);
  const intel = NEWS_FEED.slice(0, 3);
  useReveal();

  useEffect(() => {
    let live = true;
    fetchSnapshots(WATCH).then((s) => { if (live && s.length) setSnaps(s); }).catch(() => {});
    fetchAccount().then((a) => { if (live) setEquity(a.equity.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const tickers = WATCH.map((s) => {
    const snap = snaps.find((x) => x.symbol === s);
    const fb = FALLBACK.find((f) => f.s === s)!;
    return {
      s,
      p: snap?.price != null ? snap.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : fb.p,
      c: snap?.changePct ?? fb.c,
    };
  });
  const spy = tickers[0];

  return (
    <div className="landing min-h-screen">
      <div className="flex items-center justify-center gap-2 border-b border-white/[0.07] bg-[#0a0f17] px-4 py-2 text-center text-[12px] font-medium text-[#9da8b8]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#3aa67f]" />
        <span className="tnum">AI via opencode endpoint · Risk guard 3% · SPY {spy.p} {spy.c >= 0 ? "+" : ""}{spy.c.toFixed(2)}%</span>
      </div>

      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#070b12]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 md:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="VantagePoint home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="VantagePoint" className="h-9 w-9 rounded-[10px] object-cover" />
            <span className="leading-none">
              <span className="block text-[16px] font-bold tracking-tight text-white">VantagePoint</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-[#646e7e]">Trading Terminal</span>
            </span>
          </Link>
          <nav className="ml-2 hidden items-center gap-6 text-[13.5px] font-medium text-[#9da8b8] lg:flex" aria-label="Primary">
            <a href="#protocols" className="transition-colors hover:text-white">Protocols</a>
            <a href="#story" className="transition-colors hover:text-white">Proof</a>
            <a href="#journey" className="transition-colors hover:text-white">Journey</a>
            <a href="#lab" className="transition-colors hover:text-white">Lab</a>
            <a href="#intel" className="transition-colors hover:text-white">Intel</a>
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <Link href="/get-started" className="hidden text-[13.5px] font-medium text-[#9da8b8] transition-colors hover:text-white sm:block">Sign in</Link>
            <Link href="/get-started" className="lp-btn lp-btn-solid !py-2.5 text-[13px]">Get started <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 pb-10 pt-12 md:px-8 md:pt-20 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <h1 className="lp-display text-[clamp(3rem,8vw,5.5rem)] text-white">
              Trade with protocols,<br /><em>not hunches.</em>
            </h1>
            <p className="lp-body mt-6 max-w-[62ch] text-[16.5px] leading-relaxed text-[#9da8b8]">
              VantagePoint turns market news into traceable trading decisions: sensed, reasoned,
              confirmed and sized before a single order leaves the desk. Draw the logic once,
              then watch it work every morning.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/get-started" className="lp-btn lp-btn-solid">Get started <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/builder" className="lp-btn lp-btn-ghost"><Workflow className="h-4 w-4" /> Build a protocol</Link>
            </div>
            <dl className="tnum mt-8 flex flex-wrap gap-x-8 gap-y-3 text-[13px]">
              <div><dt className="sr-only">Sharpe</dt><dd className="text-[15px] font-bold text-white">1.42 Sharpe</dd><dd className="text-[#646e7e]">Breaking News Momentum</dd></div>
              <div><dt className="sr-only">Win rate</dt><dd className="text-[15px] font-bold text-white">61.4% win rate</dd><dd className="text-[#646e7e]">132 trades</dd></div>
              <div><dt className="sr-only">Guardrail</dt><dd className="flex items-center gap-1.5 text-[15px] font-bold text-white"><ShieldCheck className="h-4 w-4 text-[#3aa67f]" /> 3% day-loss guard</dd><dd className="text-[#646e7e]">Risk check on every order</dd></div>
            </dl>
          </div>

          <div className="lg:col-span-5">
            <figure className="lp-card overflow-hidden" aria-label="Demonstration of a protocol firing on NVIDIA news">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                <div className="flex items-center gap-2 text-[12.5px] font-bold text-white">
                  <Radio className="h-4 w-4 text-[#e8edf4]" /> Breaking News Momentum
                </div>
                <div className="tnum flex items-center gap-1.5 rounded-full border border-[#3aa67f]/30 bg-[#3aa67f]/10 px-2.5 py-1 text-[11px] font-bold text-[#7fcfae]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#3aa67f]" /> LIVE
                </div>
              </div>
              <div className="px-4 pt-4">
                <svg viewBox="0 0 560 96" className="h-20 w-full" role="img" aria-label="News to AI to filter to confirmation to execution flow">
                  {[
                    { x: 8, label: "News" }, { x: 122, label: "AI read" }, { x: 236, label: "Filter" }, { x: 350, label: "Confirm" }, { x: 462, label: "Execute" },
                  ].map((n, i, arr) => (
                    <g key={n.label}>
                      {i < arr.length - 1 && (
                        <line x1={n.x + 90} y1="34" x2={arr[i + 1].x - 6} y2="34" stroke="#2a3342" strokeWidth="2" className="lp-flow-edge" />
                      )}
                      <rect x={n.x} y="12" width="90" height="44" rx="8" fill={i === 4 ? "#e8edf4" : "#0a0f17"} stroke={i === 4 ? "#e8edf4" : "#2a3342"} strokeWidth="1.5" />
                      {i === 1 && <circle cx={n.x + 80} cy="22" r="5" fill="#e8edf4" className="lp-live-dot" />}
                      <text x={n.x + 45} y="32" textAnchor="middle" fontSize="12.5" fontWeight="700" fill={i === 4 ? "#070b12" : "#e7ecf3"} fontFamily="Archivo, sans-serif">{n.label}</text>
                      <text x={n.x + 45} y="46" textAnchor="middle" fontSize="10" fill={i === 4 ? "#070b12" : "#646e7e"} fontFamily="Archivo, sans-serif">
                        {["30s poll", "conf 0.92", "≥ 0.75", "+0.34%", "26 sh."][i]}
                      </text>
                    </g>
                  ))}
                </svg>
                <div className="mt-1 flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-[#0a0f17] px-3 py-2.5">
                  <span className="rounded border border-[#3aa67f]/30 bg-[#3aa67f]/10 px-1.5 py-0.5 text-[11px] font-bold text-[#7fcfae]">BUY</span>
                  <div className="text-[12.5px]"><span className="tnum font-bold text-white">26× NVDA @ 187.60</span> <span className="text-[#646e7e]">· filled</span></div>
                  <span className="tnum ml-auto text-[11px] text-[#646e7e]">12m ago</span>
                </div>
              </div>
              <div className="px-4 pb-2 pt-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] font-semibold text-[#9da8b8]">Equity · today</span>
                  <span className="tnum text-[12px] font-bold text-[#3aa67f]">+$1,240.55 (+0.50%)</span>
                </div>
                <svg viewBox="0 0 560 132" className="mt-1 h-28 w-full" preserveAspectRatio="none" role="img" aria-label="Intraday equity rising">
                  <polyline points={heroSpark} fill="none" stroke="#e8edf4" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  <circle cx={heroEquity.pts[heroEquity.pts.length - 1][0]} cy={heroEquity.pts[heroEquity.pts.length - 1][1]} r="4" fill="#3aa67f" />
                </svg>
              </div>
              <figcaption className="tnum border-t border-white/[0.07] px-4 py-2.5 text-[11.5px] text-[#646e7e]">
                NVDA raised guidance 4 minutes ago · AI confidence 0.92 · impact 0.87 · price confirmed before sizing.
              </figcaption>
            </figure>
          </div>
        </div>

        <div className="relative border-y border-white/[0.07] bg-[#0a0f17]">
          <div className="lp-marquee py-2.5" aria-label="Market snapshot">
            <div className="lp-marquee-track">
              {[0, 1].map((dup) => (
                <div key={dup} className="flex shrink-0 items-center" aria-hidden={dup === 1}>
                  {tickers.map((t) => (
                    <span key={`${dup}-${t.s}`} className="tnum flex items-center gap-2 px-6 text-[12.5px] font-bold text-white">
                      {t.s} <span className="font-medium text-[#9da8b8]">{t.p}</span>
                      <span className={`flex items-center font-bold ${t.c >= 0 ? "text-[#3aa67f]" : "text-[#e5484d]"}`}>
                        {t.c >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{Math.abs(t.c).toFixed(2)}%
                      </span>
                      <span className="ml-4 h-1 w-1 rounded-full bg-[#2a3342]" />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="protocols" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-14 md:px-8 md:py-20">
        <div className="lp-reveal flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="lp-display max-w-[16ch] text-[clamp(2rem,4.5vw,3.2rem)] text-white">Working strategies, <em>ready to clone.</em></h2>
            <p className="mt-4 max-w-[64ch] text-[15.5px] leading-relaxed text-[#9da8b8]">
              Each protocol has a character: its tickers, its patience, its proof.
              Open one in the builder, change a threshold, run it by lunch.
            </p>
          </div>
          <Link href="/marketplace" className="lp-btn lp-btn-ghost text-[13px]">Marketplace <ArrowRight className="h-4 w-4" /></Link>
        </div>

        <div className="lp-rail -mx-5 mt-8 flex gap-4 overflow-x-auto px-5 pb-2 md:-mx-8 md:px-8">
          {PROTOCOLS.map((p) => (
            <article key={p.name} className={`lp-card flex shrink-0 flex-col ${p.featured ? "w-[min(88vw,460px)]" : "w-[min(80vw,330px)]"}`}>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="tnum text-[11px] font-bold uppercase tracking-[0.14em] text-[#646e7e]">{p.nodes} nodes · {p.trades}</span>
                  {p.featured && <span className="rounded-full bg-[#e8edf4] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#070b12]">Featured</span>}
                </div>
                <h3 className="mt-2 text-[22px] font-bold leading-tight tracking-tight text-white">{p.name}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[#9da8b8]">{p.desc}</p>
                <svg viewBox="0 0 300 64" className="mt-4 h-14 w-full" preserveAspectRatio="none" role="img" aria-label={`${p.name} equity curve`}>
                  <polyline points={sparkPoints(p.seed, 36, 300, 64)} fill="none" stroke="#9da8b8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
                <div className="tnum mt-3 flex gap-5 border-t border-white/[0.07] pt-3 text-[12px]">
                  <span className="text-[#646e7e]">Win <b className="text-white">{p.wr}</b></span>
                  <span className="text-[#646e7e]">Return <b className="text-[#3aa67f]">{p.ret}</b></span>
                  <span className="text-[#646e7e]">Sharpe <b className="text-white">{p.sharpe}</b></span>
                </div>
                <Link href="/builder" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-white underline decoration-white/25 underline-offset-4 hover:decoration-white">
                  Clone in builder <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="story" className="scroll-mt-16 border-y border-white/[0.07] bg-[#0a0f17]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:px-8 md:py-20 lg:grid-cols-12">
          <div className="lp-reveal lg:col-span-7">
            <h2 className="lp-display max-w-[18ch] text-[clamp(2rem,4.5vw,3.2rem)] text-white">An account <em>that has to prove it.</em></h2>
            <p className="mt-5 max-w-[62ch] text-[15.5px] leading-relaxed text-[#9da8b8]">
              VantagePoint began with one question: what if a trading idea had to show its work?
              Every fill carries its receipt: the headline, the confidence, the confirmation,
              the guardrail that said yes.
            </p>
            <div className="tnum mt-8 grid grid-cols-3 gap-6 border-t border-white/[0.07] pt-6">
              <div><div className="text-[clamp(1.5rem,3vw,2.2rem)] font-bold tracking-tight text-white">{equity ?? "…"}</div><div className="mt-1 text-[12.5px] text-[#646e7e]">Account equity</div></div>
              <div><div className="text-[clamp(1.5rem,3vw,2.2rem)] font-bold tracking-tight text-white">61.4%</div><div className="mt-1 text-[12.5px] text-[#646e7e]">Win rate · 132 trades</div></div>
              <div><div className="text-[clamp(1.5rem,3vw,2.2rem)] font-bold tracking-tight text-white">0.5 / 3%</div><div className="mt-1 text-[12.5px] text-[#646e7e]">Day-loss guard used today</div></div>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/terminal" className="lp-btn lp-btn-solid text-[13px]">See the terminal <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/backtest" className="lp-btn lp-btn-ghost text-[13px]">Replay it in backtest</Link>
            </div>
          </div>
          <div className="lp-reveal lg:col-span-5">
            <div className="rounded-xl border border-white/[0.08] bg-[#0c121c] p-5">
              <div className="flex items-center justify-between text-[12.5px] font-bold text-white">
                <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#3aa67f]" /> Guardrails on every order</span>
                <span className="tnum text-[11px] font-semibold text-[#646e7e]">ENFORCED</span>
              </div>
              <ul className="mt-4 space-y-3 text-[13.5px] leading-relaxed text-[#c7cfda]">
                <li className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#e8edf4]" /> Confidence gate at 0.75: weak reads never reach price checks.</li>
                <li className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#e8edf4]" /> 5-minute momentum confirmation: the market co-signs or the idea dies.</li>
                <li className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#e8edf4]" /> 2% equity sizing, $10,000 cap: no single headline can sink the day.</li>
                <li className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#e8edf4]" /> Orders route to Alpaca: sized, confirmed, logged.</li>
              </ul>
              <div className="tnum mt-5 rounded-lg bg-black/40 p-3.5 font-mono text-[11.5px] leading-relaxed text-[#9da8b8]">
                <div><span className="text-[#3aa67f]">✓</span> n_ai · confidence 0.92 ≥ 0.75</div>
                <div><span className="text-[#3aa67f]">✓</span> n_tech · momentum +0.34% ≥ 0.30%</div>
                <div><span className="text-[#3aa67f]">✓</span> n_risk · $4,882 ≤ $10,000 · day 0.5/3%</div>
                <div className="text-white">→ trade BUY 26× NVDA @ 187.60</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="journey" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-14 md:px-8 md:py-20">
        <div className="lp-reveal grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="lp-display text-[clamp(2rem,4.5vw,3.2rem)] text-white">The journey <em>of a signal.</em></h2>
            <p className="mt-4 max-w-[58ch] text-[15.5px] leading-relaxed text-[#9da8b8]">
              A signal has four stages. Most ideas rightly die at stage three. That is the point.
            </p>
            <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Signal stages">
              {PHASES.map((p, i) => (
                <button key={p.name} role="tab" aria-selected={phase === i} onClick={() => setPhase(i)}
                  className={`tnum rounded-md border px-4 py-2 text-[13px] font-bold transition-colors ${phase === i ? "border-[#e8edf4] bg-[#e8edf4] text-[#070b12]" : "border-white/10 bg-transparent text-[#9da8b8] hover:text-white"}`}>
                  {p.name}
                </button>
              ))}
            </div>
            <Link href="/builder" className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-white underline decoration-white/25 underline-offset-4 hover:decoration-white">
              Open this graph in the builder <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="lp-reveal lg:col-span-7" role="tabpanel">
            <div className="lp-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                <div className="text-[20px] font-bold text-white">{PHASES[phase].title}</div>
                <div className="tnum text-[11.5px] font-bold uppercase tracking-[0.14em] text-[#646e7e]">Stage {phase + 1} / 4 · {PHASES[phase].name}</div>
              </div>
              <div className="grid gap-0 md:grid-cols-2">
                <p className="px-5 py-5 text-[14.5px] leading-relaxed text-[#9da8b8]">{PHASES[phase].body}</p>
                <div className="border-t border-white/[0.07] px-5 py-5 md:border-l md:border-t-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#646e7e]">Node config</div>
                  <ul className="tnum mt-2 space-y-1.5 font-mono text-[12px] text-white">
                    {PHASES[phase].config.map((c) => <li key={c} className="rounded-md bg-white/[0.04] px-2.5 py-1.5">{c}</li>)}
                  </ul>
                  <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#646e7e]">Sample output</div>
                  <div className="tnum mt-2 rounded-md border border-[#3aa67f]/25 bg-[#3aa67f]/10 px-2.5 py-2 font-mono text-[12px] font-semibold text-[#7fcfae]">{PHASES[phase].out}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="lab" className="border-y border-white/[0.07] bg-[#0a0f17]">
        <div className="mx-auto grid max-w-7xl gap-5 px-5 py-14 md:px-8 md:py-20 lg:grid-cols-12">
          <div className="lp-reveal lg:col-span-7">
            <div className="lp-card flex h-full flex-col overflow-hidden">
              <div className="flex items-center justify-between px-6 pt-6">
                <h2 className="lp-display text-[clamp(1.7rem,3.5vw,2.4rem)] text-white">The builder canvas.</h2>
                <span className="hidden rounded-full bg-[#e8edf4] px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#070b12] sm:block">Core</span>
              </div>
              <p className="px-6 pt-2 text-[14.5px] leading-relaxed text-[#9da8b8]">Drag nodes, wire logic, press run. The canvas in the app is the same one you learn here.</p>
              <div className="grid flex-1 gap-2.5 p-6 sm:grid-cols-3" aria-hidden="true">
                {[
                  { t: "News Feed", d: "NVDA · TSLA" }, { t: "AI Analyzer", d: "conf ≥ 0.70" },
                  { t: "Price Check", d: "5Min · 20 bars" }, { t: "Threshold", d: "0.75 gate" },
                  { t: "Risk Check", d: "2% · $10k" }, { t: "Trade", d: "Alpaca" },
                ].map((n) => (
                  <div key={n.t} className="rounded-lg border border-white/[0.07] bg-[#0a0f17] p-3">
                    <div className="h-1.5 w-8 rounded-full bg-[#2a3342]" />
                    <div className="mt-2 text-[12.5px] font-bold text-white">{n.t}</div>
                    <div className="tnum text-[11px] text-[#646e7e]">{n.d}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-white/[0.07] px-6 py-4">
                <span className="tnum text-[12px] text-[#646e7e]">8 nodes · runs in ~4s</span>
                <Link href="/builder" className="lp-btn lp-btn-solid !py-2.5 text-[13px]"><Play className="h-4 w-4" /> Open builder</Link>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-5 lg:col-span-5">
            <div className="lp-reveal lp-card flex-1 p-6">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#646e7e]"><Beaker className="h-4 w-4" /> Backtest lab</div>
              <h3 className="mt-2 text-[24px] font-bold tracking-tight text-white">Replay two months before risking a morning.</h3>
              <svg viewBox="0 0 320 96" className="mt-4 h-24 w-full" preserveAspectRatio="none" role="img" aria-label="Backtest equity curve example">
                <polyline points={sparkPoints(99, 60, 320, 96)} fill="none" stroke="#e8edf4" strokeWidth="2" strokeLinejoin="round" />
              </svg>
              <div className="tnum mt-2 flex gap-5 text-[12px] text-[#646e7e]">
                <span>Return <b className="text-[#3aa67f]">+18.2%</b></span>
                <span>Max DD <b className="text-[#e5484d]">−6.1%</b></span>
                <span>Fees + slippage <b className="text-white">included</b></span>
              </div>
              <Link href="/backtest" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-white underline decoration-white/25 underline-offset-4 hover:decoration-white">
                Run a backtest <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="lp-reveal lp-card p-6">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#646e7e]"><Compass className="h-4 w-4" /> Start from a recipe</div>
              <h3 className="mt-2 text-[24px] font-bold leading-tight tracking-tight text-white">Momentum, bounce, or event?</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#9da8b8]">Start from the closest strategy instead of a blank canvas.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["Momentum", "Mean-reversion", "Event-driven"].map((k) => (
                  <Link key={k} href="/builder" className="rounded-md border border-white/10 px-3.5 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-white/[0.06]">{k}</Link>
                ))}
                <Link href="/builder" className="lp-btn lp-btn-solid !py-2 text-[12.5px]">Start <ArrowRight className="h-4 w-4" /></Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="intel" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-14 md:px-8 md:py-20">
        <div className="lp-reveal flex flex-wrap items-end justify-between gap-4">
          <h2 className="lp-display max-w-[16ch] text-[clamp(2rem,4.5vw,3.2rem)] text-white">The intel journal, <em>this morning.</em></h2>
          <Link href="/intelligence" className="lp-btn lp-btn-ghost text-[13px]"><Newspaper className="h-4 w-4" /> All intelligence</Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {intel.map((n) => (
            <Link key={n.id} href="/intelligence" className="lp-reveal lp-card group flex flex-col overflow-hidden transition-colors hover:border-white/20">
              <div className="flex flex-col gap-3 border-b border-white/[0.07] p-5">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em]">
                  <span className="text-[#9da8b8]">{n.source}</span>
                  <span className="tnum text-[#646e7e]">{n.tickers.join(" · ")}</span>
                </div>
                <div className="tnum flex items-center gap-2 text-[11.5px] font-bold">
                  <span className={n.sentiment === "bullish" ? "text-[#3aa67f]" : n.sentiment === "bearish" ? "text-[#e5484d]" : "text-[#9da8b8]"}>{n.sentiment.toUpperCase()}</span>
                  <span className="text-[#646e7e]">conf {n.confidence.toFixed(2)} · impact {n.impact.toFixed(2)}</span>
                </div>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-[15.5px] font-bold leading-snug tracking-tight text-white group-hover:underline group-hover:decoration-white/40 group-hover:underline-offset-4">{n.headline}</h3>
                <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-[#9da8b8]">{n.summary}</p>
                <span className="tnum mt-3 text-[12px] text-[#646e7e]"><TimeAgo ts={n.ts} /> · {n.source}</span>
              </div>
            </Link>
          ))}
        </div>
        <div className="lp-reveal mt-10 flex flex-col items-center gap-4 rounded-xl border border-white/[0.07] bg-[#0a0f17] px-6 py-10 text-center">
          <h3 className="lp-display max-w-[20ch] text-[clamp(1.6rem,3.5vw,2.4rem)] text-white">Draw it once. Let the morning <em>bring the news.</em></h3>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/get-started" className="lp-btn lp-btn-solid">Get started <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/marketplace" className="lp-btn lp-btn-ghost"><Plus className="h-4 w-4" /> Clone a strategy</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.07] bg-[#0a0f17]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:px-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.png" alt="VantagePoint" className="h-9 w-9 rounded-[10px] object-cover" />
              <span className="leading-none">
                <span className="block text-[16px] font-bold tracking-tight text-white">VantagePoint</span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-[#646e7e]">Trading Terminal</span>
              </span>
            </div>
            <p className="mt-4 max-w-[38ch] text-[13.5px] leading-relaxed text-[#9da8b8]">
              Visual AI trading protocols. Draw the logic, prove it on history, run it on the morning news.
            </p>
            <div className="tnum mt-4 flex items-center gap-2 text-[12px] text-[#646e7e]">
              <Workflow className="h-4 w-4" /> Builder
              <span className="text-white/20">·</span> <FlaskConical className="h-4 w-4" /> Backtest
              <span className="text-white/20">·</span> <BookOpen className="h-4 w-4" /> Journal
            </div>
          </div>
          <nav className="grid grid-cols-2 gap-8 text-[13.5px] sm:grid-cols-3 lg:col-span-8" aria-label="Footer">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#646e7e]">Product</div>
              <ul className="mt-3 space-y-2.5 font-medium text-[#9da8b8]">
                <li><Link href="/dashboard" className="transition-colors hover:text-white">Dashboard</Link></li>
                <li><Link href="/builder" className="transition-colors hover:text-white">Protocol Builder</Link></li>
                <li><Link href="/backtest" className="transition-colors hover:text-white">Backtesting</Link></li>
                <li><Link href="/marketplace" className="transition-colors hover:text-white">Marketplace</Link></li>
              </ul>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#646e7e]">Culture</div>
              <ul className="mt-3 space-y-2.5 font-medium text-[#9da8b8]">
                <li><Link href="/intelligence" className="transition-colors hover:text-white">Market Intel</Link></li>
                <li><Link href="/terminal" className="transition-colors hover:text-white">Terminal</Link></li>
                <li><a href="#journey" className="transition-colors hover:text-white">Signal journey</a></li>
                <li><a href="#protocols" className="transition-colors hover:text-white">Strategies</a></li>
              </ul>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#646e7e]">Company</div>
              <ul className="mt-3 space-y-2.5 font-medium text-[#9da8b8]">
                <li><a href="#story" className="transition-colors hover:text-white">Proof</a></li>
                <li><a href="#lab" className="transition-colors hover:text-white">Lab</a></li>
                <li><a href="#intel" className="transition-colors hover:text-white">Journal</a></li>
                <li><Link href="/get-started" className="transition-colors hover:text-white">Get started</Link></li>
              </ul>
            </div>
          </nav>
        </div>
        <div className="border-t border-white/[0.07]">
          <div className="tnum mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-5 text-[12px] text-[#525c6c] md:px-8">
            <span>© 2026 VantagePoint Trading</span>
            <span>Not financial advice.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
