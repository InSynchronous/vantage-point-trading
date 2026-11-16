# VantagePoint Trading

AI-powered visual trading platform. Build algorithmic strategies by connecting nodes on a canvas:
news ingest, LLM analysis, confidence filters, price confirmation, risk gates, paper execution.

![stack](https://img.shields.io/badge/Next.js-16-black) ![paper only](https://img.shields.io/badge/execution-paper%20only-emerald)

## Quickstart

```bash
npm install
npm run dev        # http://localhost:3000 (main app)
npm run research  # http://localhost:8100 (AI research worker, separate terminal)
```

The app works with mock data where keys are missing. Copy `.env.example` to `.env.local` and add keys to go live.

## Connect real services (optional)

Copy `.env.example` to `.env.local`:

| Var | Purpose |
|---|---|
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | **Opencode endpoint** (OpenAI-compatible `/chat/completions`). Used by the AI News Analyzer + all AI nodes for structured JSON analysis. Falls back to a deterministic mock analyzer when unset. |
| `ALPACA_API_KEY`, `ALPACA_SECRET_KEY` | **Alpaca Markets** quotes via the server-side proxy (`/api/alpaca/quote`; keys never reach the browser). Falls back to simulated prices when unset. |
| `ALPACA_BASE_URL` | Defaults to `https://paper-api.alpaca.markets`. |

### Safety: paper trading is enforced

- `src/lib/ai.ts` → `PAPER_ONLY = true`. There is no live-order code path.
- Every fill is tagged `simulated`; risk nodes (max exposure, daily loss, position sizing) run deterministically **after** AI output, never trusting it for size.
- AI/news content is treated as untrusted input: confidence thresholds + price confirmation required before any signal.

## Tour (the defining flow)

1. Open **Protocol Builder**. The preloaded **Breaking News Momentum** protocol is:
   `News Feed → AI News Analyzer → Confidence Filter → Price Confirmation → Risk Check → Paper Trade → Notification`
2. Drag nodes from the left palette onto the canvas; incompatible ports are rejected.
3. Click a node → configure it in the right panel (model, prompt, tickers, thresholds…).
4. Hit **Run Protocol** and watch nodes light up with live logs, signals and fills.
5. Inspect per-node outputs in the config panel / Data tab.

## Structure

```
src/
  app/            dashboard, builder, backtest, intelligence, portfolio, marketplace, api/alpaca
  components/     app-shell, vp-node, node-palette, config-panel, exec-panel, charts
  lib/            nodes.ts (37 node defs) · store.ts (zustand) · engine.ts (sim run + backtest)
                  mock-data.ts · ai.ts (opencode + Alpaca abstraction)
  types/          protocol graph types
backend/          FastAPI stub defining the production API contract (validate/run/quotes/WS)
```

## Backtesting

Backtest page replays deterministic history through any protocol: date range, capital, fees (bps),
slippage (bps), execution delay, with equity curve, win rate, max drawdown, Sharpe and per-trade P&L.

## Production notes

- The frontend simulation engine (`src/lib/engine.ts`) is authoritative in this build; `backend/main.py`
  is a stub contract for moving execution server-side (topological run + risk gates + Alpaca paper fills + WS streaming).
- Protocols serialize as `{ nodes, edges, configs }` and validate server-side. The backend never trusts frontend execution.
