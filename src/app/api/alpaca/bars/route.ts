import { NextRequest, NextResponse } from "next/server";
import { upstream } from "@/lib/alpaca-server";

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const symbol = (sp.get("symbol") ?? "NVDA").toUpperCase();
    const timeframe = sp.get("timeframe") ?? "1Day";
    const limit = sp.get("limit") ?? "90";
    // Alpaca returns bars:null without an explicit start on this data tier. Default by granularity.
    const daysBack = timeframe === "1Day" ? 1825 : timeframe === "1Week" ? 1825 : timeframe === "1Hour" ? 90 : 30;
    const start = sp.get("start") ?? new Date(Date.now() - daysBack * 864e5).toISOString();
    const end = sp.get("end");
    const j = (await upstream(
      `/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${encodeURIComponent(timeframe)}&limit=${encodeURIComponent(limit)}&start=${encodeURIComponent(start)}${end ? `&end=${encodeURIComponent(end)}` : ""}&adjustment=all&feed=iex&sort=asc`,
      { data: true }
    )) as { bars?: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }> };
    return NextResponse.json({
      symbol,
      bars: (j.bars ?? [])
        .map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }))
        .sort((a, b) => (a.time < b.time ? -1 : 1)),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
