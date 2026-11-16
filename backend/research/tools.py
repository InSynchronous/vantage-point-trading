"""Tool definitions + executors for the research agent.

Every tool is read-only market/intelligence access. There is intentionally no
trading tool: findings are handed off as protocol drafts, never orders.
"""
from __future__ import annotations

import math
import statistics
import time
from typing import Any

import httpx

from . import config

DATA = "https://data.alpaca.markets"
PAPER = "https://paper-api.alpaca.markets"
FRED = "https://api.stlouisfed.org/fred"

_http: httpx.AsyncClient | None = None
_assets_cache: tuple[float, list] | None = None


async def _client() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=30.0, headers={"User-Agent": "vantagepoint-research/1.0"})
    return _http


def _alpaca_headers() -> dict:
    if not config.ALPACA_KEY or not config.ALPACA_SECRET:
        raise RuntimeError("Alpaca is not configured")
    return {"APCA-API-KEY-ID": config.ALPACA_KEY, "APCA-API-SECRET-KEY": config.ALPACA_SECRET}


TOOLS = [
    {
        "name": "get_bars",
        "description": "Daily OHLCV bars for a symbol. Up to 1000 bars.",
        "args": {"symbol": "string, e.g. NVDA", "days": "integer, lookback window (default 90)", "end": "optional YYYY-MM-DD"},
    },
    {
        "name": "get_news",
        "description": "Recent financial headlines for symbols. Returns id, ts, headline, source, tickers, summary, url.",
        "args": {"symbols": "comma-separated, e.g. NVDA,AAPL", "days_back": "integer (default 14)", "limit": "integer (default 20)"},
    },
    {
        "name": "get_snapshots",
        "description": "Latest prices and day change for symbols.",
        "args": {"symbols": "comma-separated"},
    },
    {
        "name": "get_macro",
        "description": "Current macro picture: CPI YoY, unemployment, Fed funds, payrolls, 10Y-2Y curve.",
        "args": {},
    },
    {
        "name": "analyze_text",
        "description": "AI sentiment read of a headline+body. Returns ticker, event, sentiment, impact, confidence.",
        "args": {"headline": "string", "body": "string (may be empty)", "tickers": "comma-separated hints"},
    },
    {
        "name": "compute_correlation",
        "description": "Pairwise Pearson correlation of daily returns for tickers over N days. Use for heatmaps and pair discovery.",
        "args": {"tickers": "array of symbols", "days": "integer (default 252)"},
    },
    {
        "name": "search_assets",
        "description": "Search the tradable US equity universe by symbol or name fragment.",
        "args": {"query": "string"},
    },
    {
        "name": "web_search",
        "description": "Web search for live context the market data cannot give: earnings takes, analyst actions, macro news, why a ticker moved. Returns titles, urls, dates, snippets.",
        "args": {"query": "string", "num_results": "integer (default 8, max 10)"}
    },
    {
        "name": "fetch_page",
        "description": "Fetch a static web page and extract readable text (title plus body, capped). Use for articles, filings summaries, docs.",
        "args": {"url": "string"}
    },
    {
        "name": "browse_page",
        "description": "Render a JavaScript-heavy page in headless Chromium and read its visible text. Use when fetch_page returns cookie walls or empty shells.",
        "args": {"url": "string"}
    },
    {
        "name": "save_artifact",
        "description": "Persist a deliverable. type report (markdown) | heatmap ({tickers, matrix}) | timeseries ({series: [{name, points:[[t,v]]}]}) | bars ({items: [{label, value}]}) | histogram ({series: [{name, bins, counts}]}) | table ({columns, rows}). Call once per deliverable.",
        "args": {"type": "report|heatmap|timeseries|bars|histogram|table", "title": "string", "data": "object"},
    },
]


async def execute_tool(name: str, args: dict) -> dict:
    try:
        if name == "get_bars":
            return await _bars(str(args.get("symbol", "")).upper(), int(args.get("days", 90)), str(args.get("end", "") or ""))
        if name == "get_snapshots":
            return await _snapshots(str(args.get("symbols", "")))
        if name == "get_news":
            return await _news(str(args.get("symbols", "")), int(args.get("days_back", 14)), min(int(args.get("limit", 20)), 50))
        if name == "get_macro":
            return await _macro()
        if name == "analyze_text":
            return await _analyze(str(args.get("headline", "")), str(args.get("body", "")), str(args.get("tickers", "")))
        if name == "compute_correlation":
            tickers = args.get("tickers", [])
            if isinstance(tickers, str):
                tickers = [t.strip().upper() for t in tickers.split(",")]
            return await _correlation([str(t).upper() for t in tickers][: 20], int(args.get("days", 252)))
        if name == "search_assets":
            return await _search_assets(str(args.get("query", "")))
        if name == "web_search":
            return await _web_search(str(args.get("query", "")), min(int(args.get("num_results", 8)), 10))
        if name == "fetch_page":
            return await _fetch_page(str(args.get("url", "")))
        if name == "browse_page":
            return await _browse_page(str(args.get("url", "")))
        return {"error": f"unknown tool: {name}"}
    except Exception as e:  # noqa: BLE001 - surfaced to the agent as a tool result
        return {"error": str(e)[: 500]}


async def _bars(symbol: str, days: int, end: str) -> dict:
    from datetime import date, timedelta

    c = await _client()
    end_d = end or date.today().isoformat()
    r = await c.get(
        f"{DATA}/v2/stocks/{symbol}/bars",
        params={"timeframe": "1Day", "limit": min(days + 10, 1000), "start": f"{_start(end_d, days)}T00:00:00Z", "end": f"{end_d}T23:59:59Z", "adjustment": "all", "feed": "iex"},
        headers=_alpaca_headers(),
    )
    r.raise_for_status()
    bars = (r.json().get("bars") or [])[-days:]
    return {"symbol": symbol, "bars": [{"t": b["t"][:10], "o": b["o"], "h": b["h"], "l": b["l"], "c": b["c"], "v": b.get("v", 0)} for b in bars]}


def _start(end_iso: str, days: int) -> str:
    from datetime import date, timedelta

    return (date.fromisoformat(end_iso) - timedelta(days=days + 10)).isoformat()


async def _snapshots(symbols: str) -> dict:
    c = await _client()
    syms = ",".join(s.strip().upper() for s in symbols.split(",") if s.strip())[:200]
    r = await c.get(f"{DATA}/v2/stocks/snapshots", params={"symbols": syms, "feed": "iex"}, headers=_alpaca_headers())
    r.raise_for_status()
    out = []
    for sym, s in (r.json() or {}).items():
        price = (s.get("latestTrade") or {}).get("p") or (s.get("prevDailyBar") or {}).get("c")
        prev = (s.get("prevDailyBar") or {}).get("c")
        out.append({"symbol": sym, "price": price, "changePct": ((price - prev) / prev * 100) if price and prev else None})
    return {"snapshots": out}


async def _news(symbols: str, days_back: int, limit: int) -> dict:
    from datetime import date, timedelta

    c = await _client()
    end = date.today().isoformat()
    start = (date.today() - timedelta(days=max(1, days_back))).isoformat()
    r = await c.get(
        f"{DATA}/v1beta1/news",
        params={"symbols": symbols.upper(), "limit": limit, "sort": "DESC", "start": f"{start}T00:00:00Z", "end": f"{end}T23:59:59Z", "include_content": "false"},
        headers=_alpaca_headers(),
    )
    r.raise_for_status()
    items = []
    for a in (r.json().get("news") or [])[:limit]:
        items.append({
            "id": str(a.get("id", "")),
            "ts": a.get("updated_at") or a.get("created_at"),
            "headline": a.get("headline", ""),
            "source": a.get("source", ""),
            "tickers": [str(t).upper() for t in (a.get("symbols") or [])],
            "summary": a.get("summary", ""),
            "url": a.get("url", ""),
        })
    return {"articles": items}


async def _macro() -> dict:
    c = await _client()

    async def obs(series: str, limit: int = 14):
        r = await c.get(f"{FRED}/series/observations", params={
            "series_id": series, "api_key": config.FRED_KEY, "file_type": "json",
            "sort_order": "desc", "limit": str(limit),
        }, timeout=20.0)
        r.raise_for_status()
        return [(o["date"], float(o["value"])) for o in (r.json().get("observations") or []) if o["value"] != "."]

    cpi, un, ff, pay = await _gather(obs)
    return {
        "cpi_yoy_pct": round((cpi[0][1] / cpi[12][1] - 1) * 100, 2) if len(cpi) > 12 else None,
        "unemployment_pct": un[0][1] if un else None,
        "fed_funds_pct": ff[0][1] if ff else None,
        "payrolls_k": pay[0][1] if pay else None,
    }


async def _gather(obs):
    import asyncio

    return await asyncio.gather(
        obs("CPIAUCSL", 15), obs("UNRATE", 5), obs("DFF", 5), obs("PAYEMS", 5),
    )


async def _analyze(headline: str, body: str, tickers: str) -> dict:
    if not config.AI_API_KEY:
        raise RuntimeError("AI is not configured")
    c = await _client()
    r = await c.post(
        f"{config.AI_BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {config.AI_API_KEY}", "Content-Type": "application/json", "x-opencode-session": f"research-{int(time.time())}"},
        json={
            "model": config.AI_MODEL, "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": "Financial news analyst. Always return strict JSON: ticker, event, sentiment (bullish|bearish|neutral), impact (0-1), confidence (0-1), time_horizon, reasoning."},
                {"role": "user", "content": f"Headline: {headline}\nBody: {body[:2000]}\nTickers: {tickers}"},
            ],
        },
        timeout=60.0,
    )
    r.raise_for_status()
    j = r.json()
    text = (j.get("choices") or [{}])[0].get("message", {}).get("content", "{}")
    import json as _json

    return _json.loads(text[text.find("{"): text.rfind("}") + 1])


async def _correlation(tickers: list[str], days: int) -> dict:
    closes: dict[str, list[float]] = {}
    for t in tickers:
        b = await _bars(t, days + 5, "")
        cs = [x["c"] for x in (b.get("bars") or []) if x["c"] > 0][-days:]
        if len(cs) >= 20:
            closes[t] = cs
    syms = list(closes.keys())
    rets = {s: [math.log(closes[s][i] / closes[s][i - 1]) for i in range(1, len(closes[s]))] for s in syms}
    n = min(len(v) for v in rets.values())
    rets = {s: v[-n:] for s, v in rets.items()}
    vols = {}
    for s, v in rets.items():
        m = sum(v) / len(v)
        vols[s] = round(math.sqrt(sum((x - m) ** 2 for x in v) / len(v)) * math.sqrt(252), 4)
    matrix: list[list[float | None]] = []
    for a in syms:
        row: list[float | None] = []
        for b in syms:
            if a == b:
                row.append(1.0)
                continue
            ma, mb = sum(rets[a]) / n, sum(rets[b]) / n
            cov = sum((x - ma) * (y - mb) for x, y in zip(rets[a], rets[b])) / n
            sa = math.sqrt(sum((x - ma) ** 2 for x in rets[a]) / n) or 1e-9
            sb = math.sqrt(sum((x - mb) ** 2 for x in rets[b]) / n) or 1e-9
            row.append(round(cov / (sa * sb), 4))
        matrix.append(row)
    return {"tickers": syms, "matrix": matrix, "volatility_ann": vols, "trading_days": n}


async def _search_assets(query: str) -> dict:
    global _assets_cache
    q = query.strip().lower()
    now = time.time()
    if _assets_cache and now - _assets_cache[0] < 86400:
        assets = _assets_cache[1]
    else:
        c = await _client()
        r = await c.get(f"{PAPER}/v2/assets", params={"status": "active", "asset_class": "us_equity"}, headers=_alpaca_headers(), timeout=60.0)
        r.raise_for_status()
        assets = [{"s": a.get("symbol"), "n": a.get("name"), "x": a.get("exchange")} for a in r.json() if a.get("tradable", True)]
        _assets_cache = (now, assets)
    out = [a for a in assets if q in (a["s"] or "").lower() or q in (a["n"] or "").lower()][: 15]
    return {"matches": out}


TOOLS_BY_NAME = {t["name"]: t for t in TOOLS}


async def _web_search(query: str, num_results: int = 8) -> dict:
    """Live web search via Exa. Server-side key, never exposed to the browser."""
    if not config.EXA_API_KEY:
        return {"error": "web search is not configured (missing EXA_API_KEY)"}
    if not query.strip():
        return {"error": "empty query"}
    c = await _client()
    r = await c.post(
        "https://api.exa.ai/search",
        headers={"x-api-key": config.EXA_API_KEY, "Content-Type": "application/json"},
        json={"query": query[:500], "numResults": max(1, num_results), "contents": {"text": {"maxCharacters": 1500}, "highlights": True}},
        timeout=30.0,
    )
    r.raise_for_status()
    out = []
    for x in (r.json().get("results") or [])[:num_results]:
        out.append({
            "title": x.get("title", ""), "url": x.get("url", ""),
            "date": (x.get("publishedDate") or "")[:10],
            "snippet": " ".join(x.get("highlights") or [])[:800] or str(x.get("text", ""))[:800],
        })
    return {"results": out}


_BLOCKED_HOSTS = ("localhost", "127.", "0.0.0.0", "::1", "169.254.", "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.", "172.2", "172.30.", "172.31.")


def _page_ok(url: str) -> bool:
    from urllib.parse import urlparse

    try:
        u = urlparse(url.strip())
    except Exception:
        return False
    if u.scheme not in ("http", "https"):
        return False
    host = (u.hostname or "").lower()
    return bool(host) and not host.startswith(_BLOCKED_HOSTS)


def _html_to_text(html: str) -> tuple[str, str]:
    from html.parser import HTMLParser

    class P(HTMLParser):
        def __init__(self):
            super().__init__()
            self.skip = 0
            self.title_parts: list[str] = []
            self.in_title = False
            self.chunks: list[str] = []

        def handle_starttag(self, tag, attrs):
            if tag in ("script", "style", "noscript", "svg", "nav", "footer"):
                self.skip += 1
            if tag == "title":
                self.in_title = True

        def handle_endtag(self, tag):
            if tag in ("script", "style", "noscript", "svg", "nav", "footer"):
                self.skip = max(0, self.skip - 1)
            if tag == "title":
                self.in_title = False

        def handle_data(self, data):
            t = data.strip()
            if not t:
                return
            if self.in_title:
                self.title_parts.append(t)
            elif not self.skip:
                self.chunks.append(t)

    p = P()
    p.feed(html[:500000])
    text = " ".join(p.chunks)
    return " ".join(p.title_parts)[:300], " ".join(text.split())[:12000]


async def _fetch_page(url: str) -> dict:
    if not _page_ok(url):
        return {"error": "blocked or invalid url (public http/https only)"}
    c = await _client()
    r = await c.get(url.strip(), headers={"User-Agent": "vantagepoint-research/1.0"}, follow_redirects=True, timeout=30.0)
    r.raise_for_status()
    title, text = _html_to_text(r.text)
    if len(text) < 200:
        return {"url": str(r.url), "title": title, "text": text, "note": "page body is thin (likely JS-rendered); use browse_page instead"}
    return {"url": str(r.url), "title": title, "text": text}


_browser = None


async def _browse_page(url: str) -> dict:
    """Render the page in headless Chromium and read visible text. Falls back to fetch_page."""
    global _browser
    if not _page_ok(url):
        return {"error": "blocked or invalid url (public http/https only)"}
    try:
        from playwright.async_api import async_playwright
    except Exception:
        return await _fetch_page(url)
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            try:
                pg = await browser.new_page(viewport={"width": 1280, "height": 900}, user_agent="vantagepoint-research/1.0")
                await pg.goto(url.strip(), wait_until="domcontentloaded", timeout=45000)
                await pg.wait_for_timeout(2500)
                title = await pg.title()
                text = (await pg.locator("body").inner_text(timeout=15000)) or ""
                words = " ".join(text.split())
                return {"url": pg.url, "title": title[:300], "text": words[:12000], "rendered": True}
            finally:
                await browser.close()
    except Exception as e:  # noqa: BLE001 - browser trouble degrades to static fetch
        res = await _fetch_page(url)
        res["browse_error"] = str(e)[:300]
        return res
