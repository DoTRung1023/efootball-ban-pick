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
`presenceChanged` are all gone, along with the two TTL constants. **Nothing
time-based remains at all.** `ROOM_LIST_QUIET_MS` (90 s) outlived them for a
while — admin display only, deciding how long a quiet room stayed on the
dashboard — and has gone too: it ended nothing, and the rooms it hid were
precisely the abandoned ones an admin needs to see. `listActiveRooms` now filters
on `closed` and nothing else.

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
- **A deliberate close is a close, alone or not.** It used to require an heir —
  a lone host closing had "nobody to show it to", so the room was simply deleted.
  That is false while the **console** is watching: a guest who left first and a
  host who then closed took the entry with them, and the WATCH panel fell back
  to its 404, *"not in memory — it ended, or the server restarted"*, for a room
  whose host had just closed it in front of the admin. The entry is the only
  thing that can say how a room ended, so a close always keeps it.
- **A lone host whose tab dies still deletes the room.** `reason: "disconnect"`
  with no heir is nobody choosing anything, so there is no close to report and
  nothing to keep. That is the one path that still ends with the 404, and the
  404's wording is accurate for it.
- The cost is that closed rooms accumulate for the life of the process. They
  already did — a close *with* a guest has always kept the entry, and nothing
  reaps them — so this widens an existing trade rather than making a new one.
  They are out of `listActiveRooms`, so they cost memory and not screen space.

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

There is no trap **so long as Leave really frees the seat**, and for a while it
did not — see "Leave stops the heartbeat first" below. A seat that comes back
after the leave turns this route into a loop: you press Leave, land on home, and
are posted straight back into the room you just left. Declare the route **before
`/:code`** — Express matches in order and `mine` is a valid room code as far as
that route is concerned.

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

### An empty host chair is not a free one

`entry.hostId` is who the room *belongs to*, and the point of it is that it
outlives the seat. `entry.host` is who is sitting there; the two part company
whenever the chair legitimately empties — NEW MATCH, or a deliberate close the
host can walk back into — and while they are apart this is the only thing
between the room and anyone else holding the code:

- **`claimHostSeat`** → 403 "This room belongs to another host." when the chair
  is empty and `hostId` names somebody else. Without it a stranger could post
  `role: "host"` at a room whose host had stepped out and take it over, in front
  of a guest still sitting in it — and the real host then met their own room
  with a 409.
- **Reopening a closed room** is the same rule. `role === "host"` alone used to
  be enough, so a deliberate close (which empties the seat) left the room open
  to whoever typed the code. It is `role === "host" && !adminClosed &&
  isRoomHost(entry, userId)` now. A closed room has always had a host, so there
  is no blank case to let through.

**Blank until the first claim, and that blank is room creation** — a code nobody
has ever hosted is open to whoever gets there first. It moves when the chair
legitimately does: the guest promoted on a host disconnect becomes `hostId` too,
or the new host would be locked out the moment their own seat emptied and the
old one could take it back.

**This is not the reconnect path, and it must not be confused with it.** A lost
connection does not empty a seat — there is no presence TTL (see the top of this
file), so `entry.host` still holds the dropped player's id and the *occupied*
branch lets them straight back in on an id match. That is what makes a room
survive a train tunnel, and it works whether or not any of the above exists.
This rule only ever governs a chair that is genuinely standing empty.

The cost is the one anonymous players already pay elsewhere: an anon id lives in
`localStorage`, so a host who clears it, or comes back in another browser, is a
different person to this check. Occupied, that was already a 409; empty, it is
now a 403. Signing in is what makes a seat portable.

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
`bannedPlayerIds`, all three match handshakes (`resetMatchSteps`), the `newMatch`
departure flag and `ready.guest`, so whoever joins next does not inherit
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

### Leave stops the heartbeat first, and `leavePresence` owns that

`stopPresencePolling()` is the **first line of `leavePresence()`**, not something
the caller does. The heartbeat runs at 500 ms and `registerPresence` re-creates
whatever seat it names — a room exists as soon as somebody posts presence for it
— so one beat landing after the leave puts the player back in the chair they just
vacated, and the page then navigates away with nobody left to clear it.

That ghost seat broke two things built on the seat being gone, and both were
reported as separate bugs:

- **the opponent sat on a dead board.** `pollPresence` returns the host to the
  lobby on `prevGuestId && !nextGuestId`, which needs to *witness* the seat
  emptying between two beats. Refilled, it never fires — the guest left the pick
  board and the host stayed on it;
- **the leaver was bounced back in.** `GET /rooms/mine` still answered with the
  room, so `redirectToActiveRoom` sent them from home straight back to
  `/room/CODE` — by then reset to `lobby`, so Leave on the pick board landed you
  on the ban-setting screen instead of My Players.

`leaveGuard.js` and the lobby's Leave called `stopPresencePolling()` themselves;
the draft board's Leave did not. Three call sites, one rule to remember, and the
one that forgot is the one people use mid-draft. It lives in `leavePresence` now
so none of them can.

### The lobby return is on the status too, not only on the empty seat

`pollPresence` also calls `returnToLobby()` when `state.phase` is `draft` or
`ready` and the snapshot's status is `lobby`. The empty-seat test above is an
*edge* and a client that was tabbed out, offline for a beat, or looking at a seat
some stray heartbeat refilled never sees it. The status is not an edge: the
server owns every transition into `lobby`, so a board still up under one is wrong
however it got there.

**`done` is deliberately excluded.** `done` → `lobby` is also what an accepted
rematch looks like, and the two are told apart only by the seats — which is why
the empty-seat test runs first and this one leaves `done` to `onRematchAccepted`.

(This section used to say there was no `beforeunload` guard, on the grounds that
the `sessionStorage` phase cache makes reloading safe. Reloading *is* safe — that
is why the guard never posts the leave. What is not safe is closing the tab,
which the cache does nothing for.)
## The guest leaving is not a page change, and it beats every other branch

The host stays in the room and drops to the lobby (`returnToLobby` — clears the phase
cache, resets staged bans, announces *"Your opponent left…"*, shows `#viewLobby`). No
navigation, so the announcement is an ordinary toast rather than a stashed one.

**It fires from `draft`, `ready` *and* `done`** — the whole life of the room. `done` was
missing, and the Start Match screen is the one place that mattered: it spans `ready` while
the match is being set up and played and `done` once it is over, so a guest leaving from
the post-match footer fell past this branch into the rematch one below it, whose test is
"we were in `done` and the status is no longer `done`". A departing guest satisfies that
too — the server resets the room to `lobby` either way. The host was told *"Rematch with
X — back to ban settings"* about an opponent who had just walked out.

The two events are **indistinguishable by status**: verified across pick, await-ready,
live and done, a guest leaving produces exactly the same snapshot every time — status
`lobby`, guest seat empty, host seat kept. Only the empty seat separates them, so the
empty-seat test has to come first. Keep it above the `state.phase === "done"` branch.

## Leaving a room says so on the page you land on

A toast cannot outlive the page that fires it, so a button that navigates has to hand its
message forward. `shared/ui/pendingToast.js` puts one line in `sessionStorage`; the next
page's boot takes it (read-once, so a reload cannot replay it) and shows it.

Every exit from a room goes through it:

| what the user did | lands on | line |
| --- | --- | --- |
| Close room (host) | `/` | `Room closed.` |
| Leave (guest) | `/` | `You left the room.` |
| the room-closed countdown | `/` | the close reason, as a `warn` |
| NEW MATCH | the fresh room | `New room opened — you are the host. …` |
| rematch accepted (**both** sides) | the same room, reloaded into the lobby | `Rematch with X — …` |
| Sign out | `/signin` | `Signed out.` |
| Sign in | `/` | `Welcome back, X!` |

The room reads it with `announce` rather than `showToast`: you did not ask to be on this
page and are not yet looking for the answer.

Two placement rules worth keeping:

- **Home reads it *after* `redirectToActiveRoom`.** A page the user only passes through
  must not eat the note meant for the page they end up on.
- **Sign-in no longer waits.** It used to `setTimeout(…, 1000)` before redirecting, purely
  so a sliver of "Welcome back" could be read before the page was replaced — a second of
  dead time to half-show a message. The message now arrives whole on the other side and
  the redirect is immediate.

## The participant object is rebuilt on every heartbeat

`claimHostSeat` / `claimGuestSeat` assign `entry.host = participant` on **every**
presence POST — twice a second per client — from a fresh object built out of the
request body. Anything cached on a seat rather than sent with the beat is
therefore wiped a beat after it is written, and `playerCount` was: looked up on
join, gone 500 ms later, so the lobby never rendered a squad line. Both claim
functions now carry it across when the id has not changed.

The lookup itself is **awaited on the claim beat only** (`result.changed`), not on
the heartbeat behind it — one query per join. Fired and forgotten instead, the
seat rendered with no squad line until the count landed a poll or two later,
which a screenshot caught and a DOM assertion did not.
