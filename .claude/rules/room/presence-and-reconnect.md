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
data does not persist across server restarts. Real-time sync is polling-only; WebSocket
integration is not yet implemented.

## There is no presence TTL (do not add one back)

Clients POST `/api/rooms/:code/presence` about twice a second, and it keeps
`lastSeenAt` fresh for the "connected" dot — but **a lapsed heartbeat removes
nobody**. A seat is only given up by an explicit action: Leave, Close room, or
the host kicking the guest.

It used to expire a participant after `PRESENCE_TTL_MS` (12 s, lobby) or
`DRAFT_PRESENCE_TTL_MS` (30 s, mid-draft), and when the expired participant was
the **host** it also set `closed = true` with reason "Host closed the room."
Both clients then hit `showRoomClosed` and its 10 s countdown to `/`.

That is a timer against a timer, and the heartbeat loses: it is a 500 ms
`setInterval`, and **browsers throttle timers in background tabs to roughly once
a minute.** Switching to another tab mid-pick was therefore enough to kill the
room about 40 s later — reported as "the pick room automatically closes after
50 s". Nothing was wrong with either client; the draft was simply deleted
underneath them.

`pruneStalePresence`, `presenceTtlFor`, `presenceFingerprint` and
`presenceChanged` are all gone, along with the two TTL constants. What remains is
`ROOM_LIST_QUIET_MS` (90 s) — **admin display only**. It decides how long a quiet
room stays on the dashboard listing and ends nothing.

The trade this makes: a player who closes their browser without pressing Leave
holds their seat until the server restarts, so the other side waits instead of
being told "opponent left". That is the right way round — the room outliving a
player costs a manual Leave, while the old behaviour cost a draft in progress.
The host can always kick the guest, and a room is never listed as active once it
goes quiet.

## Your seat comes from the server, not the URL

`initLobby` guesses the side from `?mode=join`, and that guess is the only thing
`state.mySide` was ever set from. `adoptSeat` in `presence.js` corrects it
against the snapshot — **before the first heartbeat** (`adoptSeatFromServer`)
and again on every poll. Two things depend on it, and neither works without it:

- **Returning by any route that drops the query string** — history, a retyped
  address, the rejoin redirect. The guest's client claimed `role: "host"`,
  `claimHostSeat` saw a different id and answered 409, and they were shown "Host
  slot taken" for a room they were still sitting in. Asking after the claim is
  too late, which is why the pre-flight GET exists.
- **Host promotion.** Promote the guest server-side and their client keeps
  claiming the guest seat, which is now empty — so `claimGuestSeat` hands it back
  and one person is seated as both host and guest. Measured after the fix:
  `host=Bob guest=—`, seated twice? no.

A room with no entry, or one where neither seat is ours, leaves the guess
standing — that is the *arriving* case rather than the returning one.

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
  `returnToLobby()`, and any failed reconnect.

## The guest leaving does not end the room

`presence.js` spots it the same way as before — `prevGuestId` present, `nextGuestId`
absent, while `state.phase` is `"draft"` or `"ready"` — but what happens next is the
opposite of what it used to be. **The host goes back to the lobby with the code intact**
(`returnToLobby()`): phase back to `"lobby"`, the turn timer cleared, staged bans and
any slot selection dropped, the phase cache cleared so a reload lands there too, a toast,
and polling left running so a new guest appears in the matchup band the moment they join.

It used to set `state.phase = "abandoned"`, stop polling and run a 10-second countdown to
the home page — abandoning a room that still existed and still had its host in it. Both
the ban board and the pick board come back this way; there is nothing phase-specific
about it.

The server does the matching half. `resetDraftToLobby()` in `store.js` puts the entry
back to `status: "lobby"` and clears bans, picks, staged bans, both confirmation pairs,
`bannedPlayerIds`, `matchReady` and `ready.guest`, so whoever joins next does not inherit
half a draft. It runs from **both** `/leave` (guest branch) and `/kick-guest`, and returns
whether there was a draft to cancel so the caller can say so in chat.

**`showOpponentLeft` is gone**, along with `cb.onOpponentLeft` — nothing could reach
them once this path stopped ending the session. The only exit screens left are the two
that really are terminal: `showRoomClosed` and `showDone`.

Only the *guest* slot can empty like this. A host leaving sets `closed = true`, which the
`state.room.closed` branch earlier in `pollPresence` catches first and still sends
everyone home. All cross-module render calls use `cb.*`.

## Leave button

There is **no `beforeunload` guard**. The dialog was removed because the
`sessionStorage` phase cache makes reloading safe — the draft is fully restored on
reconnect. Both `#lobbyLeaveBtn` and `#draftLeaveBtn` call `leavePresence()` then set
`window.location.href = "/"` directly.