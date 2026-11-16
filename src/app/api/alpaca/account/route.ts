import { NextResponse } from "next/server";
import { upstream } from "@/lib/alpaca-server";

export async function GET() {
  try {
    const acct = (await upstream("/v2/account")) as Record<string, string>;
    return NextResponse.json({
      equity: Number(acct.equity),
      cash: Number(acct.cash),
      buyingPower: Number(acct.buying_power),
      portfolioValue: Number(acct.portfolio_value),
      currency: acct.currency || "USD",
      patternDayTrader: acct.pattern_day_trader,
      ts: Date.now(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
