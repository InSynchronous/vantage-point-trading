import { NextRequest, NextResponse } from "next/server";
import { upstream } from "@/lib/alpaca-server";

// DELETE /api/alpaca/positions/[symbol]?qty=. Flattens (or partially closes) a position.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ symbol: string }> }) {
  try {
    const { symbol } = await ctx.params;
    const sym = symbol.toUpperCase();
    if (!/^[A-Z.]{1,8}$/.test(sym)) throw new Error("Invalid symbol");
    const qty = new URL(req.url).searchParams.get("qty");
    const path = qty ? `/v2/positions/${sym}?qty=${encodeURIComponent(qty)}` : `/v2/positions/${sym}`;
    const order = (await upstream(path, { init: { method: "DELETE" } })) as Record<string, any>;
    return NextResponse.json({ ok: true, ticker: order.symbol ?? sym, qty: Number(order.qty ?? 0), status: order.status ?? "closed" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
