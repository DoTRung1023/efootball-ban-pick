---
paths:
  - "public/js/features/draft/engine/presence.js"
  - "public/js/features/draft/state.js"
  - "public/js/pages/room.js"
  - "src/features/rooms/**/*.js"
  - "src/features/rooms/routes.js"
---

# Room state, presence and reconnect

**Room state is fully in-memory** (`roomPresence` Map in `src/features/rooms/store.js`). Room
data does not persist across server restarts. Presence TTL is **12 s in lobby** and
**30 s during an active draft** (`PRESENCE_TTL_MS` / `DRAFT_PRESENCE_TTL_MS` in
`src/features/rooms/config.js`) — clients must POST `/api/rooms/:code/presence` every ~5 s to
stay connected. The longer draft TTL gives enough headroom for a page reload without
losing draft state. Real-time sync is polling-only; WebSocket integration is not yet
implemented.

## Room security

The server rejects duplicate connections via HTTP 409:

- A second host attempt (different userId) → 409 "Room already has an active host."
- A second guest attempt (different userId) → 409 "Room already has an active guest."
- A kicked guest → 403.

The client maps these to three distinct error states (`is-host-lock`, `is-room-full`,
`is-access-denied`) in `#viewError`, each with its own CSS color theme in `shell.css`.
Write them through `paintErrorView` in `features/draft/errorView.js` — it is the single
writer for that view and clears all four modifiers before setting one, so a state cannot
leak from a previous error. Do not set the classes directly.

## Reload / reconnect behaviour (`presence.js` + `room.js`)

- When entering the draft view, `state.phase` is written to `sessionStorage` under key
  `efb_room_${code}_phase`.
- On page load, `initLobby` reads this key: if the cached phase is `"draft"` or
  `"ready"`, the lobby view is skipped entirely while the async reconnect completes
  (`registerAndPollPresence`). If the server confirms the room is still drafting,
  `tryEnterDraftFromRoomSnapshot` transitions directly to the draft view; otherwise the
  cache is cleared and the lobby is shown.
- The cache is cleared on: `leavePresence()`, `showDone()`, `showRoomClosed()`,
  `showOpponentLeft()`, and any failed reconnect.

## Opponent departure

`presence.js` detects opponent departure: if the guest disappears (`prevGuestId` present
but `nextGuestId` absent) while `state.phase` is `"draft"` or `"ready"`, it sets
`state.phase = "abandoned"`, stops polling, and calls `cb.onOpponentLeft()`. All
cross-module render calls use `cb.*`.

## Leave button

There is **no `beforeunload` guard**. The dialog was removed because the
`sessionStorage` phase cache makes reloading safe — the draft is fully restored on
reconnect. Both `#lobbyLeaveBtn` and `#draftLeaveBtn` call `leavePresence()` then set
`window.location.href = "/"` directly.