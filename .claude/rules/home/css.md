---
paths:
  - "public/css/home/**/*.css"
  - "public/home.html"
---

# Home page CSS (`public/css/home/`)

Split into 8 focused files, loaded in order via `<link>` tags.

- `base.css` — `:root` variables, resets, scrollbar, body (`height: 100vh;
  overflow: hidden` — locks page-level scroll), pitch background, glow orbs, app shell
  (`height: 100vh; overflow: hidden; flex-direction: column`), `.content-scroll`
  (`flex: 1; min-height: 0; overflow-y: auto` — the scrollable area that sits below the
  topbar; the scrollbar appears at the viewport right edge below the nav), topbar.
- `player-card.css` — `.player-card`, `.pc-img-wrap`, `.pc-footer`, skeleton, empty
  state, load-more.
- `squad.css` — `.main-content` (centered container, `max-width: 1400px; margin: 0 auto`
  — no `flex: 1`, that is owned by `.content-scroll` in `base.css`), tab panels, squad
  toolbar (search bar, sort/filter, select mode, empty state).
- `plans.css` — game plans panel, plan cards, plan toolbar, plan detail modal.
- `catalog.css` — add player modal + shared sort/filter dropdown UI (`.ap-dd-btn`,
  `.ap-dd-panel`, `.filter-dd-panel`, `.pos-multiselect`, `.catalog-list`). Kept in
  visual sync with `room.css` — see the room CSS rule.
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
- `responsive.css` — cross-cutting media queries (`≤768px`, `≤480px`). Mobile fix:
  `.team-search-wrap { flex: 1 0 100% }` forces the search input to its own row so the
  FILTER button stays right-aligned and its `right: 0` dropdown panel does not overflow
  off the left screen edge.