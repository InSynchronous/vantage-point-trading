import { NextRequest, NextResponse } from "next/server";
import { upstream } from "@/lib/alpaca-server";

export async function GET(req: NextRequest) {
  try {
    const limit = new URL(req.url).searchParams.get("limit") ?? "25";
    const orders = (await upstream(`/v2/orders?status=all&limit=${limit}&direction=desc`)) as Array<Record<string, any>>;
    return NextResponse.json(
      orders.map((o) => ({
        id: o.id,
        ts: new Date(o.submitted_at ?? o.created_at).getTime(),
        ticker: o.symbol,
        side: String(o.side).toUpperCase(),
        qty: Number(o.qty),
        filledQty: Number(o.filled_qty ?? 0),
        price: Number(o.filled_avg_price ?? o.limit_price ?? 0),
        type: o.order_type,
        status: o.status,
      }))
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
