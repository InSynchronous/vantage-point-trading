"use client";
import { useState } from "react";
import { getNodeDef } from "@/lib/nodes";
import { useBuilder } from "@/lib/store";
import { CATEGORY_META } from "@/types/protocol";
import { Trash2, AlertTriangle, CheckCircle2, Octagon, OctagonX } from "lucide-react";
import { clsx } from "clsx";

export function ConfigPanel() {
  const [tab, setTab] = useState<"config" | "output" | "docs">("config");
  const selectedNodeId = useBuilder((s) => s.selectedNodeId);
  const pausedNodeId = useBuilder((s) => s.pausedNodeId);
  const pausedInputs = useBuilder((s) => s.pausedInputs);
  const protocols = useBuilder((s) => s.protocols);
  const activeId = useBuilder((s) => s.activeId);
  const updateNodeConfig = useBuilder((s) => s.updateNodeConfig);
  const deleteNode = useBuilder((s) => s.deleteNode);
  const toggleBreakpoint = useBuilder((s) => s.toggleBreakpoint);
  const breakpoints = useBuilder((s) => s.breakpoints);
  const lastRunOutputs = useBuilder((s) => s.lastRunOutputs);

  const active = protocols.find((p) => p.id === activeId);
  const node = active?.nodes.find((n) => n.id === selectedNodeId);
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-xl">◈</div>
        <div className="mt-3 text-[13px] font-semibold text-white">No node selected</div>
        <p className="mt-1 text-[12px] leading-relaxed text-[#9da8b8]">Click a node to configure it. Drag new ones from the dock below, or press <Kbd>⌘K</Kbd>.</p>
      </div>
    );
  }
  const def = getNodeDef(node.type);
  const meta = CATEGORY_META[def.category];
  const output = lastRunOutputs[node.id];
  const hasBp = (breakpoints[activeId] ?? []).includes(node.id);
  const isPaused = pausedNodeId === node.id;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.07] p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: meta.color }}>{meta.label}</div>
            <div className="mt-0.5 flex items-center gap-2 text-[14px] font-bold text-white"><span>{def.icon}</span><span className="truncate">{node.data.label}</span></div>
          </div>
          <div className="flex shrink-0 gap-1">
            <button onClick={() => toggleBreakpoint(activeId, node.id)} title={hasBp ? "Remove breakpoint" : "Pause execution here"}
              className={clsx("rounded-md border p-2 transition-colors", hasBp ? "border-[#e5484d]/40 bg-[#e5484d]/15 text-[#f1999c]" : "border-white/10 text-[#646e7e] hover:text-white")}>
              {hasBp ? <OctagonX className="h-4 w-4" /> : <Octagon className="h-4 w-4" />}
            </button>
            <button onClick={() => deleteNode(node.id)} className="rounded-md border border-white/10 p-2 text-[#646e7e] hover:border-[#e5484d]/40 hover:bg-[#e5484d]/10 hover:text-[#f1999c]" title="Delete node (Del)">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-2.5 flex gap-1 rounded-md bg-white/[0.04] p-1">
          {(["config", "output", "docs"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx("flex-1 rounded py-1 text-[11.5px] font-bold capitalize", tab === t ? "bg-white/10 text-white" : "text-[#646e7e] hover:text-white")}>
              {t}{t === "output" && output !== undefined && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[#3aa67f]" />}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "config" && (
          <div className="space-y-4">
            {isPaused && (
              <div className="rounded-lg border border-[#e8edf4]/25 bg-[#e8edf4]/[0.06] px-3 py-2 text-[12px] font-semibold text-white">
                Paused here. Inputs are in the Output tab.
              </div>
            )}
            <div>
              <div className="vp-label mb-1.5">Configuration</div>
              <div className="space-y-3">
                {def.fields.map((f) => (
                  <FieldInput key={f.key} field={f as any} value={node.data.config[f.key]} onChange={(v) => updateNodeConfig(node.id, { [f.key]: v })} />
                ))}
                {def.fields.length === 0 && <div className="text-[12px] text-[#525c6c]">No configuration. Passthrough node.</div>}
              </div>
            </div>
            <div>
              <div className="vp-label mb-1.5">Validation</div>
              <Validation nodeType={node.type} config={node.data.config} />
            </div>
          </div>
        )}

        {tab === "output" && (
          <div className="space-y-3">
            {isPaused && (
              <div>
                <div className="vp-label mb-1.5">Paused inputs</div>
                <pre className="max-h-48 overflow-auto rounded-lg border border-[#e8edf4]/20 bg-black/50 p-2.5 font-mono text-[10.5px] leading-relaxed text-white">{JSON.stringify(pausedInputs, null, 2)}</pre>
              </div>
            )}
            <div>
              <div className="vp-label mb-1.5">Last output</div>
              {output !== undefined ? (
                <pre className="max-h-[420px] overflow-auto rounded-lg border border-white/[0.07] bg-black/50 p-2.5 font-mono text-[10.5px] leading-relaxed text-[#7fcfae]">{JSON.stringify(output, null, 2)}</pre>
              ) : (
                <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-[12px] text-[#525c6c]">Run the protocol to capture this node&apos;s output.</div>
              )}
            </div>
          </div>
        )}

        {tab === "docs" && (
          <div className="space-y-3 text-[12.5px] leading-relaxed text-[#9da8b8]">
            <p className="text-[#c7cfda]">{def.description}</p>
            {def.inputs.length > 0 && (
              <div><div className="vp-label mb-1.5">Inputs</div>
                <ul className="space-y-1">{def.inputs.map((p) => <li key={p.id} className="font-mono text-[11.5px]"><span className="text-white">{p.label}</span> <span className="text-[#525c6c]">:{p.type}</span></li>)}</ul></div>
            )}
            {def.outputs.length > 0 && (
              <div><div className="vp-label mb-1.5">Outputs</div>
                <ul className="space-y-1">{def.outputs.map((p) => <li key={p.id} className="font-mono text-[11.5px]"><span className="text-white">{p.label}</span> <span className="text-[#525c6c]">:{p.type}</span></li>)}</ul></div>
            )}
            {def.fields.filter((f) => f.help).map((f) => (
              <div key={f.key}><div className="vp-label mb-1">{f.label}</div><p>{(f as { help?: string }).help}</p></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-white/15 bg-white/[0.05] px-1 py-px font-mono text-[10.5px] text-white">{children}</span>;
}

function unitFor(key: string): string {
  const k = key.toLowerCase();
  if (k.includes("pct") || k.includes("percent") || k === "sharpe") return k === "sharpe" ? "" : "%";
  if (k.includes("sec") || k.includes("delay") && k.includes("bar")) return k.includes("sec") ? "s" : "";
  if (k.includes("usd") || k.includes("maxusd") || k === "value" && false) return "$";
  if (k.includes("bps")) return "bps";
  if (k.includes("bar")) return "bars";
  if (k.includes("qty")) return "sh";
  return "";
}

function FieldInput({ field, value, onChange }: { field: { key: string; label: string; type: string; options?: string[]; min?: number; max?: number; step?: number; help?: string }; value: unknown; onChange: (v: unknown) => void }) {
  const unit = unitFor(field.key);
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-[#c7cfda]">{field.label}{unit && <span className="ml-1 font-mono text-[10.5px] text-[#525c6c]">({unit})</span>}</span>
        {field.type === "slider" && <span className="font-mono text-[11px] text-white">{String(value)}</span>}
      </div>
      {field.type === "text" && <input className="vp-input font-mono" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />}
      {field.type === "tickers" && <TickerInput value={String(value ?? "")} onChange={onChange} />}
      {field.type === "number" && <input type="number" className="vp-input font-mono" value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} />}
      {field.type === "textarea" && <textarea className="vp-input min-h-[110px] resize-y font-mono text-[11.5px] leading-relaxed" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />}
      {field.type === "select" && (
        <select className="vp-input" value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {field.type === "multiselect" && (
        <div className="flex flex-wrap gap-1.5">
          {field.options?.map((o) => {
            const arr = Array.isArray(value) ? value : [];
            const on = arr.includes(o);
            return (
              <button key={o} type="button" onClick={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o])}
                className={on ? "rounded-md border border-white/30 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white" : "rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-[#9da8b8] hover:text-white"}>
                {o}
              </button>
            );
          })}
        </div>
      )}
      {field.type === "slider" && (
        <input type="range" min={field.min ?? 0} max={field.max ?? 1} step={field.step ?? 0.05} value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-white" />
      )}
      {field.type === "toggle" && (
        <button type="button" onClick={() => onChange(!value)} className={value ? "rounded-md bg-white px-3 py-1.5 text-[12px] font-bold text-black" : "rounded-md border border-white/10 px-3 py-1.5 text-[12px] text-[#9da8b8]"}>{value ? "Enabled" : "Disabled"}</button>
      )}
      {field.help && <div className="mt-1 text-[11px] text-[#525c6c]">{field.help}</div>}
    </label>
  );
}

function TickerInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = parts.filter((p) => !/^[A-Z.]{1,6}$/.test(p.toUpperCase()));
  return (
    <div>
      <input className={clsx("vp-input font-mono uppercase", bad.length > 0 && "border-[#e5484d]/50")} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} placeholder="NVDA, AAPL" spellCheck={false} />
      {bad.length > 0 && <div className="mt-1 text-[11px] text-[#f1999c]">Check: {bad.join(", ")}. Use 1–6 letters.</div>}
    </div>
  );
}

function Validation({ nodeType, config }: { nodeType: string; config: Record<string, unknown> }) {
  const issues: string[] = [];
  if (nodeType === "aiNewsAnalyzer" && !String((config as any).prompt ?? "").trim()) issues.push("Prompt is empty. The model has no instructions.");
  if (nodeType === "stockPrice" && !String((config as any).ticker ?? "").trim() && false) issues.push("Ticker is empty.");
  if ((config as any).threshold !== undefined && Number((config as any).threshold) <= 0 && nodeType === "threshold") issues.push("Threshold of 0 lets everything through.");
  if (issues.length === 0) {
    return <div className="flex items-center gap-2 rounded-lg border border-[#3aa67f]/25 bg-[#3aa67f]/[0.07] px-3 py-2 text-[12px] text-[#7fcfae]"><CheckCircle2 className="h-4 w-4" /> Valid</div>;
  }
  return <div className="space-y-1.5">{issues.map((i, k) => <div key={k} className="flex items-center gap-2 rounded-lg border border-[#e5484d]/25 bg-[#e5484d]/[0.07] px-3 py-2 text-[12px] text-[#f1999c]"><AlertTriangle className="h-4 w-4 shrink-0" />{i}</div>)}</div>;
}
