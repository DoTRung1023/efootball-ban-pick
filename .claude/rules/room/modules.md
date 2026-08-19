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
| (root) | what every phase needs: `state`, `api`, `callbacks`, `constants`, `players`, `gamePlans`, `utils`, `playerQuery`, `playerFilters`, `playerCards`, `filterOptions`, `sortPanel`, `errorView`, `chat` |
| `engine/` | what the draft *does*: `draftFlow` (turn schedule, timers), `draftActions` (server writes), `draftSession` (join / enter), `presence` (the heartbeat) |
| `shell/` | the frame around whichever phase is live: `draftView`, `draftControls`, `stageTabs`, `exitScreens`, `leaveGuard` |
| `lobby/` `ban/` `pick/` `ready/` | one folder per phase |

Imports inside a folder stay relative (`./state.js`); anything crossing a folder uses
`@/features/draft/…`.

## Cross-module wiring

- `callbacks.js` — mutable callback registry (`cb`). A module that needs to call
  "upward" into a module that already imports it goes through `cb` instead of a direct
  import, which keeps the module graph acyclic. `room.js` installs the real
  implementations on boot; until then every entry is a no-op. Keys: `renderDraftUi`,
  `renderLobby`, `tryEnterDraftFromRoomSnapshot`, `isBothMatchReady`, `enterMatchLive`,
  `onRematchAccepted`, `showRoomClosed`, `startDraftFromLobby`, `updateStageTabs`,
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
- `utils.js` — `escapeHtml`, `showToast`, `announce`, `askConfirm`, `showView`,
  `getRoomCodeFromUrl`, `getUser`, `getAnonId`, `getCurrentIdentity`.
  `escapeHtml` is re-exported from `shared/players/playerMeta.js`; `showToast` is **not**
  shared — the room toast is a different component from the home one (it uses a
  `toast--warn` modifier and a 2.4 s timeout, vs `toast show ${type}` at 3.5 s).
  **`announce` is the same toast held for 6 s**, and the choice between the two is
  about who caused the message, not how important it is. `showToast` answers
  something the user just did, and they are already looking at it. `announce`
  reports something that happened *to* them — the opponent leaving, an unhandled
  rejection — which arrives unbidden, often while a whole view is being swapped
  out underneath, so the reading clock does not start until they notice the
  screen changed. A reply that lingers is noise; an announcement that flashes is
  simply missed.
- `constants.js` — canonical lists: `POSITION_OPTIONS`, `CARD_TYPE_OPTIONS`,
  `REGION_OPTIONS`, etc. **They hold the catalog's own strings** — `FOOT_OPTIONS`
  is `["Left foot", "Right foot"]`, not `["Left", "Right"]`, because every
  consumer compares them to `players_catalog.foot` by equality. The option arrays are **mutable** and are filled at runtime by
  `fetchFilterOptions()`; update with `.length = 0` + `push()`, never reassign.
  `FORMATION_LAYOUTS` / `DEFAULT_FORMATION` are re-exported from
  `@/shared/players/formations.js` — the home page's game-plan pitch renders the same
  table, so there is one copy for both. A layout is `Row[]`, a row `[{ slot, pos }]`
  front to back; four or five rows depending on the formation.
- `playerFilters.js` — the 18-field filter panel, shared by the ban and pick
  boards and parameterised by a `"ban"` / `"pick"` prefix: `createDraftFilterState`,
  `applyDraftFilters`, `renderDraftFilterPanel`, `bindDraftFilterPanel`,
  `resetDraftFilters`, `hasActiveDraftFilters`, plus `toValidPosition`. It is a
  **leaf**: `state` is passed in rather than imported (state.js spreads
  `createDraftFilterState()` into its own literal), and `escapeHtml` comes from
  `shared/players/playerMeta.js` because `utils.js` imports `state`. See
  `ban-phase.md` for the field tables, and for why `renderDraftFilterPanel`
  writes the panel once and never rebuilds it — on a board that re-renders twice
  a second, a rebuilt panel makes every control inside it unusable.
- `sortPanel.js` — `sortCategoryLabel(key)` and `renderSortPanel(panel, activeKey,
  dataAttr)`. Ban and pick both call it; only the `data-` attribute differs. The
  categories come from **`@/shared/players/sort.js`**, the same `SORT_CATEGORIES` behind
  My Players, the Game Plans picker and Add Player — the room kept its own copy until the
  copies drifted into two different orders (the room had Club and Nationality fourth and
  fifth, everywhere else they came last; both have since been dropped from the UI).
  `normalizeSortValue` in `playerQuery.js` derives
  its accepted values from that table too, so a category cannot be offered and then
  rejected. Labels are spelled out in full on both boards; the pick button used to
  abbreviate them for width it turns out to have.
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
  `stopPresencePolling`, `clearRoomPhaseCache`, `opponentLiveness`. `registerPresence`
  and `fetchRoomSnapshot` are the single-shot calls behind `registerAndPollPresence` and
  are module-private, as is the `visibilitychange` binding that polls on return to the
  tab. `opponentLiveness` is the one place the connected / away / reconnecting / gone
  thresholds live — every badge reads it rather than testing `lastSeenAt` itself. See
  `presence-and-reconnect.md`.

## Rendering

- `draftView.js` — `renderDraftUi()`, the orchestrator called on every presence poll. It
  picks which board is visible and delegates; each board guards its own DOM writes.
  Also `attachDraftGridHandlers()` and `enterMatchLive()`, the one-way move into the
  match-live stage of Start Match — it changes `state.phase`, not the view, because
  there is no screen after Start Match. `RENDERED_PHASES` is why it renders at all in
  the `done` phase.
- `chat.js` — the floating chat dock: `initRoomChat()` binds it once on boot,
  `renderRoomChat()` repaints it. **It is not a phase module.** `#roomChat` sits outside
  every `.view`, so one panel and one scroll position serve the lobby, both draft boards
  and Start Match — it was the lobby's right-hand column, which meant the players lost
  their only channel the moment the draft began. Two callers, both deliberate:
  `pollPresence` (ahead of its per-phase branches, each of which returns) and `showView`
  (the exit screens are not rooms, and polling has usually stopped by the time one
  appears). The unread count lives in the module, not in `state` — nothing else reads it.
  `initDockDrag()` makes the dock draggable from the launcher or the panel header (the
  close button opts out): pointer events with capture, a **4px threshold** below which the
  gesture is still a click, and a one-shot `suppressClick` so the click that ends a drag
  does not toggle the panel. The position is the launcher's viewport top-left, clamped 8px
  inside the edges (again on `resize`, or a smaller window would strand it), and saved to
  **`sessionStorage`** under `efb_chat_dock`. Session, not local, and not keyed by room:
  it belongs to the window. localStorage is shared by every tab on the origin, so dragging
  the bubble in the host's window opened the guest's window — the second window of the
  same browser, which is how a pair actually tests a room — with the bubble already parked
  mid-page instead of in its default corner. `storedDockPos()` deletes the old localStorage
  key on the way past, so a position saved by the earlier build cannot haunt a new window.
- `banView.js` — `renderBanBoard()`: toolbar, both ban strips, identity badges, grid.
  The grid drops the cards you have already banned rather than greying them; see
  `ban-phase.md`.
- `pickView.js` — `renderPickBoard()`: quick-load bar, squad-pool grid, formation pitch,
  live opponent feed. The pool holds only cards you can act on — banned and
  picked are filtered out, not dimmed. See `pick-phase.md`.
- `ready/readyView.js` — `renderReadyBoard()`: the whole Start Match screen, all four
  stages. See `ready-phase.md`.
- `ready/matchSteps.js` — the table behind those stages: one row per handshake (READY,
  START MATCH, FINISH MATCH) carrying its room status, its `data-stage`, the field on the
  room holding each side's answer, the button label, the team-head chip and the three
  things the hint can say. `stepForStatus()` is how `readyView` and `draftControls` both
  find the open one, so neither branches on which it is. `currentMatchTip()` lives here
  too — the line under the button while the match is being played.
- `ready/postMatch.js` — `renderPostMatch()`, `bindPostMatchOnce()` and
  `onRematchAccepted()`: the ways out of a finished match, in the footer of Start
  Match's `post` stage. It is in `ready/` and not `shell/` because that footer is part
  of that screen — it lived on a separate `#viewDone` until Start Match absorbed it.
- `exitScreens.js` — `showRoomClosed`, now the **only** terminal screen. The countdown
  runs for **10 seconds** before redirecting to `/`. `showOpponentLeft` went when a
  guest leaving stopped ending the room (see `presence-and-reconnect.md`); `showDone`
  went when Start Match stopped needing a sequel.
- `stageTabs.js` — `updateStageTabs()`: ban-setting → ban → pick → start indicator.
- **Hovering a card floats the player's info** — `bindCardGridHover(containerId,
  selector, findPlayer)` in `shell/cardGrid.js`, over the shared
  `@/shared/ui/playerHoverCard.js`. It applies `normalizePlayerForFooter` so no
  caller has to remember that some rows carry `nation` rather than `nationality`,
  and `findPlayer` returning null shows nothing. Called from each phase's
  `bind*PhaseUiOnce` — **once**, because the listener is delegated and survives
  every rebuild; binding per render would stack one listener per render. Four
  containers are wired: `#banGrid` (the opponent's squad, from
  `state.opponentBanPlayers`), `#pickGrid` (your own, from `state.players`), and
  `#pickPitch` / `#pickBench` (from `state.room.picks[mySide]`, indexed by
  `data-pick-slot`).
  - **`#pickOppGrid` is deliberately not wired.** `playerCardHtml` no longer
    emits a `title`, and that is the point: a `title` was unconditional, so under
    the `blur` reveal mode the opponent's blurred, `aria-hidden` cards still
    printed their names in full on hover. Grids opt in now; that one does not.
- `gamePlans.js` — `loadDraftGamePlans` (fetches the list and selects **nothing**;
  the pick board starts from scratch), `loadGamePlanIntoPicks` (LOAD GAME PLAN: formation + players, minus banned),
  `getPickFormation` (now `state.pickManualFormation` alone — see `pick-phase.md`),
  `getSelectedPlan`.
- `draftControls.js` — `initDraftControls()`, all draft-view event wiring. It
  also installs `leaveGuard`.
- `leaveGuard.js` — `initLeaveGuard()` + `allowLeave()`: two guards for an exit
  that never touched a Leave button — `beforeunload` (browser dialog, every
  exit) and a History-API trap on **back** (styled `askConfirm`). Detailed in
  `presence-and-reconnect.md`, because what makes them worth having is that
  nothing else reclaims the seat.
- `ban/` — the ban phase, split across `banView.js`, `banToolbar.js`,
  `banInteractions.js` and `opponentSquad.js`. The parts every phase uses moved to the
  draft root: `playerQuery.js` (list query + sort), `playerCards.js` (card and thumb
  markup) and `filterOptions.js`. `shell/cardGrid.js` holds
  `attachMiniCardGridHandlers`, `bindGridInfoToggle` (SHOW INFO / HIDE INFO),
  `bindCardGridHover` **and** `renderPoolCount`, all four of which serve ban and
  pick. `renderPoolCount` writes the `23 of 35 · 2 picked · 10 over limit` line
  above each grid — both grids filter rather than grey, so it is the only thing
  that says a card was taken out and why. `bindGridInfoToggle` is called from
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
    `bindLobbyExit`. Add new wiring as another `bind*` function, not as more
    statements inside `initLobby`. Each is module-level and closes over nothing but
    module state, so they can be read in isolation.
- `lobby/config.js` — `scheduleLobbyConfigPush`. `pushLobbyConfig` is the writer behind
  the scheduler and is module-private. The payload — ban count, both durations, the
  reveal mode — is read from the DOM, not from `state.room.config`, so in-flight typing
  survives a presence poll; writes are debounced and sequence-numbered, and stale
  responses are dropped.
