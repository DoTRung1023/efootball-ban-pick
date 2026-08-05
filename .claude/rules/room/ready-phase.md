---
paths:
  - "public/js/room/readyView.js"
  - "public/js/room.js"
---

# Ready phase — "Start Match" (`#draftReadyPhaseBoard`)

Shown when `isReadyPhase`. Full layout inside `.sm-layout`:

- **Header** (`.sm-head`): kicker badge with pulsing dot (`READY PHASE · CONFIRM TO
  BEGIN MATCH`), `h2` title (`START MATCH`), subtitle.
- **Columns** (`#readyPhaseColumns`): 3-column grid (`.sm-columns`) — my column
  (`.sm-col`) | VS circle (`.sm-vs-circle`) | opponent column. Each column has an avatar
  initials badge, username, READY/WRITING status badge (`.sm-col-badge.is-ready` /
  `.is-writing`), a role label (YOU/OPPONENT), formation pitch rows (`.sm-pitch-row`
  built with `renderReadyPitchColHtml()` using `buildOrderedSlotMap` +
  `getFormationLayout`), and a bench strip (`.sm-bench-strip`, picks 12–23).
  State-key diff guard: key =
  `[myPickIds, theirPickIds, revealMode, mySide, myReady, theirReady].join("|")`.
- **Stats bar** (`#startMatchStats`): 5-column grid (`.sm-stats-row`) comparing
  AVG OVERALL (lineup avg of `overall_rating`), AVG OVR MAX (all-picks avg), FORMATION
  (text badge), STARTING XI (count), AVG AGE. Each cell has green/cyan progress bars
  (`.sm-stat-bar--me` / `.sm-stat-bar--opp`). State-key diff guard on pick IDs + OVR
  values + formation.
- **Footer** (`.sm-footer`): READY → / UNREADY button (`#draftReadyBtn`, `btn--primary` /
  `btn--ghost`), legend dots (`.sm-dot-you` green, `.sm-dot-opp` cyan), and hint text
  (`#readyPhaseHint`).

In `hidden` reveal mode the opponent column shows a "Picks hidden — revealed after
match" message instead of their pitch. **Opponent formation always uses
`DEFAULT_FORMATION` ("4-3-3") since formations aren't synced via presence.**

Clicking READY calls `setMatchReady()` → `POST /api/rooms/:code/match-ready`. When both
sides are ready the server sets `status = "done"` and `showDone()` is called.