import { NextRequest, NextResponse } from "next/server";

// One-shot key verification. The pasted keys are used for a single upstream
// call and never stored, logged, or persisted anywhere.
export async function POST(req: NextRequest) {
  try {
    const { key, secret } = await req.json();
    if (!key || !secret) return NextResponse.json({ error: "Paste both the key and the secret." }, { status: 400 });
    const base = (process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets").replace(/\/$/, "");
    if (base.includes("api.alpaca.markets") && !base.includes("paper")) {
      return NextResponse.json({ error: "Refusing to verify against a live endpoint." }, { status: 400 });
    }
    const r = await fetch(`${base}/v2/account`, {
      headers: { "APCA-API-KEY-ID": String(key).trim(), "APCA-API-SECRET-KEY": String(secret).trim() },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json({ error: (j as { message?: string }).message ?? `Alpaca rejected the keys (${r.status})` }, { status: 400 });
    return NextResponse.json({ ok: true, equity: Number((j as { equity?: string }).equity) || 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Verification failed" }, { status: 500 });
  }
}
