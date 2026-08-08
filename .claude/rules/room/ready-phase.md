---
paths:
  - "public/js/features/draft/ready/readyView.js"
  - "public/js/pages/room.js"
---

# Ready phase — "Start Match" (`#draftReadyPhaseBoard`)

Shown when `isReadyPhase`. **You get here only when both sides have confirmed
their squads** — the server sets `status: "await-ready"` and `renderDraftUi`
calls `enterReadyPhase()` on the snapshot that carries it. Confirming alone
leaves you on the pick board waiting; see `pick-phase.md`.

Full layout inside `.sm-layout`:

- **Header** (`.sm-head`): kicker badge with pulsing dot (`READY PHASE · CONFIRM TO
  BEGIN MATCH`), `h2` title (`START MATCH`), subtitle.
- **Columns** (`#readyPhaseColumns`): 3-column grid (`.sm-columns`) — my column
  (`.sm-col`) | VS circle (`.sm-vs-circle`) | opponent column. Each column has a
  username, READY/WRITING status badge (`.sm-col-badge.is-ready` /
  `.is-writing`), a role label (YOU/OPPONENT), formation pitch rows (`.sm-pitch-row`
  built with `renderReadyPitchColHtml()` using `buildOrderedSlotMap` +
  `getFormationLayout`), and a bench strip (`.sm-bench-strip`, slots 12–23).
  `picks` is slot-addressed, so **every count and average here filters the holes
  first** (`filledPicks`) — `averageOf` would otherwise read `.age` off a `null`
  and divide by the wrong total.
  State-key diff guard: key =
  `[myPickIds, theirPickIds, revealMode, mySide, myReady, theirReady].join("|")` —
  with `theirPickIds` blanked in `hidden` mode, because the key is written to a
  `data-` attribute and would otherwise publish the ids the column is refusing to
  draw.
- **Stats bar** (`#startMatchStats`): 5-column grid (`.sm-stats-row`) comparing
  AVG OVERALL (lineup avg of `overall_rating`), AVG OVR MAX (all-picks avg), FORMATION
  (text badge), STARTING XI (count), AVG AGE. Each cell has green/cyan progress bars
  (`.sm-stat-bar--me` / `.sm-stat-bar--opp`). State-key diff guard on pick IDs + OVR
  values + formation.
- **Footer** (`.sm-footer`): READY → / UNREADY button (`#draftReadyBtn`, `btn--primary` /
  `btn--ghost`), legend dots (`.sm-dot-you` green, `.sm-dot-opp` cyan), and hint text
  (`#readyPhaseHint`).

**Opponent formation always uses `DEFAULT_FORMATION` ("4-3-3") since formations
aren't synced via presence.**

## Reveal mode carries onto this screen

All three modes mean here what they meant during the draft — revealing at Start
Match would make the lobby setting a draft-only promise:

- `instant` — the opponent's squad and the full stats row.
- `blur` — the same column with `.sm-squad.is-concealed` (blur 9px,
  `user-select: none`, `aria-hidden`) around the pitch and bench. **The column
  head is deliberately outside the blur**: the name and the READY badge are what
  blur still promises you. Stats stay live — blur conceals identities, not shape.
- `hidden` — `hiddenColumnHtml` replaces the column with "Picks hidden — revealed
  after match", **and the stats row is masked**: every `.sm-stat-opp` reads `?`
  and every opponent bar is pinned at 50% with `.is-masked`. Without that, five
  aggregates of their squad — average rating, squad size, their formation — hand
  back exactly what the column withheld. `renderStats` takes the flag; blur does
  not set it.

Clicking READY calls `setMatchReady()` → `POST /api/rooms/:code/match-ready`. When both
sides are ready the server sets `status = "done"` and `showDone()` is called.