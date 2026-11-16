import { NextRequest, NextResponse } from "next/server";

const FRED = "https://api.stlouisfed.org/fred";

function key(): string {
  const k = process.env.FRED_KEY;
  if (!k) throw new Error("FRED not configured");
  return k;
}

async function obs(series: string, realtime?: string, limit = 14, units?: string) {
  const u = new URL(`${FRED}/series/observations`);
  u.searchParams.set("series_id", series);
  u.searchParams.set("api_key", key());
  u.searchParams.set("file_type", "json");
  u.searchParams.set("sort_order", "desc");
  u.searchParams.set("limit", String(limit));
  if (units) u.searchParams.set("units", units);
  if (realtime) {
    u.searchParams.set("realtime_start", realtime);
    u.searchParams.set("realtime_end", realtime);
  }
  const r = await fetch(u.toString(), { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error_message?: string }).error_message ?? `FRED ${r.status}`);
  return ((j as { observations?: Array<{ date: string; value: string }> }).observations ?? [])
    .map((o) => ({ date: o.date, value: o.value === "." ? null : Number(o.value) }))
    .filter((o) => o.value != null) as { date: string; value: number }[];
}

const pct = (a: number, b: number) => ((a - b) / b) * 100;

// GET /api/fred/series?series_id=CPIAUCSL&units=pc1&limit=24
export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const id = (sp.get("series_id") ?? "CPIAUCSL").toUpperCase();
    if (!/^[A-Z0-9_]+$/.test(id)) throw new Error("Invalid series id");
    const rows = await obs(id, sp.get("asof") ?? undefined, Number(sp.get("limit") || 24), sp.get("units") ?? undefined);
    return NextResponse.json({ series: id, rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
