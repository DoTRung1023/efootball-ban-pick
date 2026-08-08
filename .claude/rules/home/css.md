---
paths:
  - "public/css/{pages/home,features,shared}/**/*.css"
  - "public/home.html"
---

# Home page CSS (`public/css/`)


Number-input spinner arrows are handled globally by
`public/css/shared/numberInput.css` (linked right after `pages/home/base.css`) —
do not add a per-component rule for them. See `room/css.md`.

Split into 8 focused files, loaded in order via `<link>` tags.

- `base.css` — `:root` variables, resets, scrollbar, body (`height: 100vh` then
  `height: 100dvh`; `overflow: hidden` — locks page-level scroll; the dvh line is the
  mobile fix, keep the vh line as its fallback), pitch background, glow orbs, app shell
  (same vh/dvh pair, `overflow: hidden; flex-direction: column`), `.content-scroll`
  (`flex: 1; min-height: 0; overflow-y: auto` — the scrollable area that sits below the
  topbar; the scrollbar appears at the viewport right edge below the nav), topbar.
- `shared/playerCard.css` — `.player-card`, `.pc-img-wrap`, `.pc-footer`, skeleton, empty
  state, load-more.
- `squad.css` — `.main-content` (centered container, `max-width: 1400px; margin: 0 auto`
  — no `flex: 1`, that is owned by `.content-scroll` in `base.css`), tab panels, squad
  toolbar (search bar, sort/filter, select mode, empty state).
- `plans.css` — game plans panel, plan cards, plan toolbar, plan detail modal.
  - **Plan detail columns**: `.plan-left-col` (Starting XI) `flex: 0 1 55%` — may shrink;
    `.plan-mid-col` (bench) `flex: 0 0 200px` — a **fixed** width, not a percentage,
    because the bench grid is 2 × 82 px and a percentage column clips the second card
    below ~1220 px; `.plan-right-col` (picker) takes the rest with `min-width: 260px`.
  - **Card sizing**: `.pitch-slot` is `flex: 1` with `min-width: 0`, and
    `.pitch-slot-placeholder` / `.pitch-card-wrap` are `width: 100%; max-width: 82px`.
    Cards therefore shrink to fit their row instead of wrapping — a back five stays on
    one line at any column width. Do not reintroduce a fixed card width.
  - `.pitch-remove-btn` is hover-revealed, with an `@media (hover: none)` block that
    keeps it visible — without it a player can never be removed on touch.
  - `.plan-hover-card` / `.plan-hover-name` / `.plan-hover-detail` — the info panel
    that floats beside a pitch or bench card on hover (see `home/modules.md` for the
    JS). Three things it depends on: **`position: fixed`** on `<body>`, so neither
    the pitch nor the bench scroller can clip it; **`pointer-events: none`**, or
    sitting under the cursor it takes the hover that opened it and flickers; and an
    **opaque** `--bg-card-solid`, because it hangs over the pitch and the picker
    list. `z-index: 315` puts it above `.plan-detail-overlay` (310) and below
    `.plan-formation-panel` (520).
- `catalog.css` — add player modal + shared sort/filter dropdown UI (`.ap-dd-btn`,
  `.ap-dd-panel`, `.filter-dd-panel`, `.pos-multiselect`, `.catalog-list`). Kept in
  visual sync with the room ban toolbar (`css/features/draft/ban.css`) — see the room
  CSS rule.
- `modals.css` — shared modal overlay/card base, spinner, player popup, toast, confirm
  dialog, edit profile modal.
  - **Room CREATE drawer**: `#roomOverlay` is overridden to `justify-content: flex-end;
    align-items: stretch; padding: 0` so it anchors right. `.room-drawer` (380 px wide,
    full height, `transform: translateX(100%)` → `translateX(0)` on open, slides in from
    the right). Inner layout: `.rd-close-row` (close button row), `.rd-hero`
    (`rd-kicker` + `rd-title` + `rd-sub`), `.rd-body` (`rd-code-label` + `.rd-code-row`
    with `rd-code-input` + two `rd-icon-btn` for regen/copy + `rd-hint`), `.rd-footer`
    (`rd-start-btn` green primary + `rd-cancel-btn` ghost). On mobile (≤420 px)
    `.room-drawer` expands to full width.
- `rooms.css` — Rooms tab. Key blocks: `.rooms-dual-cards` (2-column grid);
  `.rooms-card--create` (deep green gradient, green glow border) / `.rooms-card--join`
  (deep navy gradient, cyan glow border); `.rooms-create-step` (dark pill, per-step icon
  colour); `.rooms-create-cta` / `.rooms-join-cta` / `.rooms-invite-area`.
  - `.rooms-code-input` needs `min-width: 0`: as a `flex: 1` item its intrinsic width
    (~20 chars at `0.24em` tracking) otherwise stops the row shrinking and pushes the
    paste button off screen below ~340 px.
  - **Bottom row**: `.rooms-bottom-row` (`display: grid;
    grid-template-columns: 1fr 1fr; align-items: stretch`) — left child is
    `.rooms-info-row` (single-panel STRATEGY TIPS with gold `border-top`), right child is
    `.rooms-how` (HOW A SESSION GOES card).
  - `.rooms-how` inner: `.rooms-how-kicker` (small uppercase heading), `.rooms-how-steps`
    list of `.rooms-how-step` (flex row: `.rooms-how-num` faint green number + div with
    `.rooms-how-step-title` + `.rooms-how-step-desc`; each step separated by
    `border-bottom`).
  - `.rooms-bottom-row .rooms-info-row, .rooms-info-panel { height: 100% }` ensures both
    sides are equal height. Responsive: ≤960 px `.rooms-bottom-row` and dual cards →
    single column; ≤720 px same.
  - `.rooms-info-panel:nth-child(1)` is what makes STRATEGY TIPS gold. It reads as a
    positional override but there is only ever one panel — the roster and tactics
    panels it was written for were never built, and their rules
    (`.rooms-roster-*`, `.rooms-pos-*`, `.rooms-tactics-*`, `.rooms-plan-*`,
    `.rooms-create-visual*`, plus the unused hero text rules) were removed with the
    dead JS. Sheet went 813 → 545 lines; computed styles over every element and
    `::before`/`::after` were identical at 1440 / 900 / 620 px.
- `responsive.css` — cross-cutting media queries (`≤768px`, `≤480px`), then the plan
  detail modal's own breakpoints (`≤900px`, `≤600px`). Mobile fix:
  `.team-search-wrap { flex: 1 0 100% }` forces the search input to its own row so the
  FILTER button stays right-aligned and its `right: 0` dropdown panel does not overflow
  off the left screen edge.
  - **≤480 px topbar** goes to two rows via `flex-wrap` + `order` (brand + account
    button, then `.topbar-center` at `flex: 1 0 100%`). One row needs ~425 px, so
    below that the account button was clipped. `height` becomes `auto`, overriding
    `--topbar-h`.
  - **≤480 px toolbars**: `.toolbar-actions` gets `flex: 0 0 100%` **and**
    `flex-wrap: wrap` — the three buttons total ~400 px, so one row is not enough on
    its own; `.toggle-info-btn` / `.select-all-btn` also drop their `min-width`.
  - **≤480 px catalog rows**: the thumbnail shrinks to 56 px and `.cr-pos` + `.cr-ovr`
    move to a second, right-aligned line, forced by a zero-height `.catalog-row::after`
    flex item (`order: 4; flex-basis: 100%`) sitting between them and `.cr-add-btn`.
    Without this the fixed-width children consume the row and `.cr-info` collapses to
    zero, rendering the player name one letter per line.
  - **Plan detail modal ≤900 px**: `.plan-detail-cols` flips to `flex-direction: column`
    and becomes the scroll container; the three columns go `width: 100%;
    overflow: visible` and size to their content. The bench becomes a centred 6 × 2 grid
    (4 × 3 below 600 px). `plans.js` mirrors this breakpoint in `STACKED_PLAN_LAYOUT` —
    keep the two values in sync.
  - **Picker sizing — one scroller, not two**: side by side `.plan-picker-list` is its own
    `overflow-y: auto` scroller, but stacked that nests a second scroll container inside
    the sheet, so "scroll to the bottom" has two answers and the list box's bottom edge
    sits somewhere unrelated to the last row. Below 900 px the list goes
    `flex: 0 0 auto; overflow: visible` and runs to its full length, `.plan-right-col`
    goes `flex: 0 0 auto`, and `.plan-detail-cols` is the only thing that scrolls — the
    last row then always ends flush with the bottom of the sheet at any viewport height.
    Every attempt to size the inner scroller instead (`max-height: 50vh`, then
    `flex: 1 1 clamp(240px, 34vh, 460px)`) left a band of dead space under the last row.
  - Because the picker scrolls with the sheet, `.plan-picker-toolbar` is
    `position: sticky; top: 0` below 900 px, on `--bg-card-solid`. That variable exists
    because sticky surfaces need an **opaque** background — `--bg-card` is translucent
    and the rows scroll through underneath it. Reach for it for any sticky header.
  - **≤600 px**: the modal goes full-bleed (`100vw` / `100dvh`, overlay padding 0) and
    pitch cards cap at 72 px.