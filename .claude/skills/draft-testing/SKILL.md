---
name: draft-testing
description: Exercising the room end to end when clicking two browsers through a ban phase is the slow part — jump a room straight to the ban / pick / ready / done phase over the API with roomctl.mjs, then take either seat in a real browser. Use after any change to the draft (bans, picks, reveal modes, Start Match, presence, timers), or whenever you need a room in a specific state to look at.
---

# Testing the draft

`npm run check` cannot tell you the draft still works, and the manual route to
the pick board is: two browser profiles, create, join, ready, start, ban, confirm
— every time. The API makes that scriptable.

## 1. Jump to a phase

```bash
npm run dev                                                  # or npm start
node .claude/skills/draft-testing/roomctl.mjs pick           # → pick board, 3 bans a side
node .claude/skills/draft-testing/roomctl.mjs ready --picks 23
node .claude/skills/draft-testing/roomctl.mjs status --code ABC234
```

Phases, in order: **`lobby` → `ban` → `pick` → `ready` → `done`**; the script runs
every step up to the one you name. `status` prints an existing room instead.

| Option | Default | |
| --- | --- | --- |
| `--code` | random 6-char | reuse a room you already opened |
| `--bans N` | 3 | bans staged **and confirmed** per side |
| `--picks N` | 11 | lineup size per side (23 = full squad) |
| `--host-id` / `--guest-id` | `harness-host` / `harness-guest` | see §2 |
| `--ban-count N` | — | writes `banCountPerSide` to the room config first |
| `--base` | `http://localhost:3000` | |
| `--quiet` | — | drop the "open as" footer |

It works because **there is no create-room endpoint**: a room exists as soon as
somebody posts presence for its code. Real catalog rows are pulled from
`/api/players` so the boards render like the real thing; if MySQL is down it
warns and falls back to synthetic players, so the harness still runs.

**It leaves no residue.** `src/features/rooms/` imports no `db.js` — room state
is the in-memory `roomPresence` Map and nothing else. Restart the server and
every harness room is gone.

## 2. Then take a seat in the browser

The seat belongs to an **identity**, not a URL, so opening the room in a fresh
tab gets you a 409 rather than the host chair. Set the id the harness used
*before* loading the page:

```js
localStorage.removeItem("efb_user");                       // drop any signed-in identity
localStorage.setItem("efb_room_anon_id", "harness-host");  // or harness-guest
```

then open `/room/<CODE>` (host) or `/room/<CODE>?mode=join` (guest) — the URL
decides which role the client *posts*, the server decides what it *gets*.

Signed in and want to stay that way? Pass your own id instead:
`--host-id <efb_user.id>`.

## 3. What the script cannot do for you

It writes **server** state. Anything the client owns has to be exercised in the
UI:

- **staged bans** live on the client until confirm (`state.stagedBans`) — the
  harness posts confirmed bans, so it never reproduces a staging bug;
- **the pool filter** (banned / picked cards leave the grid) is client-side;
- **reveal modes** (`instant` / `blur` / `hidden`) are pure rendering;
- **turn timers** run in the client's `draftFlow.js`;
- **the pitch, hover cards and filter panels** are all render-path behaviour.

Use `roomctl` to reach the phase, then drive the UI for the thing you changed.

**A headless harness cannot wait for a server-side timeout.** Chrome's
`--virtual-time-budget` fast-forwards the page's timers, so `await sleep(12000)`
in a harness costs milliseconds of real time — while `turnEndsAt` on the server
is real `Date.now()`. Anything that expires server-side (the alternating
auto-ban, a turn clock) will simply not have expired yet, and the run comes back
looking like the feature is broken. Two ways round it, both used:

- drive the *other* side over real HTTP from the harness page (`fetch` to
  `/ban`) and set a long clock, so nothing has to expire at all;
- or test the expiry from bash with real `sleep` and `curl` beats — the presence
  path is what resolves it, so a loop of `POST /presence` is a complete client
  for that purpose.

## 4. The real two-client run

Behavioural changes still need both sides live:

1. **Two profiles, or one normal + one incognito window** — never two tabs.
   `localStorage` is per-profile, so two tabs are the same player fighting over
   one seat.
2. Keep **both consoles open**. The informative error is often on the side that
   did not act — `pages/room.js` prints the real object next to the vague toast.
3. Expect a **~500 ms** lag on everything: sync is polling, there is no socket.
   A change that appears "one beat late" is normal; one that never appears is
   the bug.

## 5. Traps that waste a run

- **`npm run dev` is `node --watch`.** Saving anything under `src/` restarts the
  server and **destroys every room mid-draft**. Finish the run, or use
  `npm start` while testing. Editing `public/` is safe (it is served, not
  imported) but needs a reload — there is no HMR.
- **A kick is permanent.** `/kick-guest` appends to `entry.kickedGuestIds` and
  nothing ever removes an id — not a rejoin, not host promotion, not reopening.
  Kick your harness guest and that id is dead for the life of the process; use a
  new `--guest-id` or restart the server.
- **A backgrounded tab is throttled to ~1 beat/minute.** Its badge legitimately
  says "tabbed away". Nothing expires a seat — there is no presence TTL, and
  reinstating one is how a live draft got deleted underneath both players.
- **`/match-ready` is rejected outside `await-ready`/`done`** (409). That guard
  is deliberate: it used to let either side skip the rest of the draft.
- Turn the timers down for a quick pass — `--ban-count`, or POST
  `banDurationSec` / `pickDurationSec` to `/api/rooms/:code/config` (min 5 s).

## 6. Checking a renderer without any of this

For a plain `ReferenceError` in a render function, the stub-room smoke page in
`checks.md` ("Catching what the static gate cannot") is faster than a room:
serve a copy of `room.html`, call the renderers against a stub, assert **node
counts** — a renderer that threw leaves the grid at 0 cards. Delete
`public/__smoke.html` afterwards; it sits in the served directory.
