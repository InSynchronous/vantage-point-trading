import { NextResponse } from "next/server";
import { upstream } from "@/lib/alpaca-server";

// Full tradable US equity universe for symbol search. Slimmed + cached in-memory (24h)
// so the 10k-row list isn't refetched on every page load.
let cache: { at: number; rows: { s: string; n: string; x: string }[] } | null = null;

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < 24 * 3600e3) return NextResponse.json(cache.rows);
    const assets = (await upstream("/v2/assets?status=active&asset_class=us_equity")) as Array<{
      symbol?: string; name?: string; exchange?: string; tradable?: boolean;
    }>;
    const rows = assets
      .filter((a) => a.symbol && a.tradable !== false)
      .map((a) => ({ s: a.symbol as string, n: a.name ?? a.symbol as string, x: a.exchange ?? "" }));
    cache = { at: Date.now(), rows };
    return NextResponse.json(rows);
  } catch (e: any) {
    if (cache) return NextResponse.json(cache.rows);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
