import { NextRequest, NextResponse } from "next/server";
import { upstream } from "@/lib/alpaca-server";

// Real financial news via Alpaca (data API, key server-side).
// GET /api/alpaca/news?symbols=NVDA,AAPL&limit=20
export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const symbols = (sp.get("symbols") ?? "SPY,QQQ,NVDA,AAPL,TSLA,AMD,MSFT").toUpperCase();
    const limit = sp.get("limit") ?? "30";
    const start = sp.get("start");
    const end = sp.get("end");
    const extra = `${start ? `&start=${encodeURIComponent(start)}` : ""}${end ? `&end=${encodeURIComponent(end)}` : ""}`;
    const j = (await upstream(
      `/v1beta1/news?symbols=${encodeURIComponent(symbols)}&limit=${encodeURIComponent(limit)}&sort=DESC&include_content=false&exclude_contentless=false${extra}`,
      { data: true }
    )) as {
      news?: Array<{
        id?: string | number; headline?: string; summary?: string; author?: string;
        created_at?: string; updated_at?: string; url?: string; source?: string;
        symbols?: string[]; images?: { large?: string; thumb?: string }[];
      }>;
    };
    return NextResponse.json(
      (j.news ?? []).map((a, i) => ({
        id: String(a.id ?? `news_${i}`),
        ts: a.updated_at ? Date.parse(a.updated_at) : Date.now(),
        headline: a.headline ?? "(no headline)",
        source: a.source ?? "Alpaca",
        tickers: (a.symbols ?? []).map((s) => s.toUpperCase()),
        body: a.summary ?? "",
        author: a.author ?? "",
        url: a.url ?? "",
        image: a.images?.[0]?.thumb ?? a.images?.[0]?.large ?? null,
      }))
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
