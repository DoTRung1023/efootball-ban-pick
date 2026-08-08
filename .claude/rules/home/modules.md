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
    `features/draft/utils.js`: different variant classes (`toast--warn`) and a different duration,
    so the two are deliberately not merged.
  - `@/shared/ui/confirm.js` — `showConfirm`. Used by game plans (delete a plan) and by
    squad (bulk delete). Its close/resolve internals are module-private.
  - `@/shared/ui/dropdown.js` — `closeDdPanel`, `toggleDdPanel`.
  - `@/shared/players/positions.js` — `posClass` and `positionLineRank`. The bucket
    arrays and `POSITION_LINE_ORDER` back those two and are module-private; `sort.js`
    (also under `shared/`) is the other consumer, which is why this module stays shared
    even though only catalog imports it directly.
  - `@/shared/players/sort.js` — `SORT_CATEGORIES` (moved out of `catalog.js`) plus the
    comparators `tiebreakOverallDescThenName`, `ovrMaxForSort`,
    `tiebreakPositionLineThenName`, `compareByPositionLine`.
  - `@/shared/players/playerMeta.js` — `escapeHtml`, `CARD_IMG`, `ANON_PLAYER_IMG`,
    `makePlayerImg`, `playerDetailSublineHtml`, `playerDetailTooltipText`.
- `callbacks.js` — shared mutable callback registry (identical pattern to
  `features/draft/callbacks.js`). Squad sets `getSquadPlayers`, `addToSquadState`,
  `removeFromSquadState`, `renderSquad`; catalog sets `openPlayerPopup`,
  `openAddPlayerModal`, `onPlayersDeleted`. Rooms sets nothing — it used to register
  `refreshRoomsStats`, which squad/catalog/plans called after every mutation; see
  `rooms.js` below for why that went.
- `squad.js` — My Players tab: player grid, search/sort/filter, select mode, single +
  bulk delete, card click → popup via `cb.openPlayerPopup`. Exports `loadSquad`,
  `initSquadSearchSortFilter`, `initSquadControls`.
  **Bulk delete confirms, the per-card × does not** — one click on DELETE SELECTED can
  remove any number of players and there is no undo, whereas the × removes exactly the
  card it sits on. Neither confirmed until an audit found `showConfirm` imported here
  and never called.
- `@/shared/players/filterPanel.js` — **the** player filter dropdown, used by all three
  toolbars (it lives under `shared/` because squad, catalog and plans all import it).
  `buildPlayerFilterPanel({ panelId, ids, state, autocomplete, onChange, onClear })`
  plus `resetPlayerFilterState` and `getPlayerFilterOptions`. It replaced three ~270-line
  near-identical builders. Each call site passes an **explicit id map** (see
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
  - `STACKED_PLAN_LAYOUT` (`max-width: 900px`) must match the plan detail modal
    breakpoint in `css/pages/home/responsive.css`. Below it the modal's three columns stack,
    so `scrollPlanSectionIntoView` moves the sheet to the picker when a slot is selected
    and back to the pitch/bench after a player is assigned. It is a no-op on desktop.
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