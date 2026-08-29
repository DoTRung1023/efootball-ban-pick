---
name: debugging
description: Finding the cause of a bug in this app before changing code — a board stuck on "Loading...", a blank screen, two clients that disagree, a room that closes or empties itself, a 500 from the API, a value that measures wrong in the layout. Use when something is broken and you do not yet know why; covers instrumenting a codebase whose static gate bans `console.log`, driving two real clients, and proving a fix rather than assuming it.
---

# Debugging this app

The static gate (`npm run check`) proves imports resolve and symbols are bound.
It proves nothing about behaviour. Everything below is about getting the code to
**execute** in front of you.

## 1. Instrumenting without failing the gate

`debug-leftovers` fails on `debugger`, `console.log`, `console.dir` and
`console.table` **in `public/js` only** — `src/` prints legitimately.

- While debugging the client, print with `console.error` / `console.warn`; they
  pass the gate and are what the shipped error handlers already use. Strip them
  when you are done anyway — the gate is not the standard, it is the floor.
- On the server, log with **`describeError(err)` from `#lib/http.js`, never bare
  `err.message`** — mysql2 connection failures carry an empty message and put the
  cause in `err.code`, so `err.message` prints nothing and hides `ECONNREFUSED`.
- `npm run check -- debug-leftovers` before committing is the fastest way to find
  instrumentation you forgot.

## 2. The error has probably already surfaced

`public/js/pages/room.js` installs `unhandledrejection` and `error` handlers that
`console.error` the real object and raise a 6-second `announce` toast. So:

- **Open the console before reproducing.** The toast text is deliberately vague
  ("An unexpected error occurred"); the stack next to it is not.
- `api.js`'s `postAsMe` / `getJson` **resolve, never throw** — a failed room
  action returns a result object instead of rejecting. A silent no-op action is
  a response you did not check, not an exception you missed.

## 3. Triage — symptom to first place to look

| Symptom | Look at |
| --- | --- |
| board stuck on "Loading opponent squad cards..." / "Loading your squad..." | a throw inside `renderDraftUi` aborting before the grid is written — check the console; it repeats every 500 ms poll |
| screen blank, no error | an ES module failed to load (bad path/casing) — Network tab, then `npm run check -- imports` |
| control inside a panel unusable, or state resets while typing | something rebuilding the panel on a render tick; see `ban-phase.md` on build-once panels |
| two clients disagree | the presence snapshot — `applyPresenceSnapshot` in `state.js` dropping a field is the recurring shape |
| room closed itself / seat vanished | `store.js`; only Leave, Close, kick and forfeit free a seat — **there is no TTL, do not add one** (`presence-and-reconnect.md`) |
| kicked player still gets in | `isKickedFromRoom` and where the check sits relative to the seat claim |
| 500 from the API | server terminal; the route handler in `src/features/<name>/routes.js` |
| layout wrong at a viewport | measure it — `responsive-testing.md`, not the source |
| CSS rule "not applying" | link order in that page's `<head>`; `controls.css` is last on purpose |

## 4. Runtime facts that explain most "impossible" bugs

- **`npm run dev` is `node --watch`, and room state is in-memory.** Saving any
  file under `src/` restarts the server and **destroys every room, mid-draft**.
  A draft that dies the moment you edit a backend file is the watcher, not a bug.
  Editing `public/` does not restart anything (it is served, not imported) — but
  it does need a browser reload, and there is no HMR.
- **Sync is polling only, ~500 ms.** No WebSocket. A render bug fires twice a
  second; a state bug can take one poll to appear. When something "fixes itself
  after a moment", you are watching the next snapshot overwrite local state.
- **Background tabs throttle timers to roughly once a minute.** This already cost
  a live feature once: a heartbeat racing a server-side TTL lost, and switching
  tabs mid-pick killed the room ~40 s later. If a bug only reproduces when the
  tab is not focused, suspect throttling before logic.
- **Identity is a cookie**, `efb_session` (signed in) or `efb_visitor` (not), both
  httpOnly and both set by the server. Two tabs in the same profile share the cookie
  jar and are therefore **the same player** — see §5. `efb_user` in localStorage is
  only the name in the account menu; changing it changes nothing the server believes.
- **`sessionStorage` caches the room phase** as `efb_room_<code>_phase`, written
  by `draftSession.js` and cleared by `clearRoomPhaseCache`. A room that reloads
  into the wrong screen is usually a stale key; clear it and reload before
  hunting further.
- **Auth is stateless.** `userId` comes from the request body/query and is
  trusted. A "wrong user" bug is a caller passing the wrong id, not a session.

## 5. Reproducing a two-player bug

Anything involving both sides needs **two browser profiles or one normal + one
incognito window** — not two tabs, because `localStorage` is shared per profile
and both tabs would claim the same seat.

1. `npm run dev`, open `http://localhost:3000` in each.
2. Host creates the room; guest joins via `/room/<code>?mode=join`.
3. Keep **both** consoles visible — the informative error is often on the side
   that did not act.
4. Remember §4: touching a `src/` file to add a log restarts the server and ends
   the room you were mid-way through. Add the logging first, then reproduce.

## 6. Executing a render path without two clients

To catch a `ReferenceError` in a renderer cheaply, serve the real page and call
the real renderers against a stub room — full recipe in `checks.md`
("Catching what the static gate cannot"). The parts people get wrong:

- Load over **`http://localhost:3000`**, never `file://` — Chrome blocks module
  imports from `file://` and the page comes back blank with no error, which reads
  as a pass.
- Give the stub `picks` array **a `null` hole**; picks are slot-addressed, and
  `picks.length` is not the pick count (`pickCount()` is).
- **Assert node counts**, not just the absence of an error: a renderer that threw
  leaves the grid at 0 cards, so `banGrid cards: 3` is the signal it really ran.
- Delete `public/__smoke.html` afterwards — it sits in the served directory.

## 7. Layout and CSS bugs

Measure with headless Chrome per `responsive-testing.md`, and read its four
traps first — the 500 px minimum width, dropped `file://` query strings, root
absolute `/css/` paths silently loading no CSS at all, and transitions returning
mid-flight values. **A uniform ratio across unrelated measurements in one
subtree (e.g. everything 0.97×) is a transition, not a bug.**

## 8. Before calling it fixed

- **Prove the check can fail.** Reintroduce the defect and confirm your harness
  or repro reports FAIL. Every measurement tool in this repo has, at some point,
  returned a confident false pass; a green run means nothing until you have seen
  it go red.
- Re-run the real flow end to end with two clients — `npm run check` cannot tell
  you the draft still works.
- `npm run check` clean, instrumentation removed.
- If the cause was structural or counter-intuitive, add it to the rule file that
  owns the area. Most of `.claude/rules/` is exactly that, written down once so
  the next session does not re-derive it.
