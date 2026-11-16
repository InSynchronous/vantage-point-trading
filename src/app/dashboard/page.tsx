"use client";
import Link from "next/link";
import { useBuilder } from "@/lib/store";
import { SideBadge } from "@/components/side-badge";

export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import { fmtMoney } from "@/lib/mock-data";
import { TimeAgo } from "@/components/time-ago";
import { fetchAccount, fetchOrders, fetchHistory, fetchSnapshots, fetchBars, fetchNews, type Account, type Order, type Snapshot, type NewsArticle } from "@/lib/alpaca";
import { EquityChart, CandleChart } from "@/components/charts";
import { ArrowUpRight, ArrowDownRight, Play, Plus, X } from "lucide-react";
import { useWatchlist, cleanSymbol } from "@/lib/watchlist";

function lastSession<T extends { time: string }>(bars: T[]): T[] {
  if (!bars.length) return bars;
  const lastDay = bars.reduce((m, x) => (x.time.slice(0, 10) > m ? x.time.slice(0, 10) : m), "");
  return bars.filter((x) => x.time.slice(0, 10) === lastDay);
}

export default function Dashboard() {
  const protocols = useBuilder((s) => s.protocols);
  const signals = useBuilder((s) => s.signals);
  const trades = useBuilder((s) => s.trades);
  const watchlist = useWatchlist((s) => s.symbols);
  const addSymbol = useWatchlist((s) => s.add);
  const removeSymbol = useWatchlist((s) => s.remove);
  const [draft, setDraft] = useState("");

  const [acct, setAcct] = useState<Account | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [curve, setCurve] = useState<{ t: string; v: number }[]>([]);
  const [nvdaBars, setNvdaBars] = useState<{ time: string; open: number; high: number; low: number; close: number }[] | null>(null);
  const [topNews, setTopNews] = useState<NewsArticle[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [a, o, h, s, b, nw] = await Promise.all([
          fetchAccount(), fetchOrders(6), fetchHistory("1M", "1D"),
          fetchSnapshots(watchlist.length ? watchlist : ["SPY"]), fetchBars("NVDA", "5Min", 1000, new Date(Date.now() - 4 * 864e5).toISOString()), fetchNews(watchlist.slice(0, 6), 12),
        ]);
        if (!live) return;
        setAcct(a); setOrders(o); setCurve(h.points); setSnaps(s); setNvdaBars(lastSession(b.bars)); setTopNews(nw.slice(0, 3));
      } catch { /* keep silent fallbacks */ }
    })();
    return () => { live = false; };
  }, [watchlist.join(",")]);

  const equity = acct?.equity;
  const recentTrades = trades.slice(0, 5);

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="vp-ledger-head">Tuesday desk</div>
          <h1 className="mt-1 text-[20px] font-bold tracking-tight text-white">Morning review: {protocols.length} protocols watching 14 tickers</h1>
          <p className="mt-1 text-[13px] text-[#9da8b8]">AI engine via opencode endpoint · risk guard 0.5% / 3%</p>
        </div>
        <div className="flex gap-2">
          <Link href="/builder" className="flex items-center gap-2 rounded-md bg-[#e8edf4] px-3.5 py-2 text-[13px] font-bold text-black hover:bg-white"><Play className="h-4 w-4" /> Open Builder</Link>
          <Link href="/marketplace" className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-white/[0.06]"><Plus className="h-4 w-4" /> Clone strategy</Link>
        </div>
      </div>

      <div className="vp-card grid grid-cols-2 divide-white/[0.07] max-xl:gap-px xl:grid-cols-4 xl:divide-x">
        <LedgerStat label="Account value" value={equity != null ? fmtMoney(equity) : "…"} sub={acct ? `${fmtMoney(acct.cash)} cash` : "connecting…"} tone="flat" />
        <LedgerStat label="Buying power" value={acct ? fmtMoney(acct.buyingPower) : "…"} sub="day trade · margin 2:1" tone="flat" />
        <LedgerStat label="Open positions" value="…" sub="see terminal" tone="flat" />
        <LedgerStat label="Active protocols" value={String(protocols.filter((p) => p.status !== "paused").length)} sub={`${protocols.length} total`} tone="flat" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="vp-card p-5 xl:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="vp-ledger-head">Portfolio equity · 1 month</div>
              <div className="mt-1 font-mono text-[20px] font-bold tracking-tight text-white">{equity != null ? fmtMoney(equity) : "…"}</div>
            </div>
          </div>
          <div className="mt-3">{curve.length ? <EquityChart data={curve} height={230} /> : <div className="grid h-[230px] place-items-center font-mono text-[12px] text-[#525c6c]">loading…</div>}</div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-3 text-[12px]">
            <div><div className="text-[#646e7e]">Cash</div><div className="font-mono font-bold text-white">{acct ? fmtMoney(acct.cash) : "…"}</div></div>
            <div><div className="text-[#646e7e]">Equity</div><div className="font-mono font-bold text-white">{equity != null ? fmtMoney(equity) : "…"}</div></div>
            <div><div className="text-[#646e7e]">Positions</div><Link href="/terminal" className="font-semibold text-white underline decoration-white/20 underline-offset-4">Trade</Link></div>
          </div>
        </div>

        <div className="vp-card p-5">
          <div className="flex items-center justify-between">
            <div className="vp-ledger-head">Watchlist</div>
            <span className="font-mono text-[10px] text-[#525c6c]">{watchlist.length}/15</span>
          </div>
          <form
            className="mt-3 flex gap-1.5"
            onSubmit={(e) => { e.preventDefault(); if (cleanSymbol(draft) && addSymbol(draft)) setDraft(""); }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} placeholder="Add ticker, e.g. AMD"
              spellCheck={false} className="vp-input min-w-0 flex-1 !py-1.5 font-mono !text-[12px]" />
            <button type="submit" title="Add to watchlist" className="shrink-0 rounded-md bg-[#e8edf4] px-2.5 text-black hover:bg-white">
              <Plus className="h-4 w-4" />
            </button>
          </form>
          <div className="mt-1 divide-y divide-white/[0.06]">
            {watchlist.map((s) => {
              const snap = snaps.find((x) => x.symbol === s);
              const c = snap?.changePct;
              return (
                <div key={s} className="group flex items-center gap-3 py-2.5 first:pt-2 last:pb-0">
                  <span className="w-10 font-mono text-[12px] font-bold text-white">{s}</span>
                  <span className="ml-auto font-mono text-[12px] text-[#c7cfda]">{snap?.price != null ? snap.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "…"}</span>
                  <span className={`flex w-[70px] items-center justify-end gap-0.5 font-mono text-[11px] font-bold ${(c ?? 0) >= 0 ? "text-[#3aa67f]" : "text-[#e5484d]"}`}>
                    {c == null ? <span className="text-[#525c6c]">…</span> : (<>{c >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(c).toFixed(2)}%</>)}
                  </span>
                  <button onClick={() => removeSymbol(s)} title={`Remove ${s}`} className="rounded p-1 text-[#525c6c] opacity-0 transition-opacity hover:bg-white/[0.06] hover:text-[#f1999c] group-hover:opacity-100">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            {watchlist.length === 0 && <div className="py-4 text-[12px] text-[#525c6c]">Watchlist is empty. Add a ticker above.</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="vp-card p-5">
          <div className="flex items-baseline justify-between">
            <div className="vp-ledger-head">Recent signals</div>
            <Link href="/builder" className="text-[11.5px] font-semibold text-white underline decoration-white/20 underline-offset-4 hover:decoration-white/60">Open builder</Link>
          </div>
          <div className="mt-2 divide-y divide-white/[0.06]">
            {(signals.length ? signals.slice(0, 4).map((s) => ({ ticker: s.ticker, side: s.action, price: s.price, ts: s.ts, protocol: s.protocol })) : []).map((s: any, i: number) => (
              <div key={i} className="flex items-center gap-2.5 py-2.5">
                <SideBadge side={s.side} />
                <div className="min-w-0"><div className="font-mono text-[12px] font-bold text-white">{s.ticker} <span className="font-normal text-[#9da8b8]">@ ${Number(s.price).toFixed(2)}</span></div>
                <div className="truncate text-[11px] text-[#646e7e]">{s.protocol} · <TimeAgo ts={s.ts} /></div></div>
              </div>
            ))}
            {signals.length === 0 && <div className="py-4 text-[12px] text-[#525c6c]">No signals yet. Run a protocol in the builder.</div>}
          </div>
        </div>

        <div className="vp-card p-5">
          <div className="flex items-baseline justify-between">
            <div className="vp-ledger-head">Recent executions</div>
            <Link href="/terminal" className="text-[11.5px] font-semibold text-white underline decoration-white/20 underline-offset-4 hover:decoration-white/60">Terminal</Link>
          </div>
          <div className="mt-2 divide-y divide-white/[0.06]">
            {(orders.length ? orders.slice(0, 5).map((o) => ({ side: o.side, ticker: o.ticker, qty: o.filledQty || o.qty, price: o.price, ts: o.ts, status: o.status })) : recentTrades.map((t) => ({ side: t.side, ticker: t.ticker, qty: t.qty, price: t.price, ts: t.ts, status: "simulated" }))).map((t: any, i: number) => (
              <div key={i} className="flex items-center gap-2.5 py-2.5">
                <SideBadge side={t.side} />
                <div className="min-w-0"><div className="font-mono text-[12px] font-bold text-white">{t.qty}× {t.ticker} <span className="font-normal text-[#9da8b8]">@ ${Number(t.price).toFixed(2)}</span></div>
                <div className="truncate text-[11px] text-[#646e7e]">{t.status}</div></div>
              </div>
            ))}
            {orders.length === 0 && recentTrades.length === 0 && <div className="py-4 text-[12px] text-[#525c6c]">No executions yet.</div>}
          </div>
        </div>

        <div className="vp-card p-5">
          <div className="flex items-baseline justify-between">
            <div className="vp-ledger-head">Protocol performance</div>
            <Link href="/marketplace" className="text-[11.5px] font-semibold text-white underline decoration-white/20 underline-offset-4 hover:decoration-white/60">Marketplace</Link>
          </div>
          <div className="mt-2 divide-y divide-white/[0.06]">
            {protocols.map((p) => (
              <Link key={p.id} href="/builder" className="group flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-semibold text-white group-hover:underline">{p.name}</div>
                  <div className="mt-0.5 flex gap-2.5 font-mono text-[11px] text-[#646e7e]">
                    <span>WR <b className="text-[#c7cfda]">{p.stats?.winRate.toFixed(1) ?? "…"}%</b></span>
                    <span>Ret <b className="text-[#3aa67f]">+{p.stats?.returnPct.toFixed(1) ?? "…"}%</b></span>
                    <span>Sharpe <b className="text-[#c7cfda]">{p.stats?.sharpe.toFixed(2) ?? "…"}</b></span>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-[#3aa67f]/30 bg-[#3aa67f]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-[#7fcfae]">{p.status.toUpperCase()}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="vp-card p-5 xl:col-span-2">
          <div className="vp-ledger-head">NVDA · 5-minute</div>
          <div className="mt-2">{nvdaBars ? <CandleChart symbol="NVDA" data={nvdaBars} height={230} /> : <div className="grid h-[230px] place-items-center font-mono text-[12px] text-[#525c6c]">loading…</div>}</div>
        </div>
        <div className="vp-card p-5">
          <div className="vp-ledger-head">Top intelligence</div>
          <div className="mt-2 divide-y divide-white/[0.06]">
            {topNews.map((n) => (
              <Link key={n.id} href="/intelligence" className="group block py-3 first:pt-1 last:pb-0">
                <div className="text-[12.5px] font-semibold leading-snug text-white group-hover:underline">{n.headline}</div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                  <span className="text-[#646e7e]">{n.source}</span>
                  <span className="ml-auto text-[#525c6c]"><TimeAgo ts={n.ts} /></span>
                </div>
              </Link>
            ))}
            {topNews.length === 0 && <div className="py-4 text-[12px] text-[#525c6c]">Connecting to wire…</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function LedgerStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "up" | "flat" }) {
  return (
    <div className="p-4">
      <div className="vp-ledger-head">{label}</div>
      <div className="mt-1.5 font-mono text-[20px] font-bold tracking-tight text-white">{value}</div>
      <div className={`mt-0.5 text-[12px] font-medium ${tone === "up" ? "text-[#3aa67f]" : "text-[#9da8b8]"}`}>{sub}</div>
    </div>
  );
}
