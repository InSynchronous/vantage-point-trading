"use client";
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CATEGORY_META, type NodeCategory, type PortDef } from "@/types/protocol";

const PORT_COLORS: Record<string, string> = {
  news: "#60a5fa", analysis: "#a78bfa", signal: "#34d399", order: "#f59e0b",
  price: "#22d3ee", number: "#22d3ee", boolean: "#f59e0b", string: "#9da8b8",
  event: "#9da8b8", any: "#646e7e", data: "#60a5fa",
};

function portColor(t: string) {
  return PORT_COLORS[t] ?? "#646e7e";
}

export const VPNodeCard = memo(function VPNodeCard(props: NodeProps) {
  const { data, selected } = props as unknown as {
    data: {
      label: string; config: Record<string, unknown>; category: NodeCategory; icon: string;
      status?: string; inputs?: PortDef[]; outputs?: PortDef[]; breakpoint?: boolean; changed?: boolean;
    };
    selected: boolean;
  };
  const meta = CATEGORY_META[data.category];
  const status = data.status ?? "idle";
  const ring =
    status === "running" ? "border-[#22d3ee] shadow-[0_0_0_1px_rgba(34,211,238,.6),0_0_16px_rgba(34,211,238,.25)]"
    : status === "error" ? "border-[#e5484d] shadow-[0_0_0_1px_rgba(229,72,77,.6)]"
    : status === "success" ? "border-[#3aa67f]/60"
    : status === "skipped" ? "border-white/10 opacity-55"
    : data.changed ? "border-[#e8edf4]/60 shadow-[0_0_0_1px_rgba(232,237,244,.25)]"
    : selected ? "border-white/40" : "border-white/10 hover:border-white/25";
  const inputs = data.inputs ?? [];
  const outputs = data.outputs ?? [];
  const slot = (i: number, n: number) => (n <= 1 ? 50 : 18 + (i * 64) / (n - 1));

  return (
    <div className={`relative w-[188px] rounded-lg border bg-[#0c121c] transition-all ${ring}`}>
      {data.breakpoint && (
        <span className="absolute -left-1.5 -top-1.5 z-10 grid h-4 w-4 place-items-center rounded-full bg-[#e5484d]" title="Breakpoint">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
        </span>
      )}
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[13px]" style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>{data.icon}</span>
        <span className="truncate text-[12px] font-semibold text-white">{String(data.label)}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22d3ee]" />}
          {status === "success" && <span className="h-1.5 w-1.5 rounded-full bg-[#3aa67f]" />}
          {status === "error" && <span className="h-1.5 w-1.5 rounded-full bg-[#e5484d]" />}
          {data.changed && status !== "running" && <span className="h-1.5 w-1.5 rounded-full bg-[#e8edf4]" title="Output changed since last run" />}
        </span>
      </div>
      {inputs.map((p, i) => (
        <Handle key={`in-${p.id}`} id={p.id} type="target" position={Position.Left}
          title={`${p.label} : ${p.type}`}
          style={{ top: `${slot(i, inputs.length)}%`, background: portColor(p.type), width: 9, height: 9, border: "2px solid #04070f", left: -5 }} />
      ))}
      {outputs.map((p, i) => (
        <Handle key={`out-${p.id}`} id={p.id} type="source" position={Position.Right}
          title={`${p.label} : ${p.type}`}
          style={{ top: `${slot(i, outputs.length)}%`, background: portColor(p.type), width: 9, height: 9, border: "2px solid #04070f", right: -5 }} />
      ))}
    </div>
  );
});
