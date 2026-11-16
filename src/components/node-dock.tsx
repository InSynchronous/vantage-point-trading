"use client";
import { useMemo, useState } from "react";
import { NODE_DEFS } from "@/lib/nodes";
import { CATEGORY_META, type NodeCategory } from "@/types/protocol";
import { Search, ChevronUp, ChevronDown } from "lucide-react";
import { clsx } from "clsx";

const CATS: NodeCategory[] = ["data", "ai", "logic", "signal", "risk", "execution"];

export function NodeDock({ onDragStart }: { onDragStart: (type: string) => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<NodeCategory | "all">("all");
  const [open, setOpen] = useState(true);

  const list = useMemo(() => NODE_DEFS.filter((d) =>
    (cat === "all" || d.category === cat) &&
    (d.label + d.description + d.type).toLowerCase().includes(q.toLowerCase())
  ), [q, cat]);

  if (!open) {
    return (
      <div className="flex items-center gap-2 border-t border-white/[0.07] bg-[#060b16] px-4 py-2">
        <span className="text-[11.5px] font-semibold text-[#525c6c]">{NODE_DEFS.length} node types</span>
        <button onClick={() => setOpen(true)} className="ml-auto flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-white/[0.06]">
          <ChevronUp className="h-3.5 w-3.5" /> Node library
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-white/[0.07] bg-[#060b16]">
      <div className="flex items-center gap-2 px-3 pt-2">
        <div className="relative w-52 shrink-0">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-[#525c6c]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search nodes…  (⌘K)" className="vp-input !py-1.5 pl-8 text-[12px]" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <DockCat active={cat === "all"} label="All" onClick={() => setCat("all")} />
          {CATS.map((c) => (
            <DockCat key={c} active={cat === c} label={CATEGORY_META[c].label} color={CATEGORY_META[c].color} onClick={() => setCat(c)} />
          ))}
        </div>
        <span className="hidden shrink-0 font-mono text-[10.5px] text-[#525c6c] xl:block">drag onto canvas</span>
        <button onClick={() => setOpen(false)} className="shrink-0 rounded-md p-1.5 text-[#646e7e] hover:bg-white/[0.05] hover:text-white" title="Collapse library">
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto px-3 pb-2.5 pt-2">
        {list.map((d) => {
          const m = CATEGORY_META[d.category];
          return (
            <div key={d.type} draggable
              onDragStart={(e) => { e.dataTransfer.setData("application/vp-node", d.type); e.dataTransfer.effectAllowed = "move"; onDragStart(d.type); }}
              title={d.description}
              className="flex w-[168px] shrink-0 cursor-grab items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] p-2 transition-colors hover:border-white/20 hover:bg-white/[0.05] active:cursor-grabbing">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[14px]" style={{ background: m.bg, border: `1px solid ${m.border}` }}>{d.icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold text-white">{d.label}</span>
                <span className="block text-[9.5px] font-bold uppercase tracking-wider" style={{ color: m.color }}>{m.label}</span>
              </span>
            </div>
          );
        })}
        {list.length === 0 && <div className="px-2 py-3 text-[12px] text-[#525c6c]">No nodes match “{q}”.</div>}
      </div>
    </div>
  );
}

function DockCat({ active, label, color, onClick }: { active: boolean; label: string; color?: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={clsx("shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors", active ? "bg-white/10 text-white" : "text-[#525c6c] hover:text-white")}
      style={active && color ? { boxShadow: `inset 0 0 0 1px ${color}44`, color } : undefined}>
      {label}
    </button>
  );
}
