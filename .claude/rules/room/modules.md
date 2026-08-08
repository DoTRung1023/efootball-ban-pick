---
paths:
  - "public/room.html"
  - "public/js/pages/room.js"
  - "public/js/features/draft/**/*.js"
---

# Room page module map

`room.html` + `public/js/pages/room.js` — entry point. `room.js` installs the global error
handlers, wires the `cb` registry, and boots the lobby on `DOMContentLoaded`. All
behaviour lives in `public/js/features/draft/`. The whole page is **one** feature, so
its `index.js` barrel is deliberately broad where other features' barrels are narrow.

## Folder layout

| Folder | Holds |
| --- | --- |
| (root) | what every phase needs: `state`, `api`, `callbacks`, `constants`, `players`, `gamePlans`, `allowance`, `utils`, `playerQuery`, `playerFilters`, `playerCards`, `filterOptions`, `sortPanel`, `errorView` |
| `engine/` | what the draft *does*: `draftFlow` (turn schedule, timers), `draftActions` (server writes), `draftSession` (join / enter), `presence` (the heartbeat) |
| `shell/` | the frame around whichever phase is live: `draftView`, `draftControls`, `stageTabs`, `exitScreens` |
| `lobby/` `ban/` `pick/` `ready/` | one folder per phase |

Imports inside a folder stay relative (`./state.js`); anything crossing a folder uses
`@/features/draft/…`.

## Cross-module wiring

- `callbacks.js` — mutable callback registry (`cb`). A module that needs to call
  "upward" into a module that already imports it goes through `cb` instead of a direct
  import, which keeps the module graph acyclic. `room.js` installs the real
  implementations on boot; until then every entry is a no-op. Keys: `renderDraftUi`,
  `renderLobby`, `tryEnterDraftFromRoomSnapshot`, `isBothMatchReady`, `showDone`,
  `showRoomClosed`, `startDraftFromLobby`, `updateStageTabs`,
  `flushAndSubmitStagedBans`, `confirmPicks`.
- `api.js` — `postAsMe(action, body)` (fills in `requesterId`) / `getJson(url)`. Both
  resolve; none throw. `postRoomAction(action, body, code)` backs `postAsMe` and is
  module-private — go through `postAsMe` so the identity is always attached.

## Shared data

- `state.js` — `state` singleton (includes `stagedBans[]`, `opponentStagedBans[]`,
  `banFilterRegion[]`, `pickManualFormation`, `mySquadPlayers[]`),
  `defaultRoomConfig`, `applyPresenceSnapshot` (reads `bansConfirmed`
  and the opponent's `stagedBans` from each snapshot), `buildTurnSchedule`, and the
  room-config normalisation helpers.
- `utils.js` — `escapeHtml`, `showToast`, `askConfirm`, `showView`,
  `getRoomCodeFromUrl`, `getUser`, `getAnonId`, `getCurrentIdentity`.
  `escapeHtml` is re-exported from `shared/players/playerMeta.js`; `showToast` is **not**
  shared — the room toast is a different component from the home one (it uses a
  `toast--warn` modifier and a 2.4 s timeout, vs `toast show ${type}` at 3.5 s).
- `constants.js` — canonical lists: `POSITION_OPTIONS`, `CARD_TYPE_OPTIONS`,
  `REGION_OPTIONS`, etc. The option arrays are **mutable** and are filled at runtime by
  `fetchFilterOptions()`; update with `.length = 0` + `push()`, never reassign.
  `FORMATION_LAYOUTS` / `DEFAULT_FORMATION` are re-exported from
  `@/shared/players/formations.js` — the home page's game-plan pitch renders the same
  table into the same `pitchRow*` ids, so there is one copy for both.
- `playerFilters.js` — the 18-field filter panel, shared by the ban and pick
  boards and parameterised by a `"ban"` / `"pick"` prefix: `createDraftFilterState`,
  `applyDraftFilters`, `renderDraftFilterPanel`, `bindDraftFilterPanel`,
  `resetDraftFilters`, `hasActiveDraftFilters`, plus `toValidPosition`. It is a
  **leaf**: `state` is passed in rather than imported (state.js spreads
  `createDraftFilterState()` into its own literal), and `escapeHtml` comes from
  `shared/players/playerMeta.js` because `utils.js` imports `state`. See
  `ban-phase.md` for the field tables.
- `sortPanel.js` — `DRAFT_SORT_CATEGORIES` (the nine categories, in order),
  `sortCategoryLabel(key, { short })` and `renderSortPanel(panel, activeKey, dataAttr)`.
  Ban and pick both call it; only the `data-` attribute differs, and only the collapsed
  button abbreviates. `normalizeSortValue` in `playerQuery.js` derives its accepted
  values from the same table, so a category cannot be offered and then rejected.
- `errorView.js` — `paintErrorView(...)`, the single writer for `#viewError`. It clears
  all four state modifiers on every call and sets title/icon/button explicitly, so no
  caller inherits the previous error's appearance. Used by `engine/presence.js`,
  `lobby/lobby.js` and `shell/exitScreens.js`. It sits at the root rather than in
  `shell/` because `exitScreens.js` imports `engine/presence.js`, so the other placement
  would be a cycle.
- `players.js` — pure player-data helpers, including the **slot-addressed picks**
  set: `filledPicks`, `pickCount` and `buildOrderedSlotMap`.
  `room.picks[side]` is indexed by pitch slot with `null` holes, so
  `picks.length` is the highest filled slot rather than the number of picks —
  reach for `pickCount()`. There is no `firstFreeSlot`: nothing on the client
  appends a pick any more (see `pick-phase.md`). Also: `normalizeApiPlayer`,
  `normalizeMySquadPlayerForDraft`, `normalizeDraftPlayer`,
  `getPlayerCardValue`, `getPlayerImageSrc`, formation/slot utilities
  (`getFormationLayout`, `buildOrderedSlotMap`). It also re-exports
  `makePlayerImg` / `playerDetailSublineHtml` / `playerDetailTooltipText` from
  `public/js/shared/players/playerMeta.js` — see below.
- `allowance.js` — allowance/cap logic (position caps, card-type caps, range checks).
  The server normalises the same data independently in `src/features/rooms/config.js`.

## Draft flow

- `draftFlow.js` — the stage machine: `ensureDraftTimer`, `startTurnTimer` /
  `clearTurnTimer`, `applyLocalBan` (optimistic local ban, returns false when
  disallowed), `isReadyPhase`, `banLimit` / `pickLimit`, `enterReadyPhase`,
  `isBothMatchReady`. `enterReadyPhase` replaced `beginPostDraftReadyPhase`: it
  moves **local** state only, because the server now owns the transition — see
  `pick-phase.md`. The stage helpers `getDraftStage`, `advanceDraftStage`,
  `maybeAutoAdvanceFromBan` and `getTurnDurationSec` drive the timer from inside this
  module and are private to it.
  **There is no pick equivalent of `applyLocalBan`** — it was `applyLocalAction`
  until picks stopped being optimistic; see `pick-phase.md`.
- `draftActions.js` — user actions: `submitBan` (stages only), `confirmStagedBans`,
  `unconfirmBans`, `flushAndSubmitStagedBans` (timer-expiry path), `submitPick`,
  `placePickInSlot`, `replaceMyPicks`, `confirmPicks`, `setGuestReady`,
  `setMatchReady`, plus the two read-only guards `areBansLocked` /
  `isLineupLocked`. `flushStagedBansLocally`,
  `submitBansToApi` and `callBanConfirm` are the internals of `confirmStagedBans` and
  are module-private. `submitPick` posts nothing on its own — it arms a card, and
  `placePickInSlot` (called by it or by `initSlotControls`) is what writes.
- `draftSession.js` — `tryEnterDraftFromRoomSnapshot` (lobby → draft transition, writes
  the `sessionStorage` phase cache) and `startDraftFromLobby` (host START; for the guest
  it toggles their ready flag).
- `presence.js` — polling: `leavePresence`, `pollPresence`, `registerAndPollPresence`,
  `stopPresencePolling`, `clearRoomPhaseCache`. `registerPresence` and
  `fetchRoomSnapshot` are the single-shot calls behind `registerAndPollPresence` and are
  module-private.

## Rendering

- `draftView.js` — `renderDraftUi()`, the orchestrator called on every presence poll. It
  picks which board is visible and delegates; each board guards its own DOM writes.
  Also `attachDraftGridHandlers()`.
- `banView.js` — `renderBanBoard()`: toolbar, both ban strips, identity badges, grid.
- `pickView.js` — `renderPickBoard()`: quick-load bar, squad-pool grid, formation pitch,
  allowance pills, live opponent feed.
- `readyView.js` — `renderReadyBoard()`: the Start Match columns and stat comparison.
- `exitScreens.js` — `showRoomClosed` and `showDone`, the only two terminal screens
  left. The countdown runs for **10 seconds** before redirecting to `/`.
  `showOpponentLeft` went when a guest leaving stopped ending the room — see
  `presence-and-reconnect.md`.
- `stageTabs.js` — `updateStageTabs()`: ban-setting → ban → pick → start indicator.
- `gamePlans.js` — `loadDraftGamePlans` (fetches the list and selects **nothing**;
  the pick board starts from scratch), `loadGamePlanIntoPicks` (LOAD GAME PLAN: formation + players, minus banned),
  `getPickFormation` (now `state.pickManualFormation` alone — see `pick-phase.md`),
  `getSelectedPlan`.
- `draftControls.js` — `initDraftControls()`, all draft-view event wiring.
- `ban/` — the ban phase, split across `banView.js`, `banToolbar.js`,
  `banInteractions.js` and `opponentSquad.js`. The parts every phase uses moved to the
  draft root: `playerQuery.js` (list query + sort), `playerCards.js` (card and thumb
  markup) and `filterOptions.js`. `shell/cardGrid.js` holds
  `attachMiniCardGridHandlers` **and** `bindGridInfoToggle` (SHOW INFO / HIDE
  INFO), both of which serve ban and pick. `bindGridInfoToggle` is called from
  each phase's `bind*PhaseUiOnce`, not on DOMContentLoaded: the pick grid does
  not exist until its board first renders, so a load-time lookup found nothing
  and silently did nothing. Its localStorage key is per-grid, so hiding info
  while banning does not hide it while picking. See `ban-phase.md`.
**Loading state is rendered inside the boards, not as an overlay.** The pick grid
prints "Loading your squad..." off `state.loadingPlayers` and the ban grid "Loading
opponent squad cards..." off `state.loadingOpponentBanPlayers`. There was also a
`#draftLoading` overlay element that `room.html` stopped carrying; both loaders kept
toggling its `hidden` behind a null guard, so it did nothing. Do not reintroduce an
overlay — set the flag and let the board renderer show it.

- `pick.js` — pick-phase data + toolbar: `renderPickToolbar`, `renderPickPosTabs`,
  `bindPickPhaseUiOnce`, `loadDraftPlayers`. The latter wraps the module-private
  `fetchPlayers`, which reads the user's own squad from `/api/my-players` — not the
  catalog. Position tabs are defined in the module-level `PICK_TAB_GROUPS`.

## Lobby

- `lobby.js` — `initLobby()` (view state + event wiring) is the only export.
  `renderLobby()` is module-private and reaches the rest of the app through
  `cb.renderLobby = renderLobby`, set during module init.
  - `initLobby()` is an **orchestrator only**: identity/state setup, then one call per
    concern — `bindDraftSettings(user)`, `bindRevealModeDropdown`,
    `bindAddAllowanceButton`, `bindAllowanceListClick`, `bindAllowanceListChange`,
    `bindAllowanceCategoryDropdown`, `bindAllowanceCapInputs`,
    `bindGlobalDropdownDismiss`, `bindLobbyChatAndExit`. Add new wiring as another
    `bind*` function, not as more statements inside `initLobby`. Each is module-level
    and closes over nothing but module state, so they can be read in isolation;
    `closeAllLobbyDropdowns()` is shared by the dropdown binders.
- `lobby/allowanceView.js` — `renderAllowanceList()`. Card type / region / playing style
  share one multi-select shape and one cap-panel shape, both built from the
  `MULTI_SELECT_KINDS` / `CAP_KINDS` descriptor tables — add a category by adding a table
  entry, not by copying a block. Position and the text-list categories
  (club/league/nationality) have their own builders. The emitted class names and
  `data-` attributes are load-bearing: `lobby.css` styles them and `initLobby` delegates
  events off them.
- `lobby/chat.js` — `renderLobbyChat`, `sendLobbyChatMessage`.
- `lobby/config.js` — `scheduleLobbyConfigPush` / `readAllowanceFieldValue`.
  `pushLobbyConfig` is the writer behind the scheduler and is module-private. The payload
  is read from the DOM, not from `state.room.config`, so in-flight typing survives a
  presence poll; writes are debounced and sequence-numbered, and stale responses are
  dropped.
- `lobby/clubSuggest.js` — autocomplete for the text-list allowance categories:
  `scheduleClubSuggestions`, `renderClubSuggestionPanel`, `addTextAllowanceValue`,
  `clearClubSearchState`, and `clubSuggestPanelHtml`. `fetchClubSuggestions` is the
  fetch behind the scheduler and is module-private.
  `clubSuggestPanelHtml` is the panel's contents for the current search state (loading /
  results / not-found). `allowanceView.js` calls it when it rebuilds the whole allowance
  list and this module calls it on every keystroke — the two had separate copies that had
  already drifted in indentation, and they must agree or the panel changes shape on the
  next re-render.
