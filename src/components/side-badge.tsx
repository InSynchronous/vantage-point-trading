"use client";
import { clsx } from "clsx";

export function SideBadge({ side }: { side: string }) {
  const buy = side === "BUY";
  const exit = side === "EXIT";
  return (
    <span className={clsx("shrink-0 rounded border px-1.5 py-0.5 font-mono text-[11px] font-bold",
      buy ? "border-[#3aa67f]/25 bg-[#3aa67f]/10 text-[#7fcfae]"
      : exit ? "border-white/15 bg-white/[0.06] text-[#9da8b8]"
      : "border-[#e5484d]/25 bg-[#e5484d]/10 text-[#f1999c]")}>
      {side}
    </span>
  );
}
