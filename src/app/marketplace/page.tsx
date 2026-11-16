"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { useBuilder } from "@/lib/store";
import type { Protocol } from "@/types/protocol";
import { Download, Star, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";

const MARKET: (Omit<Protocol, "nodes" | "edges"> & { creator: string; stars: number; clones: number; tags: string[]; nodesCount: number; edgesCount: number; blurb: string })[] = [
  { id: "m1", name: "Earnings Momentum", description: "Buys post-earnings drift when AI confirms guidance raise + price confirms.", creator: "quant_maya", stars: 482, clones: 1204, tags: ["earnings", "momentum"], nodesCount: 9, edgesCount: 9, updatedAt: "", status: "active", stats: { winRate: 58.2, returnPct: 22.4, sharpe: 1.31, trades: 210 }, blurb: "8-K + AI analyzer + threshold 0.72 + VWAP confirm." },
  { id: "m2", name: "Breaking News Momentum", description: "Flagship: news → AI → confidence filter → price confirm → risk-checked trade.", creator: "vantagepoint", stars: 918, clones: 3410, tags: ["news", "flagship"], nodesCount: 9, edgesCount: 8, updatedAt: "", status: "active", stats: { winRate: 61.4, returnPct: 18.2, sharpe: 1.42, trades: 132 }, blurb: "The example protocol. Already in your workspace." },
  { id: "m3", name: "Fed Announcement Analyzer", description: "Parses FOMC statements; trades SPY/QQQ on hawkish/dovish tilt with tight stops.", creator: "macro_desk", stars: 356, clones: 842, tags: ["macro", "FOMC"], nodesCount: 10, edgesCount: 11, updatedAt: "", status: "active", stats: { winRate: 55.9, returnPct: 12.8, sharpe: 1.05, trades: 96 }, blurb: "Event classifier + bull/bear probs + 1% stop." },
  { id: "m4", name: "Semiconductor News Tracker", description: "Watches NVDA/AMD/AMAT/LRCX news + social volume for sector momentum.", creator: "chip_alpha", stars: 289, clones: 623, tags: ["semis", "news"], nodesCount: 7, edgesCount: 7, updatedAt: "", status: "active", stats: { winRate: 57.1, returnPct: 15.6, sharpe: 1.18, trades: 148 }, blurb: "Multi-ticker feed + consensus node." },
  { id: "m5", name: "FDA Approval Monitor", description: "SEC + news watch for PDUFA dates; sizes small with hard stops.", creator: "bio_cap", stars: 198, clones: 411, tags: ["biotech", "event"], nodesCount: 8, edgesCount: 8, updatedAt: "", status: "active", stats: { winRate: 49.3, returnPct: 31.2, sharpe: 0.94, trades: 74 }, blurb: "High variance, capped at 1% equity." },
  { id: "m6", name: "Oil Supply Disruption Strategy", description: "Energy shock detector across XLE/USO with exposure caps.", creator: "energy_desk", stars: 154, clones: 302, tags: ["energy", "macro"], nodesCount: 7, edgesCount: 6, updatedAt: "", status: "active", stats: { winRate: 52.7, returnPct: 9.4, sharpe: 0.81, trades: 61 }, blurb: "Econ indicators + impact assessment." },
];

export default function MarketplacePage() {
  const [q, setQ] = useState("");
  const router = useRouter();
  const protocols = useBuilder((s) => s.protocols);

  const list = MARKET.filter((m) => (m.name + m.description + m.tags.join(" ")).toLowerCase().includes(q.toLowerCase()));

  const clone = (m: (typeof MARKET)[number]) => {
    const src = protocols.find((p) => p.id === "prot_breaking") ?? protocols[0];
    if (!src) return;
    const id = `prot_${Date.now().toString(36)}`;
    const copy: Protocol = {
      ...src, id, name: m.name,
      description: m.description,
      nodes: src.nodes.map((n) => ({ ...n, id: `${n.id}_${id.slice(-4)}` })),
      edges: src.edges.map((e) => ({ ...e, id: `${e.id}_${id.slice(-4)}`, source: `${e.source}_${id.slice(-4)}`, target: `${e.target}_${id.slice(-4)}` })),
    };
    useBuilder.setState((s) => ({ protocols: [...s.protocols, copy], activeId: id }));
    router.push("/builder");
  };

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="vp-ledger-head">Shared protocols</div>
          <h1 className="mt-1 text-[20px] font-bold tracking-tight text-white">Protocol Marketplace</h1>
          <p className="mt-1 text-[13px] text-[#9da8b8]">Clone battle-tested strategies into your workspace. Every clone ships with risk guards on.</p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#525c6c]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search strategies…" className="vp-input pl-8" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((m) => (
          <div key={m.id} className="vp-card flex flex-col p-5 transition-colors hover:border-white/[0.18]">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[14px] font-bold tracking-tight text-white">{m.name}</div>
              <div className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-[#9da8b8]"><Star className="h-3 w-3 text-[#e8edf4]" />{m.stars}</div>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-[#646e7e]"><Users className="h-3 w-3" /> @{m.creator} · <span className="font-mono">{m.clones.toLocaleString()} clones</span></div>
            <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-[#9da8b8]">{m.description}</p>
            <div className="mt-3 rounded-md border border-white/[0.07] bg-black/30 p-2.5 font-mono text-[11px] leading-relaxed text-[#9da8b8]">{m.blurb}<div className="mt-1 text-[#525c6c]">{m.nodesCount} nodes · {m.edgesCount} edges</div></div>
            <div className="mt-2.5 flex gap-3 font-mono text-[11px]">
              <span className="text-[#646e7e]">WR <b className="text-white">{m.stats?.winRate.toFixed(1)}%</b></span>
              <span className="text-[#646e7e]">Ret <b className="text-[#3aa67f]">+{m.stats?.returnPct.toFixed(1)}%</b></span>
              <span className="text-[#646e7e]">Sharpe <b className="text-white">{m.stats?.sharpe.toFixed(2)}</b></span>
            </div>
            <div className="mt-2 flex gap-1.5">{m.tags.map((t) => <span key={t} className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10.5px] text-[#9da8b8]">#{t}</span>)}</div>
            <button onClick={() => clone(m)} className="mt-3 flex items-center justify-center gap-2 rounded-md bg-[#e8edf4] px-3 py-2 text-[12.5px] font-bold text-black transition-colors hover:bg-white">
              <Download className="h-3.5 w-3.5" /> Clone to workspace
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
