"use client";
import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/mock-data";

// Renders "…" on first paint so server HTML and hydration match,
// then swaps to the live relative time after mount.
export function TimeAgo({ ts }: { ts: number }) {
  const [label, setLabel] = useState("…");
  useEffect(() => {
    setLabel(timeAgo(ts));
    const t = setInterval(() => setLabel(timeAgo(ts)), 30000);
    return () => clearInterval(t);
  }, [ts]);
  return <>{label}</>;
}
