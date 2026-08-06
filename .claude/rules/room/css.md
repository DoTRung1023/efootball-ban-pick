---
paths:
  - "public/css/room.css"
  - "public/css/home/catalog.css"
---

# `room.css` conventions and component map

## Colour system (hard rule)

**Never write a raw `rgba()` for green, cyan, red, amber, a light text colour, or a dark
panel surface — use the `:root` token.** The file once carried 26 different alphas of the
same green and a dozen near-identical off-whites; ~340 literals were snapped onto the
ladder below and it must not drift back. Adding an intermediate rung is how the drift
starts: pick the closest existing one.

Hue meanings, applied page-wide:

| Hue | Means |
| --- | --- |
| green | you / your side / primary action / confirmed |
| cyan | the opponent / incoming |
| amber | pending, waiting on someone |
| red | destructive only (close room, kick, leave) |
| gold | achievement (Start Match stats) |

Ladders — `--g-*` (green) and `--c-*` (cyan) carry the same rungs, so an opponent-side
component is a hue swap, not a re-design:

- `-line-faint` → `-line` → `-line-hover` → `-line-active` — borders/outlines
- `-fill-faint` → `-fill` → `-fill-strong` — backgrounds
- `-glow-soft` → `-glow` — box-shadows
- `-text` / `-text-dim` — accent-coloured text below full strength

Also `--r-line|-line-hover|-fill|-fill-hover` (destructive), `--a-glow` (amber pulse),
`--text|-dim|-muted`, and `--surface-sunken|-control|-card` (recessed → raised).

Deliberate exceptions that are *not* tokens: alphas above the ladder (a filled button
gradient, a bright focus ring), `rgba(...,0)` keyframe endpoints, the blue-tinted
surfaces in the draft view, and the purple/pink in the body's ambient background art.

Keep `:root` free of dead tokens — `--panel`, `--panel-2`, `--green-dim`, `--cyan-dim`,
`--purple-dim`, `--pink-dim` and `--red-dim` were all declared and never referenced, and
have been removed.

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
- **Height-driven, never width-driven.** `--md` is `height: var(--ban-slot-h, 96px)` with
  **no explicit width** — the `img` is `height: 100%; width: auto`, so the card's natural
  aspect ratio sets the container width. This avoids letterboxing, since pesdb.net card
  images are taller than the old 3:4 ratio. Do not add a `width` or swap the strip to
  grid columns; that reintroduces letterboxing.
- `--ban-slot-h` is declared on `.ban-phase-right` (default `96px`) and **set at render
  time** by `applyBanSlotHeight()` in `banView.js`: it picks the largest height at which
  every slot for the current ban cap fits its strip without scrolling, floor 44 px. Both
  strips inherit it, so they scale together. Because a shorter card is also narrower,
  more fit per row — the search recomputes the column count at each candidate height.
  Measured (1440 px wide): cap 3 → 96 px at every viewport height; cap 12 → 90 px at
  1100 px tall, 70 px at 900, 56 px at 760; cap 18 → 46 px at 760. Nothing scrolls.
- Keep the `var(--ban-slot-h, 96px)` **fallback**: `--md` thumbs rendered outside
  `.ban-phase-right` have no such variable in scope, and without the fallback the
  declaration is invalid and the height is dropped entirely.
- The empty placeholder (`.ban-side-empty-slot`, and `.ban-side-strip:empty::before`)
  uses the same `height` plus `aspect-ratio: 68 / 96; width: auto`, so it tracks the
  card size instead of being pinned at 68×96.

## Pick phase

`.pick-phase-layout` is a 3-column CSS grid (`300px | minmax(0,1fr) | 252px`); at
≤1100 px it narrows to `260px | 1fr | 220px`; at ≤860 px it collapses to a single
column. **Do not hide `.pick-phase-center` on narrow screens** — it carries
`#confirmPicksBtn`, so hiding it (as ≤860 px used to) leaves no way to finish the draft
on a phone. Key blocks:

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

## Responsive ladder

Widths `1200` → `1100` → `900` → `860` → `620` → `480`, plus a **height** rung:
`max-height: 760px`, which pairs with `1200` for the lobby (`@media (max-width: 1200px),
(max-height: 760px)`) — a short desktop window hits the same layout problems as a phone.

The last four blocks in the file are ordered `1200/760 → 900 → 620 → 480` and live **at
the end on purpose**: several components they override (`.ban-phase-right`,
`.ban-side-section`, `.ap-dd-panel`, `.pick-phase-grid`, `.prep-scroll`, `.chat-log`) are
declared after the earlier 900 px block, so an override placed there silently loses the
cascade. Check where a selector is declared before adding a media rule for it.

- **≤1200 px or ≤760 px tall — the lobby becomes one scrolling page.** Switching
  `#viewLobby` to `overflow-y: auto` is not enough on its own: `.centered-box--lobby`
  shrinks back to the viewport unless it is `flex: 0 0 auto`, and `.lobby-board` keeps
  its desktop `overflow: hidden`, so everything past the fold (rest of BAN SETTING, the
  chat column, START DRAFT) is clipped with no way to reach it. The settings panel's
  `.prep-scroll` also drops its inner scroll here so there is one scroll, not a nested
  pane.
  - Use **`flex: 1 0 auto`**, not `height: auto`, on `.lobby-board` / `.lobby-layout` /
    `.prep-scroll`: basis is the content height, grow into spare space, never shrink.
    Plain `height: auto` scrolls correctly but collapses the panels to content, which
    on a tall viewport (iPad portrait) leaves ~600 px of dead space and unpins the
    `.lobby-cta-bar` from the panel bottom.
  - `.chat-log`'s `45vh` cap belongs in the **≤900 px** block, where the layout is
    stacked and the page scrolls. Applying it on wide-but-short viewports just leaves a
    gap, because the chat column's grid already bounds the log there. Stacked, the log
    also has no column height to fill, so it needs a floor:
    `min(38vh, 260px)` at ≤900 px, `min(32vh, 200px)` in the `max-height: 760px` block
    (which wins on short screens) — without one it collapses to ~140 px, four lines.
- **≤900 px — the draft view stops being a fixed-height app shell.** `.view--draft` gets
  `overflow-y: auto` and the panels (`.draft-shell`, `.draft-workspace`,
  `.ban-side-section`, `.pick-phase-center`) go to content height. Stacked, each region
  was being squeezed into a fraction of one viewport height and its content spilled over
  the section below. `.ban-phase-grid` / `.pick-phase-grid` keep a `vh` cap so the page
  does not grow by hundreds of cards, and `.pick-pitch-wrap` needs an explicit
  `min-height` or it collapses (it is `flex: 1` inside an auto-height column).
- **≤620 px — lobby controls stack full width.** `.lobby-actions` and `#addAllowanceBtn`
  both carry `margin-left: auto` (which pins them right on desktop); it has to be cleared
  here or they stay at content width on the right edge of a stacked column. Stretch the
  CTA via `.lobby-actions .btn`, **not** `.lobby-bottom-row .btn--primary` — the latter
  also matches the chat Send button and squashes the message input to ~20 px.
  `.lv-field-row` also drops its 190 px track cap here (`minmax(136px, 1fr)`): the cap
  keeps a three-digit field from spanning a third of a wide panel, but at one or two
  columns it just leaves a ragged edge beside the full-width MODE cards.
- **≤620 px — the stage header wraps to two rows**, and toolbar dropdowns re-anchor.
  Side by side, leave/identity (or timer/leave) + the four-step bar need ~455 px, more
  with a long username, and because `.view` has no horizontal scroll that width becomes
  the layout width for every panel below it. `.lobby-stage-row` and
  `#viewDraft > .stage-progress-container` get `flex-wrap: wrap`, with the bar at
  `flex: 1 0 100%; order: 3`; the bar's `min-width: 280px` floor is cleared here.
  Separately, `.ap-dd-panel` normally anchors to its button (sort left-aligned, filter
  right-aligned), which puts one of them off an edge on a narrow toolbar — so
  `.ban-phase-controls` / `.pick-phase-controls` become `position: relative`, the
  `.ap-dd-wrap` goes `position: static`, and the panel spans `left: 0; right: 0` under
  the whole toolbar.
- **≤480 px** — smaller stage labels, tighter card grids (`.ban-phase-grid` 104 px /
  `.pick-phase-grid` 76 px columns), and the quick-load bar wraps.

Toolbar search bars (`.ban-phase-controls`, `.pick-phase-controls`) are `flex-wrap: wrap`
with `.team-search-wrap { flex: 1 1 180px / 150px }`. They were `nowrap`, which squeezed
the input to its icon on the ban side and ran the placeholder under the sort button in
the 300 px pick pool column at **every** width.