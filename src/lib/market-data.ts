// Client-side market math for dashboard widgets. Real Alpaca data only.
export interface DayBar { date: string; open: number; high: number; low: number; close: number; volume: number }

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j as { error?: string }).error) throw new Error((j as { error?: string }).error ?? `request failed (${r.status})`);
  return j as T;
}

export async function fetchDailyBars(symbol: string, days: number): Promise<DayBar[]> {
  const start = new Date(Date.now() - (days + 10) * 864e5).toISOString();
  const j = await getJSON<{ bars?: { time: string; open: number; high: number; low: number; close: number; volume: number }[] }>(
    `/api/alpaca/bars?symbol=${encodeURIComponent(symbol)}&timeframe=1Day&limit=${days + 10}&start=${encodeURIComponent(start)}`
  );
  return (j.bars ?? []).map((b) => ({
    date: b.time.slice(0, 10), open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0,
  })).filter((b) => b.close > 0).slice(-days);
}

export function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const x = a.slice(-n), y = b.slice(-n);
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let cov = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { cov += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; }
  return cov / (Math.sqrt(sx * sy) || 1e-9);
}

export function parseTickers(raw: string): string[] {
  return [...new Set(raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 12);
}

export interface CorrResult { tickers: string[]; matrix: number[][] }

export async function correlationMatrix(tickers: string[], days: number): Promise<CorrResult> {
  const closes = new Map<string, number[]>();
  await Promise.all(tickers.map(async (t) => {
    try {
      const bars = await fetchDailyBars(t, days);
      if (bars.length >= 20) closes.set(t, bars.map((b) => b.close));
    } catch { /* skip dead tickers */ }
  }));
  const syms = [...closes.keys()];
  const rets = new Map(syms.map((s) => [s, logReturns(closes.get(s)!)]));
  const n = Math.min(...[...rets.values()].map((r) => r.length));
  const matrix = syms.map((a) => syms.map((b, j) => {
    if (a === syms[j]) return 1;
    const ra = rets.get(a)!.slice(-n), rb = rets.get(b)!.slice(-n);
    return Math.round(pearson(ra, rb) * 100) / 100;
  }));
  return { tickers: syms, matrix };
}

export interface MonthCell { key: string; label: string; start: number; end: number }

export function monthBuckets(dates: string[], months: number): MonthCell[] {
  const keys = [...new Set(dates.map((d) => d.slice(0, 7)))].sort().slice(-months);
  return keys.map((k) => {
    const inMonth = dates.filter((d) => d.startsWith(k));
    return { key: k, label: new Date(k + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }), start: 0, end: inMonth.length - 1 };
  });
}

export async function monthlyReturns(tickers: string[], months: number): Promise<{ tickers: string[]; labels: string[]; matrix: number[][] }> {
  const per: { t: string; dates: string[]; closes: number[] }[] = [];
  await Promise.all(tickers.map(async (t) => {
    try {
      const bars = await fetchDailyBars(t, months * 32 + 10);
      if (bars.length >= 20) per.push({ t, dates: bars.map((b) => b.date), closes: bars.map((b) => b.close) });
    } catch { /* skip */ }
  }));
  const keys = [...new Set(per.flatMap((p) => p.dates.map((d) => d.slice(0, 7))))].sort().slice(-months);
  const labels = keys.map((k) => new Date(k + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }));
  const matrix = per.map((p) => keys.map((k) => {
    const idx = p.dates.map((d, i) => (d.startsWith(k) ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) return 0;
    const r = (p.closes[idx[idx.length - 1]] - p.closes[idx[0]]) / p.closes[idx[0]];
    return Math.round(r * 10000) / 100;
  }));
  return { tickers: per.map((p) => p.t), labels, matrix };
}

export function histogramBins(values: number[], binCount = 18): { bins: string[]; counts: number[]; mean: number; std: number } {
  if (!values.length) return { bins: [], counts: [], mean: 0, std: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length) || 1e-9;
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = (hi - lo) || 1;
  const w = span / binCount;
  const counts = new Array(binCount).fill(0);
  for (const v of values) counts[Math.min(binCount - 1, Math.floor((v - lo) / w))]++;
  const bins = counts.map((_, i) => {
    const a = lo + i * w, b = a + w;
    const f = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
    return `${f(a)}..${f(b)}`;
  });
  return { bins, counts, mean, std };
}
