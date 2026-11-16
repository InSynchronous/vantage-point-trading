"use client";
export const dynamic = "force-dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TerminalChart, type Bar, type Marker } from "@/components/terminal-chart";
import {
  fetchAccount, fetchPositions, fetchOrders, fetchSnapshots, fetchBars, fetchAssets, placeOrder, cancelOrder, closePosition,
  type Account, type Position, type Order, type Snapshot, type Asset,
} from "@/lib/alpaca";
import { fmtMoney, fmtPct } from "@/lib/mock-data";
import { SideBadge } from "@/components/side-badge";
import { clsx } from "clsx";

const RANGES = [
  { label: "1D", tf: "5Min", days: 4 }, { label: "1W", tf: "15Min", days: 7 },
  { label: "1M", tf: "1Hour", days: 31 }, { label: "3M", tf: "1Day", days: 93 },
  { label: "1Y", tf: "1Day", days: 366 }, { label: "5Y", tf: "1Week", days: 1826 },
];

export default function TerminalPage() {
  const [symbol, setSymbol] = useState("NVDA");
  const [range, setRange] = useState("1D");
  const [bars, setBars] = useState<Bar[]>([]);
  const [chartErr, setChartErr] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [acct, setAcct] = useState<Account | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [dayPnl, setDayPnl] = useState<number | null>(null);
  // bracket state lives here so the chart's draggable lines and the ticket stay in sync
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [useTp, setUseTp] = useState(true);
  const [useSl, setUseSl] = useState(true);
  const [tpPct, setTpPct] = useState("6");
  const [slPct, setSlPct] = useState("3");
  const [tpOvr, setTpOvr] = useState<number | null>(null);
  const [slOvr, setSlOvr] = useState<number | null>(null);

  const loadMarket = useCallback(async (sym: string, rangeLabel: string) => {
    const r = RANGES.find((x) => x.label === rangeLabel) ?? RANGES[0];
    const start = new Date(Date.now() - r.days * 864e5).toISOString();
    try {
      const [b, s] = await Promise.all([fetchBars(sym, r.tf, 1000, start), fetchSnapshots([sym])]);
      if (!b.bars.length && (s[0]?.price == null)) {
        setBars([]); setSnap(null); setChartErr(`No data for ${sym}. Check the symbol.`);
        return;
      }
      let list = b.bars;
      if (rangeLabel === "1D" && list.length) {
        // last full session only (weekends have no intraday bars)
        const lastDay = list.reduce((m, x) => (x.time.slice(0, 10) > m ? x.time.slice(0, 10) : m), "");
        list = list.filter((x) => x.time.slice(0, 10) === lastDay);
      }
      setBars(list); setSnap(s[0] ?? null); setChartErr(null);
    } catch {
      setBars([]); setSnap(null); setChartErr(`Couldn't load ${sym}.`);
    }
  }, []);

  const loadAccount = useCallback(async () => {
    try {
      const [a, p, o] = await Promise.all([fetchAccount(), fetchPositions(), fetchOrders(20)]);
      setAcct(a); setPositions(p); setOrders(o);
      const h = await fetch("/api/alpaca/history?period=1D&timeframe=15Min").then((r) => r.json()).catch(() => null);
      const pts: { v: number }[] = h?.points ?? [];
      if (pts.length > 1) setDayPnl(pts[pts.length - 1].v - pts[0].v);
    } catch { /* keep previous */ }
  }, []);

  useEffect(() => { loadMarket(symbol, range); }, [symbol, range, loadMarket]);
  useEffect(() => {
    loadAccount();
    const t = setInterval(loadAccount, 20000);
    const m = setInterval(() => loadMarket(symbol, range), 60000);
    return () => { clearInterval(t); clearInterval(m); };
  }, [loadAccount, loadMarket, symbol, range]);

  const myPosition = positions.find((p) => p.ticker === symbol);
  const openOrders = orders.filter((o) => ["new", "accepted", "pending_new", "partially_filled"].includes(o.status));

  const refPx = snap?.price ?? null;
  const dir = side === "buy" ? 1 : -1;
  const baseTp = useTp && refPx ? refPx * (1 + (dir * Number(tpPct || 0)) / 100) : null;
  const baseSl = useSl && refPx ? refPx * (1 - (dir * Number(slPct || 0)) / 100) : null;
  const effTp = tpOvr ?? baseTp;
  const effSl = slOvr ?? baseSl;

  const markers = useMemo(() => {
    if (!bars.length) return [];
    const times = bars.map((b) => Math.floor(new Date(b.time).getTime() / 1000));
    return orders
      .filter((o) => o.ticker === symbol && o.price > 0 && o.filledQty > 0)
      .map((o): Marker => {
        const ts = Math.floor(o.ts / 1000);
        let t = times[0];
        for (const bt of times) { if (bt <= ts) t = bt; else break; }
        const buy = o.side === "BUY";
        return {
          time: t, position: buy ? "belowBar" : "aboveBar",
          color: buy ? "#3aa67f" : "#e5484d", shape: buy ? "arrowUp" : "arrowDown",
          text: `${buy ? "B" : "S"} ${o.filledQty}@${o.price.toFixed(2)}`,
        };
      });
  }, [bars, orders, symbol]);

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <TerminalTopBar
        symbol={symbol} setSymbol={setSymbol}
        range={range} setRange={setRange} snap={snap} acct={acct} dayPnl={dayPnl}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[1fr_360px]">
        <div className="relative min-h-[420px] border-r border-white/[0.07] bg-[#04070d]">
          {chartErr ? (
            <div className="grid h-full place-items-center p-8 text-center">
              <div><div className="text-[14px] font-bold text-white">{chartErr}</div>
              <div className="mt-1 font-mono text-[12px] text-[#646e7e]">Search any tradable US stock or ETF above.</div></div>
            </div>
          ) : (
            <div className="relative h-full w-full" title="Double-click chart to reset view">
              <TerminalChart symbol={symbol} viewKey={`${symbol}:${range}`} bars={bars} markers={markers} avgCost={myPosition?.avgCost ?? null}
                tpPrice={useTp ? effTp : null} slPrice={useSl ? effSl : null}
                onTpChange={(p) => setTpOvr(p)} onSlChange={(p) => setSlOvr(p)} />
            </div>
          )}
        </div>
        <div className="min-h-0 overflow-y-auto bg-[#060b16]">
          <div className="border-b border-white/[0.07] p-4">
            <div className="vp-ledger-head">Order ticket · {symbol}</div>
            <div className="mt-2"><AdvancedTicket symbol={symbol} last={snap?.price ?? null} onDone={loadAccount}
              side={side} setSide={setSide} useTp={useTp} setUseTp={setUseTp} useSl={useSl} setUseSl={setUseSl}
              tpPct={tpPct} setTpPct={(v) => { setTpPct(v); setTpOvr(null); }} slPct={slPct} setSlPct={(v) => { setSlPct(v); setSlOvr(null); }}
              tpPrice={effTp} slPrice={effSl} positionQty={myPosition?.qty ?? 0} /></div>
          </div>
          <div className="border-b border-white/[0.07] p-4">
            <div className="vp-ledger-head">Positions · {positions.length}</div>
            <div className="mt-2 space-y-1.5">
              {positions.length === 0 && <div className="text-[12px] text-[#525c6c]">No open positions.</div>}
              {positions.map((p) => (
                <PositionRow key={p.ticker} p={p} active={p.ticker === symbol} onSelect={() => setSymbol(p.ticker)} onChanged={loadAccount} />
              ))}
            </div>
          </div>
          <div className="p-4">
            <div className="vp-ledger-head">Orders · {openOrders.length} open</div>
            <div className="mt-2 space-y-1.5">
              {orders.length === 0 && <div className="text-[12px] text-[#525c6c]">No orders.</div>}
              {orders.slice(0, 12).map((o) => (
                <OrderRow key={o.id} o={o} onChanged={loadAccount} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -- top strip -- */
function TerminalTopBar({ symbol, setSymbol, range, setRange, snap, acct, dayPnl }: {
  symbol: string; setSymbol: (s: string) => void;
  range: string; setRange: (s: string) => void; snap: Snapshot | null; acct: Account | null; dayPnl: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[0.07] bg-[#060b16] px-4 py-2.5">
      <SymbolSearch symbol={symbol} onPick={setSymbol} />
      <div className="flex items-center gap-3 font-mono">
        <span className="text-[16px] font-bold text-white">{snap?.price != null ? snap.price.toFixed(2) : "…"}</span>
        {snap?.changePct != null && (
          <span className={clsx("text-[12px] font-bold", snap.changePct >= 0 ? "text-[#3aa67f]" : "text-[#e5484d]")}>
            {snap.changePct >= 0 ? "+" : ""}{snap.changePct.toFixed(2)}%
          </span>
        )}
      </div>
      <div className="flex gap-1 rounded-md bg-white/[0.04] p-1">
        {RANGES.map((t) => (
          <button key={t.label} onClick={() => setRange(t.label)}
            className={clsx("rounded px-2.5 py-1 font-mono text-[11.5px] font-bold", range === t.label ? "bg-white/10 text-white" : "text-[#646e7e] hover:text-white")}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-4 font-mono text-[11.5px] text-[#9da8b8]">
        <span>EQ <b className="text-white">{acct ? fmtMoney(acct.equity) : "…"}</b></span>
        <span>BP <b className="text-white">{acct ? fmtMoney(acct.buyingPower) : "…"}</b></span>
        <span>Day <b className={dayPnl != null && dayPnl < 0 ? "text-[#e5484d]" : "text-[#3aa67f]"}>{dayPnl != null ? `${dayPnl >= 0 ? "+" : ""}${fmtMoney(dayPnl)}` : "…"}</b></span>
      </div>
    </div>
  );
}

/* -- symbol search over full US equity universe -- */
function SymbolSearch({ symbol, onPick }: { symbol: string; onPick: (s: string) => void }) {
  const [q, setQ] = useState(symbol);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [recents, setRecents] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("vp-recents") ?? '["NVDA","SPY","AAPL","TSLA"]'); } catch { return ["NVDA", "SPY", "AAPL", "TSLA"]; }
  });
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => { setQ(symbol); }, [symbol]);
  useEffect(() => { fetchAssets().then(setAssets).catch(() => setAssets([])); }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

type Match = { s: string; n: string; x: string; recent: boolean };

  const matches: Match[] = useMemo(() => {
    const query = q.trim().toUpperCase();
    if (!query) return recents.slice(0, 8).map((s) => ({ s, n: "", x: "", recent: true }));
    if (!assets) return [];
    const starts: Match[] = [];
    const contains: Match[] = [];
    for (const a of assets) {
      if (a.s.startsWith(query)) starts.push({ ...a, recent: false });
      else if (a.s.includes(query) || a.n.toUpperCase().includes(query)) contains.push({ ...a, recent: false });
      if (starts.length >= 8) break;
    }
    return [...starts, ...contains].slice(0, 8);
  }, [q, assets, recents]);

  const pick = (s: string) => {
    const sym = s.toUpperCase();
    setRecents((r) => { const next = [sym, ...r.filter((x) => x !== sym)].slice(0, 8); try { localStorage.setItem("vp-recents", JSON.stringify(next)); } catch {} return next; });
    onPick(sym); setOpen(false); setQ(sym);
  };

  return (
    <div ref={wrap} className="relative">
      <input value={q}
        onChange={(e) => { setQ(e.target.value.toUpperCase()); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { const m = matches[hi] ?? matches[0]; if (m) pick(m.s); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className="w-44 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-[13px] font-bold text-white outline-none focus:border-white/30"
        placeholder="Search stocks…" spellCheck={false} />
      {open && matches.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg border border-white/10 bg-[#0c121c] shadow-2xl shadow-black/60">
          {matches.map((m, i) => (
            <button key={m.s} onMouseEnter={() => setHi(i)} onClick={() => pick(m.s)}
              className={clsx("flex w-full items-center gap-2.5 px-3 py-2 text-left", i === hi ? "bg-white/[0.08]" : "")}>
              <span className="font-mono text-[12.5px] font-bold text-white">{m.s}</span>
              <span className="truncate text-[11.5px] text-[#9da8b8]">{m.recent ? "recent" : m.n}</span>
              {m.x && <span className="ml-auto shrink-0 font-mono text-[10px] text-[#525c6c]">{m.x}</span>}
            </button>
          ))}
        </div>
      )}
      {open && q.trim() && assets && matches.length === 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-white/10 bg-[#0c121c] px-3 py-2.5 text-[12px] text-[#646e7e]">
          No match. Press Enter to try “{q.trim().toUpperCase()}” anyway.
        </div>
      )}
    </div>
  );
}
/* -- advanced ticket with bracket -- */
function AdvancedTicket({ symbol, last, onDone, side, setSide, useTp, setUseTp, useSl, setUseSl, tpPct, setTpPct, slPct, setSlPct, tpPrice, slPrice, positionQty }: {
  symbol: string; last: number | null; onDone: () => void;
  side: "buy" | "sell"; setSide: (s: "buy" | "sell") => void;
  useTp: boolean; setUseTp: (v: boolean) => void; useSl: boolean; setUseSl: (v: boolean) => void;
  tpPct: string; setTpPct: (v: string) => void; slPct: string; setSlPct: (v: string) => void;
  tpPrice: number | null; slPrice: number | null; positionQty: number;
}) {
  const [qty, setQty] = useState("10");
  const [type, setType] = useState<"market" | "limit" | "stop" | "stop_limit">("market");
  const [limitPx, setLimitPx] = useState("");
  const [stopPx, setStopPx] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const ref = last ?? 0;
  const est = ref > 0 && Number(qty) > 0 ? ref * Math.floor(Number(qty)) : null;
  // no naked shorts: SELL requires an open position, capped at its size
  const sellBlocked = side === "sell" && positionQty <= 0;
  const sellOver = side === "sell" && positionQty > 0 && Math.floor(Number(qty)) > positionQty;
  const blockReason = sellBlocked
    ? `No position in ${symbol}. Buying first is required. Short selling is disabled.`
    : sellOver ? `Exceeds your ${positionQty} sh position. Lower the qty to close, not flip short.` : null;

  const submit = async () => {
    if (blockReason) { setMsg({ ok: false, text: blockReason }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await placeOrder({
        symbol, qty: Math.floor(Number(qty)), side, type,
        ...(type === "limit" || type === "stop_limit" ? { limit_price: Number(limitPx) } : {}),
        ...(type === "stop" || type === "stop_limit" ? { stop_price: Number(stopPx) } : {}),
        ...(tpPrice ? { take_profit: Number(tpPrice.toFixed(2)) } : {}),
        ...(slPrice ? { stop_loss: Number(slPrice.toFixed(2)) } : {}),
      });
      if ((res as { error?: string }).error) throw new Error((res as { error?: string }).error);
      setMsg({ ok: true, text: `${res.side} ${res.qty}× ${res.ticker} (${res.status})${tpPrice || slPrice ? " · bracket attached" : ""}` });
      onDone();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? "Order rejected" });
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-1 rounded-md bg-white/[0.04] p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button key={s} onClick={() => { setSide(s); if (s === "sell" && positionQty > 0) setQty(String(positionQty)); }}
            className={clsx("rounded py-1.5 text-[12.5px] font-bold uppercase", side === s ? (s === "buy" ? "bg-[#3aa67f] text-white" : "bg-[#e5484d] text-white") : "text-[#9da8b8] hover:text-white")}>
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>
      <div className="mt-2.5 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="vp-label">Qty</span><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className="vp-input mt-1 font-mono" /></label>
          <label className="block"><span className="vp-label">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="vp-input mt-1">
              <option value="market">Market</option><option value="limit">Limit</option><option value="stop">Stop</option><option value="stop_limit">Stop-limit</option>
            </select>
          </label>
        </div>
        {(type === "limit" || type === "stop_limit") && (
          <label className="block"><span className="vp-label">Limit price</span><input value={limitPx} onChange={(e) => setLimitPx(e.target.value)} inputMode="decimal" placeholder={last ? last.toFixed(2) : "0.00"} className="vp-input mt-1 font-mono" /></label>
        )}
        {(type === "stop" || type === "stop_limit") && (
          <label className="block"><span className="vp-label">Stop price</span><input value={stopPx} onChange={(e) => setStopPx(e.target.value)} inputMode="decimal" placeholder={last ? last.toFixed(2) : "0.00"} className="vp-input mt-1 font-mono" /></label>
        )}
        <div className="rounded-md border border-white/[0.07] bg-black/30 p-2.5">
          <div className="vp-label">Auto exit · bracket</div>
          <label className="mt-2 flex items-center gap-2 text-[12px] text-[#c7cfda]">
            <input type="checkbox" checked={useTp} onChange={(e) => setUseTp(e.target.checked)} className="accent-[#3aa67f]" />
            Take profit
            <input value={tpPct} onChange={(e) => setTpPct(e.target.value)} inputMode="decimal" className="ml-auto w-14 rounded border border-white/10 bg-black/40 px-1.5 py-1 text-right font-mono text-[12px] text-white" />
            <span className="font-mono text-[#646e7e]">{tpPrice ? `$${tpPrice.toFixed(2)}` : "…"}</span>
          </label>
          <label className="mt-2 flex items-center gap-2 text-[12px] text-[#c7cfda]">
            <input type="checkbox" checked={useSl} onChange={(e) => setUseSl(e.target.checked)} className="accent-[#e5484d]" />
            Stop loss
            <input value={slPct} onChange={(e) => setSlPct(e.target.value)} inputMode="decimal" className="ml-auto w-14 rounded border border-white/10 bg-black/40 px-1.5 py-1 text-right font-mono text-[12px] text-white" />
            <span className="font-mono text-[#646e7e]">{slPrice ? `$${slPrice.toFixed(2)}` : "…"}</span>
          </label>
        </div>
        <div className="flex items-center justify-between font-mono text-[11.5px] text-[#646e7e]">
          <span>Est. value</span><span className="text-white">{est != null ? fmtMoney(est) : "…"}</span>
        </div>
        <button onClick={submit} disabled={busy || !!blockReason}
          className={clsx("w-full rounded-md py-2.5 text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-40", side === "buy" ? "bg-[#3aa67f] text-white hover:brightness-110" : "bg-[#e5484d] text-white hover:brightness-110")}>
          {busy ? "Routing…" : `${side === "buy" ? "Buy" : "Sell"} ${symbol}`}
        </button>
        {blockReason && <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-[#9da8b8]">{blockReason}</div>}
        {msg && (
          <div className={clsx("rounded-md border px-3 py-2 text-[12px]", msg.ok ? "border-[#3aa67f]/25 bg-[#3aa67f]/10 text-[#7fcfae]" : "border-[#e5484d]/25 bg-[#e5484d]/10 text-[#f1999c]")}>{msg.text}</div>
        )}
      </div>
    </div>
  );
}

/* -- rows -- */
function PositionRow({ p, active, onSelect, onChanged }: { p: Position; active: boolean; onSelect: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const close = async () => {
    if (!confirm(`Close ${p.ticker} (${p.qty} sh)?`)) return;
    setBusy(true);
    await closePosition(p.ticker).catch(() => null);
    setBusy(false); onChanged();
  };
  return (
    <div className={clsx("rounded-md border p-2.5", active ? "border-white/25 bg-white/[0.05]" : "border-white/[0.07] bg-white/[0.015]")}>
      <div className="flex items-center justify-between">
        <button onClick={onSelect} className="font-mono text-[12px] font-bold text-white hover:underline">{p.ticker} <span className="font-normal text-[#646e7e]">{p.qty}</span></button>
        <span className={clsx("font-mono text-[11.5px] font-bold", p.unrealizedPl >= 0 ? "text-[#3aa67f]" : "text-[#e5484d]")}>
          {p.unrealizedPl >= 0 ? "+" : ""}{fmtMoney(p.unrealizedPl)} ({fmtPct(p.unrealizedPlPct)})
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[10.5px] text-[#646e7e]">
        <span>avg {fmtMoney(p.avgCost)} · last {fmtMoney(p.price)}</span>
        <button onClick={close} disabled={busy} className="rounded border border-white/10 px-2 py-0.5 text-[10.5px] font-bold text-white hover:bg-white/10 disabled:opacity-50">
          {busy ? "…" : "Close"}
        </button>
      </div>
    </div>
  );
}

function OrderRow({ o, onChanged }: { o: Order; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const open = ["new", "accepted", "pending_new", "partially_filled"].includes(o.status);
  const cancel = async () => {
    setBusy(true);
    await cancelOrder(o.id).catch(() => null);
    setBusy(false); onChanged();
  };
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.015] px-2.5 py-2">
      <SideBadge side={o.side} />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[11.5px] font-bold text-white">{o.filledQty || o.qty}× {o.ticker} <span className="font-normal text-[#646e7e]">{o.type}</span></div>
        <div className="truncate font-mono text-[10.5px] text-[#525c6c]">{o.status}{o.price ? ` · @ $${o.price.toFixed(2)}` : ""}</div>
      </div>
      {open && (
        <button onClick={cancel} disabled={busy} className="shrink-0 rounded border border-white/10 px-2 py-1 font-mono text-[10.5px] font-bold text-white hover:bg-white/10 disabled:opacity-50">
          {busy ? "…" : "Cancel"}
        </button>
      )}
    </div>
  );
}
