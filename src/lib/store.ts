import { create } from "zustand";
import type { ExecLog, Protocol, Signal, Trade, VPEdge, VPNode } from "@/types/protocol";
import { defaultConfig, getNodeDef } from "@/lib/nodes";

let uid = 100;
export const nid = () => `n_${Date.now().toString(36)}_${(uid++).toString(36)}`;

/** layered left-to-right layout used for fresh and AI-generated graphs */
export function layoutLayered(depths: number[]): { x: number; y: number }[] {
  const cols = new Map<number, number>();
  return depths.map((d) => {
    const row = cols.get(d) ?? 0;
    cols.set(d, row + 1);
    return { x: 60 + d * 280, y: 60 + row * 150 };
  });
}

function breakingNewsProtocol(): Protocol {
  const nodes: VPNode[] = [
    { id: "n_news", type: "newsFeed", position: { x: 40, y: 180 }, data: { label: "News Feed", config: { tickers: "NVDA, TSLA, AAPL, AMD, MSFT, SPY, QQQ", sources: ["Reuters","Bloomberg","CNBC"], minNovelty: 0.5, pollSecs: 30 }, status: "idle" } },
    { id: "n_ai", type: "aiNewsAnalyzer", position: { x: 300, y: 180 }, data: { label: "AI News Analyzer", config: { model: "opencode-default", prompt: "Analyze this financial news. Return JSON: ticker, event, sentiment, impact 0-1, confidence 0-1, time_horizon, novelty, reasoning.", tickers: "NVDA", confidenceThreshold: 0.7 }, status: "idle" } },
    { id: "n_conf", type: "threshold", position: { x: 570, y: 180 }, data: { label: "Confidence Filter", config: { field: "confidence", threshold: 0.65 }, status: "idle" } },
    { id: "n_price", type: "stockPrice", position: { x: 300, y: 380 }, data: { label: "Stock Price", config: { ticker: "NVDA", timeframe: "5Min", lookback: 20 }, status: "idle" } },
    { id: "n_tech", type: "techConfirm", position: { x: 570, y: 380 }, data: { label: "Technical Confirmation", config: { method: "momentum_5m", minMovePct: 0.3 }, status: "idle" } },
    { id: "n_sig", type: "buySignal", position: { x: 705, y: 280 }, data: { label: "Signal", config: { strength: 0.8, ticker: "" }, status: "idle" } },
    { id: "n_risk", type: "positionSizing", position: { x: 975, y: 280 }, data: { label: "Risk Check", config: { method: "pct_equity", value: 2, maxUsd: 10000 }, status: "idle" } },
    { id: "n_trade", type: "paperTrade", position: { x: 1245, y: 280 }, data: { label: "Trade Order", config: { qty: 0, orderType: "market" }, status: "idle" } },
    { id: "n_notify", type: "notify", position: { x: 1245, y: 480 }, data: { label: "Notification", config: { channel: "in-app", message: "{{action}} {{ticker}} @ {{price}}" }, status: "idle" } },
  ];
  const edges: VPEdge[] = [
    { id: "e1", source: "n_news", target: "n_ai" },
    { id: "e2", source: "n_ai", target: "n_conf" },
    { id: "e3", source: "n_conf", target: "n_tech" },
    { id: "e4", source: "n_price", target: "n_tech", sourceHandle: "price", targetHandle: "price" },
    { id: "e5", source: "n_tech", target: "n_sig" },
    { id: "e6", source: "n_sig", target: "n_risk" },
    { id: "e7", source: "n_risk", target: "n_trade" },
    { id: "e8", source: "n_trade", target: "n_notify" },
  ];
  return { id: "prot_breaking", name: "Breaking News Momentum", description: "News → AI analysis → confidence filter → price confirmation → risk-checked paper trade.", nodes, edges, updatedAt: new Date().toISOString(), status: "active", stats: { winRate: 61.4, returnPct: 18.2, sharpe: 1.42, trades: 132 } };
}

interface BuilderState {
  protocols: Protocol[];
  activeId: string;
  selectedNodeId: string | null;
  running: boolean;
  pausedNodeId: string | null;
  pausedInputs: unknown[];
  breakpoints: Record<string, string[]>; // protocolId -> nodeIds
  logs: ExecLog[];
  signals: Signal[];
  trades: Trade[];
  nodeStatus: Record<string, string>;
  lastRunOutputs: Record<string, unknown>;
  prevRunOutputs: Record<string, unknown>;
  changedIds: string[];
  savedAt: Record<string, string>;
  savedSnapshot: Record<string, string>; // protocolId -> JSON of nodes+edges at save

  setActive: (id: string) => void;
  updateNodes: (nodes: VPNode[]) => void;
  updateEdges: (edges: VPEdge[]) => void;
  selectNode: (id: string | null) => void;
  updateNodeConfig: (id: string, patch: Record<string, unknown>) => void;
  addNode: (type: string, pos: { x: number; y: number }) => void;
  deleteNode: (id: string) => void;
  saveProtocol: () => void;
  newProtocol: () => void;
  importGraph: (name: string, description: string, defs: { type: string; label: string; config: Record<string, unknown> }[], links: { from: number; to: number; fromPort: string; toPort: string }[]) => void;
  duplicateProtocol: () => void;
  setRunning: (r: boolean) => void;
  setPaused: (nodeId: string | null, inputs?: unknown[]) => void;
  toggleBreakpoint: (protocolId: string, nodeId: string) => void;
  pushLogs: (l: ExecLog[]) => void;
  clearRun: () => void;
  setNodeStatus: (id: string, s: string) => void;
  resetStatuses: () => void;
  applyRunResult: (r: { logs: ExecLog[]; signals: Signal[]; trades: Trade[]; nodeOutputs: Record<string, unknown> }) => void;
}

function pairsProtocol(): Protocol {
  const nodes: VPNode[] = [
    { id: "p_spread", type: "pairsSpread", position: { x: 60, y: 200 }, data: { label: "KO/PEP Spread", config: { legA: "KO", legB: "PEP", hedgeRatio: 1, lookback: 30, entryZ: 1, exitZ: 0.5, side: "long" }, status: "idle" } },
    { id: "p_size", type: "positionSizing", position: { x: 380, y: 200 }, data: { label: "Risk Check", config: { method: "pct_equity", value: 2, maxUsd: 10000 }, status: "idle" } },
    { id: "p_trade", type: "paperTrade", position: { x: 690, y: 200 }, data: { label: "Trade Order", config: { qty: 0, orderType: "market" }, status: "idle" } },
    { id: "p_note", type: "notify", position: { x: 690, y: 400 }, data: { label: "Notification", config: { channel: "in-app", message: "{{action}} {{ticker}} z={{zscore}}" }, status: "idle" } },
  ];
  const edges: VPEdge[] = [
    { id: "pe1", source: "p_spread", target: "p_size" },
    { id: "pe2", source: "p_size", target: "p_trade" },
    { id: "pe3", source: "p_trade", target: "p_note" },
  ];
  return { id: "prot_pairs", name: "KO/PEP Pairs Mean Reversion", description: "Buy the laggard leg of the Coca-Cola vs Pepsi spread on z-score extremes. No news needed.", nodes, edges, updatedAt: new Date().toISOString(), status: "draft" };
}

export const useBuilder = create<BuilderState>((set, get) => ({
  protocols: [breakingNewsProtocol(), pairsProtocol()],
  activeId: "prot_breaking",
  selectedNodeId: null,
  running: false,
  pausedNodeId: null,
  pausedInputs: [],
  breakpoints: {},
  logs: [],
  signals: [],
  trades: [],
  nodeStatus: {},
  lastRunOutputs: {},
  prevRunOutputs: {},
  changedIds: [],
  savedAt: {},
  savedSnapshot: {},

  setActive: (id) => set({ activeId: id, selectedNodeId: null, logs: [], nodeStatus: {}, pausedNodeId: null, changedIds: [] }),
  updateNodes: (nodes) => {
    const { protocols, activeId } = get();
    set({ protocols: protocols.map((p) => (p.id === activeId ? { ...p, nodes, updatedAt: new Date().toISOString() } : p)) });
  },
  updateEdges: (edges) => {
    const { protocols, activeId } = get();
    set({ protocols: protocols.map((p) => (p.id === activeId ? { ...p, edges, updatedAt: new Date().toISOString() } : p)) });
  },
  selectNode: (id) => set({ selectedNodeId: id }),
  updateNodeConfig: (id, patch) => {
    const { protocols, activeId } = get();
    set({
      protocols: protocols.map((p) =>
        p.id === activeId
          ? { ...p, nodes: p.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } } } : n)) }
          : p
      ),
    });
  },
  addNode: (type, pos) => {
    const def = getNodeDef(type);
    const node: VPNode = { id: nid(), type, position: pos, data: { label: def.label, config: defaultConfig(def), status: "idle" } };
    const { protocols, activeId } = get();
    set({ protocols: protocols.map((p) => (p.id === activeId ? { ...p, nodes: [...p.nodes, node] } : p)), selectedNodeId: node.id });
  },
  deleteNode: (id) => {
    const { protocols, activeId } = get();
    set({
      protocols: protocols.map((p) =>
        p.id === activeId ? { ...p, nodes: p.nodes.filter((n) => n.id !== id), edges: p.edges.filter((e) => e.source !== id && e.target !== id) } : p
      ),
      selectedNodeId: null,
    });
  },
  saveProtocol: () => {
    const { protocols, activeId } = get();
    const p = protocols.find((x) => x.id === activeId);
    if (!p) return;
    const snap = JSON.stringify({ n: p.nodes, e: p.edges, d: p.description, name: p.name });
    set((s) => ({
      protocols: protocols.map((x) => (x.id === activeId ? { ...x, updatedAt: new Date().toISOString() } : x)),
      savedAt: { ...s.savedAt, [activeId]: new Date().toISOString() },
      savedSnapshot: { ...s.savedSnapshot, [activeId]: snap },
    }));
  },
  newProtocol: () => {
    const id = `prot_${Date.now().toString(36)}`;
    const p: Protocol = { id, name: "Untitled Protocol", description: "Describe your strategy…", nodes: [], edges: [], updatedAt: new Date().toISOString(), status: "draft" };
    set((s) => ({ protocols: [...s.protocols, p], activeId: id, selectedNodeId: null, logs: [], nodeStatus: {} }));
  },
  duplicateProtocol: () => {
    const { protocols, activeId } = get();
    const src = protocols.find((p) => p.id === activeId);
    if (!src) return;
    const id = `prot_${Date.now().toString(36)}`;
    const copy: Protocol = { ...src, id, name: src.name + " (copy)", nodes: src.nodes.map((n) => ({ ...n, id: `${n.id}_c` })), edges: src.edges.map((e) => ({ ...e, id: `${e.id}_c`, source: `${e.source}_c`, target: `${e.target}_c` })) };
    set((s) => ({ protocols: [...s.protocols, copy], activeId: id }));
  },
  importGraph: (name: string, description: string, defs: { type: string; label: string; config: Record<string, unknown> }[], links: { from: number; to: number; fromPort: string; toPort: string }[]) => {
    const id = `prot_${Date.now().toString(36)}`;
    // depth per node for layered layout
    const depth = new Array(defs.length).fill(0);
    let guard = 0;
    let changed = true;
    while (changed && guard++ < 50) {
      changed = false;
      for (const l of links) {
        if (l.from >= 0 && l.from < defs.length && l.to >= 0 && l.to < defs.length && depth[l.to] <= depth[l.from]) {
          depth[l.to] = depth[l.from] + 1;
          changed = true;
        }
      }
    }
    const pos = layoutLayered(depth);
    const nodeIds = defs.map(() => nid());
    const nodes: VPNode[] = defs.map((d, i) => ({
      id: nodeIds[i], type: d.type, position: pos[i],
      data: { label: d.label, config: d.config, status: "idle" as const },
    }));
    const edges: VPEdge[] = links
      .filter((l) => l.from >= 0 && l.from < defs.length && l.to >= 0 && l.to < defs.length && l.from !== l.to)
      .map((l, i) => ({ id: `e_ai_${Date.now().toString(36)}_${i}`, source: nodeIds[l.from], target: nodeIds[l.to], sourceHandle: l.fromPort || null, targetHandle: l.toPort || null }));
    const p: Protocol = { id, name, description, nodes, edges, updatedAt: new Date().toISOString(), status: "draft" };
    set((s) => ({ protocols: [...s.protocols, p], activeId: id, selectedNodeId: null, logs: [], nodeStatus: {}, changedIds: [] }));
  },
  setRunning: (r) => set({ running: r, ...(r ? {} : { pausedNodeId: null, pausedInputs: [] }) }),
  setPaused: (nodeId, inputs = []) => set({ pausedNodeId: nodeId, pausedInputs: inputs }),
  toggleBreakpoint: (protocolId, nodeId) => set((s) => {
    const cur = s.breakpoints[protocolId] ?? [];
    const next = cur.includes(nodeId) ? cur.filter((x) => x !== nodeId) : [...cur, nodeId];
    return { breakpoints: { ...s.breakpoints, [protocolId]: next } };
  }),
  pushLogs: (l) => set((s) => ({ logs: [...s.logs, ...l] })),
  clearRun: () => set({ logs: [], signals: [], nodeStatus: {}, lastRunOutputs: {}, changedIds: [], pausedNodeId: null, pausedInputs: [] }),
  setNodeStatus: (id, s) => set((st) => ({ nodeStatus: { ...st.nodeStatus, [id]: s } })),
  resetStatuses: () => set({ nodeStatus: {}, changedIds: [] }),
  applyRunResult: (r) => set((s) => {
    const changed = Object.keys(r.nodeOutputs).filter(
      (id) => JSON.stringify(r.nodeOutputs[id]) !== JSON.stringify(s.lastRunOutputs[id])
    );
    return {
      logs: [...s.logs, ...r.logs],
      signals: [...r.signals, ...s.signals].slice(0, 50),
      trades: [...r.trades, ...s.trades].slice(0, 50),
      prevRunOutputs: s.lastRunOutputs,
      lastRunOutputs: r.nodeOutputs,
      changedIds: changed,
    };
  }),
}));

export function activeProtocol(s: BuilderState): Protocol {
  return s.protocols.find((p) => p.id === s.activeId) ?? s.protocols[0];
}
