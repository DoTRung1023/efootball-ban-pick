---
paths:
  - "public/room.html"
  - "public/js/room.js"
  - "public/js/room/**/*.js"
---

# Room page module map

`room.html` + `public/js/room.js` — entry point for the room page; imports all
sub-modules and wires up callbacks. Keeps: draft timer, stage advancement,
`applyLocalAction`, `submitBan`, `submitPick`, `renderDraftUi`, `showDone`,
`showOpponentLeft` (5-second countdown to home when opponent leaves during draft),
`showRoomClosed` (10-second countdown to home when room closes), `initDraftControls`,
and all side-panel / formation rendering.

- `callbacks.js` — shared mutable callback registry (`cb`) that breaks circular imports
  between sub-modules. Sub-modules call `cb.renderDraftUi()` etc.; `room.js` sets the
  real implementations after defining them. Registered callbacks: `renderDraftUi`,
  `renderLobby`, `tryEnterDraftFromRoomSnapshot`, `isBothMatchReady`, `showDone`,
  `showRoomClosed`, `startDraftFromLobby`, `onOpponentLeft`.
- `state.js` — `state` singleton (includes `stagedBans[]`, `opponentStagedBans[]`,
  `banFilterRegion[]`, `pickPosTab`, `pickManualFormation`, `mySquadPlayers[]`,
  `mySquadLoading`), `defaultRoomConfig`, `applyPresenceSnapshot` (reads `bansConfirmed`
  and opponent's `stagedBans` from each snapshot), `buildTurnSchedule`, and all
  room-config normalisation helpers.
- `utils.js` — `escapeHtml`, `showToast`, `askConfirm`, `showView`,
  `getRoomCodeFromUrl`, `getUser`, `getAnonId`, `getCurrentIdentity`.
- `players.js` — pure player-data helpers: `normalizeApiPlayer`,
  `normalizeMySquadPlayerForDraft`, `normalizeDraftPlayer`, `miniCardHtml`,
  `playerDetailTooltipText`, formation/slot utilities.
- `ban.js` — ban phase logic: `getBanListPlayers`, `getPickListPlayers`,
  `renderBanToolbar`, `bindBanPhaseUiOnce`, `attachMiniCardGridHandlers`,
  `fetchFilterOptions`, `imageOnlyThumbHtml`, `stagedBanThumbHtml`,
  `opponentStagedBanThumbHtml`. All render calls go through `cb.renderDraftUi()`.
- `pick.js` — pick phase logic: `renderPickToolbar`, `renderPickPosTabs`,
  `bindPickPhaseUiOnce`, `fetchPlayers` (loads the user's own squad from
  `/api/my-players`), `loadDraftPlayers`. Position tabs (ALL/GK/DEF/MID/ATT) set
  `state.pickPosTab` and `state.pickFilterPosition`; tab groups are defined in the
  module-level `PICK_TAB_GROUPS` map.
- `lobby.js` — full lobby: `renderLobby`, `initLobby`, config push, club autocomplete,
  lobby chat. Sets `cb.renderLobby = renderLobby` during module init.
- `presence.js` — presence polling: `registerPresence`, `fetchRoomSnapshot`,
  `leavePresence`, `pollPresence`, `registerAndPollPresence`, `stopPresencePolling`.
- `allowance.js` — all allowance/cap logic (position caps, card type caps, range
  checks); the server normalizes the same data independently.
- `constants.js` — canonical lists: `POSITION_OPTIONS`, `CARD_TYPE_OPTIONS`,
  `REGION_OPTIONS`, etc.

<!-- Note: an in-progress refactor has added further modules under public/js/room/
     (api.js, banView.js, draftActions.js, draftControls.js, draftFlow.js,
     draftSession.js, draftView.js, exitScreens.js, gamePlans.js, pickView.js,
     readyView.js, stageTabs.js) that are not yet described here. -->