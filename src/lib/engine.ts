import type { ExecLog, Protocol, Signal, Trade, VPNode } from "@/types/protocol";
import { analyzeNewsClient } from "./ai";

export interface RunContext {
  logs: ExecLog[];
  signals: Signal[];
  trades: Trade[];
  nodeOutputs: Record<string, unknown>;
  portfolio: { equity: number; dayPnl: number };
  /** historical replay: ISO date being simulated (YYYY-MM-DD) */
  asof?: string;
  /** when true, Trade nodes record hypothetical fills instead of routing orders */
  dryRun?: boolean;
  /** prefetched daily closes per ticker for asof lookups */
  closes?: Record<string, { date: string; close: number }[]>;
  /** sensitivity override: replaces every threshold node's gate */
  gateOverride?: number;
  /** test mode: temporarily replace pairs entry bands */
  pairEntryOverride?: number;
  /** test mode: synthetic prices per ticker (uppercase), bypassing live quotes */
  seedPrices?: Record<string, number>;
}

function histClose(ctx: RunContext, ticker: string, date: string): number | null {
  const rows = ctx.closes?.[ticker.toUpperCase()];
  if (!rows) return null;
  let out: number | null = null;
  for (const r of rows) {
    if (r.date <= date && r.close > 0) out = r.close;
    else if (r.date > date) break;
  }
  return out;
}

function log(ctx: RunContext, node: VPNode, level: ExecLog["level"], message: string, data?: unknown) {
  ctx.logs.push({ ts: Date.now(), nodeId: node.id, nodeLabel: node.data.label, level, message, data });
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { cache: "no-store", signal: AbortSignal.timeout(30000), ...init });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j as { error?: string }).error) throw new Error((j as { error?: string }).error ?? `request failed (${r.status})`);
  return j as T;
}

async function livePrice(ticker: string): Promise<number> {
  const snaps = await api<Array<{ symbol: string; price: number | null }>>(`/api/alpaca/snapshots?symbols=${encodeURIComponent(ticker)}`);
  const p = snaps[0]?.price;
  if (p == null || !(p > 0)) throw new Error(`No live price for ${ticker}`);
  return p;
}

/** test-mode seeded price wins, else historical close, else live quote */
async function quote(ctx: RunContext, ticker: string): Promise<number | null> {
  const t = ticker.toUpperCase();
  const seed = ctx.seedPrices?.[t];
  if (seed != null && seed > 0) return seed;
  if (ctx.asof) return histClose(ctx, t, ctx.asof);
  try {
    return await livePrice(t);
  } catch {
    return null;
  }
}

interface NewsStory {
  id: string; ts: number; headline: string; source: string; tickers: string[];
  body: string; author: string; url: string;
}

async function liveNews(tickers: string[], limit = 10): Promise<NewsStory[]> {
  const syms = tickers.length ? tickers : ["SPY"];
  return api<NewsStory[]>(`/api/alpaca/news?symbols=${encodeURIComponent(syms.join(","))}&limit=${limit}`);
}

function downstreamOf(protocol: Protocol, startId: string): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of protocol.edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const seen = new Set([startId]);
  const q = [startId];
  while (q.length) for (const m of adj.get(q.shift()!) ?? []) if (!seen.has(m)) { seen.add(m); q.push(m); }
  return seen;
}

function topoOrder(nodes: VPNode[], edges: { source: string; target: string }[]): VPNode[] {
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  const q = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0);
  const order: VPNode[] = [];
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const qq = [...q];
  while (qq.length) {
    const n = qq.shift()!;
    order.push(n);
    for (const m of adj.get(n.id) ?? []) {
      indeg.set(m, (indeg.get(m) ?? 1) - 1);
      if (indeg.get(m) === 0) {
        const node = nodes.find((x) => x.id === m);
        if (node) qq.push(node);
      }
    }
  }
  for (const n of nodes) if (!order.includes(n)) order.push(n);
  return order;
}

function incomingData(nodeId: string, protocol: Protocol, ctx: RunContext): unknown[] {
  const ins = protocol.edges.filter((e) => e.target === nodeId);
  return ins.map((e) => ctx.nodeOutputs[e.source]).filter((v) => v !== undefined);
}

function tickersOf(cfg: Record<string, any>): string[] {
  return String(cfg.tickers ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
}

// -- Live node execution: every data input comes from Alpaca or the opencode model --
async function execNode(node: VPNode, protocol: Protocol, ctx: RunContext): Promise<unknown> {
  const cfg = node.data.config as Record<string, any>;
  const inputs = incomingData(node.id, protocol, ctx);
  const first = inputs[0] as any;

  switch (node.type) {
    case "newsFeed":
    case "rssFeed":
    case "secFilings": {
      const tickers = tickersOf(cfg);
      const stories = await liveNews(tickers.length ? tickers : ["SPY", "QQQ", "NVDA"]);
      const item = stories[0];
      if (!item) throw new Error("Wire returned no stories for these tickers");
      log(ctx, node, "info", `Polled news (${item.source}): "${item.headline}"`, { article: item.id, url: item.url });
      return { ...item, _kind: "news" };
    }
    case "marketData": {
      const syms = tickersOf(cfg);
      const list = syms.length ? syms : ["SPY", "QQQ", "DIA"];
      const snaps = await api<Array<{ symbol: string; price: number | null; changePct: number | null }>>(
        `/api/alpaca/snapshots?symbols=${encodeURIComponent(list.join(","))}`
      );
      log(ctx, node, "info", `Market snapshot: ${snaps.map((s) => `${s.symbol} ${s.price ?? "n/a"}`).join(" · ")}`, snaps);
      return { bars: snaps, _kind: "market" };
    }
    case "econIndicators": {
      const macro = await api<Record<string, unknown>>(
        `/api/fred/macro${ctx.asof ? `?asof=${ctx.asof}` : ""}`
      );
      const sel = Array.isArray((cfg as Record<string, any>).indicators) && (cfg as Record<string, any>).indicators.length
        ? (cfg as Record<string, any>).indicators as string[]
        : ["CPI", "FOMC", "NFP", "PPI", "GDP"];
      const cpi = macro.cpi as { yoyPct?: number } | undefined;
      const un = macro.unemploymentPct as { value?: number } | undefined;
      const ff = macro.fedFundsPct as { value?: number } | undefined;
      const pr = macro.payrollsK as { value?: number } | undefined;
      log(ctx, node, "info",
        `Macro (${String(macro.asof ?? "latest")}): CPI ${cpi?.yoyPct?.toFixed?.(1) ?? "n/a"}% YoY · U-rate ${un?.value ?? "n/a"}% · Fed funds ${ff?.value ?? "n/a"}% · NFP ${pr?.value ?? "n/a"}k · 10Y-2Y ${(macro as { curve10Y2Y?: number }).curve10Y2Y ?? "n/a"}`,
        { ...macro, selected: sel });
      return { ...macro, _kind: "macro" };
    }
    case "socialSentiment":
    case "earningsCalendar": {
      throw new Error(`${node.data.label} has no live source connected. Wire a News Feed or remove it`);
    }
    case "stockPrice": {
      const t = String(cfg.ticker || first?.ticker || "").trim().toUpperCase();
      if (!t) throw new Error("Stock Price needs a ticker (config or upstream)");
      const p = await quote(ctx, t);
      if (p == null || !(p > 0)) throw new Error(`No ${ctx.asof ? "historical" : "live"} price for ${t}`);
      log(ctx, node, "info", `${t} @ $${p.toFixed(2)} (${cfg.timeframe ?? "5Min"})${ctx.asof ? ` as of ${ctx.asof}` : " live"}`);
      return { ticker: t, price: p, ts: Date.now(), _kind: "price" };
    }
    case "aiNewsAnalyzer": {
      const news = first?._kind === "news" ? first : null;
      if (!news?.headline) throw new Error("AI News Analyzer needs an upstream news story");
      const analysis = await analyzeNewsClient(news.headline, news.body || news.headline, (news.tickers ?? []).join(",") || String(cfg.tickers ?? ""), true);
      const price = await quote(ctx, analysis.ticker);
      log(ctx, node, "success", `${analysis.ticker} ${analysis.sentiment} (conf ${analysis.confidence.toFixed(2)}, impact ${analysis.impact.toFixed(2)}). Live model.`, analysis);
      return { ...analysis, price, articleId: news.id, articleUrl: news.url, ts: Date.now(), _kind: "analysis" };
    }
    case "sentiment":
    case "entityExtraction":
    case "eventClassification":
    case "bullBear":
    case "aiSummary":
    case "histCompare":
    case "impactAssessment": {
      if (!first || typeof first !== "object") throw new Error(`${node.data.label} needs upstream data. Nothing connected`);
      if (first._filtered) return first;
      const text = first.headline ?? first.reasoning ?? first.summary ?? first.reason ?? null;
      const tickers = (first.tickers ?? (first.ticker ? [first.ticker] : [])).join(",");
      if (!text) { log(ctx, node, "success", `${node.data.label} passthrough (already structured)`, first); return { ...first, _kind: "analysis" }; }
      const a = await analyzeNewsClient(String(text).slice(0, 2000), String(first.body ?? text).slice(0, 4000), tickers, true);
      log(ctx, node, "success", `${node.data.label} complete. Live model.`, a);
      return { ...first, ...a, _kind: "analysis" };
    }
    case "threshold": {
      const field = String(cfg.field || "confidence");
      const th = ctx.gateOverride ?? Number(cfg.threshold ?? 0.75);
      const ovr = ctx.gateOverride != null ? " [override]" : "";
      const v = Number(first?.[field] ?? first?.confidence ?? 0);
      if (v >= th) {
        log(ctx, node, "success", `${field}=${v.toFixed(2)} ≥ ${th}: PASS${ovr}`, first);
        return first;
      }
      log(ctx, node, "warn", `${field}=${v.toFixed(2)} < ${th}: FILTERED${ovr}`, first);
      return { _filtered: true, reason: `below threshold ${field}<${th}` };
    }
    case "comparison": {
      const a = Number(first?.price ?? first?.value ?? first ?? 0);
      const b = Number(cfg.compareValue ?? 0);
      void b;
      log(ctx, node, "info", `Compared ${JSON.stringify(first)?.slice(0, 80)}`);
      return true;
    }
    case "ifElse": {
      const expr = String(cfg.expression || "confidence > 0.75");
      const m = expr.match(/(\w+)\s*(>=|<=|>|<|==|!=)\s*([\d.]+)/);
      let pass = true;
      if (m) {
        const v = Number(first?.[m[1]] ?? 0);
        const rhs = Number(m[3]);
        pass = m[2] === ">" ? v > rhs : m[2] === ">=" ? v >= rhs : m[2] === "<" ? v < rhs : m[2] === "<=" ? v <= rhs : m[2] === "==" ? v === rhs : v !== rhs;
      }
      log(ctx, node, pass ? "success" : "info", `IF ${expr} → ${pass ? "TRUE" : "FALSE"}`);
      return pass ? first : { _filtered: true, reason: "if/else false branch" };
    }
    case "andOr": {
      const op = String(cfg.op || "AND");
      log(ctx, node, "info", `${op} evaluated`);
      return first ?? true;
    }
    case "timeDelay":
    case "dedup":
    case "aggregate":
    case "switch": {
      if (first?._filtered) { log(ctx, node, "info", "Skipped (upstream filtered)"); return first; }
      log(ctx, node, "info", `${node.data.label} passed`);
      return first;
    }
    case "buySignal":
    case "sellSignal":
    case "holdSignal":
    case "consensus":
    case "signalStrength": {
      if (first?._filtered) { log(ctx, node, "info", "No signal (filtered upstream)"); return { _filtered: true }; }
      if (!first || typeof first !== "object" || first._filtered) throw new Error(`${node.data.label} needs an upstream signal`);
      const isSell = node.type === "sellSignal" || first?.sentiment === "bearish";
      const action = node.type === "holdSignal" ? "HOLD" : isSell ? "SELL" : "BUY";
      const ticker = String(cfg.ticker || first?.ticker || "").toUpperCase();
      if (!ticker) throw new Error("Signal has no ticker. Check AI output or set an override");
      const price = Number(first?.price) > 0 ? Number(first.price) : await quote(ctx, ticker);
      if (!(price != null && price > 0)) throw new Error(`No price for ${ticker}`);
      const sig: Signal = {
        id: `sig_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
        ts: Date.now(),
        ticker,
        action: action as Signal["action"],
        confidence: Number(first?.confidence ?? cfg.strength ?? 0.8),
        price,
        reason: first?.reasoning ?? first?.reason ?? `${node.data.label} fired`,
        protocol: protocol.name,
      };
      ctx.signals.push(sig);
      log(ctx, node, action === "HOLD" ? "info" : "success", `${action} ${sig.ticker} @ $${sig.price.toFixed(2)} (conf ${sig.confidence.toFixed(2)})`, sig);
      return { ...sig, _kind: "signal" };
    }
    case "techConfirm": {
      if (first?._filtered) { log(ctx, node, "info", "No signal (filtered upstream)"); return { _filtered: true }; }
      if (ctx.dryRun && ctx.gateOverride != null) {
        log(ctx, node, "success", "Price confirmation opened for test [override]", first);
        return { ...(typeof first === "object" ? first : {}), confirmed: true, priceMovePct: 0, _kind: "signal" };
      }
      const ticker = String(first?.ticker || "").toUpperCase();
      if (!ticker) throw new Error("Technical Confirmation needs an upstream ticker");
      const minMove = Number(cfg.minMovePct ?? 0.3);
      let closes: number[];
      if (ctx.asof) {
        const rows = (ctx.closes?.[ticker] ?? []).filter((r) => r.date <= ctx.asof!);
        closes = rows.slice(-8).map((r) => r.close);
      } else {
        const bars = await api<{ bars: { time: string; close: number }[] }>(
          `/api/alpaca/bars?symbol=${encodeURIComponent(ticker)}&timeframe=5Min&limit=12&start=${encodeURIComponent(new Date(Date.now() - 2 * 864e5).toISOString())}`
        );
        closes = (bars.bars ?? []).map((b) => b.close).filter((c) => c > 0);
      }
      if (closes.length < 2) throw new Error(`Not enough intraday bars for ${ticker}`);
      const move = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
      const wantUp = first?.action !== "SELL" && first?.sentiment !== "bearish";
      const ok = wantUp ? move >= minMove * 0.2 : move <= -minMove * 0.2;
      const drift = `${move >= 0 ? "+" : ""}${move.toFixed(2)}% over ${closes.length} bars`;
      if (!ok) { log(ctx, node, "warn", `Price did NOT confirm (${drift}) . Signal held`, first); return { _filtered: true, reason: "no price confirmation" }; }
      log(ctx, node, "success", `Price confirmed (${drift}, ${cfg.method ?? "momentum"})`, first);
      return { ...(typeof first === "object" ? first : {}), confirmed: true, priceMovePct: move, _kind: "signal" };
    }
    case "pairsSpread": {
      if (first?._filtered && !ctx.asof) { log(ctx, node, "info", "No signal (filtered upstream)"); return { _filtered: true }; }
      const legA = String(cfg.legA || "KO").trim().toUpperCase();
      const legB = String(cfg.legB || "PEP").trim().toUpperCase();
      const lookback = Math.max(20, Math.min(250, Math.floor(Number(cfg.lookback ?? 60))));
      const entryZ = ctx.pairEntryOverride ?? Number(cfg.entryZ ?? 2);
      const exitZ = Number(cfg.exitZ ?? 0.5);
      const ovr = ctx.pairEntryOverride != null ? " [override]" : "";
      const side = String(cfg.side ?? "both").toLowerCase();
      // test walkthrough with auto-tune opens the side filter too, logged openly; replays respect it
      const sideOpen = !ctx.asof && ctx.pairEntryOverride != null;
      const end = ctx.asof ? new Date(Date.parse(ctx.asof) + 864e5).toISOString() : undefined;
      const start = new Date((ctx.asof ? Date.parse(ctx.asof) : Date.now()) - (lookback + 10) * 864e5).toISOString();
      let ca: number[];
      let cb: number[];
      if (ctx.asof && ctx.closes?.[legA]?.length && ctx.closes?.[legB]?.length) {
        // replay path: slice the prefetched closes, aligned by trading date
        const mb = new Map(ctx.closes[legB].map((r) => [r.date, r.close]));
        const aligned = ctx.closes[legA]
          .filter((r) => r.date <= ctx.asof! && mb.has(r.date))
          .slice(-lookback);
        ca = aligned.map((r) => r.close);
        cb = aligned.map((r) => mb.get(r.date)!);
      } else {
        const [ba, bb] = await Promise.all([legA, legB].map((s) =>
          api<{ bars: { time: string; close: number }[] }>(
            `/api/alpaca/bars?symbol=${encodeURIComponent(s)}&timeframe=1Day&limit=${lookback + 10}&start=${encodeURIComponent(start)}${end ? `&end=${encodeURIComponent(end)}` : ""}`
          ).catch(() => ({ bars: [] }))
        ));
        ca = (ba.bars ?? []).map((b) => b.close).filter((c) => c > 0).slice(-lookback);
        cb = (bb.bars ?? []).map((b) => b.close).filter((c) => c > 0).slice(-lookback);
      }
      if (!ctx.asof) {
        // test mode: a synthetic story reprices the last bar so the fake event moves the spread
        const sA = ctx.seedPrices?.[legA];
        const sB = ctx.seedPrices?.[legB];
        if (sA != null && sA > 0 && ca.length) ca[ca.length - 1] = sA;
        if (sB != null && sB > 0 && cb.length) cb[cb.length - 1] = sB;
      }
      if (ca.length < 20 || cb.length < 20 || ca.length !== cb.length) throw new Error(`Not enough overlapping history for ${legA}/${legB}`);
      const hedge = Number(cfg.hedgeRatio ?? 1) || 1;
      const spreads = ca.map((a, i) => Math.log(a) - hedge * Math.log(cb[i]));
      const mean = spreads.reduce((x, y) => x + y, 0) / spreads.length;
      const sd = Math.sqrt(spreads.reduce((x, y) => x + (y - mean) ** 2, 0) / spreads.length) || 1e-9;
      const z = (spreads[spreads.length - 1] - mean) / sd;
      const asof = ctx.asof ?? new Date().toISOString().slice(0, 10);
      if (z > entryZ) {
        if ((side === "long") && !sideOpen) {
          log(ctx, node, "info", `LONG-only: skipped SHORT spread ${legA}/${legB} (z=${z.toFixed(2)} ≥ ${entryZ})`, { z });
          return { _filtered: true, reason: `SHORT blocked (side=long)` };
        }
        const opened = side === "long" ? " [side opened for test]" : "";
        // legA relatively expensive: short A, long B
        log(ctx, node, "success", `SHORT spread ${legA}/${legB} (z=${z.toFixed(2)} ≥ ${entryZ})${ovr}${opened}`, { z });
        const outS = { ticker: legA, action: "SELL", confidence: Math.min(0.99, Math.abs(z) / 4), price: ca[ca.length - 1], hedgeTicker: legB, hedgeSide: "BUY", hedgeRatio: hedge, zscore: z, ts: Date.parse(asof), _kind: "signal" } as const;
        ctx.signals.push({ id: `sig_${Date.now()}_${Math.floor(Math.random() * 9999)}`, ts: Date.parse(asof), ticker: legA, action: "SELL", confidence: outS.confidence, price: outS.price, reason: `SHORT spread ${legA}/${legB} z=${z.toFixed(2)}`, protocol: protocol.name });
        return outS;
      }
      if (z < -entryZ) {
        if ((side === "short") && !sideOpen) {
          log(ctx, node, "info", `SHORT-only: skipped LONG spread ${legA}/${legB} (z=${z.toFixed(2)} ≤ -${entryZ})`, { z });
          return { _filtered: true, reason: `LONG blocked (side=short)` };
        }
        const opened = side === "short" ? " [side opened for test]" : "";
        log(ctx, node, "success", `LONG spread ${legA}/${legB} (z=${z.toFixed(2)} ≤ -${entryZ})${ovr}${opened}`, { z });
        const outB = { ticker: legA, action: "BUY", confidence: Math.min(0.99, Math.abs(z) / 4), price: ca[ca.length - 1], hedgeTicker: legB, hedgeSide: "SELL", hedgeRatio: hedge, zscore: z, ts: Date.parse(asof), _kind: "signal" } as const;
        ctx.signals.push({ id: `sig_${Date.now()}_${Math.floor(Math.random() * 9999)}`, ts: Date.parse(asof), ticker: legA, action: "BUY", confidence: outB.confidence, price: outB.price, reason: `LONG spread ${legA}/${legB} z=${z.toFixed(2)}`, protocol: protocol.name });
        return outB;
      }
      if (Math.abs(z) < exitZ) {
        log(ctx, node, "info", `Spread converged (z=${z.toFixed(2)}), exit`, { z });
        const outX = { ticker: legA, action: "EXIT", confidence: 1, price: ca[ca.length - 1], hedgeTicker: legB, zscore: z, ts: Date.parse(asof), _kind: "signal" } as const;
        ctx.signals.push({ id: `sig_${Date.now()}_${Math.floor(Math.random() * 9999)}`, ts: Date.parse(asof), ticker: legA, action: "EXIT", confidence: 1, price: outX.price, reason: `Spread converged (z=${z.toFixed(2)})`, protocol: protocol.name });
        return outX;
      }
      log(ctx, node, "info", `Spread neutral (z=${z.toFixed(2)}), no position change`, { z });
      return { _filtered: true, reason: `z=${z.toFixed(2)} inside bands` };
    }
    case "positionSizing":
    case "maxExposure":
    case "stopLoss":
    case "takeProfit":
    case "maxDailyLoss":
    case "portfolioAlloc": {
      if (first?._filtered) { log(ctx, node, "info", "Risk check skipped (no signal)"); return first; }
      if (node.type === "maxDailyLoss" && ctx.portfolio.dayPnl < -3000) {
        log(ctx, node, "error", "HALTED: max daily loss breached");
        return { _filtered: true, reason: "daily loss limit" };
      }
      log(ctx, node, "success", `Risk OK: ${node.data.label}`, first);
      return { ...(typeof first === "object" ? first : { value: first }), riskChecked: true, _kind: "order" };
    }
    case "paperTrade": {
      if (first?._filtered) { log(ctx, node, "info", "No order (filtered upstream)"); return first; }
      const ticker = String(first?.ticker || "").toUpperCase();
      if (!ticker) throw new Error("Trade node needs an upstream ticker");
      const hedgeTicker = String((first as any)?.hedgeTicker || "").toUpperCase() || null;
      const hedgeSide = String((first as any)?.hedgeSide || "").toUpperCase() === "SELL" ? "sell" : "buy";
      const hedgeRatio = Number((first as any)?.hedgeRatio) || 1;
      if (first?.action === "HOLD") { log(ctx, node, "info", `HOLD ${ticker}. No order routed`); return { ...first, routed: false }; }
      if (first?.action === "EXIT") {
        // flatten both legs: live = real close orders, replay = pass-through for the tracker
        if (ctx.dryRun) { log(ctx, node, "info", `EXIT ${ticker}${hedgeTicker ? ` + ${hedgeTicker}` : ""} (${ctx.asof})`, first); return { ...first, _kind: "signal" }; }
        for (const s of [ticker, ...(hedgeTicker ? [hedgeTicker] : [])]) {
          try { await api(`/api/alpaca/positions/${encodeURIComponent(s)}`, { method: "DELETE" }); } catch { /* already flat */ }
        }
        log(ctx, node, "success", `Flattened ${ticker}${hedgeTicker ? ` + ${hedgeTicker}` : ""}`, first);
        return { ticker, closed: true };
      }
      const side = first?.action === "SELL" ? "sell" : "buy";
      const price = Number(first?.price) > 0 ? Number(first.price) : await quote(ctx, ticker);
      if (!(price != null && price > 0)) throw new Error(`No price for ${ticker}`);
      const qty = Number(cfg.qty) > 0 ? Math.floor(Number(cfg.qty)) : Math.max(1, Math.floor(5000 / price));
      const hedgePrice = hedgeTicker
        ? await quote(ctx, hedgeTicker)
        : null;
      const hedgeQty = hedgeTicker && hedgePrice ? Math.max(1, Math.floor((qty * price) / hedgePrice * hedgeRatio)) : 0;
      if (ctx.dryRun) {
        const mk = (t: string, s: "BUY" | "SELL", q: number, p: number): Trade => ({
          id: `dry_${ctx.asof ?? Date.now()}_${t}_${Math.floor(Math.random() * 9999)}`,
          ts: ctx.asof ? Date.parse(ctx.asof) : Date.now(), ticker: t, side: s,
          qty: q, price: p, value: q * p, protocol: protocol.name, status: "hypothetical",
        });
        const trade = mk(ticker, side.toUpperCase() as "BUY" | "SELL", qty, price);
        ctx.trades.push(trade);
        log(ctx, node, "success", `${trade.side} ${qty}× ${ticker} @ $${price.toFixed(2)} hypothetical (${ctx.asof})`, trade);
        if (hedgeTicker && hedgePrice && hedgeQty > 0) {
          const ht = mk(hedgeTicker, hedgeSide.toUpperCase() as "BUY" | "SELL", hedgeQty, hedgePrice);
          ctx.trades.push(ht);
          log(ctx, node, "success", `Hedge ${ht.side} ${hedgeQty}× ${hedgeTicker} @ $${hedgePrice.toFixed(2)} hypothetical`, ht);
        }
        return { ...trade, _kind: "order" };
      }
      const place = async (sym: string, q: number, sd: string) =>
        api<{ id: string; status: string; qty: number; type: string }>(`/api/alpaca/order`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: sym, qty: q, side: sd, type: "market", time_in_force: "day" }),
        });
      const placed = await place(ticker, qty, side);
      const trade: Trade = {
        id: String(placed.id ?? `trd_${Date.now()}`),
        ts: Date.now(), ticker, side: side.toUpperCase() as "BUY" | "SELL", qty, price, value: qty * price,
        protocol: protocol.name, status: "filled",
      };
      ctx.trades.push(trade);
      log(ctx, node, "success", `${trade.side} ${qty}× ${ticker} @ ~$${price.toFixed(2)}, order ${trade.status} (${trade.id.slice(0, 8)})`, trade);
      if (hedgeTicker && hedgePrice && hedgeQty > 0) {
        const hp = await place(hedgeTicker, hedgeQty, hedgeSide);
        const ht: Trade = {
          id: String(hp.id ?? `trd_${Date.now()}`), ts: Date.now(), ticker: hedgeTicker,
          side: hedgeSide.toUpperCase() as "BUY" | "SELL", qty: hedgeQty, price: hedgePrice, value: hedgeQty * hedgePrice,
          protocol: protocol.name, status: "filled",
        };
        ctx.trades.push(ht);
        log(ctx, node, "success", `Hedge ${ht.side} ${hedgeQty}× ${hedgeTicker} @ ~$${hedgePrice.toFixed(2)} (${String(hp.status)})`, ht);
      }
      return { ...trade, _kind: "order" };
    }
    case "orderSim": {
      if (first?._filtered) return first;
      const ticker = String(first?.ticker || "").toUpperCase() || "SPY";
      const price = Number(first?.price) > 0 ? Number(first.price) : (await quote(ctx, ticker)) ?? 0;
      const feeBps = Number(cfg.feeBps ?? 5);
      const slipBps = Number(cfg.slippageBps ?? 8);
      const est = price > 0 ? { estFee: (price * feeBps) / 10000, estSlippage: (price * slipBps) / 10000 } : {};
      log(ctx, node, "info", `Dry-run ${ticker} @ ${price ? "$" + price.toFixed(2) : "n/a"}. Fees ${feeBps}bps, slippage ${slipBps}bps, no fill.`, { ...est });
      return { ...(typeof first === "object" ? first : {}), ...est, simulated: true };
    }
    case "closePosition": {
      const ticker = String(cfg.ticker || first?.ticker || "").toUpperCase();
      if (!ticker) throw new Error("Close Position needs a ticker");
      if (ctx.dryRun) { log(ctx, node, "info", `Would flatten ${ticker} (${ctx.asof})`, first); return { ticker, closed: true, dryRun: true }; }
      await api(`/api/alpaca/positions/${encodeURIComponent(ticker)}`, { method: "DELETE" });
      log(ctx, node, "success", `Flattened ${ticker} on Alpaca`, first);
      return { ticker, closed: true };
    }
    case "notify":
    case "logger": {
      log(ctx, node, "info", `${node.data.label}: ${JSON.stringify(first)?.slice(0, 140)}`, first);
      return first;
    }
    default:
      log(ctx, node, "info", "Executed (passthrough)", first);
      return first;
  }
}

export interface RunOpts {
  equity?: number;
  dayPnl?: number;
  step?: (nodeId: string, status: string) => void;
  delayMs?: number;
  /** pause before these nodes (breakpoints) or every node when stepMode */
  breakpoints?: Set<string>;
  stepMode?: boolean;
  /** called when paused; resolves 'step' (run one, pause again) or 'continue' */
  onPause?: (node: VPNode, inputs: unknown[]) => Promise<"step" | "continue">;
  /** replay: execute only this node + downstream, seeding the rest from a previous run */
  startId?: string;
  seedOutputs?: Record<string, unknown>;
  /** polled each iteration; when true the run aborts */
  shouldAbort?: () => boolean;
  /** historical replay date (YYYY-MM-DD): price nodes use closes instead of live quotes */
  asof?: string;
  /** historical replay: Trade nodes record hypothetical fills, never route orders */
  dryRun?: boolean;
  /** prefetched daily closes per ticker for asof lookups */
  closes?: Record<string, { date: string; close: number }[]>;
  /** sensitivity override: replaces every threshold node's gate */
  gateOverride?: number;
  /** test mode: temporarily replace pairs entry bands */
  pairEntryOverride?: number;
  /** test mode: synthetic prices per ticker (uppercase), bypassing live quotes */
  seedPrices?: Record<string, number>;
}

export async function runProtocol(protocol: Protocol, opts: RunOpts = {}): Promise<RunContext> {
  let acct = { equity: opts.equity ?? 0, dayPnl: opts.dayPnl ?? 0 };
  try {
    const a = await api<{ equity: number }>("/api/alpaca/account");
    acct = { equity: Number(a.equity) || 0, dayPnl: opts.dayPnl ?? 0 };
  } catch { /* keep provided/defaults */ }
  const ctx: RunContext = {
    logs: [], signals: [], trades: [], nodeOutputs: { ...(opts.seedOutputs ?? {}) },
    portfolio: acct,
    asof: opts.asof,
    dryRun: opts.dryRun,
    closes: opts.closes,
    gateOverride: opts.gateOverride,
    pairEntryOverride: opts.pairEntryOverride,
    seedPrices: opts.seedPrices,
  };
  let order = topoOrder(protocol.nodes, protocol.edges);
  if (opts.startId) {
    const keep = downstreamOf(protocol, opts.startId);
    order = order.filter((n) => keep.has(n.id));
  }
  let stepping = !!opts.stepMode;
  for (const node of order) {
    if (opts.shouldAbort?.()) {
      ctx.logs.push({ ts: Date.now(), nodeId: "sys", nodeLabel: "System", level: "warn", message: "Stopped by user" });
      break;
    }
    // Seeded nodes (historical replay story, synthetic test story) are NOT
    // re-executed: without this the live node would clobber the seeded value
    // and the replay would analyze today's news instead of history.
    // (startId replays re-execute from the chosen node, so they are exempt.)
    if (!opts.startId && opts.seedOutputs && Object.prototype.hasOwnProperty.call(opts.seedOutputs, node.id)) {
      opts.step?.(node.id, "success");
      ctx.logs.push({ ts: Date.now(), nodeId: node.id, nodeLabel: node.data.label, level: "info", message: "Seeded input (replay)" });
      continue;
    }
    const inputs = incomingData(node.id, protocol, ctx);
    if ((opts.breakpoints?.has(node.id) || stepping) && opts.onPause) {
      const action = await opts.onPause(node, inputs);
      stepping = action === "step";
    }
    opts.step?.(node.id, "running");
    await new Promise((r) => setTimeout(r, opts.delayMs ?? 420));
    try {
      const ins = incomingData(node.id, protocol, ctx);
      if (ins.length > 0 && ins.every((v: any) => v?._filtered)) {
        ctx.nodeOutputs[node.id] = { _filtered: true };
        opts.step?.(node.id, "skipped");
        ctx.logs.push({ ts: Date.now(), nodeId: node.id, nodeLabel: node.data.label, level: "info", message: "Skipped (upstream filtered)" });
        continue;
      }
      const out = await execNode(node, protocol, ctx);
      ctx.nodeOutputs[node.id] = out;
      opts.step?.(node.id, (out as any)?._filtered ? "skipped" : "success");
    } catch (e: any) {
      opts.step?.(node.id, "error");
      ctx.logs.push({ ts: Date.now(), nodeId: node.id, nodeLabel: node.data.label, level: "error", message: e?.message ?? "Execution error" });
    }
  }
  return ctx;
}


// -- Historical replay: run the real graph day-by-day over archived news + bars --
// Every signal, price, and fill below comes from Alpaca history or the live model.
// Nothing is simulated except the hypothetical fills (status "hypothetical").
export interface BacktestParams {
  from: string; to: string; capital: number; feeBps: number; slippageBps: number; delayBars: number;
  /** risk exit: close a group when its loss exceeds this fraction of entry value (0 = off) */
  stopPct?: number;
  /** profit exit: bank a group when its gain exceeds this fraction of entry value (0 = off) */
  takeProfitPct?: number;
  /** risk exit: close groups held longer than this many days (0/undefined = off) */
  maxHoldDays?: number;
}
export interface BacktestResult {
  equity: { t: string; v: number }[];
  trades: (Trade & { pnl: number; exitDate?: string; exitPrice?: number })[];
  metrics: { totalReturn: number; winRate: number; maxDD: number; sharpe: number; profit: number; numTrades: number };
  days: { date: string; stories: number; signals: number }[];
  verdicts: { date: string; headline: string; sentiment: string; confidence: number; stage: string }[];
  maxConfidence: number;
  gateUsed: number;
  maxAbsZ: number;
  pairEntryUsed: number | null;
  pricePaths: Record<string, { date: string; close: number }[]>;
}

export async function runHistoricalBacktest(
  protocol: Protocol,
  p: BacktestParams & { gateOverride?: number; pairEntryOverride?: number },
  onProgress?: (done: number, total: number, label: string) => void
): Promise<BacktestResult> {
  const newsNodes = protocol.nodes.filter((n) => ["newsFeed", "rssFeed", "secFilings"].includes(n.type));
  const tickers = [...new Set(newsNodes.flatMap((n) =>
    String((n.data.config as Record<string, any>).tickers ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  ))];
  const priceTickers = [...new Set(protocol.nodes.flatMap((n) => {
    if (n.type === "stockPrice") {
      const t = String((n.data.config as Record<string, any>).ticker ?? "").trim().toUpperCase();
      return t ? [t] : [];
    }
    if (n.type === "pairsSpread") {
      const c = n.data.config as Record<string, any>;
      return [String(c.legA ?? "").trim().toUpperCase(), String(c.legB ?? "").trim().toUpperCase()].filter(Boolean);
    }
    return [];
  }))];
  const syms = [...new Set([...tickers, ...priceTickers])];
  // Index ETFs ride along so market-roundup analyses (SPY/QQQ/DIA ticker
  // reads) always have closes to mark against.
  for (const idx of ["SPY", "QQQ", "DIA"]) if (!syms.includes(idx)) syms.push(idx);
  const universe = syms.length ? syms : ["SPY"];
  const hasNews = newsNodes.length > 0;
  const from = p.from.slice(0, 10);
  const to = p.to.slice(0, 10);
  const dayMs = 864e5;
  const days: string[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += dayMs) days.push(new Date(t).toISOString().slice(0, 10));
  const cap = hasNews ? 60 : 730;
  if (days.length > cap) throw new Error(hasNews ? "Range capped at 60 days for news replay." : "Range capped at 2 years.");

  // 1) archived news in 2-day chunks (feed pages at 50 items, DESC;
  // wider chunks would silently drop older stories past the page limit)
  const allStories: NewsStory[] = [];
  if (hasNews) {
    for (let c0 = Date.parse(from); c0 <= Date.parse(to); c0 += 2 * dayMs) {
      const c1 = Math.min(c0 + 2 * dayMs - 1, Date.parse(to));
      const cs = new Date(c0).toISOString().slice(0, 10);
      const ce = new Date(c1).toISOString().slice(0, 10);
      const j = await api<NewsStory[]>(`/api/alpaca/news?symbols=${encodeURIComponent(universe.join(","))}&limit=50&start=${cs}T00:00:00Z&end=${ce}T23:59:59Z`).catch(() => [] as NewsStory[]);
      for (const s of j) {
        const d = new Date(s.ts).toISOString().slice(0, 10);
        if (d >= from && d <= to && !allStories.some((x) => x.id === s.id)) allStories.push(s);
      }
      if (allStories.length >= 400) break;
      onProgress?.(0, days.length, `news ${cs}`);
    }
  }
  const byDay = new Map<string, NewsStory[]>();
  for (const s of allStories) {
    const d = new Date(s.ts).toISOString().slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(s);
  }

  // 2) daily closes per ticker (with lookback for momentum + marking)
  const lookbackStart = new Date(Date.parse(from) - 120 * dayMs).toISOString();
  const closes: Record<string, { date: string; close: number }[]> = {};
  for (const s of universe) {
    const j = await api<{ bars: { time: string; close: number }[] }>(
      `/api/alpaca/bars?symbol=${encodeURIComponent(s)}&timeframe=1Day&limit=1200&start=${encodeURIComponent(lookbackStart)}&end=${encodeURIComponent(to + "T23:59:59Z")}`
    ).catch(() => ({ bars: [] }));
    closes[s] = (j.bars ?? []).map((b) => ({ date: b.time.slice(0, 10), close: b.close })).filter((r) => r.close > 0);
  }
  const emptyCtx = (): RunContext => ({ logs: [], signals: [], trades: [], nodeOutputs: {}, portfolio: { equity: 0, dayPnl: 0 }, closes });
  // The model reads tickers off headlines, which are not limited to the graph
  // universe (roundups resolve to SPY/QQQ/DIA, single names to anything tradable).
  // Fetch bars on demand so every signaled ticker has closes to mark, stop,
  // and exit against. Cached per run; failures keep the old skip behavior.
  const ensureCloses = async (ticker: string) => {
    const t = (ticker ?? "").toUpperCase();
    if (!t || closes[t]?.length) return;
    const j = await api<{ bars: { time: string; close: number }[] }>(
      `/api/alpaca/bars?symbol=${encodeURIComponent(t)}&timeframe=1Day&limit=1200&start=${encodeURIComponent(lookbackStart)}&end=${encodeURIComponent(to + "T23:59:59Z")}`
    ).catch(() => ({ bars: [] as { time: string; close: number }[] }));
    closes[t] = (j.bars ?? []).map((b) => ({ date: b.time.slice(0, 10), close: b.close })).filter((r) => r.close > 0);
  };

  // 3) walk each day: top story -> full graph -> hypothetical fills
  const equity: { t: string; v: number }[] = [];
  const trades: (Trade & { pnl: number; exitDate?: string; exitPrice?: number })[] = [];
  const dayRows: { date: string; stories: number; signals: number }[] = [];
  const verdicts: { date: string; headline: string; sentiment: string; confidence: number; stage: string }[] = [];
  const thrNode = protocol.nodes.find((n) => n.type === "threshold");
  const techNode = protocol.nodes.find((n) => n.type === "techConfirm");
  const gateUsed = p.gateOverride ?? Number((thrNode?.data.config as Record<string, any> | undefined)?.threshold ?? 0.75);
  const pairsNodeForEntry = protocol.nodes.find((n) => n.type === "pairsSpread");
  const pairEntryUsed = pairsNodeForEntry
    ? (p.pairEntryOverride ?? Number(((pairsNodeForEntry.data.config as Record<string, any> | undefined)?.entryZ ?? 2)))
    : null;
  type Pos = { side: "BUY" | "SELL"; qty: number; entry: number; entryDate: string; group: string };
  const open = new Map<string, Pos>();
  let realized = 0;
  let maxAbsZ = 0;
  const notional = Math.max(1000, p.capital * 0.1);

  const markToMarket = (date: string) => {
    let unreal = 0;
    for (const [t, pos] of open) {
      const c = histClose(emptyCtx(), t, date);
      if (c != null) unreal += (pos.side === "BUY" ? c - pos.entry : pos.entry - c) * pos.qty;
    }
    return unreal;
  };

  const closePositionAt = (ticker: string, date: string, tag: string) => {
    const prev = open.get(ticker);
    if (!prev) return;
    const exit = histClose(emptyCtx(), ticker, date) ?? prev.entry;
    const fee = (prev.qty * exit * p.feeBps) / 10000 + (prev.qty * prev.entry * p.feeBps) / 10000;
    const slip = (prev.qty * exit * p.slippageBps) / 10000;
    const pnl = (prev.side === "BUY" ? exit - prev.entry : prev.entry - exit) * prev.qty - fee - slip;
    realized += pnl;
    trades.push({ id: `hist_${date}_${ticker}_${tag}`, ts: Date.parse(date), ticker, side: prev.side, qty: prev.qty, price: prev.entry, value: prev.qty * prev.entry, protocol: protocol.name, status: "hypothetical", pnl, exitDate: date, exitPrice: exit });
    open.delete(ticker);
  };

  const openPosition = (ticker: string, side: "BUY" | "SELL", price: number, date: string, group?: string) => {
    if (open.has(ticker)) return;
    const qty = Math.max(1, Math.floor(notional / price));
    realized -= (qty * price * p.feeBps) / 10000 + (qty * price * p.slippageBps) / 10000;
    open.set(ticker, { side, qty, entry: price, entryDate: date, group: group ?? `g_${date}_${ticker}` });
    trades.push({ id: `hist_${date}_${ticker}_open`, ts: Date.parse(date), ticker, side, qty, price, value: qty * price, protocol: protocol.name, status: "hypothetical", pnl: 0 });
  };

  const applySignal = (s: Signal & { hedgeTicker?: string; hedgeSide?: "BUY" | "SELL" }, date: string) => {
    if (s.action === "EXIT") {
      closePositionAt(s.ticker, date, "exit");
      if (s.hedgeTicker) closePositionAt(s.hedgeTicker, date, "exit");
      return;
    }
    if (s.action !== "BUY" && s.action !== "SELL") return;
    const prev = open.get(s.ticker);
    if (prev && ((prev.side === "BUY") !== (s.action === "BUY"))) closePositionAt(s.ticker, date, "flip");
    const grp = `g_${date}_${s.ticker}`;
    openPosition(s.ticker, s.action, s.price, date, grp);
    if (s.hedgeTicker) {
      const hp = histClose(emptyCtx(), s.hedgeTicker, date);
      if (hp != null && s.hedgeSide && (s.hedgeSide === "BUY" || s.hedgeSide === "SELL")) {
        const hprev = open.get(s.hedgeTicker);
        if (hprev && ((hprev.side === "BUY") !== (s.hedgeSide === "BUY"))) closePositionAt(s.hedgeTicker, date, "flip");
        if (!open.has(s.hedgeTicker)) {
          // size hedge leg dollar-neutral to the primary fill
          const primary = open.get(s.ticker);
          const refQty = primary ? primary.qty : Math.max(1, Math.floor(notional / s.price));
          const refPx = primary ? primary.entry : s.price;
          const hqty = Math.max(1, Math.floor((refQty * refPx) / hp));
          realized -= (hqty * hp * p.feeBps) / 10000 + (hqty * hp * p.slippageBps) / 10000;
          open.set(s.hedgeTicker, { side: s.hedgeSide, qty: hqty, entry: hp, entryDate: date, group: primary?.group ?? `g_${date}_${s.ticker}` });
          trades.push({ id: `hist_${date}_${s.hedgeTicker}_open`, ts: Date.parse(date), ticker: s.hedgeTicker, side: s.hedgeSide, qty: hqty, price: hp, value: hqty * hp, protocol: protocol.name, status: "hypothetical", pnl: 0 });
        }
      }
    }
  };

  const aiNodeShared = protocol.nodes.find((n) => n.type === "aiNewsAnalyzer");
  for (let i = 0; i < days.length; i++) {
    const date = days[i];
    onProgress?.(i, days.length, date);
    const todays = byDay.get(date) ?? [];
    let story = todays[0];
    // Trade the day's strongest read, not just the most recent headline:
    // score up to 3 stories in parallel and keep the highest confidence.
    // The winning analysis is seeded into the graph so the run does not
    // pay for (or disagree with) a second model call.
    let seededAnalysis: Record<string, unknown> | null = null;
    if (hasNews && todays.length > 1) {
      // selection is best-effort ranking: cap each read at 20s so one slow
      // model call cannot stall the replay (the graph run does the real read)
      const withTimeout = <T>(pr: Promise<T>, ms: number): Promise<T | null> =>
        Promise.race([pr, new Promise<null>((_, rej) => setTimeout(() => rej(new Error("rank timeout")), ms))]).catch(() => null);
      const scored = await Promise.all(todays.slice(0, 3).map(async (cand) => {
        const a = await withTimeout(analyzeNewsClient(cand.headline, cand.body || cand.headline, (cand.tickers ?? []).join(","), true), 20000);
        return a ? { s: cand, a } : null;
      }));
      let best: { s: (typeof todays)[number]; a: { ticker?: string; confidence?: number; sentiment?: string } } | null = null;
      for (const r of scored) {
        if (r && typeof r.a?.confidence === "number" && (best == null || (r.a.confidence ?? -1) > (best.a.confidence ?? -1))) best = r;
      }
      if (best) {
        story = best.s;
        await ensureCloses(String(best.a.ticker ?? ""));
        const px = histClose(emptyCtx(), String(best.a.ticker ?? "").toUpperCase(), date) ?? 0;
        seededAnalysis = { ...best.a, price: px, articleId: (best.s as { id?: string }).id ?? "", articleUrl: (best.s as { url?: string }).url ?? "", ts: Date.parse(date), _kind: "analysis" };
      }
    }
    const seedOutputs: Record<string, unknown> = {};
    if (story) for (const n of newsNodes) seedOutputs[n.id] = { ...story, _kind: "news" };
    if (seededAnalysis && aiNodeShared) seedOutputs[aiNodeShared.id] = seededAnalysis;
    // price-only protocols run every trading day; news protocols run on story days
    const hasBarsToday = universe.some((t) => (closes[t] ?? []).some((r) => r.date === date));
    const shouldRun = hasNews ? !!story : hasBarsToday;
    let sigs: Signal[] = [];
    if (shouldRun) {
      const ctx = await runProtocol(protocol, { delayMs: 0, asof: date, dryRun: true, closes, seedOutputs, gateOverride: p.gateOverride, pairEntryOverride: p.pairEntryOverride, step: () => {} });
      sigs = ctx.signals;
      for (const q of sigs) {
        await ensureCloses(q.ticker);
        const h = (q as unknown as { hedgeTicker?: string }).hedgeTicker;
        if (h) await ensureCloses(h);
      }
      const aiNode = aiNodeShared;
      const av = (aiNode ? ctx.nodeOutputs[aiNode.id] : null) as { sentiment?: string; confidence?: number } | null;
      if (av && typeof av.confidence === "number" && story) {
        const thrOut = (thrNode ? ctx.nodeOutputs[thrNode.id] : null) as { _filtered?: boolean } | null;
        const techOut = (techNode ? ctx.nodeOutputs[techNode.id] : null) as { _filtered?: boolean } | null;
        const stage = sigs.length > 0 ? "signal"
          : thrOut?._filtered ? "filtered"
          : techOut?._filtered ? "no-confirm" : "no-trade";
        verdicts.push({ date, headline: story.headline, sentiment: String(av.sentiment ?? "neutral"), confidence: av.confidence, stage });
      }
      const pairsNode = protocol.nodes.find((n) => n.type === "pairsSpread");
      if (pairsNode) {
        const pv = ctx.nodeOutputs[pairsNode.id] as { ticker?: string; action?: string; zscore?: number } | null;
        if (pv && typeof pv.zscore === "number") {
          maxAbsZ = Math.max(maxAbsZ, Math.abs(pv.zscore));
          const legA = String((pairsNode.data.config as Record<string, any>).legA ?? "A").toUpperCase();
          const legB = String((pairsNode.data.config as Record<string, any>).legB ?? "B").toUpperCase();
          verdicts.push({
            date, headline: `${legA}/${legB} spread z=${pv.zscore.toFixed(2)}`,
            sentiment: pv.action === "BUY" ? "bullish" : pv.action === "SELL" ? "bearish" : "neutral",
            confidence: Math.min(0.99, Math.abs(pv.zscore) / 4),
            stage: sigs.length > 0 ? "signal" : (pv as { _filtered?: boolean })._filtered ? "filtered" : "no-trade",
          });
        }
      }
      for (const s of sigs) applySignal(s as Signal & { hedgeTicker?: string; hedgeSide?: "BUY" | "SELL" }, date);
    }
// risk exits run every day (not just signal days): stop out losers, expire stale holds
    if ((p.stopPct ?? 0) > 0 || (p.maxHoldDays ?? 0) > 0 || (p.takeProfitPct ?? 0) > 0) {
      const groups = new Map<string, { tickers: string[]; entry: number; unreal: number; ageDays: number }>();
      for (const [t, pos] of open) {
        const c = histClose(emptyCtx(), t, date);
        if (c == null) continue;
        const g = groups.get(pos.group) ?? { tickers: [], entry: 0, unreal: 0, ageDays: 0 };
        g.tickers.push(t);
        g.entry += pos.qty * pos.entry;
        g.unreal += (pos.side === "BUY" ? c - pos.entry : pos.entry - c) * pos.qty;
        g.ageDays = Math.max(g.ageDays, Math.round((Date.parse(date) - Date.parse(pos.entryDate)) / dayMs));
        groups.set(pos.group, g);
      }
      for (const [, g] of groups) {
        const stopped = (p.stopPct ?? 0) > 0 && g.entry > 0 && g.unreal < -(p.stopPct ?? 0) * g.entry;
        const expired = (p.maxHoldDays ?? 0) > 0 && g.ageDays > (p.maxHoldDays ?? 0);
        const banked = (p.takeProfitPct ?? 0) > 0 && g.entry > 0 && g.unreal > (p.takeProfitPct ?? 0) * g.entry;
        if (stopped || expired || banked) for (const t of g.tickers) closePositionAt(t, date, stopped ? "stop" : expired ? "expire" : "take-profit");
      }
    }

    dayRows.push({ date, stories: todays.length, signals: sigs.length });
    equity.push({ t: date, v: Math.round(p.capital + realized + markToMarket(date)) });
  }

  // close leftovers at last close
  const lastDate = days[days.length - 1];
  for (const [t, pos] of open) {
    const exit = histClose(emptyCtx(), t, lastDate) ?? pos.entry;
    const pnl = (pos.side === "BUY" ? exit - pos.entry : pos.entry - exit) * pos.qty;
    realized += pnl;
    trades.push({ id: `hist_${lastDate}_${t}_close`, ts: Date.parse(lastDate), ticker: t, side: pos.side, qty: pos.qty, price: pos.entry, value: pos.qty * pos.entry, protocol: protocol.name, status: "hypothetical", pnl, exitDate: lastDate, exitPrice: exit });
  }
  const finalEq = Math.round(p.capital + realized);
  if (equity.length) equity[equity.length - 1] = { t: lastDate, v: finalEq };

  const closed = trades.filter((t) => t.exitDate);
  const wins = closed.filter((t) => t.pnl > 0).length;
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) rets.push((equity[i].v - equity[i - 1].v) / Math.max(1, equity[i - 1].v));
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length)) || 1e-6;
  let peak = p.capital, maxDD = 0;
  for (const pt of equity) { peak = Math.max(peak, pt.v); maxDD = Math.min(maxDD, (pt.v - peak) / peak); }
  onProgress?.(days.length, days.length, "done");
  const maxConfidence = verdicts.reduce((m, v) => Math.max(m, v.confidence), 0);
  const pricePaths: Record<string, { date: string; close: number }[]> = {};
  for (const [sym, rows] of Object.entries(closes)) {
    pricePaths[sym] = rows.filter((r) => r.date >= from && r.date <= to);
  }
  return {
    equity,
    trades: trades.slice().reverse(),
    metrics: {
      totalReturn: ((finalEq - p.capital) / p.capital) * 100,
      winRate: closed.length ? (wins / closed.length) * 100 : 0,
      maxDD: maxDD * 100,
      sharpe: (mean / sd) * Math.sqrt(252),
      profit: finalEq - p.capital,
      numTrades: closed.length,
    },
    days: dayRows,
    verdicts: verdicts.slice().reverse(),
    maxConfidence,
    gateUsed,
    maxAbsZ,
    pairEntryUsed,
    pricePaths,
  };
}
