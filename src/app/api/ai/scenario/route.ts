import { NextRequest, NextResponse } from "next/server";
import { resolveAIBase, resolveModel } from "@/lib/ai";

// POST /api/ai/scenario { brief? } -> synthetic test scenario for Test Mode.
// Clearly fake data for walkthroughs: AI-invented headline, body, tickers.
// Prices are filled in live by the client from real quotes.
export async function POST(req: NextRequest) {
  try {
    const { brief, legs, hasNews } = (await req.json().catch(() => ({}))) as {
      brief?: string; legs?: string[]; hasNews?: boolean;
    };
    const pairLegs = Array.isArray(legs)
      ? legs.map((t) => String(t).toUpperCase().slice(0, 8)).filter(Boolean).slice(0, 2)
      : [];
    const isPairs = pairLegs.length === 2 && hasNews === false;
    const base = resolveAIBase();
    const key = process.env.AI_API_KEY;
    const model = resolveModel();
    if (!base || !key) throw new Error("AI is not configured");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "x-opencode-session": `vpt-scenario-${Date.now().toString(36)}`,
        "User-Agent": "vantagepoint-trading/1.0",
      },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: isPairs
              ? `You invent a SINGLE plausible-but-fake corporate event that SPLITS the pair ${pairLegs[0]} vs ${pairLegs[1]} for testing a pairs-trading bot. Good news for one leg, bad news for the other (earnings beat vs guide-down, FDA win vs recall, upgrade vs downgrade, contract win vs lost deal). Respond with NOTHING but JSON: {"headline": string, "body": string (2-3 sentences naming both tickers), "tickers": ["${pairLegs[0]}", "${pairLegs[1]}"], "shocks": {"${pairLegs[0]}": number, "${pairLegs[1]}": number}}. Mark it obviously synthetic: include "[TEST]" at the start of the headline. Shocks are one-day price moves in percent, opposite signs, each between 3 and 8 in magnitude, matching the story direction.`
              : `You invent a SINGLE plausible-but-fake breaking financial news story for testing a trading bot. Respond with NOTHING but JSON: {"headline": string, "body": string (2-3 sentences), "tickers": string[] (1-3 real US tickers), "event": "earnings_guidance|analyst_upgrade|merger|fda|macro|supply|product_launch", "direction": "bullish|bearish"}. Mark it obviously synthetic: include "[TEST]" at the start of the headline. Make it dramatic enough to trigger signals (big guidance raise or miss).`,
          },
          { role: "user", content: (typeof brief === "string" && brief.trim() ? brief : isPairs ? `${pairLegs[0]} beats and raises guidance while ${pairLegs[1]} warns on costs` : "A semiconductor earnings surprise") .slice(0, 500) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI request failed (${res.status})`);
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content ?? "{}";
    const start = text.indexOf("{");
    const parsed = JSON.parse(start >= 0 ? text.slice(start, text.lastIndexOf("}") + 1) : text) as {
      headline?: string; body?: string; tickers?: string[];
      shocks?: Record<string, unknown>;
    };
    if (!parsed.headline) throw new Error("AI returned an empty scenario");
    if (isPairs) {
      const shocks: Record<string, number> = {};
      for (const leg of pairLegs) {
        const raw = Number((parsed.shocks as Record<string, unknown> | undefined)?.[leg]);
        shocks[leg] = Number.isFinite(raw) ? Math.max(-25, Math.min(25, raw)) : 0;
      }
      if (shocks[pairLegs[0]] === 0 && shocks[pairLegs[1]] === 0) {
        shocks[pairLegs[0]] = 5; shocks[pairLegs[1]] = -4;
      }
      return NextResponse.json({
        headline: String(parsed.headline).slice(0, 200),
        body: String(parsed.body ?? "").slice(0, 1000),
        tickers: pairLegs,
        shocks,
      });
    }
    return NextResponse.json({
      headline: String(parsed.headline).slice(0, 200),
      body: String(parsed.body ?? "").slice(0, 1000),
      tickers: (Array.isArray(parsed.tickers) ? parsed.tickers : ["NVDA"]).map((t) => String(t).toUpperCase().slice(0, 8)).slice(0, 3),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Scenario generation failed" }, { status: 502 });
  }
}
