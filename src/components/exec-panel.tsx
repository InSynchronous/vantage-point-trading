"use client";
import { useBuilder } from "@/lib/store";
import type { ExecLog } from "@/types/protocol";
import { CheckCircle2, Info, AlertTriangle, XCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";

const ICON = {
  info: Info, success: CheckCircle2, warn: AlertTriangle, error: XCircle,
} as const;

export function ExecPanel() {
  const logs = useBuilder((s) => s.logs);
  const signals = useBuilder((s) => s.signals);
  const [tab, setTab] = useState<"logs" | "signals" | "data">("logs");
  const lastRunOutputs = useBuilder((s) => s.lastRunOutputs);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-white/[0.07] px-3 pt-2">
        {(["logs", "signals", "data"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx("rounded-t px-3 py-2 text-[12px] font-semibold capitalize transition-colors",
              tab === t ? "bg-white/[0.06] text-white" : "text-[#646e7e] hover:text-[#9da8b8]")}>
            {t}{t === "logs" && logs.length > 0 && <span className="ml-1.5 rounded-full bg-white/10 px-1.5 font-mono text-[10px] text-white">{logs.length}</span>}
            {t === "signals" && signals.length > 0 && <span className="ml-1.5 rounded-full bg-[#3aa67f]/20 px-1.5 font-mono text-[10px] text-[#7fcfae]">{signals.length}</span>}
          </button>
        ))}
        <button onClick={() => useBuilder.setState({ logs: [] })} className="ml-auto mb-1 rounded p-1.5 text-[#646e7e] hover:bg-white/5 hover:text-white" title="Clear logs"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-2.5">
        {tab === "logs" && (
          <div className="space-y-0.5">
            {logs.length === 0 && <Empty text="Run the protocol to see the execution trace. Each node reports pass, skip, or reject here." />}
            {[...logs].reverse().map((l, i) => <LogRow key={`${l.ts}_${i}`} log={l} />)}
          </div>
        )}
        {tab === "signals" && (
          <div className="space-y-1.5">
            {signals.length === 0 && <Empty text="Generated BUY / SELL signals will appear here with confidence and reason." />}
            {signals.map((s) => (
              <div key={s.id} className="rounded-md border border-white/[0.07] bg-white/[0.02] p-2.5">
                <div className="flex items-center gap-2">
                  <span className={clsx("rounded px-1.5 py-0.5 font-mono text-[11px] font-bold", s.action === "BUY" ? "bg-[#3aa67f]/15 text-[#7fcfae]" : s.action === "SELL" ? "bg-[#e5484d]/15 text-[#f1999c]" : "bg-white/[0.06] text-[#9da8b8]")}>{s.action}</span>
                  <span className="font-mono text-[12px] font-bold text-white">{s.ticker}</span>
                  <span className="ml-auto font-mono text-[11px] text-[#9da8b8]">${s.price.toFixed(2)}</span>
                </div>
                <div className="mt-1 text-[11px] leading-snug text-[#9da8b8]">{s.reason}</div>
                <div className="mt-1 font-mono text-[10px] text-[#646e7e]">conf {s.confidence.toFixed(2)} · {s.protocol}</div>
              </div>
            ))}
          </div>
        )}
        {tab === "data" && (
          <pre className="overflow-auto rounded-md border border-white/[0.07] bg-black/40 p-2.5 font-mono text-[10.5px] text-[#9da8b8]">{JSON.stringify(lastRunOutputs, null, 2) || "{}"}</pre>
        )}
      </div>
    </div>
  );
}

function LogRow({ log }: { log: ExecLog }) {
  const Icon = ICON[log.level];
  const color = log.level === "success" ? "text-[#3aa67f]" : log.level === "error" ? "text-[#e5484d]" : log.level === "warn" ? "text-amber-300" : "text-[#9da8b8]";
  return (
    <div className="flex gap-2 rounded px-2 py-1.5 hover:bg-white/[0.03]">
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} strokeWidth={1.75} />
      <div className="min-w-0">
        <div className="text-[11.5px] leading-snug text-[#c7cfda]"><span className="font-mono text-[10px] text-[#646e7e]">[{log.nodeLabel}]</span> {log.message}</div>
        <div className="font-mono text-[10px] text-[#525c6c]">{new Date(log.ts).toLocaleTimeString()}</div>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-white/10 p-5 text-center text-[12px] leading-relaxed text-[#646e7e]">{text}</div>;
}
