export interface NewsItem {
  id: string;
  ts: number;
  headline: string;
  source: string;
  tickers: string[];
  body: string;
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
  impact: number;
  summary: string;
  url: string;
}

export interface Holding {
  ticker: string;
  name: string;
  qty: number;
  avgCost: number;
  price: number;
}

export interface Candle { time: string; open: number; high: number; low: number; close: number; volume?: number }

const NOW = Date.now();

export const NEWS_FEED: NewsItem[] = [
  { id: "article_123", ts: NOW - 4 * 60e3, headline: "NVIDIA raises Q4 revenue guidance on surging AI datacenter demand", source: "Reuters", tickers: ["NVDA"], body: "NVIDIA raised forward revenue guidance well above consensus, citing accelerating Hopper and Blackwell orders from hyperscalers. Management flagged multi-quarter visibility.", sentiment: "bullish", confidence: 0.92, impact: 0.87, summary: "NVDA raised guidance on AI datacenter strength; hyperscaler orders accelerating.", url: "#" },
  { id: "article_124", ts: NOW - 22 * 60e3, headline: "Tesla Q3 deliveries miss Street view; margins in focus", source: "Bloomberg", tickers: ["TSLA"], body: "Tesla delivered fewer vehicles than expected as competition in China intensified. Analysts flagged pricing and margin trajectory into Q4.", sentiment: "bearish", confidence: 0.78, impact: 0.64, summary: "TSLA deliveries missed by ~4%; China competition and margins weigh.", url: "#" },
  { id: "article_125", ts: NOW - 47 * 60e3, headline: "Apple unveils M4-powered lineup with deeper AI integration", source: "CNBC", tickers: ["AAPL"], body: "Apple introduced new silicon and on-device AI features, with services attach expected to lift average selling prices.", sentiment: "bullish", confidence: 0.71, impact: 0.52, summary: "AAPL launches M4 line with AI features; ASP uplift expected.", url: "#" },
  { id: "article_126", ts: NOW - 68 * 60e3, headline: "AMD upgraded at top-tier bank on AI inference share gains", source: "WSJ", tickers: ["AMD"], body: "Analysts upgraded AMD citing accelerating inference wins and improving MI300 ramp into enterprise.", sentiment: "bullish", confidence: 0.69, impact: 0.48, summary: "AMD upgraded; inference share gains cited.", url: "#" },
  { id: "article_127", ts: NOW - 95 * 60e3, headline: "Fed officials signal patience on rates as inflation cools gradually", source: "Reuters", tickers: ["SPY","QQQ"], body: "Policymakers emphasized data-dependence, keeping December options open. Futures pricing shifted modestly dovish.", sentiment: "neutral", confidence: 0.66, impact: 0.55, summary: "Fed stays data-dependent; December cut odds edge up.", url: "#" },
  { id: "article_128", ts: NOW - 130 * 60e3, headline: "Oil jumps as supply disruption fears resurface in the Gulf", source: "Bloomberg", tickers: ["XLE","USO"], body: "Crude rallied on reports of shipping delays; refiners and airlines diverged. Volatility in energy complex rose.", sentiment: "bullish", confidence: 0.74, impact: 0.61, summary: "Crude up on supply fears; energy vol rises.", url: "#" },
  { id: "article_129", ts: NOW - 180 * 60e3, headline: "FDA grants priority review to biotech's lead therapy; decision due Q2", source: "SEC Wire", tickers: ["BIIB"], body: "Priority review shortens the PDUFA clock; analysts model 60% approval odds with large peak-sales range.", sentiment: "bullish", confidence: 0.68, impact: 0.72, summary: "Priority review granted; approval odds ~60%.", url: "#" },
  { id: "article_130", ts: NOW - 240 * 60e3, headline: "Semiconductor equipment orders rebound; memory capex returns", source: "CNBC", tickers: ["AMAT","LRCX","MU"], body: "Tool orders beat seasonal patterns as DRAM pricing firms; memory capex cycle appears to be turning.", sentiment: "bullish", confidence: 0.7, impact: 0.5, summary: "Semi tool orders rebound on memory recovery.", url: "#" },
];

export const HOLDINGS: Holding[] = [
  { ticker: "NVDA", name: "NVIDIA Corp", qty: 120, avgCost: 131.4, price: 187.6 },
  { ticker: "AAPL", name: "Apple Inc", qty: 85, avgCost: 198.2, price: 232.4 },
  { ticker: "MSFT", name: "Microsoft", qty: 60, avgCost: 402.1, price: 428.9 },
  { ticker: "TSLA", name: "Tesla", qty: 90, avgCost: 248.0, price: 241.3 },
  { ticker: "AMD", name: "Advanced Micro", qty: 200, avgCost: 142.8, price: 158.2 },
  { ticker: "SPY", name: "S&P 500 ETF", qty: 45, avgCost: 512.0, price: 587.3 },
];

export const CASH = 84210;

export const TICKER_NAMES: Record<string, string> = {
  NVDA: "NVIDIA Corp", AAPL: "Apple Inc", MSFT: "Microsoft", TSLA: "Tesla",
  AMD: "Advanced Micro", SPY: "S&P 500 ETF", QQQ: "Nasdaq 100 ETF", AMAT: "Applied Materials",
};

// deterministic pseudo-random walk for charts / simulation
export function genCandles(seed: number, points = 90, start = 180): Candle[] {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const out: Candle[] = [];
  let p = start;
  const t0 = Date.now() - points * 5 * 60e3;
  for (let i = 0; i < points; i++) {
    const drift = (rnd() - 0.48) * 2.2;
    const open = p;
    const close = Math.max(1, p + drift);
    const high = Math.max(open, close) + rnd() * 0.9;
    const low = Math.min(open, close) - rnd() * 0.9;
    const d = new Date(t0 + i * 5 * 60e3);
    out.push({ time: d.toISOString().slice(0, 16).replace("T", " "), open, high, low, close, volume: Math.round(1e5 + rnd() * 9e5) });
    p = close;
  }
  return out;
}

export function priceOf(ticker: string): number {
  const h = HOLDINGS.find((x) => x.ticker === ticker);
  if (h) return h.price;
  let s = 0;
  for (const c of ticker) s += c.charCodeAt(0);
  return 50 + (s % 300) + ((s * 7) % 40) / 10;
}

export function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
export function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
export function timeAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
