---
paths:
  - "public/home.html"
  - "public/js/pages/home.js"
  - "public/js/pages/home/**/*.js"
  - "public/js/features/squad/**/*.js"
  - "public/js/features/catalog/**/*.js"
  - "public/js/features/gamePlans/**/*.js"
  - "public/js/features/rooms/**/*.js"
---

# Home page modules

`home.html` + `public/js/pages/home.js` — main app entry point (`type="module"`); an ESM
boot file that imports the home features (`squad`, `catalog`, `gamePlans`, `rooms`)
through their barrels and owns `initTabs` (nav tabs ↔ tab panels), the page's only piece
of chrome.

`utils.js` is **gone**. It was the grab-bag every home module imported from; the nav
account menu and edit-profile modal moved to `@/features/auth/`, and everything more
than one feature needed moved to `public/js/shared/`, imported from there directly:

  - `@/features/auth/index.js` — `initUserMenu`, `initEditProfile` (plus
    `openEditProfile`, `closeEditProfile`, `clearEpErrors`).
  - `@/shared/lib/session.js` — `getUser`, `requireAuth` (the room bundle shares this
    one; `features/draft/utils.js` re-exports `getUser` so room modules keep their existing import).
  - `@/shared/ui/toast.js` — `showToast`. The room page keeps its **own** `showToast` in
    `features/draft/utils.js`: different variant classes (`toast--warn`) and different
    durations (2.4 s, or 6 s via its `announce`), so the two are deliberately not merged.
    The home page has no `announce` because it has no unprompted messages — every toast
    here answers something the user just clicked.
  - `@/shared/ui/confirm.js` — `showConfirm`. Used by game plans (delete a plan) and by
    squad (bulk delete). Its close/resolve internals are module-private.
  - `@/shared/ui/dropdown.js` — `closeDdPanel`, `toggleDdPanel`.
  - `@/shared/ui/playerHoverCard.js` — the floating player-info panel:
    `showPlayerHoverCard`, `hidePlayerHoverCard`, `bindPlayerHoverCard` (an
    element you hold) and `bindPlayerHoverCardGrid` (a container written with
    `innerHTML` — **bind once**, the listener is delegated). One panel element
    per page, created on first use. Both bundles use it; the room side goes
    through `bindCardGridHover` in `features/draft/shell/cardGrid.js`.
    - It **replaced the native `title`** on every player card. Beyond the ~1s
      delay and the unstyleable OS chrome, a `title` is unconditional: the pick
      board's `blur` reveal mode blurs the opponent's cards and sets
      `aria-hidden`, and the tooltip still printed their names in full — the
      exact thing the setting withholds. Grids now opt in, and the opponent's
      does not. `playerDetailTooltipText` went with it; nothing called it.
    - Hiding is driven by a **`mousemove` guard**, not `mouseleave`. Both
      bundles rebuild grids under the cursor (the ban grid on every staged ban,
      the room boards on a presence poll) and an element replaced while hovered
      never fires `mouseleave`.
    - **The panel waits `SHOW_DELAY_MS` (500 ms) before appearing.** Without it,
      it fired on every card the pointer crossed — in a grid of 40 that is most
      of them, flashing across the screen on the way somewhere else. Four things
      the delay changed, each measured:
      - the `mousemove` guard is armed when the **countdown starts**, not when
        the panel appears. Armed on appearance, a pointer that swept off
        mid-delay would leave nothing to cancel the timer and the panel would
        open half a second later over wherever the pointer had got to;
      - `hidePlayerHoverCard()` cancels a pending reveal as well as hiding a
        visible one — it is called from render paths, so it must stop a
        countdown aimed at a card that is about to be replaced;
      - `showPlayerHoverCard` returns early when `anchor === anchorEl`, so
        moving *within* a card does not restart the countdown (native `title`
        behaves the same). Moving to a **different** card does restart it;
      - the timer re-checks `anchorEl.isConnected` before painting, for the grid
        that rebuilt during the delay.
  - `@/shared/players/positions.js` — `posClass` and `positionLineRank`. The bucket
    arrays and `POSITION_LINE_ORDER` back those two and are module-private; `sort.js`
    (also under `shared/`) is the other consumer, which is why this module stays shared
    even though only catalog imports it directly.
  - `@/shared/players/sort.js` — `SORT_CATEGORIES` (moved out of `catalog.js`) plus the
    comparators `tiebreakOverallDescThenName`, `ovrMaxForSort`,
    `tiebreakPositionLineThenName`, `compareByPositionLine`. **The room imports
    `SORT_CATEGORIES` too** (`features/draft/sortPanel.js`), so this one table is what
    every sort dropdown in the app is built from — My Players, Add Player, the plan
    picker, ban and pick, all seven categories in one order. Changing it changes all five.
  - `@/shared/players/playerMeta.js` — `escapeHtml`, `CARD_IMG`, `ANON_PLAYER_IMG`,
    `makePlayerImg`, `playerDetailSublineHtml`. There is no plain-text variant:
    `playerDetailTooltipText` existed for card `title` tooltips and every one of
    those is now the styled panel, which renders the same rows as markup.
- `callbacks.js` — shared mutable callback registry (identical pattern to
  `features/draft/callbacks.js`). Squad sets `getSquadPlayers`, `addToSquadState`,
  `removeFromSquadState`, `renderSquad`; catalog sets `openPlayerPopup`,
  `openAddPlayerModal`, `onPlayersDeleted`. Rooms sets nothing — it used to register
  `refreshRoomsStats`, which squad/catalog/plans called after every mutation; see
  `rooms.js` below for why that went.
- `squad.js` — My Players tab: player grid, search/sort/filter, select mode, single +
  bulk delete, card click → popup via `cb.openPlayerPopup`. Exports `loadSquad`,
  `initSquadSearchSortFilter`, `initSquadControls`.
  Cards carry **no `title`**: hovering one floats the shared panel
  (`@/shared/ui/playerHoverCard.js`) with the same four metadata lines the
  footer prints, so they are readable with SHOW INFO off.
  **Bulk delete confirms, the per-card × does not** — one click on DELETE SELECTED can
  remove any number of players and there is no undo, whereas the × removes exactly the
  card it sits on. Neither confirmed until an audit found `showConfirm` imported here
  and never called.
- `@/shared/players/filterPanel.js` — **the** player filter dropdown, used by all three
  toolbars (it lives under `shared/` because squad, catalog and plans all import it).
  `buildPlayerFilterPanel({ panelId, ids, state, autocomplete, onChange, onClear })`
  plus `createPlayerFilterState`, `resetPlayerFilterState` and `getPlayerFilterOptions`.
  It replaced three ~270-line near-identical builders.
  **The 18 filter fields are declared once**, in `FILTER_SETS` + `FILTER_SCALARS`.
  `createPlayerFilterState()` builds a fresh block from those lists and
  `resetPlayerFilterState(state)` clears the same ones, so the initialiser and the
  reset cannot drift; spread it into a feature's state object
  (`{ query: "", ...createPlayerFilterState() }`). All three call sites did write the
  list out by hand, and `plans.js` also hand-rolled the reset — a new filter field
  would have been added to the panel and silently never cleared there. Each call
  returns **new** `Set`s; never share one block between two state objects. Each call site passes an **explicit id map** (see
  `CATALOG_FILTER_IDS` / `SQUAD_FILTER_IDS` / `PP_FILTER_IDS`) because the three id
  schemes are irregular (`fcOvrMin` / `sqfOvrMin` / `ppFcOvrMin`) and both the CSS
  and the surrounding wiring reference them by string — never derive an id from a
  prefix. `autocomplete: false` (the plan picker) drops the club/nationality
  autocomplete wrappers. To add a filter row, edit `panelMarkup` once.
- `catalog.js` — Add Player modal and player popup: catalog list, sort/filter
  dropdowns, add/remove player. Exports `openAddPlayerModal`, `initAddPlayerModal`,
  `initPlayerPopup` — and nothing else. It used to re-export `SORT_CATEGORIES` and the
  `filterPanel.js` option helpers on behalf of `squad.js` / `plans.js`; both now import
  those from `@/shared/players/`, so do not re-add a shim here. `PAGE_SIZE` is a local
  const (rows per `/api/players` request and per "load more") — it was a one-line
  `shared/players/constants.js` whose comment claimed squad batched by the same number,
  which squad never did.
- `catalog/ovr.js` — `hasFullOvrPair`, `ovrPairInnerHtml`: the "level 1 / max" rating
  pair. Catalog-only; it sat in `shared/players/` until an audit found its second
  consumer was a dead import.
- `plans.js` — Game Plans tab: plan list, pitch formation view, plan picker, slot
  assignment. Exports `loadGamePlans`, `initGamePlans`.
  - `initFormationDropdown` emits each option as a **bare label** — no
    `.plan-formation-opt-text` span and no check SVG. The tick is `::after` on
    `.active`, as on the pick board, so the two controls share one shape.
  - `applyPlanSlotWidth()` sizes the pitch: it measures `#planPitch` and writes
    `--plan-slot-w`, the largest card at which four rows fit without overflowing,
    capped 116 px and floored 40 px. Same measure-then-verify shape as
    `applyPitchSlotWidth()` on the pick board, and the verify half matters more
    here — `.plan-pitch` is `overflow: hidden`, so an overflowing row is cropped
    silently rather than scrolled. It runs from `renderDetailSlots()`, again
    right after the overlay opens (the first render measures a closed overlay,
    which has no box), and on `resize` while the modal is open. Nothing else
    re-renders the modal on its own, unlike the room's 500 ms poll.
  - `applyPlacingState()` toggles `is-placing` on `.plan-detail-cols` from
    `gamePlans.pickerPendingPlayerId`. Called from `renderDetailSlots()` **and**
    from the picker row's click handler, which changes that flag without
    re-rendering the slots.
  - `STACKED_PLAN_LAYOUT` (`max-width: 900px`) must match the plan detail modal
    breakpoint in `css/pages/home/responsive.css`. Below it the modal's three columns stack,
    so `scrollPlanSectionIntoView` moves the sheet to the picker when a slot is selected
    and back to the pitch/bench after a player is assigned. It is a no-op on desktop.
  - **Hovering a filled pitch or bench card floats the player's info** — the
    shared panel in `@/shared/ui/playerHoverCard.js`; `bindSlotHover` is the
    two-line adapter. **The slot row cannot supply the text.**
    `/api/game-plans/:id/players` returns slot, role, name, position, overall,
    club and pesdb_id — no region, nationality, league, foot or physicals — so
    rendering it directly gives one line (the club) where there should be four;
    measured. `fullPlayerForSlot` resolves it against `cb.getSquadPlayers()` on
    `player_id`, the squad list the picker beside it is already reading. The
    room's `loadGamePlanIntoPicks` matches the same rows against its own squad
    for the same reason.
  - `hidePlayerHoverCard()` runs from `renderDetailSlots()` and
    `closePlanDetail()`. Both renders replace their slot elements outright, so a
    hovered card is detached without ever firing `mouseleave`.

- `rooms.js` — Rooms tab: create-room drawer + join flow. Exports `initRoomModal`
  and `initRoomHub`.
  - `goToRoom` is **async** — for `mode: "join"` it calls `GET /api/rooms/:code` first;
    if `room.host` is null (room not found) it shows an error toast and stops
    navigation, preventing users from entering a non-existent room.
  - `initRoomModal` opens/closes the right-side drawer (`#roomOverlay`); when opening it
    measures the scrollbar width and adds matching `padding-right` to the body so the
    background does not shift.
  - `initRoomHub` wires: code input normalisation, `#pasteCodeBtn` (clipboard paste,
    URL-aware), `#joinRoomLink` (invite-link input).
  - **There is no roster/tactics stats panel.** `loadRoomsStats` and three renderers
    (`renderCreateVisual`, `renderRosterPanel`, `renderTacticsPanel`) targeted
    `#roomsCreateVisual` / `#rosterStatBody` / `#tacticsStatBody`, which no version of
    `home.html` ever contained — the panel was started and never built. Every renderer
    returned on its `if (!body) return`, but `cb.refreshRoomsStats()` still fired from
    five call sites after each player add/delete and plan create/delete, costing two
    API round-trips (`/api/my-players` + `/api/game-plans`) each time to render nothing.
    The whole chain is gone. The only info panel on the Rooms tab is the static
    STRATEGY TIPS markup in `home.html`; if the stats panel is ever wanted, it starts
    with the markup.