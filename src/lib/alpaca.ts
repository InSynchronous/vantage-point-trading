// Browser-side Alpaca access. Always via same-origin proxies (keys stay server-side).

export interface Account { equity: number; cash: number; buyingPower: number; portfolioValue: number; ts: number }
export interface Position {
  ticker: string; qty: number; side: string; avgCost: number; price: number;
  marketValue: number; unrealizedPl: number; unrealizedPlPct: number; changeTodayPct: number;
}
export interface Order {
  id: string; ts: number; ticker: string; side: string; qty: number; filledQty: number;
  price: number; type: string; status: string;
}
export interface Snapshot { symbol: string; price: number | null; changePct: number | null }

export interface Asset { s: string; n: string; x: string }

export async function fetchAssets(): Promise<Asset[]> {
  return get<Asset[]>("/api/alpaca/assets");
}

export interface NewsArticle {
  id: string; ts: number; headline: string; source: string; tickers: string[];
  body: string; author: string; url: string; image: string | null;
}

export async function fetchNews(symbols: string[], limit = 30): Promise<NewsArticle[]> {
  return get<NewsArticle[]>(`/api/alpaca/news?symbols=${encodeURIComponent(symbols.join(","))}&limit=${limit}`);
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok || (j as { error?: string }).error) throw new Error((j as { error?: string }).error ?? `request failed`);
  return j as T;
}

export const fetchAccount = () => get<Account>("/api/alpaca/account");
export const fetchPositions = () => get<Position[]>("/api/alpaca/positions");
export const fetchOrders = (limit = 25) => get<Order[]>(`/api/alpaca/orders?limit=${limit}`);
export const fetchHistory = (period = "1M", timeframe = "1D") =>
  get<{ points: { t: string; v: number }[] }>(`/api/alpaca/history?period=${period}&timeframe=${timeframe}`);
export const fetchSnapshots = (symbols: string[]) =>
  get<Snapshot[]>(`/api/alpaca/snapshots?symbols=${encodeURIComponent(symbols.join(","))}`);
export const fetchBars = (symbol: string, timeframe = "1Day", limit = 90, start?: string) =>
  get<{ symbol: string; bars: { time: string; open: number; high: number; low: number; close: number; volume: number }[] }>(
    `/api/alpaca/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}${start ? `&start=${encodeURIComponent(start)}` : ""}`
  );

export async function placeOrder(args: {
  symbol: string; qty: number; side: "buy" | "sell";
  type?: "market" | "limit" | "stop" | "stop_limit";
  limit_price?: number; stop_price?: number;
  take_profit?: number; stop_loss?: number;
}): Promise<Order & { error?: string }> {
  const r = await fetch("/api/alpaca/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...args, time_in_force: "day" }),
  });
  return r.json();
}

export async function cancelOrder(id: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`/api/alpaca/order/${id}`, { method: "DELETE" });
  return r.json();
}

export async function closePosition(symbol: string, qty?: number): Promise<{ ok: boolean; error?: string; ticker?: string }> {
  const r = await fetch(`/api/alpaca/positions/${encodeURIComponent(symbol)}${qty ? `?qty=${qty}` : ""}`, { method: "DELETE" });
  return r.json();
}
