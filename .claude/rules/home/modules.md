---
paths:
  - "public/home.html"
  - "public/js/home.js"
  - "public/js/home/**/*.js"
---

# Home page modules (`public/js/home/`)

`home.html` + `public/js/home.js` — main app entry point (`type="module"`); a 23-line
ESM boot file that imports from `public/js/home/` sub-modules.

- `utils.js` — shared helpers: `getUser`, `requireAuth`, `showToast`, `showConfirm`,
  `initTabs`, `initUserMenu`, `initEditProfile`, sort helpers (`POSITION_LINE_ORDER`,
  `positionLineRank`, `tiebreakOverallDescThenName`, `ovrMaxForSort`,
  `compareByPositionLine`), DD panel helpers (`openDdPanel`, `closeDdPanel`,
  `toggleDdPanel`), player detail helpers (`playerDetailSublineHtml`,
  `playerDetailTooltipText`, `ovrPairInnerHtml`).
- `callbacks.js` — shared mutable callback registry (identical pattern to
  `room/callbacks.js`). Squad sets `getSquadPlayers`, `addToSquadState`,
  `removeFromSquadState`, `renderSquad`; catalog sets `openPlayerPopup`,
  `openAddPlayerModal`, `onPlayersDeleted`; rooms sets `refreshRoomsStats` (called by
  `plans.js` after plan create/delete and by `squad.js` + `catalog.js` after player
  add/delete so the Rooms tab stats auto-refresh without a page reload).
- `squad.js` — My Players tab: player grid, search/sort/filter, select mode, single +
  bulk delete, card click → popup via `cb.openPlayerPopup`. Exports `loadSquad`,
  `initSquadSearchSortFilter`, `initSquadControls`.
- `filterPanel.js` — **the** player filter dropdown, used by all three toolbars.
  `buildPlayerFilterPanel({ panelId, ids, state, autocomplete, onChange, onClear })`
  plus `resetPlayerFilterState`, `initAutocomplete`, `wireAttributeMultiselects`,
  `playerFilterOptionsCache` / `getPlayerFilterOptions`. It replaced three ~270-line
  near-identical builders. Each call site passes an **explicit id map** (see
  `CATALOG_FILTER_IDS` / `SQUAD_FILTER_IDS` / `PP_FILTER_IDS`) because the three id
  schemes are irregular (`fcOvrMin` / `sqfOvrMin` / `ppFcOvrMin`) and both `room.css`
  and the surrounding wiring reference them by string — never derive an id from a
  prefix. `autocomplete: false` (the plan picker) drops the club/nationality
  autocomplete wrappers. To add a filter row, edit `panelMarkup` once.
- `catalog.js` — Add Player modal and player popup: catalog list, sort/filter
  dropdowns, add/remove player. Re-exports the `filterPanel.js` option helpers, since
  `squad.js` and `plans.js` import them from here. Exports `openAddPlayerModal`,
  `initAddPlayerModal`, `initPlayerPopup`.
- `plans.js` — Game Plans tab: plan list, pitch formation view, plan picker, slot
  assignment. Exports `loadGamePlans`, `initGamePlans`.
  - `STACKED_PLAN_LAYOUT` (`max-width: 900px`) must match the plan detail modal
    breakpoint in `css/home/responsive.css`. Below it the modal's three columns stack,
    so `scrollPlanSectionIntoView` moves the sheet to the picker when a slot is selected
    and back to the pitch/bench after a player is assigned. It is a no-op on desktop.
- `rooms.js` — Rooms tab: create-room drawer + join flow. Exports `initRoomModal`,
  `initRoomHub`, `loadRoomsStats`.
  - `goToRoom` is **async** — for `mode: "join"` it calls `GET /api/rooms/:code` first;
    if `room.host` is null (room not found) it shows an error toast and stops
    navigation, preventing users from entering a non-existent room.
  - `initRoomModal` opens/closes the right-side drawer (`#roomOverlay`); when opening it
    measures the scrollbar width and adds matching `padding-right` to the body so the
    background does not shift.
  - `initRoomHub` wires: code input normalisation, `#pasteCodeBtn` (clipboard paste,
    URL-aware), `#joinRoomLink` (invite-link input).
  - `loadRoomsStats(userId)` stores `_statsUserId` and registers
    `cb.refreshRoomsStats = () => loadRoomsStats(_statsUserId)` so stats auto-refresh
    when plans or players change elsewhere.