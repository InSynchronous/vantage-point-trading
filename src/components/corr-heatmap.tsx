"use client";
import { useMemo, useState } from "react";
import { clsx } from "clsx";

export interface HeatmapData {
  tickers: string[];
  matrix: (number | null)[][];
}

/** Diverging red (-1) -> dark (0) -> green (+1) correlation matrix. */
export function CorrelationHeatmap({ data, onPickPair }: { data: HeatmapData; onPickPair?: (a: string, b: string, corr: number) => void }) {
  const [sel, setSel] = useState<[number, number] | null>(null);
  const { tickers, matrix } = data;
  const n = tickers.length;
  const cell = Math.max(34, Math.min(64, Math.floor(560 / Math.max(1, n))));

  const color = (v: number | null) => {
    if (v == null) return "rgba(255,255,255,0.04)";
    const x = Math.max(-1, Math.min(1, v));
    if (x >= 0) return `rgba(58,166,127,${0.06 + 0.82 * Math.abs(x)})`;
    return `rgba(229,72,77,${0.06 + 0.82 * Math.abs(x)})`;
  };

  const best = useMemo(() => {
    let b: { a: string; c: number; i: number; j: number } | null = null;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const v = matrix[i]?.[j];
        if (v != null && (!b || Math.abs(v) > Math.abs(b.c))) b = { a: `${tickers[i]} / ${tickers[j]}`, c: v, i, j };
      }
    return b;
  }, [tickers, matrix, n]);

  if (!n) return <div className="p-4 text-[12px] text-[#525c6c]">Empty matrix.</div>;

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="inline-block">
          <div className="flex">
            <div style={{ width: cell }} />
            {tickers.map((t) => (
              <div key={t} style={{ width: cell }} className="truncate px-1 pb-1 text-center font-mono text-[10px] font-bold text-[#9da8b8]">{t}</div>
            ))}
          </div>
          {tickers.map((t, i) => (
            <div key={t} className="flex items-center">
              <div style={{ width: cell }} className="truncate pr-1 text-right font-mono text-[10px] font-bold text-[#9da8b8]">{t}</div>
              {tickers.map((_, j) => {
                const v = matrix[i]?.[j];
                const isSel = sel?.[0] === i && sel?.[1] === j;
                return (
                  <button
                    key={j} title={`${tickers[i]} vs ${tickers[j]}: ${v == null ? "n/a" : v.toFixed(3)}`}
                    onClick={() => { setSel([i, j]); if (onPickPair && v != null && i !== j) onPickPair(tickers[i], tickers[j], v); }}
                    style={{ width: cell, height: cell, background: color(v), boxShadow: isSel ? "inset 0 0 0 2px #fff" : undefined }}
                    className="m-px grid place-items-center rounded-[3px] font-mono text-[10px] font-bold text-white/90 transition-transform hover:scale-105"
                  >
                    {v == null ? "·" : v.toFixed(2).replace("0.", ".")}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-[#646e7e]">
        <span className="font-mono">-1 <span className="inline-block h-2 w-16 rounded align-middle" style={{ background: "linear-gradient(90deg,#e5484d,#0c121c,#3aa67f)" }} /> +1</span>
        {best && <span>strongest pair: <b className="text-white">{best.a}</b> <span className="font-mono text-white">{best.c.toFixed(2)}</span></span>}
      </div>
    </div>
  );
}
