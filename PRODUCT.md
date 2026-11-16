# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Retail and prosumer systematic traders evaluating whether visual, news-driven protocols can replace discretionary trading. (Inferred from repo: builder-centric app, paper-trading focus. Confirm with user.)

## Product Purpose

VantagePoint lets traders build, execute, and backtest AI-powered visual trading protocols: news sensing → AI analysis → confirmation → risk-checked paper execution. Success is a protocol the user trusts enough to run on a paper account and clone from the marketplace.

## Positioning

A node-canvas protocol builder where every live decision is traceable: each signal carries its news source, AI confidence, price confirmation, and risk check, executed as Alpaca paper orders, never a black-box signal feed.

## Operating Context

Morning-desk ritual: trader reviews overnight news, watches protocols scan tickers, confirms signals, checks paper P&L and guardrails. Core objects: protocols (node graphs), signals, paper trades, backtests, market intel feed.

## Capabilities and Constraints

Confirmed in code: visual builder on React Flow with node palette + config + execution panels; deterministic backtest engine with fees/slippage; Alpaca paper execution enforced; market intel feed with sentiment/confidence/impact; portfolio dashboard with equity curve and candle charts. Open/undecided: auth/accounts, live brokerage, pricing, real user testimonials.

## Brand Commitments

Existing app identity is dark terminal (`#04070f`, cyan→violet accents, Geist + Geist Mono). Marketing front page deliberately takes a contrasting warm-paper editorial world loosely inspired by deltacafes.com structure (hero story → product shelf → heritage proof → process journey → lab → quiz → journal → footer). No coffee claims; all trading figures are simulated/paper.

## Evidence on Hand

`src/lib/mock-data.ts`: NEWS_FEED (8 items with sentiment/confidence), HOLDINGS + CASH ($84,210), deterministic `genCandles`, portfolio math. `src/lib/store.ts`: Breaking News Momentum protocol (61.4% WR, +18.2%, Sharpe 1.42, 132 trades). No real customer proof, pricing, or benchmarks. Do not fabricate.

## Product Principles

1. Prove, don't claim: every promise ships with its trace (source, confidence, fill).
2. Paper first: simulation and guardrails before any talk of real capital.
3. Visual and auditable: the graph is the strategy; no hidden steps.
4. Ritual over dashboard: a daily review flow beats another wall of metrics.
5. Honest simulation: label paper results as paper, always.

## Accessibility & Inclusion

Undecided. Front page targets WCAG 2.2 AA: keyboard-operable tabs/rails, visible focus, reduced-motion support, ≥4.5:1 body contrast.
