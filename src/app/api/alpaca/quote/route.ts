import { NextRequest, NextResponse } from "next/server";

// Proxy Alpaca paper API server-side so keys never hit the browser.
// Env: ALPACA_API_KEY, ALPACA_SECRET_KEY, ALPACA_BASE_URL (default paper)
export async function GET(req: NextRequest) {
  const symbol = new URL(req.url).searchParams.get("symbol") ?? "NVDA";
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) {
    return NextResponse.json({ error: "Alpaca not configured", symbol, price: null }, { status: 200 });
  }
  try {
    const r = await fetch(`https://data.alpaca.markets/v2/stocks/${symbol}/quotes/latest`, {
      headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
    });
    const j = await r.json();
    const q = j?.quote;
    // ap is 0 when no ask is posted (e.g. outside hours). ?? won't skip 0, so prefer explicitly.
    const price = q?.ap && q?.bp ? (q.ap + q.bp) / 2 : q?.ap || q?.bp || null;
    return NextResponse.json({ symbol, price, ts: Date.now() });
  } catch (e: any) {
    return NextResponse.json({ error: String(e), symbol, price: null }, { status: 502 });
  }
}
