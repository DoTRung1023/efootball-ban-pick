---
paths:
  - "public/css/features/draft/**/*.css"
  - "public/css/features/catalog/catalog.css"
  - "public/css/shared/numberInput.css"
---

# Room page CSS conventions and component map

## Dead rules were swept once — keep it that way

Every class selector in the room sheets now appears somewhere in the markup or in a
module that builds markup. 1,438 lines across all sheets (12,301 -> 10,863) went in one
pass: whole families left behind by features that were removed or rebuilt —
`side-panel-*`, `mini-*`, `slot-*`, `draft-topbar` and `draft-loading` in `shell.css`;
`ban-history-*`, `ban-tracker-*`, `draft-panel--*` in `ban.css`; the pre-`.sm-*`
`ready-phase-*` screen in `ready.css`.

Breakpoint overrides count too. A second pass recursing into `@media` blocks took the
last six — `.ban-phase-confirm` / `.ban-phase-actions` (ban), `.draft-side` /
`.draft-side--right` (shell), `.create-room-btn` / `.room-settings-row`
(`home/responsive.css`) — each an orphan override whose base rule had already gone.
**Zero of 994 class selectors are now unreferenced**; a new dead rule is a regression.

Four traps if you repeat this:

- A selector list cannot be split on commas. `:is(input, select)` has one of its own,
  and splitting there emitted `select){ … }`, which invalidates every rule after it in
  the sheet.
- Strip comments *before* tracking quotes. An apostrophe in prose ("the input's width")
  opens a quote that never closes.
- Strip comments before testing for `@` too, or a section banner sitting above
  `@media` makes the block read as a style rule and it is never entered — that is
  exactly why `home/responsive.css` survived the first recursive pass.
- A class inside `:not()` is an *exclusion*, not a requirement. `.card:not(.is-dead)`
  still styles every `.card`, so treating `is-dead` as required deletes a live rule.
  Seven such selectors exist across the sheets.

All four produce silent, wide breakage. Verify with a computed-style diff plus a
control run — see "Verifying a change to these files" below.

## The seven sheets

`draft.css` was 6,009 lines. It is now seven sheets under
`public/css/features/draft/`, grouped by concern and linked from `room.html` in
this order:

| Sheet | Holds |
| --- | --- |
| `base.css` | `:root` tokens, resets, pitch background, glow orbs |
| `shell.css` | the frame around whichever phase is live: view states, error/abandoned screens, spinner, buttons, stage progress, draft layout, side panel, mini cards, Done, header bars |
| `lobby.css` | top bar, matchup, settings panel, allowance builder, chat |
| `ban.css` | ban board, ported "My Players" toolbar, player cards, right sidebar |
| `pick.css` | quick-load bar, squad pool, formation pitch, allowance bar, live feed |
| `ready.css` | the Start Match screen |
| `responsive.css` | cross-cutting responsive rules |

`room.html` also links `css/shared/playerHoverCard.css` — the floating
player-info panel, shared with the home page. It is documented in `home/css.md`;
the only room-side constraint is that it may use no room-only token, which is why
`--surface-popover` is declared on both pages.

There is no bundler, so the `<link>` order **is** the cascade. `base.css` must stay
first (everything reads its custom properties) and `responsive.css` last (it
overrides the phase sheets). Reordering the links silently re-renders the page —
nothing will error.

`.mini-card` and `.side-panel` live in `shell.css`, not a phase sheet: they carry
both `.is-ban` and `.is-pick` variants.

### Three rules that had to be reclassified

The spans of the original file did not match its concerns, and three rules were
only working because of where they happened to sit. Grouping by concern moves
them, which changes who wins — so each was reclassified into the sheet its
consumers actually live in:

| Rule | Was in | Now in | Why |
| --- | --- | --- | --- |
| `.draft-select` (+ `:focus`) | stage-progress span | `lobby.css` | used on exactly **one** element in the whole app — the allowance category trigger in the lobby |
| `.lobby-stage-row` | draft-header span | `lobby.css` | the header bar of the lobby, used once inside `#viewLobby` |
| `.stage-progress-container--lobby` (+ its ` .stage-progress-bar`) | lobby span | `shell.css` | a modifier of a shell component, and it must stay ahead of the generic `.stage-progress-container` |

Each move keeps the original relative order inside its new sheet, so the winning
rule is unchanged.

**Two of these are latent dead CSS** — worth knowing before you "fix" what looks
wrong:

- `.draft-select` overrides the purpose-built `.allowance-category-trigger`, so
  that button renders as a purple 7px-radius box at 13px, **not** the green 18px
  pill its own rule describes. The pill styling appears only on hover, where
  `.allowance-category-trigger:hover` wins on specificity.
- The base rule for `.lobby-stage-row` sits after the `@media (max-width: 900px)`
  override in the lobby responsive block, so that override never applies.

Both are preserved exactly as they were. Changing either is a visual decision,
not a refactor.

### Verifying a change to these files

Moving a rule between sheets changes its cascade position. Verify with a
computed-style diff: load a real captured DOM with the old and new sheet sets and
compare `getComputedStyle` for every element plus `::before`/`::after`. The
current split passes 18 comparisons (lobby/ban/pick DOM x six widths) with zero
differences.

Six traps in that harness, each of which produced a confident false result
before being fixed:

1. The repo path contains spaces — unencoded, the `file://` sheets silently fail
   to load and *everything* differs. Assert a known token resolves first.
2. `getComputedStyle` returns **used** values, so images still loading make the
   signature timing-dependent. Strip every `src`.
3. It enumerates **custom properties in declaration order**, which splitting
   changes with no rendering effect. Sort property names before comparing.
4. Confirm the files on disk are the build you think you are measuring — a stale
   copy produced both a false pass and a false failure here.
5. **Widths you did not measure read as "identical".** A run at 1440/900/620 cannot
   see a rule removed from the `≤480` rung. Measure every rung the change touches,
   and load the page in an `<iframe>` of that width — headless Chrome will not shrink
   its own window below 500 px and reports the wider viewport without complaint
   (see `responsive-testing.md`).
6. **A control probe can lose the cascade.** Proving the harness sees a change means
   injecting one it *can* see: pick a property nothing else in that block sets. A
   `gap` probe added to a block that sets `gap` again lower down is simply overridden,
   and the resulting silence looks like a broken harness rather than a bad probe.

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

The room sheets and `auth.css` currently have **zero** duplicated top-level selectors —
verified by a scan that strips comments and skips `@media` / `@keyframes` bodies. Two had
crept back in and were merged: `.draft-panel--ban-phase` (the earlier block was fully
subsumed by the later one) and `.pick-opp-grid` (a stray `grid-auto-rows` folded into the
canonical block). Rules
inside `@media` blocks are a separate scope and do not count as duplicates. When merging
a duplicate, keep the **later** block's position — it is the one winning the cascade —
and carry over only the properties the winning block does not already set.

`base.css` `:root` defines `--bg-card`, `--bg-card-hover`, and `--transition` to match
`pages/home/base.css` values so shared components like `.player-card` look identical across
both pages.

## Number inputs (one shared rule)

`public/css/shared/numberInput.css` hides the spinner arrows on **every**
`input[type="number"]` in the app, and is linked by `home.html` and `room.html`
right after each page's base sheet. `admin.html` and `signin.html` have no
number inputs and do not link it.

There is nothing to do when you add a number input — it is covered. Do not
re-add a per-component spinner rule; that is what this replaced.

Four near-identical copies used to live in `lobby.css` (twice), `ban.css` and
`catalog.css`, and had drifted: two were missing the standard `appearance`, two
were missing `margin: 0`, and one carried an unprefixed `appearance: none` that
does nothing.

Both halves of the shared rule are deliberate:

- `appearance: textfield` is what removes the spinner in Firefox (80+) and
  Chrome. `-moz-appearance` is kept as the legacy alias for older Firefox.
- The `::-webkit-*-spin-button` half is belt-and-braces for older WebKit.
  Measured on current Chrome: once the element rule applies, no spin button is
  generated at all, so those selectors never match — `getComputedStyle` on them
  reports the input's own box. Keep them for Safari.

One deliberate scope change came with the consolidation: `#lobbyBansInput` (the
hidden input behind the BAN PER SIDE stepper) was not covered by any of the four
old blocks and now is. It is `hidden` / `display: none`, so this is invisible —
verified as the only element that changed.

## Parity with `home/catalog.css`

The ban page uses `.ap-dd-btn`, `.sort-dir-btn`, `.filter-input`, `.range-pair`,
`.filter-clear-btn`, `.filter-group-label` etc. These are defined in `ban.css` and kept
visually in sync with `public/css/features/catalog/catalog.css`. Key rules: `.ap-dd-btn.has-active`
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
- **Height-driven, never width-driven.** The thumb is `height: var(--ban-slot-h, 96px)`
  with **no explicit width** — the `img` is `height: 100%; width: auto`, so the card's
  natural aspect ratio sets the container width. This avoids letterboxing, since
  pesdb.net card images are taller than the old 3:4 ratio. Do not add a `width` or swap
  the strip to grid columns; that reintroduces letterboxing.
- **There is one thumb size**, so the height lives on `.ban-phase-thumb` itself and the
  markup helpers in `playerCards.js` take no `size` argument. It used to be a `--md` /
  `--lg` pair emitted as `ban-phase-thumb--${size}`; `--lg` (a fixed 94 × 124, which
  contradicts the height-driven rule above) was dead for as long as every caller passed
  `"md"`, and the template interpolation is why `dead-css` could not see it. Re-add a
  size only as a literal class name.
- `--ban-slot-h` is declared on `.ban-phase-right` (default `96px`) and **set at render
  time** by `applyBanSlotHeight()` in `banView.js`: it picks the largest height at which
  every slot for the current ban cap fits its strip without scrolling, floor 44 px. Both
  strips inherit it, so they scale together. Because a shorter card is also narrower,
  more fit per row — the search recomputes the column count at each candidate height.
- Keep the `var(--ban-slot-h, 96px)` **fallback**: `--md` thumbs rendered outside
  `.ban-phase-right` have no such variable in scope, and without the fallback the
  declaration is invalid and the height is dropped entirely.

### One width formula, in three places

A slot at height `H` is `2px + (H − 2px) × 240/339` wide, and **everything that needs
a slot width must use that expression** — the `width` on `.ban-side-empty-slot`, the
`slotWidth()` helper in `banView.js`, and any future consumer.

- `240 × 339` is the intrinsic size of a pesdb.net card PNG. The thumb has no `width`,
  so the `img` (`height: 100%; width: auto`) is what sets it.
- The `2px` is the thumb's 1px hairline, which sits **outside** the art — the card is
  `H` tall including the border, so the art is only `H − 2px`.

Both terms matter, and dropping either is what the formula exists to prevent:

- A plain `aspect-ratio: 68 / 96` on the placeholder (which is what it used to carry)
  misses the border term and comes out ~0.6px narrower than a real card at every `H`.
  Sub-pixel, but the strip is `flex-wrap`, so a row holding both kinds no longer wraps
  on the same columns as a row of pure placeholders — which is the visible symptom:
  the dashed boxes shift as bans land.
- `applyBanSlotHeight()` had the same 68/96 in `SLOT_RATIO`, so it over-counted how
  many cards fit per row and picked heights the strip could not actually hold. At
  1440 × 1100 with cap 12 it chose 90 px; twelve real cards then wrapped to four rows
  (384 px of content in a 340 px strip) and the strip scrolled — the one thing the
  routine exists to avoid.

Re-measured with the corrected formula (window 1440 wide; strip is 279 px):
cap 3 → 96 px at every height; cap 12 → 88 px at a 1013 px viewport, 74 at 813;
cap 18 → 68 px at 1013, 54 at 813. Nothing scrolls, and a strip of `n` cards plus
`cap − n` placeholders wraps identically to a strip of `cap` placeholders.

`.ban-side-empty-slot` and `.ban-side-strip:empty::before` share one rule block —
they are the same placeholder. Written separately they drifted 3px apart, because
`* { box-sizing: border-box }` in `base.css` does not match `::before` and its dashed
border fell outside the declared size. The shared block sets `box-sizing` explicitly.

## Ban sidebar footer (`.ban-side-actions`)

`.ban-status-hint` is **always in flow and exactly one line tall**, empty or not
(`min-height: 14px` = `font-size 10px × line-height 1.4`). It used to carry
`:empty { display: none }`, which took the row out of the column while empty; the
footer then grew by that row *plus* the column's 8px gap the moment "Waiting for
opponent…" appeared, and the space between the section divider and CONFIRM BANS
jumped from 12px to 34px on confirm. Measured after: **34px in all three states**
(unconfirmed / waiting / both confirmed) at 1440, 1200 and 900 px.

The collapse was a deliberate trade — it bought 22px back in the unconfirmed
state, which is the common one — so reserving the row spends that permanently.
A stable footer was judged worth it. Do not put `:empty { display: none }` back.

## Pick phase

`.pick-phase-layout` is a 3-column CSS grid (`380px | minmax(0,1fr) | 252px`); at
≤1100 px it narrows to `360px | 1fr | 220px`; at ≤860 px it collapses to a single
column. **Do not hide `.pick-phase-center` on narrow screens** — it carries
`#confirmPicksBtn`, so hiding it (as ≤860 px used to) leaves no way to finish the
draft on a phone.

The left column is 380 px so its cards land at **~114 px**, against the ban grid's
measured **139 px** — close enough to read as the same component. It was 300 px
with `minmax(86px, 1fr)`, which made the cards too small for the footer detail
that SHOW INFO exists to reveal. The ≤1100 rung drops the grid floor to 100 px
along with the column: leave it at 112 px and `auto-fill` falls to two tracks, so
the cards get *bigger* on the narrower screen (114 px at 1440, 144 px at 1100).

**`.pick-phase-controls` is two rows, and each row is forced rather than left to
`flex-wrap`.** Search alone on the first (`.team-search-wrap { flex: 1 0 100% }`),
then sort + FILTER + SHOW INFO sharing the second. Wrapping on its own put the
sort group up beside the search and SHOW INFO alone on a third row. Same break
`home/responsive.css` forces on its own toolbar at ≤768 px.

Three trims are what make the second row fit. The row is only **338 px** at the
≤1100 px column, and at the ban toolbar's own metrics it was **396 px** of
content:

- `.ap-dd-btn` → `padding: 6px 9px; gap: 5px; letter-spacing: 0.06em`, and
  `.toggle-info-btn` drops its 120 px floor and matches.
- **The two leading glyphs are hidden** —
  `.ap-dd-btn > svg:not(.dd-chevron) { display: none }`. They are 18 px each and
  the last 36 px has to come from somewhere; unlike a smaller font it costs no
  legibility, because OVR MAX and FILTER already say what the pictures said. The
  chevrons stay — they are the affordance that says "menu". Note the class in
  `:not()` is an *exclusion*: this rule needs `.dd-chevron` to keep existing.
- Measured at 1440/1200/1100/1024/900/800/700: **two rows at every one**, with
  the second running 25 → 344 px inside 25 → 363 px of space.

**The dropdowns hang off their own button and open rightward**
(`.ap-dd-panel { left: 0; right: auto }`, with `.ap-dd-wrap` keeping its base
`position: relative`). They used to span the whole toolbar — `left: 0; right: 0`
resolved against a `position: relative` `.pick-phase-controls` — which drew a
356 px slab for a 190 px menu and pointed at no button in particular.

Left-anchoring is what keeps them on screen, and it is the part to preserve:
`.filter-dd-panel` is `right: 0` by default, so it extends *leftward* from its
button, and in a ~360 px column that put its 260 px of content off the left edge
of the page — measured `left: -123px` at a 900 px viewport, which is what the
full-width override was working around. Left-anchored, the filter panel instead
overhangs the column's **right** edge by 22 px (380 px column) / 42 px (360 px),
floating over the pitch — which is what a popover is for, and it is still inside
the viewport at every width measured.

The ≤620 px rung still spans both toolbars; on a phone that is the right answer.
These rules sit in `pick.css`, which loads before `responsive.css`, so it wins.

Key blocks:

- `.pick-lineup-head` — the pitch column's header: `.pick-plan-row` (the two
  lineup-level controls) on the left, CLEAR ALL on the right, `space-between`
  with `flex-wrap` as a safety net. It replaced the `.pick-lineup-meta` strip,
  whose five rules are gone.
- `.pick-plan-row` — `.pick-load-plan-btn` (LOAD GAME PLAN) and
  `.pick-formation-wrap` / `.pick-formation-btn` / `.pick-formation-panel`.
  **This control is mirrored on the home page** as
  `.plan-formation-trigger` / `.plan-formation-panel` / `.plan-formation-option`
  in `gamePlans.css` — same metrics, green instead of cyan. Change one, change
  the other; a computed-style diff over 50 properties plus the rendered panel
  width is what holds them together.
  - The panel is **`min-width: 0`** — shrink-to-fit. Nine `N-N-N` labels and a
    tick is all it holds, so a floor only ever made it wider than its content
    (it was 156px; it measures 100.6px).
  - `padding: 4px` on **all four sides**, with `border-radius: 6px` on the
    options — 10px panel radius minus the 4px padding, so the highlight is an
    inset pill concentric with the panel. Full-bleed rows put square corners
    against the panel's rounded ones, which showed on the first row whenever it
    was the active one.
  - The options are `white-space: nowrap`. `4-3-3` has two hyphens, which are
    break opportunities, so without it the panel's shrink-to-fit width depended
    on how wide its trigger happened to be.
  **The panel opens downward** (`top: calc(100% + 6px)`) because the row sits at
  the *top* of the column; it opened upward when the row was under the pitch, and
  leaving that would open it off the top of the board. Measured at
  1440/1100/860/620: all three controls stay on one row and the open panel stays
  inside the viewport.
  - **`--surface-popover`, not `--surface-sunken`.** `sunken` is a 0.5-alpha tint
    for a block inset into a card that is already opaque behind it; this panel
    hangs over the pitch, and at 0.5 the dashed empty slots and their `+ ATT`
    labels read straight through the formation numbers. That was the reported
    symptom — "hard to see the numbers" — and it is why the ladder gained an
    opaque top rung. Anything floating over the board wants it.
  - **One column of nine, not a 2 × 5 grid.** Two columns made the list read in a
    zigzag (4-3-3 beside 4-4-2, then back across for 4-5-1) and the 78 px tracks
    left no room for a selected marker. It is the shape the game-plan dropdown on
    the home page already uses.
  - The tick is `button::after { content: "✓" }` toggled by `opacity`, **not**
    markup: `renderFormationPanel` builds the buttons once and thereafter only
    flips `is-active`, so a marker in the HTML would have to be rebuilt each
    render. U+2713 is `Emoji_Presentation=No`, so it renders as a text glyph with
    no variation selector needed — unlike the fog emoji in `pickView.js`.
- `.pick-pos-tabs` / `.pick-pos-tab` / `.is-active` — tab bar with `--cyan`
  accent on the active tab.
- `.pick-phase-grid` — same `player-card` component as `.ban-phase-grid`, and
  the hover now matches it: `scale(1.04)` (no `translateY`, same anti-jitter
  reason) plus `border-color` + glow + `z-index: 30`, in cyan instead of green.
  It used to paint a hard `box-shadow: 0 0 0 2px` ring and had no `z-index`.
  Three things that rule needs, all of which were missing and each of which was
  visible:
  - **`align-items: start` on the grid.** Items stretch to the row by default, so
    a card shorter than its neighbour got a box taller than its artwork and the
    outline — which traces the *box* — sat below the card. With it, the only
    slack is the card's own 2px of border.
  - **`padding` on the grid.** `overflow-y: auto` clips at the padding box, so
    with none the top row was cut off by the scroller the instant it grew.
    `.ban-phase-grid` carries 10px; this one has `8px 6px`, enough for a ~244px
    card's ~4.9px of upward growth without costing a column.
  - **`width: 100%` + `z-index: 30` on the card**, so it fills its cell and rises
    above its neighbours when scaled (`z-index` needs the `position: relative`
    that rule already sets).

  Note the horizontal padding costs 12px, which drops `auto-fill` from three
  tracks to two at a 112px floor — hence the 108px floor. Overlay CSS:
  `.is-pick-taken .pc-img-wrap::after { content: "PICKED" }` and
  `.is-ban-taken::after { content: "BANNED" }`.
- **`grid-auto-rows: max-content` is load-bearing on every grid holding a
  `.player-card`** — `.ban-phase-grid` had it, `.pick-phase-grid` and
  `.pick-opp-grid` did not. `room.html` does **not** link
  `shared/playerCard.css`; the room's `.pc-img-wrap` comes from `ban.css` and has
  *no height of its own*, taking the image's natural height instead. Without
  max-content rows the card is sized by the grid rather than by its content and
  the wrap collapses — measured **0 px** in the pick grid, so every card rendered
  as a bare footer with no player image. Both grids also carry
  `.pc-img-wrap { height: auto }`, mirroring `.ban-phase-grid`. Any new
  card grid on this page needs both.
- **`.pc-img-wrap img` carries `aspect-ratio: 240 / 339`, and it is load-bearing
  too.** These images have no width/height attributes and are `loading="lazy"`,
  so without a declared ratio a card has *no height at all* until its image is
  sized — even a cache hit is asynchronous. Every rebuild of a card grid makes
  brand-new `<img>` elements, so for a frame the whole grid collapses to its
  footers, the scroller clamps `scrollTop` to the shorter content, and the list
  jumps upward and stays there. Measured on a 40-card pick grid with the images
  unsized: card **244 → 111px**, `.pc-img-wrap` **154 → 20px**, grid
  **3526 → 1658px**, `scrollTop` **600 → 334**. With the ratio declared, all four
  hold. It costs nothing when the image *has* loaded — ban, pick, opponent and
  ready cards measure pixel-identical with and without it, because 240 × 339 is
  the art's real size.
- `.pick-pitch` / `.pick-pitch-row` / `.pick-slot` — formation pitch; empty slots
  use `.pick-slot--empty` (dashed green border + `+` icon + row label), filled
  slots `.pick-slot--filled`. Slots are **interactive**: `.is-active` is the
  loud green ring on a slot selected for a swap or a fill, `.pick-slot--empty`
  has its own hover, and `.pick-slot-remove` is the hover-revealed ×. That ×
  needs its `@media (hover: none)` block keeping it visible, or a player can
  never be removed on touch — the same trap `.pitch-remove-btn` has on the home
  page.
  - **The hover and selection rings are `.pick-slot::after` with `inset: 0`, not
    a `box-shadow`.** Both scrollers around these slots clip on both axes —
    `overflow-x` computes to `auto` alongside `overflow-y` — and a slot on any
    edge sits flush against the clip rect. Measured on the first substitute:
    **0.0px of slack on its left, top and bottom**, so a ring drawn outside the
    border box lost three of its four sides. Padding on `.pick-bench` /
    `.pick-pitch` buys the room but costs height in a column already tuned so the
    pitch fits, and it only mitigates the clip. `inset: 0` cannot be clipped and
    cannot be mis-sized: it *is* the border box. The idle `::after` is
    `border: 2px solid transparent`, so only the colour transitions.
  - The `.is-active` glow stays a `box-shadow` (`0 0 18px var(--g-glow)`) — soft
    enough that clipping it at a container edge is imperceptible, unlike a hard
    line missing on three sides.
  - **The `::after` ring is for `--filled` slots only.** A filled slot is bare
    artwork, so the ring *is* its outline. An empty one already draws a dashed
    border, and the ring landed just outside it: a solid green rectangle around a
    dashed rectangle, two outlines deep. `.pick-slot--empty.is-active` turns its
    own border `--green` and keeps the glow — the same thing the game-plan pitch
    does. Measured: `border-style: dashed`, `border-color: rgb(44,207,117)`,
    ring `rgba(0,0,0,0)`, and the filled slot's ring still green.
  - **One box for both states: `aspect-ratio: 240 / 339`.** That is the intrinsic
    size of a pesdb card PNG — the ratio `.ban-side-empty-slot` uses, without the
    border term, because an empty slot draws its dashed border *inside* the box
    and a filled one has no border. The slot used to be `min-height: 88px` with
    its height left to the content, so an empty slot came out roughly square
    while a filled one grew to the card's full height: every pick shoved the rows
    below it down the pitch. Measured after: filled and empty are both
    82.0 × 115.8 at 1440 px, and the art fills the box with **0.0 px** of slack.
  - `.pick-pitch-row` is `align-items: center`, **not `stretch`** — a stretched
    flex item takes the line's cross size instead of its aspect-derived one. It
    is a no-op while every slot in a row is the same width, which is the usual
    case, but not for a row squeezed below `max-width`.
  - **`max-width: var(--pick-slot-w, 82px)` — the width is measured, not fixed.**
    `applyPitchSlotWidth()` in `pickView.js` writes the property on `#pickPitch`
    each render: the largest slot at which four rows fit `.pick-pitch-wrap`
    without scrolling, capped at 116 px and floored at 40 px. A fixed width is
    wrong at every size but one — 82 px fitted 1440 × 900 exactly and scrolled
    at 1280 × 1024. Measured across eleven window sizes from 1024 × 768 to
    2560 × 1440, and every formation's widest row: **nothing scrolls**, slots
    run 42 px → 116 px. The 82 px fallback only applies before the first
    measurement. See `pick-phase.md` for the algorithm.
  - Rows with more slots get narrower cards when the column is tight (a 4-slot
    DEF row measured 78 px against the GK row's 82 px in a 250 px column). That
    is flex doing its job — within a row, empty and filled always match.
  - **Square corners throughout**: the slot and `.pick-slot-img` carry no radius,
    matching `.player-card`, `.ban-phase-thumb` and the home pitch. The bench
    inherits the ratio and the square corners from `.pick-slot`; only
    `max-width: none` differs.
  - **A filled slot is the card art and the × — nothing else.**
    `.pick-slot-overlay` / `.pick-slot-name` / `.pick-slot-ovr` are gone; they
    reprinted the surname and the rating in a smaller font, over the part of the
    artwork that already carries both.
  - **`.is-placing .pick-slot--empty`** is the drop-target state: while a pool
    card is chosen, `pickView` puts `is-placing` on `#draftPickPhaseBoard` and
    the empty rectangles go solid green. Without it the second half of the click
    pair has to be guessed at — the slots look exactly as inert as they do the
    rest of the time. It pairs with `.pick-phase-grid .player-card.is-pending`,
    which is the same loud green ring `.pick-slot.is-active` uses, seen from the
    other end. **Green, not the pick board's cyan**: cyan means the opponent, and
    this is your choice.
  - **`.pick-pitch-wrap` styles its own scrollbar** (4 px, `--g-fill-strong`
    thumb, `scrollbar-width: thin`) like every other scroller on the page. Left
    to the OS default it lands as a wide light slab over the right-hand column of
    slots. Green, because this is your side of the board.
- `.pick-bench-wrap` / `.pick-bench` — the substitutes strip, every slot past the
  starting XI drawn as a real rectangle (this replaced a "23 MORE" label).
  `.pick-bench .pick-slot` clears the pitch slot's `max-width` and nothing else;
  without that a short bench row stretches one card across the whole strip. The
  card ratio comes from `.pick-slot`, so a sub is the same shape as a starter,
  just smaller (52 × 74 at 1440 px). `.pick-bench-head` holds the title alone —
  there is **no count**, because twelve visible rectangles already say what
  "1/12" said.
- `.pick-slot-remove` is solid `--red` with a white glyph and a drop shadow,
  matching `.pitch-remove-btn` on the home game-plan pitch, and `z-index: 3` to
  clear `.pick-slot::after`. It was `--r-fill` — 10% alpha over card art, which
  is very nearly invisible. Still hover-revealed, as on the home page, and it
  still needs the `@media (hover: none)` block.
- `.pick-bottom-bar` / `.pick-allowance-bar` / `.pick-allowance-pill` /
  `.is-maxed`, plus `.pick-confirm-hint` and `.pick-confirm-btn.is-confirmed`.
  The confirm button is **never hidden** — it is disabled until the squad is
  full, and the hint beside it says why. `.pick-confirm-hint` is always in flow
  with a `min-height` (font-size × line-height) for the same reason
  `.ban-status-hint` is: a line that appears and disappears moves the footer.
  `.is-waiting` paints it **amber**, the "pending, waiting on someone" hue.
  `.is-confirmed` strips the button back to a ghost, because once it says
  UN-CONFIRM it is no longer the primary action.
- `.pick-phase-right` / `.pick-live-*` / `.pick-opp-*` — cyan-accented sidebar.
  Its footer is the presence dot plus `.pick-live-status-text` and nothing else;
  the `Synced 3.4s ago` readout (`.pick-live-sync` / `#pickLiveSync`) is gone.
  `state.lastRoomUpdatedAt` stays — `presence.js` still uses it to tell a changed
  snapshot from an unchanged one.
  `.pick-opp-grid` is a card grid (`minmax(66px, 1fr)`, 60 px at ≤1100), **not**
  the old text feed.
- **`.pick-opp-grid.is-concealed`** is the **`blur`** reveal mode: `filter:
  blur(7px)` plus `user-select: none`, so the cards stay in the layout — the
  count and progress bar above still show the opponent's progress — but the names
  are not readable and cannot be recovered by dragging across the blur.
  `pickView.js` also sets `aria-hidden`, or a screen reader reads out exactly what
  the setting withholds.
- **`.pick-opp-locked`** is the **`hidden`** mode, a separate setting: `pickView`
  hides the grid, the count and `#pickOppProgressWrap` outright and shows this
  panel instead — lock icon, PICKS HIDDEN, and one line of status. Do not collapse
  the two modes into one rule; blur is not a weaker `display: none`, it is the
  middle rung and both are user-selectable. `.sm-squad.is-concealed` in
  `ready.css` is the same blur carried onto the Start Match screen.
- `.pick-plan-*` — the LOAD GAME PLAN dialog, which reuses `.confirm-overlay` /
  `.confirm-modal` from `shell.css` so the page has one modal shell.
  **`.pick-plan-overlay` sets `z-index: 110`, below the shell's 120**, and that
  is not cosmetic: sharing the shell means sharing its stacking level, and this
  overlay is *later* in `room.html` than `#confirmOverlay`, so it won on DOM
  order and painted over the "Replace lineup" confirm — measured with
  `elementFromPoint` at the viewport centre, which returned a `.pick-plan-name`
  row while the confirm was open behind it. A confirm interrupts everything, so
  it must outrank every other overlay rather than depend on markup order.
  110 keeps this one above `.toast` (100), as it was.

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
  `.pick-phase-grid` 76 px columns), and the quick-load bar wraps. The formation
  dropdown also flips to `left: auto; right: 0`: it is the *second* control in
  `.pick-plan-row`, so at 320 px it starts ~201 px in and its 156 px of list ran
  37 px off the right of the screen. Measured in a 320/390/480 px iframe: on
  screen at all three, and back to left-anchored at 500 px.

  One thing does not fit at 320 px: the toolbar's second row needs 319 px of
  buttons in 274 px, so SHOW INFO drops to a third row there. That is the floor
  width and the only rung where it happens — 390 px up keeps all three together.

Toolbar search bars (`.ban-phase-controls`, `.pick-phase-controls`) are `flex-wrap: wrap`
with `.team-search-wrap { flex: 1 1 180px / 150px }`. They were `nowrap`, which squeezed
the input to its icon on the ban side and ran the placeholder under the sort button in
the 300 px pick pool column at **every** width.
## The locked board (both phases)

Once a side confirms, its board goes read-only until UN-CONFIRM. `banView` and
`pickView` each put **`is-locked`** on their `.draft-panel` section, and three
kinds of rule hang off it.

**Hover is gated at the source, never reset afterwards.** Every hover rule that
promises an interaction is prefixed `.draft-panel:not(.is-locked)`:

| Sheet | Rule |
| --- | --- |
| `ban.css` | `.ban-phase-grid .player-card:not(.is-unavailable):hover` |
| `pick.css` | `.pick-phase-grid .player-card:not(.is-unavailable):hover` |
| `pick.css` | `.pick-slot--filled:hover::after`, `.pick-slot--empty:hover` |
| `pick.css` | `.pick-slot--filled:hover .pick-slot-remove` (+ `:focus-within`) |

A `.is-locked … :hover { transform: none; … }` override would work too and is
the wrong shape: it has to restate the resting value of every property the hover
touches, so the two blocks drift the first time one of them is tuned. Gating
cannot drift — the rule either matches or it does not.

**The locked look** is `cursor: not-allowed` plus `opacity: 0.72;
filter: grayscale(0.5)` on the pool cards, scoped `:not(.is-unavailable)` in
both grids. That exclusion is load-bearing: your own bans (0.45) and your picked
/ banned players (0.55) carry their state *in* their opacity, and levelling
every card to one value erases it. The pitch and bench keep full colour — a
confirmed lineup is the thing you want to look at — and lose only their
affordances: the rings above, and `.is-locked .pick-slot-remove { display: none }`.
That × is `display`, not `opacity`, because `@media (hover: none)` pins it to
`opacity: 1` with no hover to take it away, and an invisible button is still
clickable and still in the tab order.

**`.grid-lock-note`** (in `shell.css`, since both phases use it) is the banner
above each grid: one line of 10px text, `--g-fill` on `--g-line`, with the
UN-CONFIRM in `<strong>` at full `--green`. **No icon** — a padlock glyph was
tried and cut; the sentence already says the word. Green because the hue table gives
green to *confirmed*; the amber "waiting on someone" fact is a different one and
already has `.ban-status-hint` / `.pick-confirm-hint`.

It is shown by **CSS alone** — `display: none`, then `.is-locked .grid-lock-note
{ display: block }`. No `hidden` attribute and no JS: an element with a `display`
of its own overrides `[hidden]` (author sheet beats UA sheet regardless of
specificity), which is the standard way this component breaks, and the state has
only one home either way.

Measured, at 1440 × 900 unless stated:

- **Zero computed-style differences** across both boards against HEAD — every
  element, plus `::before` and `::after`, in the unlocked state. Both grids'
  own boxes included: the hidden banner costs the grid **0 px** of height.
  (A first pass diffed old CSS against new over the *new* markup and showed
  `#banGrid` 78 → 148 px; that is the banner rendering as an unstyled `<p>`
  in the old sheet, not a regression. Diff against the real baseline — HEAD's
  markup *and* HEAD's sheets.)
- Locked vs unlocked, per probe element: pool cards `default → not-allowed`,
  `1 → 0.72`, `none → grayscale(0.5)`; banned/picked cards hold 0.45 / 0.55 and
  their own grayscale; slots `pointer → not-allowed`; the × `flex → none`; the
  banner `none → block`. **Hover rules matching each element: 1 → 0** for every
  card and slot (the gate tested by stripping `:hover` off each rule's selector
  and asking the element whether the rest still matches — a selector that no
  longer matches cannot paint).
- Banner height **30 px from 1440 down to 360**, wrapping to 44 px at 320. No
  overflow and no column scroll at any rung (1440 / 1200 / 1100 / 900 / 620 /
  480 / 400 / 360 / 320).

**Disable transitions before measuring this.** `.pick-phase-grid .player-card`
transitions `opacity` and `filter`, and transitions never advance under
`--virtual-time-budget`: the locked pick card read back `opacity: 1;
filter: grayscale(0)` — its *start* values, indistinguishable from a rule that
failed to apply — while the ban card, which transitions neither, read correctly.
Inject `*,*::before,*::after{transition:none !important;animation:none !important}`.
