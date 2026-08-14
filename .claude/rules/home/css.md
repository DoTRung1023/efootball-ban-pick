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
- `shared/pitchField.css` — the football field both squad pitches stand on
  (`.pitch-field`, `.pitch-field-marks`, `.pf-*`), shared with the room's pick
  pitch. Like every `shared/` sheet it may only use tokens **both** pages declare
  — here `--text`, `--border`, and `--radius` behind a fallback; the room's
  `--g-*` ladder is not available to it.
- `squad.css` — `.main-content` (centered container, `max-width: 1400px; margin: 0 auto`
  — no `flex: 1`, that is owned by `.content-scroll` in `base.css`), tab panels, squad
  toolbar (search bar, sort/filter, select mode, empty state).
- `plans.css` — game plans panel, plan cards, plan toolbar, plan detail modal.
  - **Plan detail columns**: `.plan-left-col` (Starting XI) `flex: 0 1 55%` — may shrink;
    `.plan-mid-col` (bench) `flex: 0 0 200px` — a **fixed** width, not a percentage,
    because the bench grid is 2 × 82 px and a percentage column clips the second card
    below ~1220 px; `.plan-right-col` (picker) takes the rest with `min-width: 260px`.
  - **The pitch is a drawn football field** — turf, mow stripes, touchlines,
    penalty and goal areas, halfway line and centre circle — from
    `css/shared/pitchField.css`, which the room's pick pitch shares. `.plan-pitch`
    is the panel and declares no background of its own; `.pitch-field-marks` and
    its `.pf-*` children are **static markup in `home.html`**, a sibling of
    `#planPitchRows` rather than inside it, because `renderStartingXI()` replaces
    that container's contents outright. `.pitch-rows` carries `z-index: 1`: the
    marks are positioned and the rows are not, so without it the field paints
    over the cards. The turf mixes `--text` into **black rather than `--bg`** —
    `--bg`'s blue is a floor no ratio can get under, and against it the pitch
    comes out teal at every mix worth trying.
  - **Card sizing is measured, not fixed.** `.pitch-slot` is `flex: 1` with
    `min-width: 0`, and `.pitch-slot-placeholder` / `.pitch-card-wrap` are
    `width: 100%; max-width: var(--plan-slot-w, 82px)` — `applyPlanSlotWidth()`
    in `plans.js` writes that property on `#planPitch` each render. Cards shrink
    to fit their row instead of wrapping (a back five stays on one line at any
    column width) **and** grow into a wide pitch. Do not reintroduce a fixed
    card width: 82 px was right at exactly one window size, and above it the
    pitch grew while the boxes sat marooned in the middle of it. Measured:
    **40 px at 940 px wide → 50 at 1024 → 76 at 1280 → 93 at 1440 → 116** (the
    cap) from 1920 up; nothing overflows at any of them. The control, pinned back
    to 82 px, measures 82.0 at 1440 and 79.5 at 2560 — the bug.
  - `.pitch-slot`'s own cap is `calc(var(--plan-slot-w, 82px) + 12px)`, its
    horizontal padding. It was a flat 110 px, which silently *became* the limit
    once the card could exceed 98 px — `--plan-slot-w` above that had no effect
    at all. If you change `.pitch-slot`'s padding, change the `+ 12px` and
    `SLOT_PAD_X` in `plans.js` with it.
  - **Never `transition: all` on a slot — the measurement reads the box back.**
    `applyPlanSlotWidth()` writes `--plan-slot-w` and then, in the same task,
    reads `scrollHeight` to check the rows fit. A transition on the derived
    `max-width` makes that read return the layout at the *previous* card size for
    the next 0.22s, so the verify pass sees phantom overflow. It cost eight
    stolen pixels: switching 4-3-3 (116px) to any five-row shape (109px) left the
    pitch mid-shrink and therefore too tall, the loop spent all 8 of its steps
    and stuck at 101px until the next formation change — while a *growing* write,
    or rewriting the same value, measured clean. That is what made "change the
    formation twice" look like a fix and made the bug look like a stale
    measurement. Measured directly: under `transition: all`, writing 116 → 60 and
    reading `.pitch-slot`'s rect in the same task still reports the 124px box;
    with an explicit colour-only list it reports 70px. `.pick-slot` on the room's
    board runs the same measure-then-verify routine and has never shown this,
    because its transition has always been `background, border-color`. Keep every
    slot rule's list explicit and free of layout properties.
  - The 82 px fallback still applies on the **bench**, which has no measurement:
    `.plan-mid-col` is a fixed 200 px, so 2 × 82 + gap is already as wide as it
    goes.
  - **An empty box names the position it is waiting for** — `.pitch-slot-plus` +
    `.pitch-slot-pos-label` inside `.pitch-slot-placeholder` (CB, DMF, LWF …, and
    SUB on the bench), the same as the pick board. The text comes from the slot
    itself: `getFormationLayout` in `shared/players/formations.js` carries a
    `pos` per slot, which replaced the four `PITCH_ROW_LABELS` strings when
    formations stopped being four generic lines. The bench prints a smaller size
    because its boxes stay at the 82 px fallback.
  - **`.plan-detail-cols.is-placing`** turns every empty box solid green while a
    squad player is chosen in the picker — the mirror of `.is-placing
    .pick-slot--empty` on the pick board, and for the same reason: without it the
    second half of the click pair has to be guessed at. It sits on
    `.plan-detail-cols` because the pitch and the bench are separate columns
    under it and both are targets.
  - **The empty box's four states are mirrored on the room's pick board**, and
    a table of both is in `room/css.md`. The one to preserve here is
    **chosen + hover**: `.pitch-slot.empty:hover .pitch-slot-placeholder` is
    (0,4,0) against `.pitch-slot.active …`'s (0,3,0), so hover takes the border
    while the `box-shadow` glow — which the hover rule does not set — stays on.
    That is the behaviour the pick board was matched to. `selectPlanSlot`
    toggling `active` **in place** rather than re-rendering the slots is the
    other half of it: the box under the cursor never stops being hovered, so
    the change is one step.
  - `.pitch-remove-btn` is hover-revealed, with an `@media (hover: none)` block that
    keeps it visible — without it a player can never be removed on touch.
  - The hover info panel is **not** in this sheet — it is
    `css/shared/playerHoverCard.css`, shared with the room page. See "The player
    hover panel" below.
  - **The formation dropdown is the pick board's control in green.**
    `.plan-formation-trigger` / `.plan-formation-panel` / `.plan-formation-option`
    are kept identical to `.pick-formation-btn` / `-panel` / its buttons in
    `css/features/draft/pick.css` — same padding, radius, font, the same
    `content: "✓"` tick on `::after`, the same `#` prefix in the trigger. Verified
    by diffing 50 computed properties plus the rendered panel width across the two
    pages. If you change one, change the other — with **three** exceptions, each
    for a reason local to its page:
    - the accent hue (green here, cyan there);
    - this one keeps an open/close transition the pick panel does not have;
    - **this one anchors `right: 0`, the pick panel `left: 0`.** The trigger sits
      at the right end of the STARTING XI header, inside two `overflow: hidden`
      ancestors (`.plan-xi-section`, `.plan-left-col`) — a clip no `z-index` wins
      against. Left-anchored, the shrink-to-fit panel hung 9 px past that edge and
      lost its right side, which reads on screen as the bench column covering it.
      Three-digit formation names fitted; `4-2-3-1` and its siblings are ~20 px
      wider and did not. Right-anchored it clears the edge by 14 px at 1440 /
      1280 / 1024 px. The pick board's trigger is at the *left* of a wide column
      with 365 px of slack, so it stays as it is.
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
  - **Stacked, `.plan-pitch` declares `aspect-ratio: 3 / 4`** — without it the
    pitch measured itself. The column is auto-height below 900 px, so the panel
    took its height from the rows and `applyPlanSlotWidth()` then divided that
    height by the row count to size those rows. Four rows settled at 74 px cards;
    five re-entered the loop and settled at **38**, on a pitch with 200 px of
    unused width beside it. A declared shape gives the measurement a fixed box,
    and 3:4 is roughly a pitch: five-row formations now measure 104 px at 900 px
    wide, 89 at 620, 68 at 480, 51 at 390 and 38 at 320, none of them cropped.
  - **`.pitch-row` keeps `flex: 1` when stacked**, exactly as side by side. It
    was `flex: 0 0 auto` for as long as the pitch was auto-height — rows had to
    size themselves or there was no height at all — which left them packed
    against `flex-start`: the squad hugged the top of the field and every spare
    pixel piled up under the goalkeeper. Measured at 390 px: 19 px of turf above
    the front line against 32 px below the keeper, and **140 px** below him in
    5-3-2, whose narrower cards make every row shorter. With the `aspect-ratio`
    above supplying a real height the rows share it evenly again — headroom and
    footroom now match within 2 px for all fifteen formations at 480 / 390 /
    320 px. The room's pick pitch never had this: `.pick-pitch-rows` distributes
    with `justify-content: space-evenly`, which is symmetric by construction
    (measured 7/7 px at every width).
  - **≤600 px**: the modal goes full-bleed (`100vw` / `100dvh`, overlay padding 0) and
    pitch cards cap at 72 px.

## The player hover panel (`shared/playerHoverCard.css`)

`.player-hover-card` / `.player-hover-name` / `.player-hover-detail` — the info
panel that floats beside a player card on hover, on **both** pages (My Players,
the game-plan pitch and bench, the ban grid, the pick pool and the pick lineup).
`home.html` and `room.html` both link it; `shared/ui/playerHoverCard.js` owns the
behaviour.

Because it is shared it may only use tokens **both** pages declare —
`--surface-popover`, `--border`, `--text`, `--text-dim` — and it styles the
`.pmeta-*` rows itself rather than inheriting them, since the two pages define
those at different scopes. `--surface-popover` was added to `home/base.css` for
this; it sits beside `--bg-card-solid` and means something different: sticky
surfaces scroll with their content, this one hangs over it.

Three properties are load-bearing:

- **`position: fixed`** on `<body>` — no grid, pitch or bench scroller can clip it.
- **`pointer-events: none`** — under the cursor it would take the hover that
  opened it, and flicker.
- **opaque** `--surface-popover` — it covers live content, and a translucent
  panel over a pitch is the same unreadable mess the room's formation dropdown was.

`z-index: 315` puts it over `.plan-detail-overlay` (310) and under
`.plan-formation-panel` (520).

> **Colour system note.** This file predates the efhub re-skin. The token *names* below
> are current, but the reasoning often says "green", "cyan" or "glow" — those hues and
> that glow are gone. Green meant "you" and cyan meant "the opponent"; both are greyscale
> now, and the only accent left on this page is the turn clock and the pick slot waiting
> on you. Read `DESIGN.md` §3 and §12 for what replaced what; treat colour claims here as
> history and the structural claims as current.
