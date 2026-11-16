export type NodeCategory =
  | "data"
  | "ai"
  | "logic"
  | "signal"
  | "risk"
  | "execution";

export interface PortDef {
  id: string;
  label: string;
  type: "event" | "string" | "number" | "boolean" | "news" | "analysis" | "signal" | "order" | "any";
}

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "multiselect" | "slider" | "toggle" | "textarea" | "tickers";
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  default: unknown;
  help?: string;
}

export interface NodeDef {
  type: string;
  label: string;
  category: NodeCategory;
  description: string;
  icon: string;
  inputs: PortDef[];
  outputs: PortDef[];
  fields: FieldDef[];
  defaults: Record<string, unknown>;
}

export interface VPNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string; config: Record<string, unknown>; status?: "idle" | "running" | "success" | "error" | "skipped" };
}

export interface VPEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  animated?: boolean;
}

export interface Protocol {
  id: string;
  name: string;
  description: string;
  nodes: VPNode[];
  edges: VPEdge[];
  updatedAt: string;
  status: "draft" | "active" | "paused";
  stats?: { winRate: number; returnPct: number; sharpe: number; trades: number };
}

export interface ExecLog {
  ts: number;
  nodeId: string;
  nodeLabel: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
  data?: unknown;
}

export interface Trade {
  id: string;
  ts: number;
  ticker: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  value: number;
  pnl?: number;
  protocol: string;
  status: "filled" | "simulated" | "hypothetical";
}

export interface Signal {
  id: string;
  ts: number;
  ticker: string;
  action: "BUY" | "SELL" | "HOLD" | "EXIT";
  confidence: number;
  price: number;
  reason: string;
  protocol: string;
}

export const CATEGORY_META: Record<NodeCategory, { label: string; color: string; bg: string; border: string }> = {
  data: { label: "Data Sources", color: "#22d3ee", bg: "rgba(34,211,238,.1)", border: "rgba(34,211,238,.35)" },
  ai: { label: "AI Intelligence", color: "#a78bfa", bg: "rgba(167,139,250,.12)", border: "rgba(167,139,250,.4)" },
  logic: { label: "Logic", color: "#f59e0b", bg: "rgba(245,158,11,.1)", border: "rgba(245,158,11,.35)" },
  signal: { label: "Trading Signals", color: "#34d399", bg: "rgba(52,211,153,.1)", border: "rgba(52,211,153,.35)" },
  risk: { label: "Risk Management", color: "#f87171", bg: "rgba(248,113,113,.1)", border: "rgba(248,113,113,.35)" },
  execution: { label: "Execution", color: "#60a5fa", bg: "rgba(96,165,250,.12)", border: "rgba(96,165,250,.4)" },
};

export function portsCompatible(a: string, b: string): boolean {
  if (a === "any" || b === "any") return true;
  if (a === b) return true;
  // event can drive anything trigger-like; allow event->any already covered
  // analysis output can feed signal/any/logic
  const flexible: Record<string, string[]> = {
    news: ["any", "news", "analysis"],
    analysis: ["any", "analysis", "signal"],
    signal: ["any", "signal", "order"],
    number: ["any", "number"],
    boolean: ["any", "boolean"],
    event: ["any", "event"],
  };
  return flexible[a]?.includes(b) ?? false;
}
