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

The trade this makes **mid-draft**: a player who closes their browser without
pressing Leave holds their seat until the server restarts, so the other side
waits instead of being told "opponent left". (In the **lobby** this no longer
applies — see "Leaving, and what happens to the room" below.) That is the right way round — the room outliving a
player costs a manual Leave, while the old behaviour cost a draft in progress.
The host can always kick the guest, and a room is never listed as active once it
goes quiet.

## Opponent liveness (display only — still no TTL)

The seat is not reclaimed by a timer and must not be, but the *other player* can
at least be told. `opponentLiveness(participant)` in `engine/presence.js` is the
single place that decides, and every badge reads it:

| State | Rule | Shown as |
| --- | --- | --- |
| `connected` | last beat within `OPPONENT_CONNECTED_MS` (15 s) | `· is choosing…`, dot lit |
| `away` | stale, but that beat said `hidden` | `· tabbed away`, **dot still lit** |
| `reconnecting` | stale from a foreground tab | `· reconnecting…`, amber |
| `gone` | stale past `OPPONENT_GONE_MS` (120 s), or seat empty | `· connection lost` / `· left the room`, muted |

**Nothing here frees a seat.** `lastSeenAt` is written and serialised on the
server and never compared there — grep it and keep that true. Reclaim remains
Leave, the host's Kick, and the turn timer's forfeit.

Three things this depends on:

- **The client keeps the fields.** `applyPresenceSnapshot` used to rebuild
  participants as `{ id, username }`, dropping `lastSeenAt` — which is why an
  opponent who closed their browser read as "· is choosing…" forever. The data
  was already on the wire; only the consumer was missing.
- **`hidden` is why the thresholds can be this tight.** The heartbeat sends
  `document.hidden`; the server stores and serialises it. Without it a
  backgrounded tab — throttled to roughly once a minute — is indistinguishable
  from a departing one, and that is the ground the deleted 12–30 s TTL died on.
  `visibilitychange` also polls immediately on return, so coming back to the tab
  clears your badge instead of waiting out a throttled tick.
- **`away` keeps the dot lit.** A backgrounded tab is connected; it is the
  heartbeat that is slow, not the player.

Measured through the real render path, ban badge and pick footer together:

| age of last beat | liveness | badge |
| --- | --- | --- |
| 0 s / 12 s | `connected` | `· is choosing…` ● |
| 30 s visible | `reconnecting` | `· reconnecting…` ○ (amber) |
| 30 s hidden | `away` | `· tabbed away` ● |
| 119 s visible | `reconnecting` | `· reconnecting…` ○ |
| 121 s | `gone` | `· connection lost` ○ (muted) |
| seat empty | `gone` | `· left the room` |

`state.presenceError` is a **different fact** — it is *my* connection failing.
The pick footer reads both and reports them separately; conflating them is what
made a healthy client describe the opponent as "Picking..." indefinitely.

## The exit guard (`shell/leaveGuard.js`)

Because of that trade, the cheapest fix is to make the abandonment less likely:
`initLeaveGuard()` asks first when the browser is about to take the user out of
a live room. Installed from `initDraftControls()`, in **two halves**, because no
single hook does the job:

- **`beforeunload`** catches every exit — tab close, reload, back, address bar —
  but can only ever raise the browser's own dialog.
- **A History-API trap** catches *back* alone and shows `askConfirm` instead. It
  pushes a spare entry (same URL, nothing visible) once a guarded phase is
  reached; a `popstate` cannot be cancelled, so the handler re-pushes the entry
  to undo the pop and then asks. Confirm runs the normal leave path.

  Two costs, both accepted: back takes two presses, and each cancel adds another
  history entry. A `dialogOpen` flag stops a second press stacking a second
  dialog. The arming interval is **bounded** (2 min) — a 409 lands on
  `#viewError`, which is never guarded, and an unbounded 2 Hz interval would run
  there for the life of the tab.

Measured by driving `history.back()` against the real init path: the entry is
pushed, back opens the dialog with the host/guest wording and the page does not
navigate, cancel keeps you in the room, a second back re-arms, and after
`allowLeave()` back passes through silently.

It asks only when there is a seat to abandon — `state.room` set **and**
`state.phase` in `lobby` / `draft` / `ready`. Verified through the real init
path by dispatching the event and reading `defaultPrevented`:

| phase | in a room | asks |
| --- | --- | --- |
| `loading` | no | no |
| `lobby` / `draft` / `ready` | yes | **yes** |
| `done` | yes | no — the draft is over |
| `error` | yes | no — you have already been ejected |
| `draft` | no | no |

`allowLeave()` stands it down permanently, and every app-driven exit calls it:
both Leave buttons (they have already asked), `showExitCountdown` and
`showDone`. The terminal screens matter more than they look — **they do not
change `state.phase`**, so a room closed mid-draft still reads as `draft`, and
without the call the 10 s countdown and its "Back to home" would both trip the
guard.

Three limits, all of them the browser's and none of them fixable here:

- **The wording is the browser's.** `preventDefault()` requests the dialog but
  cannot fill it in, and a returned string is ignored by every current engine.
  `askConfirm` is unusable — it is asynchronous and unload does not wait.
- **It needs sticky activation.** A page the user has never clicked in unloads
  silently, so a guest who opens an invite link and immediately closes the tab
  is not asked.
- **A reload is indistinguishable from a close.** Which is why the guard only
  asks and must never post the leave itself: doing that on `pagehide` would
  evict a player for pressing F5, and reconnecting to your own room is what the
  rest of this file is built around. `leavePresence()` already sets
  `keepalive: true`, so it is tempting; do not.

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

## Leaving, and what happens to the room

`/leave` takes an optional `reason`. `"disconnect"` means the user did not
choose it — the `pagehide` beacon — and the two readings are deliberately
opposite:

| Who leaves | How | Result |
| --- | --- | --- |
| Host, guest present | Leave button | Room closes for everyone (unchanged) |
| Host, guest present | tab closed | **Guest is promoted**, draft resets to lobby |
| Host, alone | either | **Room is deleted** |
| Guest | either | Seat empties, draft resets to lobby, room survives |

**A room nobody is left in is deleted** — the first time anything in this
process removed an entry. `ensureRoomEntry` mints one for *any* code that gets
polled, so every code ever visited used to live until a restart.

Two exceptions, both load-bearing:

- **A closed room is kept.** `closed` + `closeReason` is the only thing that
  puts the remaining player on the "Room closed" screen; deleting it hands them
  an empty snapshot instead. Found by testing — the first version deleted it and
  the flag never reached the guest.
- **A lone host leaving deliberately sets no `closed` flag at all.** There is
  nobody to show it to, so the room is simply deleted. Reopening the code makes
  a fresh lobby, which is what `reopenRoom` would have produced anyway.

### The beacon is lobby-only

`initDisconnectBeacon` in `leaveGuard.js` posts `reason: "disconnect"` on
`pagehide` — **only while `state.phase === "lobby"`**. Mid-draft the same beacon
would let a crashed tab, a locked phone or a mis-swipe reset both squads, and a
draft is expensive to lose where a lobby seat is not. Past the lobby the seat is
held exactly as before and the opponent's badge carries the news.

`sendBeacon` with a `Blob` typed `application/json`: the request has to outlive
the document (a `fetch` is cancelled on unload) and a bare string is sent as
`text/plain`, which `express.json()` leaves as an empty body.

## Coming back: `GET /api/rooms/mine`

Closing a tab does not give up a seat, so the app has to be able to ask "where
was I?" on the way back in. The client cannot answer it: the phase cache is
per-tab `sessionStorage`, and the home page does not know the code anyway.

`GET /api/rooms/mine?userId=` scans for a non-closed room with that id in either
seat and returns `{ code, side, phase }`. `home.js` awaits it before booting
anything else and `location.replace`s into the room. `replace`, not `href`, so
Back does not land on a page that immediately redirects here again.

There is no trap: Leave frees the seat, so the next visit stays home. Declare
the route **before `/:code`** — Express matches in order and `mine` is a valid
room code as far as that route is concerned.

**Signed-out players get this too**, because `getAnonId` now writes to
`localStorage`. It was `sessionStorage`, so a signed-out player who closed the
tab came back as a new person and their old id sat in the seat forever — with no
TTL, that made the room permanently unusable.

## Room security

The server rejects duplicate connections via HTTP 409:

- A second host attempt (different userId) → 409 "Room already has an active host."
- A second guest attempt (different userId) → 409 "Room already has an active guest."
- Anyone on the room's `kickedGuestIds` list → 403, **for either role** — the check
  runs before the seat claim, so a kicked player cannot come back as host either.
  The list is never cleared; see `backend.md`.

**A terminal response must not be answered with a re-render.** The 403/409/410 branches
of `registerPresence` paint `#viewError`, stop the polling and set `state.phase = "error"`,
then return `undefined` — which is also what a plain network failure returns. Both callers
used to read that as "reconnect failed" and answer it by calling `showView("viewLobby")`,
painting straight over the screen they had just been handed: a kicked player saw a working
lobby with themselves still in the guest seat, and a guest opening a closed room never saw
"Room closed". `wentTerminal()` is the test that separates the two cases; keep it ahead of
every fallback render.

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
any slot selection dropped, the phase cache cleared so a reload lands there too, an
`announce` (the 6 s toast — this one lands while the host is mid-pick and the board is
vanishing under them, which is exactly what the short one is wrong for), and polling left
running so a new guest appears in the matchup band the moment they join.

It used to set `state.phase = "abandoned"`, stop polling and run a 10-second countdown to
the home page — abandoning a room that still existed and still had its host in it. Both
the ban board and the pick board come back this way; there is nothing phase-specific
about it.

The server does the matching half. `resetDraftToLobby()` in `store.js` puts the entry
back to `status: "lobby"` and clears bans, picks, staged bans, both confirmation pairs,
`bannedPlayerIds`, all three match handshakes (`resetMatchSteps`) and `ready.guest`, so
whoever joins next does not inherit
half a draft. It runs from **both** `/leave` (guest branch) and `/kick-guest`, and returns
whether there was a draft to cancel so the caller can say so in chat.

**`showOpponentLeft` is gone**, along with `cb.onOpponentLeft` — nothing could reach
them once this path stopped ending the session. The only exit screens left are the two
that really are terminal: `showRoomClosed` and `showDone`.

Only the *guest* slot can empty like this. A host leaving sets `closed = true`, which the
`state.room.closed` branch earlier in `pollPresence` catches first and still sends
everyone home. All cross-module render calls use `cb.*`.

## Leave button

`#lobbyLeaveBtn` and `#draftLeaveBtn` both `askConfirm`, then `allowLeave()`,
`leavePresence()` and `window.location.href = "/"`. The `allowLeave()` call is
what stops the exit guard asking a second question about a decision the user has
just made.

(This section used to say there was no `beforeunload` guard, on the grounds that
the `sessionStorage` phase cache makes reloading safe. Reloading *is* safe — that
is why the guard never posts the leave. What is not safe is closing the tab,
which the cache does nothing for.)