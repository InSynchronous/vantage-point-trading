import { NextRequest, NextResponse } from "next/server";
import { analyzeNews } from "@/lib/ai";

// Same-origin proxy so the opencode API key stays server-side.
// The browser engine calls this; it never sees AI_API_KEY.
export async function POST(req: NextRequest) {
  try {
    const { headline, body, tickersHint } = await req.json();
    const strict = new URL(req.url).searchParams.get("strict") === "1";
    const meta = { live: false };
    const analysis = await analyzeNews(
      String(headline ?? ""),
      String(body ?? ""),
      String(tickersHint ?? ""),
      meta,
      strict
    );
    return NextResponse.json({ ...analysis, _via: meta.live ? "live" : "mock" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "AI unavailable" }, { status: 503 });
  }
}
