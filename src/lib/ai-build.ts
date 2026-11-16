// AI protocol generation: turn a natural-language strategy into a validated
// node graph. The catalog is generated from NODE_DEFS so it can never drift
// out of sync with the editor. All output is validated before use.

import { NODE_DEFS, getNodeDef } from "@/lib/nodes";
import { portsCompatible } from "@/types/protocol";
import { resolveAIBase, resolveModel } from "@/lib/ai";

export interface BuiltNode {
  type: string;
  label?: string;
  config?: Record<string, unknown>;
}

export interface BuiltEdge {
  from: number;
  to: number;
  fromPort?: string;
  toPort?: string;
}

export interface BuiltProtocol {
  name: string;
  description: string;
  nodes: BuiltNode[];
  edges: BuiltEdge[];
}

function catalog(): string {
  return NODE_DEFS.filter((d) => d.type !== "orderSim").map((d) => {
    const ins = d.inputs.map((p) => `${p.id}:${p.type}`).join(", ") || "none";
    const outs = d.outputs.map((p) => `${p.id}:${p.type}`).join(", ") || "none";
    const fields = d.fields.map((f) => `${f.key} (${f.type}${f.options ? `: ${f.options.join("|")}` : ""}, default ${JSON.stringify(f.default)})`).join("; ");
    return `- ${d.type} [${d.category}] "${d.label}": ${d.description}\n  in: ${ins}\n  out: ${outs}\n  config: ${fields || "none"}`;
  }).join("\n");
}

export function buildSystemPrompt(): string {
  return `You design algorithmic trading protocols as node graphs. Respond with NOTHING but a single JSON object.

Node catalog (type, category, inputs id:type, outputs id:type, config fields):
${catalog()}

Port types: event, news, analysis, signal, order, number, boolean, string, any.
Compatible pairs: identical types, or any↔anything. news feeds analysis; analysis feeds signal; signal feeds order. number/boolean only feed matching logic inputs. A connection with incompatible types is REJECTED.

Rules:
- Every graph MUST start at one or more source nodes (category "data": no inputs or trigger-only).
- Every non-source node MUST have all its inputs connected.
- The graph MUST end at terminal nodes (no outputs: paperTrade, notify, logger, closePosition, holdSignal).
- paperTrade is the standard terminal for orders. risk nodes (positionSizing, maxExposure, stopLoss, maxDailyLoss, portfolioAlloc) go between signal and paperTrade.
- NEVER use orderSim. It is a dry-run calculator, not an order terminal. Every order flow MUST end at paperTrade.
- Use ONLY types from the catalog. Use ONLY ports listed for each node. Use ONLY config keys listed for each node.
- Keep graphs tight: 4-10 nodes. Prefer: source → AI analysis → threshold/filter → confirmation → signal (buySignal; direction follows sentiment) → risk → paperTrade. Every order flow NEEDS a signal node (buySignal, sellSignal, consensus, or pairsSpread): backtests only act on emitted signals.
- For pairs trading: use pairsSpread (legA, legB, hedgeRatio, lookback, entryZ, exitZ, side) → positionSizing → paperTrade (+notify). No news nodes needed.
- If the user asks for pairs trading, the graph MUST contain a pairsSpread node and MUST NOT contain news nodes (no newsFeed, rssFeed, secFilings, aiNewsAnalyzer, threshold, techConfirm). A pairs graph is: pairsSpread → positionSizing → paperTrade (+notify).
- A pairs graph MUST use exactly this pairsSpread config unless the user specifies otherwise: { "lookback": 30, "entryZ": 1.0, "exitZ": 0.5, "side": "long", "hedgeRatio": 1 }. Rationale: on calm large-cap pairs, shorting strength bled through the recent trend regime while buying the laggard stayed green.
- Real tickers only (US equities/ETFs). Config values must match field types (numbers not strings).

Schema (exact):
{
  "name": "Short Title",
  "description": "One sentence.",
  "nodes": [ { "type": "<catalog type>", "label": "Display Name", "config": { "<key>": value } } ],
  "edges": [ { "from": 0, "to": 1, "fromPort": "<output id>", "toPort": "<input id>" } ]
}
Nodes are referenced by 0-based index into nodes. Omit fromPort/toPort only when the source has exactly one output and the target exactly one input.

Example: pairs trading on soda stocks:
{
  "name": "KO/PEP Pairs Mean Reversion",
  "description": "Long/short the Coca-Cola vs Pepsi spread on z-score extremes.",
  "nodes": [
    { "type": "pairsSpread", "label": "KO/PEP Spread", "config": { "legA": "KO", "legB": "PEP", "hedgeRatio": 1, "lookback": 30, "entryZ": 1.0, "exitZ": 0.5, "side": "long" } },
    { "type": "positionSizing", "label": "Risk Check", "config": { "method": "pct_equity", "value": 2, "maxUsd": 10000 } },
    { "type": "paperTrade", "label": "Trade Order", "config": { "qty": 0, "orderType": "market" } },
    { "type": "notify", "label": "Notification", "config": { "channel": "in-app", "message": "{{ticker}} {{action}} z={{zscore}}" } }
  ],
  "edges": [
    { "from": 0, "to": 1, "fromPort": "signal", "toPort": "signal" },
    { "from": 1, "to": 2, "fromPort": "sized", "toPort": "in" },
    { "from": 2, "to": 3, "fromPort": "out", "toPort": "in" }
  ]
}`;
}

export interface ValidatedGraph {
  name: string;
  description: string;
  nodes: { type: string; label: string; config: Record<string, unknown> }[];
  edges: { from: number; to: number; fromPort: string; toPort: string }[];
  warnings: string[];
}

export function validateGraph(raw: unknown): ValidatedGraph {
  if (!raw || typeof raw !== "object") throw new Error("Model did not return a protocol object");
  const bp = raw as Partial<BuiltProtocol>;
  if (!Array.isArray(bp.nodes) || bp.nodes.length === 0) throw new Error("Model returned no nodes");
  if (bp.nodes.length > 24) throw new Error("Graph too large (max 24 nodes)");
  const warnings: string[] = [];

  const nodes = bp.nodes.map((n, i) => {
    if (!n || typeof n.type !== "string") throw new Error(`Node ${i} has no type`);
    if (n.type === "orderSim") {
      warnings.push(`"Order Simulation" is a dry-run calculator, replaced with a real Trade node`);
      n = { ...n, type: "paperTrade", label: typeof n.label === "string" && n.label ? n.label : "Trade Order" };
    }    let def;
    try { def = getNodeDef(n.type); }
    catch { throw new Error(`Unknown node type "${n.type}" at index ${i}`); }
    const config: Record<string, unknown> = {};
    for (const f of def.fields) {
      const v = (n.config as Record<string, unknown> | undefined)?.[f.key];
      config[f.key] = sanitizeValue(f.type, v, f.default);
    }
    if (n.type === "pairsSpread") {
      const legs = [String(config.legA ?? "").toUpperCase(), String(config.legB ?? "").toUpperCase()].sort().join("/");
      if (legs === "KO/PEP" && String(config.side ?? "both") !== "long") {
        warnings.push(`"KO/PEP" spread is not long-only: shorting strength lost on trailing history, side "long" backtested green`);
      }
    }
    return { type: n.type, label: typeof n.label === "string" && n.label ? n.label.slice(0, 40) : def.label, config };
  });

  const edges: ValidatedGraph["edges"] = [];
  for (const [i, e] of ((bp.edges ?? []) as BuiltEdge[]).entries()) {
    const bad = (msg: string) => { warnings.push(`Edge ${i} dropped: ${msg}`); };
    if (typeof e?.from !== "number" || typeof e?.to !== "number" || e.from === e.to) { bad("bad endpoints"); continue; }
    const sDef = getNodeDef(nodes[e.from].type);
    const tDef = getNodeDef(nodes[e.to].type);
    if (!sDef || !tDef || !nodes[e.from] || !nodes[e.to]) { bad("unknown node index"); continue; }
    const sPort = sDef.outputs.find((p) => p.id === (e.fromPort ?? "")) ?? (sDef.outputs.length === 1 ? sDef.outputs[0] : null);
    const tPort = tDef.inputs.find((p) => p.id === (e.toPort ?? "")) ?? (tDef.inputs.length === 1 ? tDef.inputs[0] : null);
    if (!sPort) { bad(`no output port "${e.fromPort}" on ${sDef.type}`); continue; }
    if (!tPort) { bad(`no input port "${e.toPort}" on ${tDef.type}`); continue; }
    if (!portsCompatible(sPort.type, tPort.type)) { bad(`${sPort.type} → ${tPort.type} incompatible`); continue; }
    edges.push({ from: e.from, to: e.to, fromPort: sPort.id, toPort: tPort.id });
  }

  // order flows need a signal emitter: backtests only act on emitted signals
  const SIGNAL_EMITTERS = new Set(["buySignal", "sellSignal", "holdSignal", "consensus", "signalStrength", "pairsSpread"]);
  if (nodes.some((n) => n.type === "paperTrade") && !nodes.some((n) => SIGNAL_EMITTERS.has(n.type))) {
    warnings.push("No signal node feeds Trade: add a BUY Signal (direction follows sentiment) or backtests will run zero trades");
  }

  // every non-source node must have all inputs wired
  const incoming = new Map<number, Set<string>>();
  for (const e of edges) {
    if (!incoming.has(e.to)) incoming.set(e.to, new Set());
    incoming.get(e.to)!.add(e.toPort);
  }
  nodes.forEach((n, i) => {
    const def = getNodeDef(n.type);
    if (def.category === "data") return;
    for (const inp of def.inputs) {
      if (!incoming.get(i)?.has(inp.id)) warnings.push(`"${n.label}" input "${inp.label}" is unconnected`);
    }
  });

  return {
    name: typeof bp.name === "string" && bp.name ? bp.name.slice(0, 60) : "AI Protocol",
    description: typeof bp.description === "string" ? bp.description.slice(0, 200) : "",
    nodes, edges, warnings,
  };
}

function sanitizeValue(type: string, v: unknown, fallback: unknown): unknown {
  if (v === undefined || v === null) return fallback;
  if (type === "number" || type === "slider") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  if (type === "text" || type === "tickers" || type === "textarea" || type === "select") return String(v).slice(0, 2000);
  if (type === "multiselect") return Array.isArray(v) ? v.map(String) : fallback;
  if (type === "toggle") return v === true || v === "true";
  return v;
}

export async function generateProtocol(prompt: string): Promise<ValidatedGraph> {
  const base = resolveAIBase();
  const key = process.env.AI_API_KEY;
  const model = resolveModel();
  if (!base || !key) throw new Error("AI is not configured");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "x-opencode-session": `vpt-build-${Date.now().toString(36)}`,
      "User-Agent": "vantagepoint-trading/1.0",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: prompt.slice(0, 2000) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status})`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    parsed = JSON.parse(start >= 0 ? text.slice(start, end + 1) : text);
  } catch {
    throw new Error("AI returned invalid JSON");
  }
  return validateGraph(parsed);
}
