import { NextRequest, NextResponse } from "next/server";
import { upstream } from "@/lib/alpaca-server";

export async function GET(req: NextRequest) {
  try {
    const symbols = (new URL(req.url).searchParams.get("symbols") ?? "SPY").toUpperCase();
    const snaps = (await upstream(`/v2/stocks/snapshots?symbols=${encodeURIComponent(symbols)}&feed=iex`, { data: true })) as Record<
      string, { latestTrade?: { p?: number }; prevDailyBar?: { c?: number } }
    >;
    return NextResponse.json(
      Object.entries(snaps).map(([symbol, s]) => {
        const price = s.latestTrade?.p ?? s.prevDailyBar?.c ?? null;
        const prev = s.prevDailyBar?.c ?? null;
        return { symbol, price, changePct: price != null && prev ? ((price - prev) / prev) * 100 : null };
      })
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
