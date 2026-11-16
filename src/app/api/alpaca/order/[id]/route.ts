import { NextRequest, NextResponse } from "next/server";
import { upstream } from "@/lib/alpaca-server";

// DELETE /api/alpaca/order/[id]. Cancels an open order (paper endpoint enforced upstream).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!/^[a-f0-9-]{8,64}$/i.test(id)) throw new Error("Invalid order id");
    await upstream(`/v2/orders/${id}`, { init: { method: "DELETE" } });
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
