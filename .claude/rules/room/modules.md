---
paths:
  - "public/room.html"
  - "public/js/room.js"
  - "public/js/room/**/*.js"
---

# Room page module map

`room.html` + `public/js/room.js` — entry point. `room.js` is ~83 lines: it installs the
global error handlers, wires the `cb` registry, and boots the lobby on
`DOMContentLoaded`. All behaviour lives in `public/js/room/`.

## Cross-module wiring

- `callbacks.js` — mutable callback registry (`cb`). A module that needs to call
  "upward" into a module that already imports it goes through `cb` instead of a direct
  import, which keeps the module graph acyclic. `room.js` installs the real
  implementations on boot; until then every entry is a no-op. Keys: `renderDraftUi`,
  `renderLobby`, `tryEnterDraftFromRoomSnapshot`, `isBothMatchReady`, `showDone`,
  `showRoomClosed`, `onOpponentLeft`, `startDraftFromLobby`, `updateStageTabs`,
  `flushAndSubmitStagedBans`.
- `api.js` — `postRoomAction(action, body, code)` / `postAsMe(action, body)` (fills in
  `requesterId`) / `getJson(url)`. All resolve; none throw.

## Shared data

- `state.js` — `state` singleton (includes `stagedBans[]`, `opponentStagedBans[]`,
  `banFilterRegion[]`, `pickPosTab`, `pickManualFormation`, `mySquadPlayers[]`,
  `mySquadLoading`), `defaultRoomConfig`, `applyPresenceSnapshot` (reads `bansConfirmed`
  and the opponent's `stagedBans` from each snapshot), `buildTurnSchedule`, and the
  room-config normalisation helpers.
- `utils.js` — `escapeHtml`, `showToast`, `askConfirm`, `showView`,
  `getRoomCodeFromUrl`, `getUser`, `getAnonId`, `getCurrentIdentity`.
- `constants.js` — canonical lists: `POSITION_OPTIONS`, `CARD_TYPE_OPTIONS`,
  `REGION_OPTIONS`, `FORMATION_LAYOUTS`, etc. The option arrays are **mutable** and are
  filled at runtime by `fetchFilterOptions()`; update with `.length = 0` + `push()`,
  never reassign.
- `players.js` — pure player-data helpers: `normalizeApiPlayer`,
  `normalizeMySquadPlayerForDraft`, `normalizeDraftPlayer`, `miniCardHtml`,
  `getPlayerCardValue`, `getPlayerImageSrc`, formation/slot utilities
  (`getFormationLayout`, `buildOrderedSlotMap`).
- `allowance.js` — allowance/cap logic (position caps, card-type caps, range checks).
  The server normalises the same data independently in `src/rooms/config.js`.

## Draft flow

- `draftFlow.js` — the stage machine: `getDraftStage`, `advanceDraftStage`,
  `maybeAutoAdvanceFromBan`, `ensureDraftTimer`, `startTurnTimer` / `clearTurnTimer`,
  `applyLocalAction` (optimistic local ban/pick, returns false when disallowed),
  `isReadyPhase`, `banLimit` / `pickLimit`, `beginPostDraftReadyPhase`,
  `isBothMatchReady`.
- `draftActions.js` — user actions: `submitBan` (stages only), `confirmStagedBans`,
  `flushStagedBansLocally`, `submitBansToApi`, `callBanConfirm`,
  `flushAndSubmitStagedBans` (timer-expiry path), `submitPick`, `setGuestReady`,
  `setMatchReady`. `submitPick` returns early when `applyLocalAction` rejects the pick,
  so a cap violation is never posted.
- `draftSession.js` — `tryEnterDraftFromRoomSnapshot` (lobby → draft transition, writes
  the `sessionStorage` phase cache) and `startDraftFromLobby` (host START; for the guest
  it toggles their ready flag).
- `presence.js` — polling: `registerPresence`, `fetchRoomSnapshot`, `leavePresence`,
  `pollPresence`, `registerAndPollPresence`, `stopPresencePolling`,
  `clearRoomPhaseCache`.

## Rendering

- `draftView.js` — `renderDraftUi()`, the orchestrator called on every presence poll. It
  picks which board is visible and delegates; each board guards its own DOM writes.
  Also `attachDraftGridHandlers()`.
- `banView.js` — `renderBanBoard()`: toolbar, both ban strips, identity badges, grid.
- `pickView.js` — `renderPickBoard()`: quick-load bar, squad-pool grid, formation pitch,
  allowance pills, live opponent feed.
- `readyView.js` — `renderReadyBoard()`: the Start Match columns and stat comparison.
- `exitScreens.js` — `showRoomClosed`, `showOpponentLeft`, `showDone`. Both countdown
  screens run for **10 seconds** before redirecting to `/`.
- `stageTabs.js` — `updateStageTabs()`: ban-setting → ban → pick → start indicator.
- `gamePlans.js` — `loadDraftGamePlans`, `loadDraftGamePlanPlayers`, `getPickFormation`
  (selected plan's formation → `state.pickManualFormation` → `DEFAULT_FORMATION`),
  `getSelectedPlan`.
- `planPreview.js` — the ban-phase "consult a plan" reference panel:
  `renderBanPlanPanel()` (plan `<select>` + collapse toggle + preview) and
  `renderSlotMapPreview()` (pitch rows 1–11 + bench 12–23). Read-only; it never affects
  the draft. Both the pitch and the panel are behind a `data-planKey` state guard.
  The pick phase does not use it — it has its own plan chips and a live pitch.
- `draftControls.js` — `initDraftControls()`, all draft-view event wiring.
- `ban.js` — ban-phase data + toolbar: `getBanListPlayers`, `getPickListPlayers`,
  `renderBanToolbar`, `bindBanPhaseUiOnce`, `attachMiniCardGridHandlers`,
  `fetchFilterOptions`, `banPlayerCardHtml`, `imageOnlyThumbHtml`,
  `stagedBanThumbHtml`, `opponentStagedBanThumbHtml`.
- `pick.js` — pick-phase data + toolbar: `renderPickToolbar`, `renderPickPosTabs`,
  `bindPickPhaseUiOnce`, `fetchPlayers` (the user's own squad from `/api/my-players`),
  `loadDraftPlayers`. Position tabs are defined in the module-level `PICK_TAB_GROUPS`.

## Lobby

- `lobby.js` — `renderLobby()` and `initLobby()` (view state + event wiring). Sets
  `cb.renderLobby = renderLobby` during module init.
- `lobby/allowanceView.js` — `renderAllowanceList()`. Card type / region / playing style
  share one multi-select shape and one cap-panel shape, both built from the
  `MULTI_SELECT_KINDS` / `CAP_KINDS` descriptor tables — add a category by adding a table
  entry, not by copying a block. Position and the text-list categories
  (club/league/nationality) have their own builders. The emitted class names and
  `data-` attributes are load-bearing: `room.css` styles them and `initLobby` delegates
  events off them.
- `lobby/chat.js` — `renderLobbyChat`, `sendLobbyChatMessage`.
- `lobby/config.js` — `pushLobbyConfig` / `scheduleLobbyConfigPush` /
  `readAllowanceFieldValue`. The payload is read from the DOM, not from
  `state.room.config`, so in-flight typing survives a presence poll; writes are debounced
  and sequence-numbered, and stale responses are dropped.
- `lobby/clubSuggest.js` — autocomplete for the text-list allowance categories:
  `scheduleClubSuggestions`, `fetchClubSuggestions`, `renderClubSuggestionPanel`,
  `addTextAllowanceValue`, `clearClubSearchState`.
