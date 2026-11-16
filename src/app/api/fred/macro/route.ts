import { NextRequest, NextResponse } from "next/server";

const FRED = "https://api.stlouisfed.org/fred";

function key(): string {
  const k = process.env.FRED_KEY;
  if (!k) throw new Error("FRED not configured");
  return k;
}

async function obs(series: string, realtime?: string, limit = 14) {
  const u = new URL(`${FRED}/series/observations`);
  u.searchParams.set("series_id", series);
  u.searchParams.set("api_key", key());
  u.searchParams.set("file_type", "json");
  u.searchParams.set("sort_order", "desc");
  u.searchParams.set("limit", String(limit));
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

const yoy = (rows: { date: string; value: number }[], months = 12) => {
  if (rows.length <= months) return null;
  return ((rows[0].value - rows[months].value) / rows[months].value) * 100;
};

// GET /api/fred/macro[?asof=YYYY-MM-DD]: curated bundle for the Economic Indicators node.
// ?asof uses FRED vintages, so backtests see data as known at that date.
export async function GET(req: NextRequest) {
  try {
    const asof = new URL(req.url).searchParams.get("asof") ?? undefined;
    const [cpi, unrate, dff, payems, ppi, gdp, dgs10, dgs2] = await Promise.all([
      obs("CPIAUCSL", asof, 15), obs("UNRATE", asof, 14), obs("DFF", asof, 10),
      obs("PAYEMS", asof, 14), obs("PPIACO", asof, 15), obs("GDP", asof, 6),
      obs("DGS10", asof, 5), obs("DGS2", asof, 5),
    ]);
    const mom = (rows: { date: string; value: number }[]) =>
      rows.length > 1 ? ((rows[0].value - rows[1].value) / Math.abs(rows[1].value)) * 100 : null;
    return NextResponse.json({
      asof: asof ?? "latest",
      cpi: { date: cpi[0]?.date ?? null, value: cpi[0]?.value ?? null, yoyPct: yoy(cpi) },
      unemploymentPct: { date: unrate[0]?.date ?? null, value: unrate[0]?.value ?? null },
      fedFundsPct: { date: dff[0]?.date ?? null, value: dff[0]?.value ?? null },
      payrollsK: { date: payems[0]?.date ?? null, value: payems[0]?.value ?? null, momPct: mom(payems) },
      ppiYoYPct: { date: ppi[0]?.date ?? null, value: ppi[0]?.value ?? null, yoyPct: yoy(ppi) },
      gdpQoq: { date: gdp[0]?.date ?? null, value: gdp[0]?.value ?? null },
      yield10Y: dgs10[0]?.value ?? null,
      yield2Y: dgs2[0]?.value ?? null,
      curve10Y2Y: dgs10[0] && dgs2[0] ? +(dgs10[0].value - dgs2[0].value).toFixed(2) : null,
      note: "FOMC meeting calendar is not in FRED; stance is read from the fed funds rate and the 10Y-2Y curve.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
