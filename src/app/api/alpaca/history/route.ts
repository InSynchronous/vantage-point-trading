import { NextRequest, NextResponse } from "next/server";
import { upstream } from "@/lib/alpaca-server";

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const period = sp.get("period") ?? "1M";
    const timeframe = sp.get("timeframe") ?? "1D";
    const hist = (await upstream(
      `/v2/account/portfolio/history?period=${encodeURIComponent(period)}&timeframe=${encodeURIComponent(timeframe)}`
    )) as { timestamp?: number[]; equity?: (number | null)[] };
    const ts = hist.timestamp ?? [];
    const eq = hist.equity ?? [];
    const points = ts
      .map((t, i) => ({ t: new Date(t * 1000).toISOString().slice(0, 10), v: eq[i] ?? null as number | null }))
      .filter((p) => p.v != null) as { t: string; v: number }[];
    return NextResponse.json({ points });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
