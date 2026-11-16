import { NextResponse } from "next/server";
import { upstream } from "@/lib/alpaca-server";

export async function GET() {
  try {
    const pos = (await upstream("/v2/positions")) as Array<Record<string, string>>;
    return NextResponse.json(
      pos.map((p) => ({
        ticker: p.symbol,
        qty: Number(p.qty),
        side: p.side,
        avgCost: Number(p.avg_entry_price),
        price: Number(p.current_price),
        marketValue: Number(p.market_value),
        unrealizedPl: Number(p.unrealized_pl),
        unrealizedPlPct: Number(p.unrealized_plpc) * 100,
        changeTodayPct: Number(p.change_today ?? 0) * 100,
      }))
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
