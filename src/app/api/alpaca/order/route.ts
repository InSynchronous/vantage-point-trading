import { NextRequest, NextResponse } from "next/server";
import { upstream } from "@/lib/alpaca-server";

// Manual order entry. Always routed to the Alpaca PAPER trading endpoint.
// (enforced in tradingBase()). No live-order code path exists.
// Supports: market, limit, stop, stop_limit + bracket legs (take_profit / stop_loss).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = String(body.symbol ?? "").trim().toUpperCase();
    const qty = Math.floor(Number(body.qty));
    const side = String(body.side ?? "").toLowerCase();
    const type = String(body.type ?? "market").toLowerCase();
    const time_in_force = String(body.time_in_force ?? "day").toLowerCase();

    if (!/^[A-Z.]{1,8}$/.test(symbol)) throw new Error("Invalid symbol");
    if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantity must be a positive whole number");
    if (side !== "buy" && side !== "sell") throw new Error("Side must be buy or sell");
    if (!["market", "limit", "stop", "stop_limit"].includes(type)) throw new Error("Type must be market, limit, stop or stop_limit");
    if (!["day", "gtc", "ioc", "fok"].includes(time_in_force)) throw new Error("Invalid time in force");

    // No naked shorts: SELL requires an open position and may not exceed its size.
    if (side === "sell") {
      let held = 0;
      try {
        const pos = (await upstream(`/v2/positions/${symbol}`)) as { qty?: string; side?: string };
        const q = Math.floor(Number(pos.qty ?? 0));
        held = pos.side === "short" ? 0 : Math.abs(q);
      } catch {
        held = 0; // 404 = no position
      }
      if (held <= 0) throw new Error(`No position in ${symbol}. Short selling is disabled.`);
      if (qty > held) throw new Error(`Sell qty ${qty} exceeds your ${held} sh position.`);
    }

    const payload: Record<string, unknown> = { symbol, qty, side, type, time_in_force };
    const num = (v: unknown, name: string) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive price`);
      return n;
    };    if (type === "limit" || type === "stop_limit") payload.limit_price = num(body.limit_price, "Limit price");
    if (type === "stop" || type === "stop_limit") payload.stop_price = num(body.stop_price, "Stop price");

    // Bracket legs (Alpaca attaches TP + SL, OCO-managed server-side)
    if (body.take_profit != null) {
      payload.take_profit = { limit_price: num(body.take_profit, "Take-profit price") };
    }
    if (body.stop_loss != null) {
      const sl = Number(body.stop_loss);
      if (!Number.isFinite(sl) || sl <= 0) throw new Error("Stop-loss must be a positive price");
      payload.stop_loss = { stop_price: sl };
    }

    const order = (await upstream("/v2/orders", {
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    })) as Record<string, any>;

    return NextResponse.json({
      id: order.id,
      ticker: order.symbol,
      side: String(order.side).toUpperCase(),
      qty: Number(order.qty),
      type: order.order_type,
      status: order.status,
      ts: Date.now(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
