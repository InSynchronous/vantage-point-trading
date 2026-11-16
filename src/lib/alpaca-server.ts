// Server-only Alpaca helpers. Keys never leave the server.
// PAPER ENFORCED: trading calls go to the paper endpoint. Anything that
// looks like the live trading host is refused outright.

export function tradingBase(): string {
  const b = (process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets").replace(/\/$/, "");
  if (b.includes("api.alpaca.markets") && !b.includes("paper")) {
    throw new Error("Live trading host refused. Paper only.");
  }
  return b;
}

export function dataBase(): string {
  return "https://data.alpaca.markets";
}

export function authHeaders(): Record<string, string> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) throw new Error("Alpaca not configured");
  return { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret };
}

export async function upstream(path: string, opts: { data?: boolean; init?: RequestInit } = {}) {
  const base = opts.data ? dataBase() : tradingBase();
  const r = await fetch(`${base}${path}`, { ...opts.init, headers: { ...authHeaders(), ...(opts.init?.headers as Record<string, string> | undefined) } });
  const text = await r.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 500) }; }
  if (!r.ok) {
    const msg = (json as { message?: string })?.message ?? text.slice(0, 300) ?? `Alpaca ${r.status}`;
    throw new Error(`Alpaca ${r.status}: ${msg}`);
  }
  return json;
}
