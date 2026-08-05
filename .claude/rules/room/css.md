---
paths:
  - "public/css/room.css"
  - "public/css/home/catalog.css"
---

# `room.css` conventions and component map

## Single canonical rule block (hard rule)

Each component has a **single canonical rule block** — do not add a second rule for the
same selector later in the file to tweak values; update the existing block instead. Late
overrides with the same selector caused widespread redundancy (`.timer-ring`,
`.stage-progress-dot`, `.stage-progress-dot::before`,
`.stage-progress-dot .stage-dot-label`, `.stage-progress-line`, `.chat-item`,
`.stage-progress-container--lobby` all had duplicate blocks that have since been merged).
A later pass merged eight more: `#viewLobby`, `.centered-box--lobby`,
`.lobby-stage-row`, `.stage-progress-bar`, `.draft-panel--ban-phase`,
`.ban-phase-right`, `.filter-dd-panel`, `#viewDraft > .stage-progress-container`.
Context-specific variants use modifier classes (e.g. `.is-active`, `.is-completed`,
`.is-mine`) or scoped parent selectors, not repeated base selectors.

`room.css` and `signin.css` currently have **zero** duplicated top-level selectors. Rules
inside `@media` blocks are a separate scope and do not count as duplicates. When merging
a duplicate, keep the **later** block's position — it is the one winning the cascade —
and carry over only the properties the winning block does not already set.

`room.css` `:root` defines `--bg-card`, `--bg-card-hover`, and `--transition` to match
`home/base.css` values so shared components like `.player-card` look identical across
both pages.

## Parity with `home/catalog.css`

The ban page uses `.ap-dd-btn`, `.sort-dir-btn`, `.filter-input`, `.range-pair`,
`.filter-clear-btn`, `.filter-group-label` etc. These are defined in `room.css` and kept
visually in sync with `public/css/home/catalog.css`. Key rules: `.ap-dd-btn.has-active`
(green highlight when filter active), `.filter-clear-btn` (red destructive style),
`.select-mode-btn` (`border-radius: 7px`), `.filter-group-label` (section divider:
uppercase label, subtle green tint, top/bottom border — both files share an identical
definition).

## Ban phase card hover (anti-jitter)

- The sole hover rule for ban grid cards is
  `.ban-phase-grid .player-card:not(.is-unavailable):hover` — applies to all
  non-unavailable cards (including non-clickable browse-mode cards), not just
  `is-clickable` ones. Uses `scale(1.04)` only — **no `translateY`**. Removing the
  vertical translate prevents CSS hover jitter: `translateY(-Npx)` moves the card's
  bottom edge above the cursor when near the bottom, deactivating `:hover`, causing the
  card to snap back into the cursor, reactivating it, and looping visually.
- There is no separate `.player-card.is-clickable:hover` rule — it was removed as dead
  code (always overridden by the more specific ban-grid rule for every element in scope).

## Ban card thumbnails (`.ban-phase-thumb`)

- `border-radius: 0` — no rounded corners on cards in "Bans on Me" / "My Bans" strips.
- `height` is fixed (96 px for `--md`); **no explicit width** — the `img` is set to
  `height: 100%; width: auto` so the card's natural aspect ratio determines the container
  width. This avoids letterboxing since pesdb.net card images are taller than the old 3:4
  container ratio.
- The empty-state dashed placeholder (`.ban-side-strip:empty::before`) uses `68×96 px`
  with `border-radius: 0` to match the natural card proportions.

## Pick phase

`.pick-phase-layout` is a 3-column CSS grid (`300px | minmax(0,1fr) | 252px`); at
≤1100 px it narrows to `260px | 1fr | 220px`; at ≤860 px the center column is hidden and
the layout becomes 2-column; at ≤620 px it collapses to a single column. Key blocks:

- `.pick-quickload-bar` — horizontal flex bar with plan chips (`.pick-ql-card`,
  `.pick-ql-card.is-selected`) and a formation dropdown (`.pick-ql-formation-btn`,
  `.pick-ql-formation-panel`).
- `.pick-pos-tabs` / `.pick-pos-tab` / `.pick-pos-tab.is-active` — tab bar with `--cyan`
  accent on active tab.
- `.pick-phase-grid` — same `player-card` component as `.ban-phase-grid`; hover uses CSS
  `:hover` only (`scale(1.04)`, no `translateY`) for the same anti-jitter reason. Overlay
  CSS: `.pick-phase-grid .player-card.is-pick-taken .pc-img-wrap::after
  { content: "PICKED"; background: rgba(0,180,90,0.78) }` and `.is-ban-taken::after
  { content: "BANNED"; background: rgba(200,40,40,0.78) }`.
- `.pick-pitch` / `.pick-pitch-row` / `.pick-slot` — formation pitch; empty slots use
  `.pick-slot--empty` (dashed green border + `+` icon + row label); filled slots use
  `.pick-slot--filled` (card image + `.pick-slot-overlay` gradient with name + OVR).
- `.pick-bottom-bar` / `.pick-allowance-bar` / `.pick-allowance-pill` /
  `.pick-allowance-pill.is-maxed` — allowance pills in green; `is-maxed` highlights the
  pill when the cap is reached.
- `.pick-phase-right` / `.pick-live-*` / `.pick-opp-*` / `.pick-feed-row` /
  `.pick-feed-waiting` — live feed sidebar with cyan accent, scrollable feed, and footer
  sync timestamp.

## Ready phase (Start Match) — `.sm-*` prefix

- `.sm-layout` — `display: flex; flex-direction: column; gap: 12px; flex: 1;
  min-height: 0; overflow-y: auto; padding: 12px 16px 16px` — scrollable container for
  the full Start Match view.
- `.sm-kicker` / `.sm-kicker-dot` — small uppercase label with a pulsing green dot
  (`.sm-kicker-dot` uses `@keyframes smDotPulse`).
- `.sm-columns` — `display: grid; grid-template-columns: 1fr 52px 1fr` — two squad
  columns flanking a VS circle.
- `.sm-vs-circle` — 42×42 px centered circle with subtle green border and "VS" text.
- `.sm-col` — card container (`border: 1px solid rgba(0,230,118,0.12);
  border-radius: 12px; background: rgba(6,18,12,0.5); overflow: hidden`).
- `.sm-col-badge.is-ready` (green) / `.sm-col-badge.is-writing` (cyan) — status pill in
  the column header.
- `.sm-pitch-row` — `display: flex; justify-content: center; gap: 4px`; cards inside use
  `flex: 1; max-width: 105px; min-width: 0`.
- `.sm-bench-strip` — `display: flex; gap: 4px; overflow-x: auto`; bench cards are
  `flex-shrink: 0; width: 68px`.
- `.sm-stats-row` — `display: grid; grid-template-columns: repeat(5, 1fr)` — stat
  comparison grid.
- `.sm-stat-bar--me` (green) / `.sm-stat-bar--opp` (cyan) — progress bars inside each
  stat cell.
- `.sm-dot-you` / `.sm-dot-opp` — 7×7 px legend dots (green / cyan).
- Responsive: at ≤860 px `.sm-columns` stacks to single column; at ≤620 px
  `.sm-stats-row` reduces to 3 columns.