// -- AI abstraction: opencode endpoint with mock fallback --
// Env: AI_BASE_URL, AI_API_KEY, AI_MODEL
// Go inference lives at https://opencode.ai/inference/go/openai/v1 (chat/completions).
// The /zen/go/v1 base is the agent auth flow, not inference. It is mapped automatically.
// Requires `x-opencode-session` header + a real model ID (see https://opencode.ai/v2/docs/console/go/).

// Stable session per server process for Go routing + prompt caching.
const SESSION_ID = `vpt-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

function resolveBase(raw: string | undefined): string | null {
  if (!raw) return null;
  const b = raw.replace(/\/$/, "");
  if (b.includes("/zen/go")) return "https://opencode.ai/inference/go/openai/v1";
  return b;
}

const VALID_DEFAULT_MODEL = "glm-5.3-flash"; // cheap, chat/completions-compatible
export function resolveModel(): string {
  const m = process.env.AI_MODEL;
  if (!m || m === "opencode-default") return VALID_DEFAULT_MODEL; // not a real model ID
  return m;
}

export function resolveAIBase(): string | null {
  return resolveBase(process.env.AI_BASE_URL || process.env.NEXT_PUBLIC_AI_BASE_URL);
}

export interface AIAnalysis {
  ticker: string;
  event: string;
  sentiment: "bullish" | "bearish" | "neutral";
  impact: number;
  confidence: number;
  time_horizon: string;
  novelty: number;
  reasoning: string;
  sources: string[];
}

const MOCK_ANALYSES: AIAnalysis[] = [
  { ticker: "NVDA", event: "earnings_guidance", sentiment: "bullish", impact: 0.87, confidence: 0.92, time_horizon: "medium_term", novelty: 0.85, reasoning: "Company raised forward revenue guidance on AI datacenter demand.", sources: ["article_123"] },
  { ticker: "TSLA", event: "delivery_miss", sentiment: "bearish", impact: 0.64, confidence: 0.78, time_horizon: "short_term", novelty: 0.6, reasoning: "Q3 deliveries missed consensus by 4%; margin pressure noted.", sources: ["article_124"] },
  { ticker: "AAPL", event: "product_launch", sentiment: "bullish", impact: 0.52, confidence: 0.71, time_horizon: "medium_term", novelty: 0.55, reasoning: "New chip + services attach expected to lift ASP.", sources: ["article_125"] },
  { ticker: "AMD", event: "analyst_upgrade", sentiment: "bullish", impact: 0.48, confidence: 0.69, time_horizon: "short_term", novelty: 0.4, reasoning: "Top-tier upgrade citing share gains in inference.", sources: ["article_126"] },
];

export function aiConfigured(): boolean {
  return !!(process.env.AI_API_KEY || process.env.NEXT_PUBLIC_AI_CONFIGURED);
}

/**
 * Browser-safe analysis: calls the same-origin /api/ai/analyze proxy so
 * AI_API_KEY never leaves the server. Falls back to the mock analyzer if
 * the proxy is unreachable or misconfigured.
 */
export async function analyzeNewsClient(headline: string, body: string, tickersHint: string, strict = false): Promise<AIAnalysis> {
  try {
    const res = await fetch(`/api/ai/analyze${strict ? "?strict=1" : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headline, body, tickersHint }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    const json = await res.json();
    if (json?.error) throw new Error(json.error);
    return json as AIAnalysis;
  } catch {
    return analyzeNews(headline, body, tickersHint);
  }
}

export async function analyzeNews(headline: string, body: string, tickersHint: string, meta?: { live: boolean }, strict = false): Promise<AIAnalysis> {
  const base = resolveBase(process.env.AI_BASE_URL || process.env.NEXT_PUBLIC_AI_BASE_URL);
  const key = process.env.AI_API_KEY;
  const model = resolveModel();

  if (base && key) {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "x-opencode-session": SESSION_ID,
          "User-Agent": "vantagepoint-trading/1.0",
        },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "You are a financial news analyst. Always return strict JSON with keys: ticker, event, sentiment (bullish|bearish|neutral), impact (0-1), confidence (0-1), time_horizon, novelty (0-1), reasoning, sources." },
            { role: "user", content: `Headline: ${headline}\nBody: ${body}\nFocus tickers: ${tickersHint}` },
          ],
          temperature: 0.2,
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(text);
      if (meta) meta.live = true;
      return {
        ticker: String(parsed.ticker || "NVDA"),
        event: String(parsed.event || "general"),
        sentiment: ["bullish","bearish","neutral"].includes(parsed.sentiment) ? parsed.sentiment : "neutral",
        impact: Number(parsed.impact ?? 0.5),
        confidence: Number(parsed.confidence ?? 0.6),
        time_horizon: String(parsed.time_horizon || "short_term"),
        novelty: Number(parsed.novelty ?? 0.5),
        reasoning: String(parsed.reasoning || "Model output"),
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      };
    } catch {
      if (strict) throw new Error("AI unavailable");
      // fall through to mock
    }
  }
  if (strict) throw new Error("AI unavailable");
  // deterministic mock pick based on headline hash
  let h = 0;
  for (const c of headline) h = (h * 31 + c.charCodeAt(0)) % MOCK_ANALYSES.length;
  const pick = MOCK_ANALYSES[h];
  return { ...pick };
}

// -- Alpaca abstraction (paper only, enforced) --
// Env: ALPACA_API_KEY, ALPACA_SECRET_KEY, ALPACA_BASE_URL (default paper)

export const PAPER_ONLY = true;

export interface AlpacaQuote { symbol: string; price: number; ts: number }

export async function getAlpacaQuote(symbol: string): Promise<AlpacaQuote | null> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  const base = process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";
  if (key && secret) {
    try {
      const r = await fetch(`/api/alpaca/quote?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
      if (r.ok) return await r.json();
    } catch { /* fallback */ }
    void base;
  }
  return null; // caller falls back to simulation
}

export function alpacaConfigured(): boolean {
  return !!(process.env.ALPACA_API_KEY || process.env.NEXT_PUBLIC_ALPACA_CONFIGURED);
}
