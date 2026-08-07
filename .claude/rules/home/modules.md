---
paths:
  - "public/home.html"
  - "public/js/home.js"
  - "public/js/home/**/*.js"
---

# Home page modules (`public/js/home/`)

`home.html` + `public/js/home.js` — main app entry point (`type="module"`); an ESM boot
file that imports from `public/js/home/` sub-modules and owns `initTabs` (nav tabs ↔
tab panels), the page's only piece of chrome.

`utils.js` is **gone**. It was the grab-bag every home module imported from; the nav
account menu and edit-profile modal moved to `@/features/auth/`, and everything more
than one feature needed moved to `public/js/shared/`, imported from there directly:

  - `@/features/auth/index.js` — `initUserMenu`, `initEditProfile` (plus
    `openEditProfile`, `closeEditProfile`, `clearEpErrors`).
  - `@/shared/lib/session.js` — `getUser`, `requireAuth` (the room bundle shares this
    one; `room/utils.js` re-exports `getUser` so room modules keep their existing import).
  - `@/shared/ui/toast.js` — `showToast`. The room page keeps its **own** `showToast` in
    `room/utils.js`: different variant classes (`toast--warn`) and a different duration,
    so the two are deliberately not merged.
  - `@/shared/ui/confirm.js` — `showConfirm`, `_closeConfirm`.
  - `@/shared/ui/dropdown.js` — `openDdPanel`, `closeDdPanel`, `toggleDdPanel`.
  - `@/shared/players/positions.js` — `posClass`, `POSITION_LINE_ORDER`,
    `positionLineRank`, `POS_DEF` / `POS_MID` / `POS_FWD`.
  - `@/shared/players/sort.js` — `SORT_CATEGORIES` (moved out of `catalog.js`) plus the
    comparators `tiebreakOverallDescThenName`, `ovrMaxForSort`,
    `tiebreakPositionLineThenName`, `compareByPositionLine`.
  - `@/shared/players/ovr.js` — `hasFullOvrPair`, `ovrPairInnerHtml`.
  - `@/shared/players/playerMeta.js` — `escapeHtml`, `CARD_IMG`, `ANON_PLAYER_IMG`,
    `makePlayerImg`, `playerDetailSublineHtml`, `playerDetailTooltipText`.
  - `@/shared/players/constants.js` — `PAGE_SIZE`.
- `callbacks.js` — shared mutable callback registry (identical pattern to
  `room/callbacks.js`). Squad sets `getSquadPlayers`, `addToSquadState`,
  `removeFromSquadState`, `renderSquad`; catalog sets `openPlayerPopup`,
  `openAddPlayerModal`, `onPlayersDeleted`; rooms sets `refreshRoomsStats` (called by
  `plans.js` after plan create/delete and by `squad.js` + `catalog.js` after player
  add/delete so the Rooms tab stats auto-refresh without a page reload).
- `squad.js` — My Players tab: player grid, search/sort/filter, select mode, single +
  bulk delete, card click → popup via `cb.openPlayerPopup`. Exports `loadSquad`,
  `initSquadSearchSortFilter`, `initSquadControls`.
- `@/shared/players/filterPanel.js` — **the** player filter dropdown, used by all three
  toolbars (it lives under `shared/` because squad, catalog and plans all import it).
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
  dropdowns, add/remove player. Exports `openAddPlayerModal`, `initAddPlayerModal`,
  `initPlayerPopup` — and nothing else. It used to re-export `SORT_CATEGORIES` and the
  `filterPanel.js` option helpers on behalf of `squad.js` / `plans.js`; both now import
  those from `@/shared/players/`, so do not re-add a shim here.
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