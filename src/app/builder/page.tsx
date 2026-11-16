"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState,
  type Connection, type Node, type Edge, type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useBuilder, nid } from "@/lib/store";
import { getNodeDef, defaultConfig, NODE_DEFS } from "@/lib/nodes";
import { CATEGORY_META, portsCompatible, type VPNode, type Trade } from "@/types/protocol";
import { VPNodeCard } from "@/components/vp-node";
import { NodeDock } from "@/components/node-dock";
import { ConfigPanel } from "@/components/config-panel";
import { ExecPanel } from "@/components/exec-panel";
import { AIBuilderPanel, TestDialog, type BuiltGraph } from "@/components/builder-ai";
import { runProtocol } from "@/lib/engine";
import {
  Play, Square, Save, Plus, Copy, Bug, Check, Undo2, Redo2,
  CheckCircle2, PanelRight, Magnet, LayoutDashboard, Map as MapIcon,
  StepForward, FastForward, X, AlertTriangle, Keyboard, Sparkles, FlaskConical,
} from "lucide-react";
import { clsx } from "clsx";

const nodeTypes = { vp: VPNodeCard };

function getNodeDefSafe(t: string) { try { return getNodeDef(t); } catch { return null; } }

function toFlow(nodes: VPNode[], status: Record<string, string>, breakpoints: string[], changedIds: string[]): Node[] {
  return nodes.map((n) => {
    let cat: any = "data";
    try { cat = getNodeDef(n.type).category; } catch {}
    const def = getNodeDefSafe(n.type);
    return {
      id: n.id, type: "vp", position: n.position,
      data: {
        label: n.data.label, config: n.data.config, category: cat, nodeType: n.type,
        icon: def?.icon ?? "◻", status: status[n.id] ?? "idle",
        inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
        breakpoint: breakpoints.includes(n.id), changed: changedIds.includes(n.id),
      },
    };
  });
}

interface CtxMenu { x: number; y: number; nodeId: string }

export default function BuilderPage() {
  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <BuilderInner />
    </div>
  );
}

function BuilderInner() {
  const protocols = useBuilder((s) => s.protocols);
  const activeId = useBuilder((s) => s.activeId);
  const active = protocols.find((p) => p.id === activeId) ?? protocols[0];
  const running = useBuilder((s) => s.running);
  const pausedNodeId = useBuilder((s) => s.pausedNodeId);
  const breakpoints = useBuilder((s) => s.breakpoints);
  const changedIds = useBuilder((s) => s.changedIds);
  const savedAt = useBuilder((s) => s.savedAt);
  const savedSnapshot = useBuilder((s) => s.savedSnapshot);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [future, setFuture] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [showRight, setShowRight] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [snap, setSnap] = useState(true);
  const [leftOpen, setLeftOpen] = useState(true);
  const [narrow, setNarrow] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  // space-drag pan
  const [spacing, setSpacing] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const [checklist, setChecklist] = useState<{ nodeId: string | null; message: string }[] | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [testActive, setTestActive] = useState(false);
  const [testVerdict, setTestVerdict] = useState<null | { traded: boolean; trades: Trade[]; blocker: string | null; story: string }>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<ReactFlowInstance | null>(null);
  const pauseRef = useRef<{ resolve: (a: "step" | "continue") => void } | null>(null);
  const abortRef = useRef(false);
  const nodeStatus = useBuilder((s) => s.nodeStatus);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1100px)");
    const apply = () => { setNarrow(mq.matches); setLeftOpen(!mq.matches); };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // sync from store when protocol changes + fit view
  useEffect(() => {
    setNodes(toFlow(active.nodes, {}, breakpoints[activeId] ?? [], []));
    setEdges(active.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined, targetHandle: e.targetHandle ?? undefined, animated: false })));
    setHistory([]); setFuture([]);
    requestAnimationFrame(() => instRef.current?.fitView({ padding: 0.25, maxZoom: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // sync statuses / breakpoints / changed flags
  useEffect(() => {
    setNodes((ns) => ns.map((n) => ({
      ...n,
      data: { ...(n.data as object), status: nodeStatus[n.id] ?? (n.data as any).status, breakpoint: (breakpoints[activeId] ?? []).includes(n.id), changed: changedIds.includes(n.id) },
    } as Node)));
  }, [nodeStatus, breakpoints, changedIds, activeId]);

  // highlight upstream path of selection
  const selectedNodeId = useBuilder((s) => s.selectedNodeId);
  useEffect(() => {
    if (!selectedNodeId) {
      setEdges((es) => es.map((e) => ({ ...e, style: { stroke: "#3a4658", strokeWidth: 1.5 } })));
      return;
    }
    const preds = new Map<string, string[]>();
    for (const e of edges) {
      if (!preds.has(e.target)) preds.set(e.target, []);
      preds.get(e.target)!.push(e.source);
    }
    const anc = new Set<string>([selectedNodeId]);
    const q = [selectedNodeId];
    while (q.length) for (const p of preds.get(q.shift()!) ?? []) if (!anc.has(p)) { anc.add(p); q.push(p); }
    setEdges((es) => es.map((e) =>
      anc.has(e.source) && anc.has(e.target)
        ? { ...e, style: { stroke: "#e8edf4", strokeWidth: 2 } }
        : { ...e, style: { stroke: "#3a4658", strokeWidth: 1.5 } }
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);

  const pushHistory = useCallback(() => {
    setHistory((h) => [...h.slice(-49), { nodes, edges }]);
    setFuture([]);
  }, [nodes, edges]);

  const persist = useCallback((ns: Node[], es: Edge[]) => {
    const st = useBuilder.getState();
    const prot = st.protocols.find((p) => p.id === st.activeId);
    if (!prot) return;
    const byId = new Map(prot.nodes.map((n) => [n.id, n]));
    const vpNodes: VPNode[] = ns.map((n) => {
      const orig = byId.get(n.id);
      const nodeType = (n.data as any)?.nodeType ?? orig?.type ?? "logger";
      return { id: n.id, type: nodeType, position: n.position, data: { label: String((n.data as any).label), config: (n.data as any).config ?? {} } };
    });
    st.updateNodes(vpNodes);
    st.updateEdges(es.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => persist(nodes, edges), 400);
    return () => clearTimeout(t);
  }, [nodes, edges, persist]);

  const onConnect = useCallback((c: Connection) => {
    const st = useBuilder.getState();
    const prot = st.protocols.find((p) => p.id === st.activeId)!;
    const src = prot.nodes.find((n) => n.id === c.source);
    const tgt = prot.nodes.find((n) => n.id === c.target);
    if (src && tgt) {
      try {
        const sDef = getNodeDef(src.type);
        const tDef = getNodeDef(tgt.type);
        const sPort = sDef.outputs.find((p) => p.id === c.sourceHandle) ?? sDef.outputs[0];
        const tPort = tDef.inputs.find((p) => p.id === c.targetHandle) ?? tDef.inputs[0];
        if (sPort && tPort && !portsCompatible(sPort.type, tPort.type)) {
          st.pushLogs([{ ts: Date.now(), nodeId: tgt.id, nodeLabel: tgt.data.label, level: "error", message: `Incompatible connection: ${sPort.type} → ${tPort.type}` }]);
          return;
        }
      } catch {}
    }
    pushHistory();
    setEdges((es) => addEdge({ ...c, style: { stroke: "#e8edf4", strokeWidth: 1.75 } }, es));
  }, [pushHistory]);

  const placeNode = useCallback((type: string, pos: { x: number; y: number }) => {
    pushHistory();
    const def = getNodeDef(type);
    const id = nid();
    const flowNode: Node = { id, type: "vp", position: pos, data: { label: def.label, config: defaultConfig(def), category: def.category, nodeType: type, icon: def.icon, status: "idle", inputs: def.inputs, outputs: def.outputs, breakpoint: false, changed: false } };
    setNodes((ns) => [...ns, flowNode]);
    const st = useBuilder.getState();
    const prot = st.protocols.find((p) => p.id === st.activeId)!;
    st.updateNodes([...prot.nodes, { id, type, position: pos, data: { label: def.label, config: defaultConfig(def), status: "idle" } }]);
    st.selectNode(id);
  }, [pushHistory]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/vp-node");
    if (!type || !wrapRef.current) return;
    const bounds = wrapRef.current.getBoundingClientRect();
    placeNode(type, { x: e.clientX - bounds.left - 110, y: e.clientY - bounds.top - 40 });
  }, [placeNode]);

  const onNodeClick = useCallback((_: unknown, n: Node) => {
    useBuilder.getState().selectNode(n.id);
    setCtxMenu(null);
  }, []);

  const onNodesDelete = useCallback((deleted: Node[]) => {
    pushHistory();
    for (const d of deleted) useBuilder.getState().deleteNode(d.id);
  }, [pushHistory]);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, n: Node) => {
    e.preventDefault();
    useBuilder.getState().selectNode(n.id);
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: n.id });
  }, []);

  const duplicateNode = useCallback((id: string) => {
    const st = useBuilder.getState();
    const prot = st.protocols.find((p) => p.id === st.activeId)!;
    const src = prot.nodes.find((n) => n.id === id);
    if (!src) return;
    pushHistory();
    const nid2 = nid();
    const pos = { x: src.position.x + 40, y: src.position.y + 40 };
    const def = getNodeDefSafe(src.type);
    setNodes((ns) => [...ns, {
      id: nid2, type: "vp", position: pos,
      data: { label: src.data.label, config: JSON.parse(JSON.stringify(src.data.config)), category: def?.category ?? "data", nodeType: src.type, icon: def?.icon ?? "◻", status: "idle", inputs: def?.inputs ?? [], outputs: def?.outputs ?? [], breakpoint: false, changed: false },
    }]);
    st.updateNodes([...prot.nodes, { id: nid2, type: src.type, position: pos, data: { label: src.data.label, config: JSON.parse(JSON.stringify(src.data.config)), status: "idle" } }]);
    st.selectNode(nid2);
  }, [pushHistory]);

  const autoLayout = useCallback(() => {
    pushHistory();
    setNodes((ns) => {
      const incoming = new Map<string, number>();
      const preds = new Map<string, string[]>();
      for (const n of ns) { incoming.set(n.id, 0); preds.set(n.id, []); }
      setEdges((es) => {
        for (const e of es) {
          incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
          preds.get(e.target)?.push(e.source);
        }
        return es;
      });
      const depth = new Map<string, number>();
      const visit = (id: string, stack: string[] = []): number => {
        if (depth.has(id)) return depth.get(id)!;
        if (stack.includes(id)) return 0;
        const ps = preds.get(id) ?? [];
        const d = ps.length ? 1 + Math.max(...ps.map((p) => visit(p, [...stack, id]))) : 0;
        depth.set(id, d);
        return d;
      };
      ns.forEach((n) => visit(n.id));
      const cols = new Map<number, number>();
      return ns.map((n) => {
        const d = depth.get(n.id) ?? 0;
        const row = cols.get(d) ?? 0;
        cols.set(d, row + 1);
        return { ...n, position: { x: 60 + d * 260, y: 60 + row * 140 } };
      });
    });
  }, [pushHistory]);

  /* ---------- validation ---------- */
  const validate = useCallback((): { nodeId: string | null; message: string }[] => {
    const st = useBuilder.getState();
    const prot = st.protocols.find((p) => p.id === st.activeId)!;
    const issues: { nodeId: string | null; message: string }[] = [];
    if (!prot.nodes.length) issues.push({ nodeId: null, message: "Canvas is empty. Add nodes first." });
    const incoming = new Map<string, number>();
    for (const n of prot.nodes) incoming.set(n.id, 0);
    for (const e of prot.edges) incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    for (const n of prot.nodes) {
      let def;
      try { def = getNodeDef(n.type); } catch { issues.push({ nodeId: n.id, message: `${n.data.label}: unknown node type.` }); continue; }
      if (def.category !== "data" && def.inputs.length > 0 && (incoming.get(n.id) ?? 0) === 0) {
        issues.push({ nodeId: n.id, message: `${n.data.label} has no inputs connected.` });
      }
      if (n.type === "aiNewsAnalyzer" && !String((n.data.config as any).prompt ?? "").trim()) {
        issues.push({ nodeId: n.id, message: "AI News Analyzer prompt is empty." });
      }
      if (n.type === "threshold" && Number((n.data.config as any).threshold) <= 0) {
        issues.push({ nodeId: n.id, message: "Threshold of 0 lets everything through." });
      }
      if (n.type === "paperTrade" && Number((n.data.config as any).qty) < 0) {
        issues.push({ nodeId: n.id, message: "Trade quantity is negative." });
      }
    }
    return issues;
  }, []);

  /* ---------- run with pause/step/replay ---------- */
  const doRun = useCallback(async (opts: { stepMode?: boolean; startId?: string; startLabel?: string; testSeed?: { story: { headline: string; body: string; tickers: string[] }; prices: Record<string, number>; gateOverride?: number | null; pairEntryOverride?: number | null } } = {}) => {
    const st = useBuilder.getState();
    const prot = st.protocols.find((p) => p.id === st.activeId)!;
    abortRef.current = false;
    if (!opts.testSeed) { setTestActive(false); setTestVerdict(null); }
    st.setRunning(true);
    st.resetStatuses();
    st.clearRun();
    st.setPaused(null);
    if (opts.testSeed) setTestActive(true);
    // test mode seeds every news node with the synthetic story and pins prices
    let seedOutputs: Record<string, unknown> | undefined = opts.startId ? st.lastRunOutputs : undefined;
    let seedPrices: Record<string, number> | undefined;
    let dryRun = false;
    if (opts.testSeed) {
      const newsNodes = prot.nodes.filter((n) => ["newsFeed", "rssFeed", "secFilings"].includes(n.type));
      const story = {
        id: `test_${Date.now()}`, ts: Date.now(), headline: opts.testSeed.story.headline,
        body: opts.testSeed.story.body, source: "TEST-FEED", tickers: opts.testSeed.story.tickers,
        author: "test", url: "",
      };
      seedOutputs = {};
      for (const n of newsNodes) seedOutputs[n.id] = { ...story, _kind: "news" };
      seedPrices = {};
      for (const [k, v] of Object.entries(opts.testSeed.prices)) if (v > 0) seedPrices[k.toUpperCase()] = v;
      dryRun = true;
    }
    st.pushLogs([{
      ts: Date.now(), nodeId: "sys", nodeLabel: "System", level: "info",
      message: opts.testSeed
        ? `▶ TEST MODE "${opts.testSeed.story.headline.slice(0, 90)}" (synthetic story, hypothetical fills)`
        : opts.startId ? `▶ Replay from "${prot.nodes.find((n) => n.id === opts.startId)?.data.label}" (${opts.startLabel ?? ""})` : `▶ Running "${prot.name}" (${prot.nodes.length} nodes, ${prot.edges.length} edges)`,
    }]);
    const bps = new Set(st.breakpoints[st.activeId] ?? []);
    const gate = (node: VPNode, inputs: unknown[]) => new Promise<"step" | "continue">((resolve) => {
      st.setPaused(node.id, inputs);
      st.selectNode(node.id);
      pauseRef.current = { resolve };
    });
    const ctx = await runProtocol(prot, {
      step: (id, s) => st.setNodeStatus(id, s),
      delayMs: opts.stepMode ? 250 : 420,
      breakpoints: bps,
      stepMode: opts.stepMode ?? !!opts.testSeed,
      onPause: gate,
      startId: opts.startId,
      seedOutputs,
      seedPrices,
      dryRun,
      gateOverride: opts.testSeed?.gateOverride ?? undefined,
      pairEntryOverride: opts.testSeed?.pairEntryOverride ?? undefined,
      shouldAbort: () => abortRef.current,
    });
    st.applyRunResult(ctx);
    const nSig = ctx.signals.length;
    st.pushLogs([{ ts: Date.now(), nodeId: "sys", nodeLabel: "System", level: nSig ? "success" : "info", message: `■ Finished: ${ctx.signals.length} signal(s), ${ctx.trades.length} trade(s), ${ctx.logs.length} log events` }]);
    if (opts.testSeed && !abortRef.current) {
      const hypo = ctx.trades.filter((t) => t.status === "hypothetical");
      let blocker: string | null = null;
      if (hypo.length === 0) {
        const stAfter = useBuilder.getState();
        const errNode = prot.nodes.find((n) => stAfter.nodeStatus[n.id] === "error");
        if (errNode) {
          const errLog = [...ctx.logs].reverse().find((l) => l.nodeId === errNode.id && l.level === "error");
          blocker = `Failed at "${errNode.data.label}"${errLog ? `: ${errLog.message}` : ""}`;
        } else {
          const filt = prot.nodes.find((n) => (ctx.nodeOutputs[n.id] as { _filtered?: boolean; reason?: string } | undefined)?._filtered);
          if (filt) {
            const r = ctx.nodeOutputs[filt.id] as { reason?: string };
            blocker = `Stopped at "${filt.data.label}"${r?.reason ? `: ${r.reason}` : " (filtered out, no signal passed)"}`;
          } else {
            blocker = "Ran clean, but no node emitted a trade";
          }
        }
      }
      setTestVerdict({ traded: hypo.length > 0, trades: hypo, blocker, story: opts.testSeed.story.headline });
    }
    st.setPaused(null);
    st.setRunning(false);
    setTestActive(false);
  }, []);

  const run = useCallback(() => {
    const issues = validate();
    if (issues.length) { setChecklist(issues); return; }
    doRun();
  }, [validate, doRun]);

  const buildFromAI = useCallback((graph: BuiltGraph) => {
    const st = useBuilder.getState();
    st.importGraph(
      graph.name, graph.description,
      graph.nodes.map((n) => ({ type: n.type, label: n.label, config: n.config })),
      graph.edges
    );
    st.pushLogs([
      { ts: Date.now(), nodeId: "sys", nodeLabel: "AI Builder", level: "success", message: `Built "${graph.name}" (${graph.nodes.length} nodes, ${graph.edges.length} wires)` },
      ...graph.warnings.slice(0, 5).map((w) => ({ ts: Date.now(), nodeId: "sys", nodeLabel: "AI Builder", level: "warn" as const, message: w })),
    ]);
  }, []);

  const testGraphInfo = useMemo(() => {
    const hasNews = active.nodes.some((n) => ["newsFeed", "rssFeed", "secFilings"].includes(n.type));
    const pairs = active.nodes.filter((n) => n.type === "pairsSpread").map((n) => {
      const c = n.data.config as Record<string, any>;
      return {
        legA: String(c.legA ?? "KO").toUpperCase(),
        legB: String(c.legB ?? "PEP").toUpperCase(),
        entryZ: Number(c.entryZ ?? 2),
        lookback: Number(c.lookback ?? 60),
      };
    });
    return { hasNews, pairs };
  }, [active.nodes]);

  const runTest = useCallback((story: { headline: string; body: string; tickers: string[] }, opts: { prices: Record<string, number>; gateOverride: number | null; pairEntryOverride: number | null }) => {
    const st = useBuilder.getState();
    const prot = st.protocols.find((p) => p.id === st.activeId);
    if (!prot || prot.nodes.length === 0) {
      st.pushLogs([{ ts: Date.now(), nodeId: "sys", nodeLabel: "Test Mode", level: "error", message: "Test run needs nodes on the canvas first." }]);
      return;
    }
    doRun({ testSeed: { story, prices: opts.prices, gateOverride: opts.gateOverride, pairEntryOverride: opts.pairEntryOverride } });
  }, [doRun]);

  const resume = useCallback((action: "step" | "continue") => {
    useBuilder.getState().setPaused(null);
    pauseRef.current?.resolve(action);
    pauseRef.current = null;
  }, []);

  const stop = useCallback(() => {
    abortRef.current = true;
    pauseRef.current?.resolve("continue");
    pauseRef.current = null;
    useBuilder.getState().setRunning(false);
    useBuilder.getState().setPaused(null);
    setTestActive(false);
  }, []);

  const undo = useCallback(() => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setFuture((f) => [{ nodes, edges }, ...f]);
    setHistory((h) => h.slice(0, -1));
    setNodes(prev.nodes); setEdges(prev.edges);
  }, [history, nodes, edges]);

  const redo = useCallback(() => {
    if (!future.length) return;
    const [next, ...rest] = future;
    setHistory((h) => [...h, { nodes, edges }]);
    setFuture(rest);
    setNodes(next.nodes); setEdges(next.edges);
  }, [future, nodes, edges]);

  const counts = useMemo(() => ({ n: nodes.length, e: edges.length }), [nodes, edges]);
  const dirty = useMemo(() => {
    const snap = savedSnapshot[activeId];
    if (!snap) return false;
    return snap !== JSON.stringify({ n: active.nodes, e: active.edges, d: active.description, name: active.name });
  }, [savedSnapshot, activeId, active.nodes, active.edges, active.description, active.name]);

  // autosave every 30s when dirty
  useEffect(() => {
    const t = setInterval(() => {
      const st = useBuilder.getState();
      const prot = st.protocols.find((p) => p.id === st.activeId);
      if (!prot || !prot.nodes.length) return;
      const snap = st.savedSnapshot[st.activeId];
      const cur = JSON.stringify({ n: prot.nodes, e: prot.edges, d: prot.description, name: prot.name });
      if (snap !== cur) st.saveProtocol();
    }, 30000);
    return () => clearInterval(t);
  }, []);

  // keyboard: save / undo / redo / quick-add / zoom
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); useBuilder.getState().saveProtocol(); return; }
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); openQuickAddCenter(); return; }
      if (mod && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
      if ((mod && e.shiftKey && e.key.toLowerCase() === "z") || (mod && e.key.toLowerCase() === "y")) { e.preventDefault(); redo(); return; }
      if (typing || mod) return;
      if (e.key === "+" || e.key === "=") instRef.current?.zoomIn();
      else if (e.key === "-") instRef.current?.zoomOut();
      else if (e.key === "0") instRef.current?.fitView({ padding: 0.25 });
      else if (e.key === "Delete" || e.key === "Backspace") { /* ReactFlow handles */ }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo]);

  // space-drag pan
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.code === "Space" && tag !== "INPUT" && tag !== "TEXTAREA") { e.preventDefault(); setSpacing(true); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpacing(false); };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  const openQuickAddCenter = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !instRef.current) return;
    const b = el.getBoundingClientRect();
    const sx = b.left + b.width / 2;
    const sy = b.top + b.height / 2;
    const pos = instRef.current.screenToFlowPosition({ x: sx, y: sy });
    setQuickAdd({ x: pos.x - 90, y: pos.y - 20, sx, sy });
  }, []);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".react-flow__node")) return;
    const inst = instRef.current;
    if (!inst) return;
    const pos = inst.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setQuickAdd({ x: pos.x - 90, y: pos.y - 20, sx: e.clientX, sy: e.clientY });
  }, []);

  const validConnection = useCallback((c: Connection | Edge) => {
    const st = useBuilder.getState();
    const prot = st.protocols.find((p) => p.id === st.activeId);
    const src = prot?.nodes.find((n) => n.id === c.source);
    const tgt = prot?.nodes.find((n) => n.id === c.target);
    if (!src || !tgt || src.id === tgt.id) return false;
    try {
      const sDef = getNodeDef(src.type);
      const tDef = getNodeDef(tgt.type);
      const sPort = sDef.outputs.find((p) => p.id === (c as Connection).sourceHandle) ?? sDef.outputs[0];
      const tPort = tDef.inputs.find((p) => p.id === (c as Connection).targetHandle) ?? tDef.inputs[0];
      if (!sPort || !tPort) return false;
      return portsCompatible(sPort.type, tPort.type);
    } catch { return true; }
  }, []);

  const pausedNode = pausedNodeId ? active.nodes.find((n) => n.id === pausedNodeId) : null;

  return (
    <>
      <div className="flex min-h-0 flex-1">
        {/* slim protocol rail */}
        {(!narrow || leftOpen) && (
          <div className={`${narrow ? "absolute z-20 h-full shadow-2xl" : "w-[196px] shrink-0"} flex flex-col border-r border-white/[0.07] bg-[#060b16]`}>
            <div className="border-b border-white/[0.07] p-3">
              <div className="vp-label mb-1.5 flex items-center gap-1.5">Protocol {dirty && <span className="h-1.5 w-1.5 rounded-full bg-white" title="Unsaved changes" />}</div>
              <select value={activeId} onChange={(e) => { setCtxMenu(null); useBuilder.getState().setActive(e.target.value); }} className="vp-input text-[12.5px]">
                {protocols.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div className="mt-1.5 font-mono text-[10.5px] text-[#525c6c]">
                {dirty ? "● unsaved" : savedAt[activeId] ? `saved ${new Date(savedAt[activeId]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "no changes"}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1">
                <ToolBtn title="New protocol" onClick={() => useBuilder.getState().newProtocol()}><Plus className="h-3.5 w-3.5" /></ToolBtn>
                <ToolBtn title="Duplicate protocol" onClick={() => useBuilder.getState().duplicateProtocol()}><Copy className="h-3.5 w-3.5" /></ToolBtn>
                <ToolBtn title="Save (⌘S)" onClick={() => useBuilder.getState().saveProtocol()}><Save className="h-3.5 w-3.5" /></ToolBtn>
                <ToolBtn title="Auto-layout" onClick={autoLayout}><LayoutDashboard className="h-3.5 w-3.5" /></ToolBtn>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="vp-label mb-1.5">In this graph</div>
              <div className="space-y-1">
                {active.nodes.map((n) => (
                  <button key={n.id}
                    onClick={() => useBuilder.getState().selectNode(n.id)}
                    className={clsx("block w-full truncate rounded-md px-2 py-1.5 text-left text-[12px] transition-colors",
                      selectedNodeId === n.id ? "bg-white/10 text-white" : "text-[#9da8b8] hover:bg-white/[0.04] hover:text-white")}>
                    {n.data.label}
                  </button>
                ))}
                {active.nodes.length === 0 && <div className="text-[12px] text-[#525c6c]">Empty. Add nodes from the dock below or press ⌘K.</div>}
              </div>
            </div>
          </div>
        )}

        {/* canvas */}
        <div className="relative min-w-0 flex-1 bg-[#04070d]" ref={wrapRef} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
          <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-210px)] flex-wrap items-center gap-1.5">
            {narrow && (
              <button onClick={() => setLeftOpen(!leftOpen)} className="rounded-md border border-white/10 bg-[#0c121c] px-2.5 py-2 text-[12px] font-semibold text-white" title="Protocols">
                ☰
              </button>
            )}
            <button onClick={run} disabled={running}
              className={clsx("flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-bold transition-colors",
                running ? "cursor-wait bg-white/10 text-[#9da8b8]" : "bg-[#e8edf4] text-black hover:bg-white")}>
              <Play className="h-4 w-4" /> {running ? "Running…" : pausedNodeId ? "Resume" : "Run"}
            </button>
            <button onClick={() => doRun({ stepMode: true })} disabled={running} title="Step through node by node"
              className="flex items-center gap-2 rounded-md border border-white/15 bg-[#0c121c] px-3 py-2 text-[13px] font-semibold text-white hover:bg-white/[0.07] disabled:opacity-50">
              <Bug className="h-4 w-4" /> Step
            </button>
            {running && (
              <button onClick={stop} className="flex items-center gap-2 rounded-md border border-[#e5484d]/40 bg-[#e5484d]/10 px-3 py-2 text-[13px] font-semibold text-[#f1999c] hover:bg-[#e5484d]/20">
                <Square className="h-3.5 w-3.5" /> Stop
              </button>
            )}
            <button onClick={undo} disabled={!history.length} className="rounded-md border border-white/10 bg-[#0c121c] p-2 text-[#9da8b8] hover:bg-white/[0.06] hover:text-white disabled:opacity-40" title="Undo (⌘Z)"><Undo2 className="h-4 w-4" /></button>
            <button onClick={redo} disabled={!future.length} className="rounded-md border border-white/10 bg-[#0c121c] p-2 text-[#9da8b8] hover:bg-white/[0.06] hover:text-white disabled:opacity-40" title="Redo (⇧⌘Z)"><Redo2 className="h-4 w-4" /></button>
            <button onClick={() => setShowMinimap(!showMinimap)} className={clsx("rounded-md border p-2 transition-colors", showMinimap ? "border-white/25 bg-white/[0.07] text-white" : "border-white/10 bg-[#0c121c] text-[#646e7e]")} title="Toggle minimap"><MapIcon className="h-4 w-4" /></button>
            <button onClick={() => setSnap(!snap)} className={clsx("rounded-md border p-2 transition-colors", snap ? "border-white/25 bg-white/[0.07] text-white" : "border-white/10 bg-[#0c121c] text-[#646e7e]")} title="Snap to grid"><Magnet className="h-4 w-4" /></button>
            <button onClick={() => setShowShortcuts(true)} className="rounded-md border border-white/10 bg-[#0c121c] p-2 text-[#646e7e] hover:text-white" title="Keyboard shortcuts"><Keyboard className="h-4 w-4" /></button>
            <button onClick={() => { useBuilder.getState().selectNode(null); setShowRight(true); }} title="AI builder: describe a strategy, AI drafts the graph" className="flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-[13px] font-bold text-black hover:bg-white/85">
              <Sparkles className="h-4 w-4" /> <span className="hidden min-[1300px]:inline">AI Builder</span>
            </button>
            <button onClick={() => setShowTest(true)} disabled={running} className="flex items-center gap-1.5 rounded-md border border-white/25 bg-white/[0.06] px-3 py-2 text-[13px] font-bold text-white hover:bg-white/[0.1] disabled:opacity-50" title="Test with AI-generated fake data, stepped through node by node">
              <FlaskConical className="h-4 w-4" /> <span className="hidden min-[1300px]:inline">Test</span>
            </button>
            <span className="ml-1 hidden rounded border border-white/10 bg-black/60 px-2 py-1 font-mono text-[11px] text-[#9da8b8] min-[1400px]:block">{counts.n} nodes · {counts.e} edges</span>
          </div>
          <div className="absolute right-3 top-3 z-10 hidden items-center gap-1.5 min-[1700px]:flex">
            <span className="rounded border border-white/10 bg-black/60 px-2 py-1 font-mono text-[11px] text-[#525c6c]">⌘K add · Del remove · right-click node</span>
            <button onClick={() => setShowRight(!showRight)} className="rounded-md border border-white/10 bg-[#0c121c] p-2 text-[#9da8b8] hover:bg-white/[0.06] hover:text-white" title="Toggle panel"><PanelRight className="h-4 w-4" /></button>
          </div>

          {testActive && !pausedNode && (
            <div className="absolute left-1/2 top-24 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border border-white/20 bg-black/85 px-3 py-1.5 backdrop-blur">
              <FlaskConical className="h-3.5 w-3.5 text-white" />
              <span className="text-[12px] font-bold uppercase tracking-wider text-white">Test mode · synthetic story · hypothetical fills</span>
            </div>
          )}

          {pausedNode && (
            <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-white/20 bg-black/85 py-1.5 pl-3 pr-1.5 shadow-2xl backdrop-blur">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              <span className="text-[12.5px] font-semibold text-white">Paused at {pausedNode.data.label}</span>
              <button onClick={() => resume("step")} className="flex items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-[12px] font-bold text-black hover:bg-white/85" title="Execute this node, pause at next"><StepForward className="h-3.5 w-3.5" /> Step</button>
              <button onClick={() => resume("continue")} className="flex items-center gap-1 rounded-md border border-white/20 px-2.5 py-1.5 text-[12px] font-bold text-white hover:bg-white/10" title="Resume until breakpoint or end"><FastForward className="h-3.5 w-3.5" /> Continue</button>
            </div>
          )}

          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onNodesDelete={onNodesDelete}
            onNodeDragStart={pushHistory}
            onDoubleClick={onDoubleClick}
            onPaneClick={() => setCtxMenu(null)}
            onInit={(inst) => { instRef.current = inst; }}
            isValidConnection={validConnection}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.25} maxZoom={1.75}
            deleteKeyCode={["Backspace", "Delete"]}
            snapToGrid={snap} snapGrid={[16, 16]}
            panOnDrag={spacing ? [0, 1, 2] : true}
            selectionOnDrag={!spacing}
            className="vp-grid-bg"
            defaultEdgeOptions={{ style: { stroke: "#3a4658", strokeWidth: 1.5 } }}
          >
            <Background color="rgba(214,224,238,0.07)" gap={snap ? 16 : 28} />
            <Controls position="bottom-left" showInteractive={false} />
            {showMinimap && <MiniMap position="bottom-right" pannable zoomable style={{ background: "#0a0f17" }} />}
          </ReactFlow>

          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="max-w-sm rounded-xl border border-dashed border-white/15 bg-black/50 p-7 text-center backdrop-blur">
                <div className="text-[13px] font-bold text-white">Start building</div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#9da8b8]">Drag a <b className="text-white">News Feed</b> → <b className="text-white">AI Analyzer</b> → <b className="text-white">Threshold</b> → <b className="text-white">Trade</b>, or press <span className="rounded border border-white/15 px-1 font-mono text-[11px] text-white">⌘K</span>.</p>
              </div>
            </div>
          )}

          {ctxMenu && (
            <NodeCtxMenu menu={ctxMenu} close={() => setCtxMenu(null)}
              onReplay={() => { doRun({ startId: ctxMenu.nodeId }); }}
              onBreakpoint={() => useBuilder.getState().toggleBreakpoint(activeId, ctxMenu.nodeId)}
              hasBreakpoint={(breakpoints[activeId] ?? []).includes(ctxMenu.nodeId)}
              onDuplicate={() => duplicateNode(ctxMenu.nodeId)}
              onDelete={() => useBuilder.getState().deleteNode(ctxMenu.nodeId)} />
          )}
        </div>

        {/* right panel */}
        {showRight && (
          <div className={`${narrow ? "absolute right-0 z-20 h-full w-[340px] shadow-2xl" : "w-[320px] shrink-0"} flex flex-col border-l border-white/[0.07] bg-[#060b16]`}>
            <div className="min-h-0 flex-[1.15] border-b border-white/[0.07]">
              {selectedNodeId ? <ConfigPanel /> : <AIBuilderPanel onBuild={(g) => buildFromAI(g)} />}
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <ExecPanel />
            </div>
          </div>
        )}
      </div>

      {/* node dock */}
      <NodeDock onDragStart={() => {}} />

      {/* quick add */}
      {quickAdd && (
        <QuickAdd x={quickAdd.x} y={quickAdd.y} sx={quickAdd.sx} sy={quickAdd.sy}
          onPick={(t) => { placeNode(t, { x: quickAdd.x, y: quickAdd.y }); setQuickAdd(null); }}
          onClose={() => setQuickAdd(null)} />
      )}

      {/* test mode */}
      {showTest && (
        <TestDialog
          onClose={() => setShowTest(false)}
          onRun={(story, opts) => { setShowTest(false); runTest(story, opts); }}
          graph={testGraphInfo}
        />
      )}

      {/* test verdict */}
      {testVerdict && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setTestVerdict(null)}>
          <div className="w-[460px] max-w-full rounded-xl border border-white/10 bg-[#0c121c] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${testVerdict.traded ? "bg-[#3aa67f]/15 text-[#7fcfae]" : "bg-white/[0.07] text-[#9da8b8]"}`}>test result</span>
              <div className="text-[15px] font-bold text-white">{testVerdict.traded ? "WOULD TRADE" : "WOULD NOT TRADE"}</div>
            </div>
            <p className="mt-1 line-clamp-2 text-[12px] text-[#646e7e]">“{testVerdict.story}”</p>
            {testVerdict.traded ? (
              <div className="mt-3 space-y-2">
                {testVerdict.trades.map((t) => (
                  <div key={t.id} className="flex items-center gap-2.5 rounded-lg border border-[#3aa67f]/25 bg-[#3aa67f]/[0.06] px-3 py-2.5">
                    <span className={clsx("rounded px-1.5 py-0.5 font-mono text-[11px] font-extrabold", t.side === "BUY" ? "bg-[#3aa67f]/20 text-[#7fcfae]" : "bg-[#e5484d]/20 text-[#f1999c]")}>{t.side}</span>
                    <div className="font-mono text-[12.5px] font-bold text-white">{t.qty}× {t.ticker} <span className="font-normal text-[#9da8b8]">@ ${t.price.toFixed(2)}</span></div>
                    <div className="ml-auto font-mono text-[12px] text-[#c7cfda]">${t.value.toFixed(2)}</div>
                  </div>
                ))}
                <p className="text-[11.5px] leading-relaxed text-[#646e7e]">Hypothetical fills only. No real order was placed and no money moved. The graph wanted to trade.</p>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#c7cfda]">
                {testVerdict.blocker ?? "No order was produced."}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setTestVerdict(null)} className="rounded-md border border-white/10 px-3.5 py-2 text-[13px] font-semibold text-[#9da8b8] hover:text-white">Inspect graph</button>
              <button onClick={() => { setTestVerdict(null); run(); }} className="rounded-md bg-[#e8edf4] px-3.5 py-2 text-[13px] font-bold text-black hover:bg-white">Run live now</button>
            </div>
          </div>
        </div>
      )}

      {/* pre-run checklist */}
      {checklist && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm" onClick={() => setChecklist(null)}>
          <div className="w-[420px] max-w-[90vw] rounded-xl border border-white/10 bg-[#0c121c] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-[14px] font-bold text-white"><AlertTriangle className="h-4 w-4 text-white" /> {checklist.length} issue{checklist.length > 1 ? "s" : ""} to review</div>
            <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
              {checklist.map((c, i) => (
                <button key={i} onClick={() => { if (c.nodeId) useBuilder.getState().selectNode(c.nodeId); setChecklist(null); }}
                  className="block w-full rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-left text-[12.5px] text-[#c7cfda] hover:border-white/25">
                  {c.message}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setChecklist(null)} className="rounded-md border border-white/10 px-3.5 py-2 text-[13px] font-semibold text-[#9da8b8] hover:text-white">Cancel</button>
              <button onClick={() => { setChecklist(null); doRun(); }} className="rounded-md bg-[#e8edf4] px-3.5 py-2 text-[13px] font-bold text-black hover:bg-white">Run anyway</button>
            </div>
          </div>
        </div>
      )}

      {/* shortcuts */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="w-[380px] max-w-[90vw] rounded-xl border border-white/10 bg-[#0c121c] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-[14px] font-bold text-white">Keyboard shortcuts</div>
              <button onClick={() => setShowShortcuts(false)} className="rounded p-1 text-[#646e7e] hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 space-y-2 text-[12.5px] text-[#9da8b8]">
              {[["⌘/Ctrl S", "Save protocol"], ["⌘/Ctrl K or double-click", "Add node at cursor"], ["⌘/Ctrl Z · ⇧⌘Z", "Undo / redo"], ["Del", "Delete selection"], ["+ / − / 0", "Zoom in / out / fit"], ["Space + drag", "Pan canvas"], ["Right-click node", "Replay · breakpoint · delete"]].map(([k, d]) => (
                <div key={k} className="flex items-center justify-between"><span>{d}</span><span className="rounded border border-white/15 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-white">{k}</span></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- subcomponents ---------- */

function ToolBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return <button title={title} onClick={onClick} className="grid place-items-center rounded-md border border-white/10 bg-white/[0.02] py-2 text-[#9da8b8] transition-colors hover:bg-white/[0.07] hover:text-white">{children}</button>;
}

function NodeCtxMenu({ menu, close, onReplay, onBreakpoint, hasBreakpoint, onDuplicate, onDelete }: {
  menu: CtxMenu; close: () => void; onReplay: () => void; onBreakpoint: () => void; hasBreakpoint: boolean; onDuplicate: () => void; onDelete: () => void;
}) {
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 200),
  };
  const item = "flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-[#c7cfda] hover:bg-white/[0.06] hover:text-white";
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
      <div style={style} className="z-50 w-[200px] overflow-hidden rounded-lg border border-white/10 bg-[#0c121c] py-1 shadow-2xl">
        <button className={item} onClick={() => { onReplay(); close(); }}><Play className="h-3.5 w-3.5" /> Replay from here</button>
        <button className={item} onClick={() => { onBreakpoint(); close(); }}>
          {hasBreakpoint ? <Check className="h-3.5 w-3.5 text-[#e5484d]" /> : <span className="grid h-3.5 w-3.5 place-items-center"><span className="h-2 w-2 rounded-full border border-current" /></span>}
          {hasBreakpoint ? "Remove breakpoint" : "Pause here"}
        </button>
        <button className={item} onClick={() => { onDuplicate(); close(); }}><Copy className="h-3.5 w-3.5" /> Duplicate</button>
        <button className={clsx(item, "text-[#f1999c]")} onClick={() => { onDelete(); close(); }}><X className="h-3.5 w-3.5" /> Delete</button>
      </div>
    </>
  );
}

function QuickAdd({ x, y, sx, sy, onPick, onClose }: { x: number; y: number; sx: number; sy: number; onPick: (t: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const list = useMemo(() => NODE_DEFS.filter((d) =>
    (d.label + d.description + d.type).toLowerCase().includes(q.toLowerCase())
  ).slice(0, 9), [q]);
  useEffect(() => { setHi(0); }, [q]);
  void x; void y;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed z-50 w-[320px] overflow-hidden rounded-xl border border-white/10 bg-[#0c121c] shadow-2xl"
        style={{ left: Math.min(sx - 160, window.innerWidth - 340), top: Math.min(sy - 40, window.innerHeight - 420) }}>
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Enter" && list[hi]) onPick(list[hi].type);
            else if (e.key === "Escape") onClose();
          }}
          placeholder="Add node…" className="w-full border-b border-white/[0.07] bg-transparent px-3.5 py-2.5 text-[13px] text-white outline-none placeholder:text-[#525c6c]" />
        <div className="max-h-[300px] overflow-y-auto py-1">
          {list.map((d, i) => {
            const m = CATEGORY_META[d.category];
            return (
              <button key={d.type} onMouseEnter={() => setHi(i)} onClick={() => onPick(d.type)}
                className={clsx("flex w-full items-center gap-2.5 px-3 py-2 text-left", i === hi ? "bg-white/[0.07]" : "")}>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[14px]" style={{ background: m.bg, border: `1px solid ${m.border}` }}>{d.icon}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold text-white">{d.label}</span>
                  <span className="block truncate text-[11px] text-[#646e7e]">{d.description}</span>
                </span>
              </button>
            );
          })}
          {list.length === 0 && <div className="px-3.5 py-3 text-[12px] text-[#525c6c]">No match.</div>}
        </div>
      </div>
    </>
  );
}
