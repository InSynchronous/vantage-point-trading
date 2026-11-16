# Design

<!-- impeccable:design-schema 1 -->

## World

Warm-paper editorial meets trading terminal. Morning-desk light with paper ground (`#f7f1e5`), espresso ink (`#1c130c`), one saturated signal red (`#b91f26`) carrying proofs and the single italic accent word per display heading, Dark espresso night (`#150e08`) reserved for the proof band, intel card headers, and footer. Loosely follows deltacafes.com's page rhythm (story hero, product shelf, heritage proof, process journey, lab/culture, quiz, journal, footer) with VantagePoint's real protocols and paper-trading evidence, no coffee claims.

## Palette

- `paper #f7f1e5` (ground), `paper-2 #efe6d2` (bands), `paper-3 #e7d9bd`, card `#fffdf7`
- `ink #1c130c`, `ink-soft #5d4f41` (body), `ink-faint #8a7a67` (meta), `line rgba(28,19,12,.14)`
- `signal #b91f26` / `signal-deep #8c151b` (accents, quiz band), `moss #2e5b3a` (positive), `gold #b98a1f`
- `night #150e08`, `night-2 #20140b`; secondary text on night is paper-tinted (`#d8cbb4`, `#b9a888`), never gray
- Strategy: committed. Signal red owns bands, live dots, and key underlines; everything else stays paper and ink

## Type

- Display: Bodoni Moda (400–700, italic for the accent word), `clamp(3.2rem,8.5vw,6rem)` hero, tracking −0.025em, `text-wrap: balance`
- UI/body: Archivo (400–800); figures: tabular-nums; mono (Geist Mono) for node config and fill receipts
- Body copy max ~68ch; more space above headings than below

## Signature interaction

Hero shows the mechanism working: animated News → AI → Filter → Confirm → Execute flow (marching-ants edges, pulsing AI dot), a live BUY receipt card, and a real-data equity sparkline, plus a pausable ticker marquee. One authored moment; scroll reveals use a single exponential ease-out and respect `prefers-reduced-motion`.

## Components

- Pill buttons (solid ink, ghost outline, paper-on-dark); underline links with 2px signal offset
- Protocol shelf: horizontal snap rail, lead card wider than the rest, color-band top edge, real sparkline + WR/Return/Sharpe
- Journey tabs (Sense/Reason/Confirm/Execute): pill tablist with `aria-selected`, config + sample-output panel
- Intel cards: night header block (source, tickers, sentiment/confidence) over paper body
- Sticky paper-blur header; thin night status bar with live/paper indicator

## Boundaries

- Dashboard and app routes use the restrained terminal ledger system (`vp-*` styles, `AppShell`): near-black `#070b12`, panel `#0c121c`, hairline `rgba(214,224,238,.09)` borders, bone-white `#e8edf4` primary buttons, green `#3aa67f` / red `#e5484d` reserved for P&L and side badges, tabular mono for figures; no gradients, no glow text, no nested card stacks. The paper world lives only on `/`
- No gradient text, no kickers above headings, no equal icon-card grids, no border-left accents; focus rings, selection, and scrollbars are themed from the palette
