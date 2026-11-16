# VantagePoint Trading — Technical One-Sheet

**AI-native visual alpha platform: from unstructured news to risk-checked paper execution in one auditable workflow.**

## Elevator Synergy
VantagePoint operationalizes the full decisioning lifecycle — Sense → Reason → Confirm → Execute — empowering traders to productize discretionary intuition into scalable, repeatable trading protocols. No black-box signals. Every action is traceable, explainable, and compliance-ready.

## Core Value Props
- **End-to-end orchestration:** drag-and-drop protocol builder (37 modular nodes: data, AI, logic, signals, risk, execution) powered by React Flow.
- **Actionable intelligence:** LLM-driven news analytics (opencode endpoint, structured JSON: ticker, sentiment, impact, confidence) with deterministic mock fallback.
- **Risk-first execution:** multi-layer guardrails — confidence gating, price confirmation, position sizing, max exposure, daily loss halt — before any Alpaca paper order.
- **Institutional-grade validation:** deterministic historical replay engine with fees, slippage, equity curve, win rate, max drawdown, Sharpe. Hypothetical fills, marked to market.
- **360° visibility:** terminal with candles + volume, bracket orders, marketplace cloning, intel journal, live portfolio ledger.

## Under the Hood — Agentic Orchestration & API Fabric
- **Multi-agent intelligence mesh:** 8 specialized AI agents (`aiNewsAnalyzer`, sentiment, entity extraction, impact assessment, event classification, bull/bear calibration, summarization, historical comparison) synergize through a unified reasoning pipeline. Each agent leverages purpose-built system prompts and cross-validates upstream context to deliver holistic, high-conviction alpha signals.
- **Secure AI gateway:** browser → `POST /api/ai/analyze?strict=1` → server-side `analyzeNews()` → opencode `/chat/completions` (JSON mode, temp 0.2, `x-opencode-session` for prompt caching). Zero-trust architecture: `AI_API_KEY` never hits the client. Graceful degradation to deterministic mock analyzer ensures always-on resiliency with `_via: live|mock` observability.
- **Unified market API fabric:** 12+ same-origin `/api/alpaca/*` micro-endpoints (quote, bars, snapshots, news, account, positions, orders, history) abstract away vendor complexity. Server-only `upstream()` in `alpaca-server.ts` injects `APCA-API-KEY-ID/SECRET`, enforces `tradingBase()` paper-only routing (live host refused), and normalizes error telemetry.
- **Enterprise-grade order flow:** `POST /api/alpaca/order` validates synergy inputs (symbol regex, whole-share qty, side/type/TIF whitelists), blocks naked shorts, attaches OCO bracket legs (take-profit/stop-loss), and routes to Alpaca paper. Full lifecycle observability via order IDs, fill receipts, and position reconciliation.
- **Deterministic execution engine:** `src/lib/engine.ts` topologically orchestrates the agent graph with breakpoint pausing, step-through debugging, seed-output replay, `asof` time-travel, and hypothetical-fill ledger — delivering end-to-end lineage from headline to P&L.

## Proof Points (paper/simulated)
- Flagship protocol: Breaking News Momentum — 61.4% win rate, +18.2% return, 1.42 Sharpe, 132 trades (simulated)
- 8-node graph runs in ~4s with full per-node logs and receipts
- Backtest caps: 60 days news replay, 2 years price-only

*Not financial advice. Paper trading only.*
