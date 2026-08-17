---
paths:
  - "public/js/features/draft/ready/readyView.js"
  - "public/js/features/draft/ready/postMatch.js"
  - "public/js/features/draft/shell/exitScreens.js"
  - "public/js/pages/room.js"
---

# Start Match — the last screen of a room (`#draftReadyPhaseBoard`)

**There is no screen after this one.** It has two stages and it does not navigate
between them — `data-stage` on the board, written by `renderReadyBoard`, swaps the
footer and nothing else:

| `data-stage` | Room status | Footer |
| --- | --- | --- |
| `confirm` | `await-ready` | READY button + hint (`.sm-foot--confirm`) |
| `live` | `done` | the three ways out (`.sm-foot--live`) |

You reach `confirm` only when **both** sides have confirmed their squads: the server
sets `status: "await-ready"` and `renderDraftUi` calls `enterReadyPhase()` on the
snapshot carrying it. Confirming alone leaves you on the pick board waiting — see
`pick-phase.md`.

`enterMatchLive()` (in `shell/draftView.js`) is the one-way move to `live`. It sets
`state.phase = "done"`, stands the exit guard down, and renders. It **does not** change
the view and **does not** clear the cached phase — that cache is what lets a reload come
straight back here, and the room is still live while a rematch can be offered.

> There used to be a separate `#viewDone` screen for the second stage: it re-listed as
> plain text the same two squads this screen already draws as cards. It is gone —
> along with `showDone`, `.view--done` and every `.done-*` rule. `showRoomClosed` is now
> the only terminal screen in `exitScreens.js`.

`renderDraftUi` therefore renders in the `done` phase as well as `draft` and `ready`
(`RENDERED_PHASES`), and `enterReadyPhase()` is **not** called once the match is live —
it would walk the phase back out of `done` on the next poll.

## Layout

- **No header.** There was a `.sm-head` block (`FINAL STEP · START MATCH` and a line of
  instructions). It is gone: the stage rail across the top of the room already reads
  START MATCH, so the title said it twice and pushed the squads — the only thing on this
  screen worth the space — below the fold. Which stage you are in is carried by the
  footer.
- **Teams** (`#smTeams`) — `minmax(0, 1fr) auto minmax(0, 1fr)`: my column, the `.sm-vs`
  badge, their column. Each `.sm-team` has a head (name, `ROLE · FORMATION`, and a
  `.sm-chip` reading READY or NOT READY), a pitch built from `getFormationLayout` +
  `buildOrderedSlotMap`, and a bench strip of slots 12–23. `picks` is slot-addressed,
  so **every count and average filters the holes first** (`filledPicks`).
- **The two cards are the same size, and that is load-bearing.** `align-items: stretch`
  on the grid plus a flex column inside each card: `.sm-squad` grows, `.sm-pitch` takes
  `flex: 1` and absorbs the difference between a four-row and a five-row formation, and
  the bench lands flush with the bottom of both. With `align-items: start` a 4-4-2 card
  ended well above a 3-2-4-1 one and the two BENCH strips sat at different heights —
  they are the one genuinely like-for-like row on the screen. Measured at 1440 and
  900 px: both cards 658 × 1078 and 388 × 1059, benches aligned to the pixel, with the
  hidden column stretching to match as well. Below 860 px the columns stack and each
  card sizes to its own content, which is correct — there is nothing beside it to match.
- **The pitch is a drawn football field**, from `shared/pitchField.css` — the same sheet
  behind the game-plan and pick pitches. Unlike those two, this screen **emits its own
  markings** (`PITCH_MARKS_HTML` in `readyView.js`): there are two pitches here and
  `renderTeams` replaces the whole of `#smTeams` when a reveal mode swaps a column, so
  static markup could not survive. It is safe because the marks are a *sibling* of the
  rows and the renderer writes both together. `.sm-pitch-rows` carries `z-index: 1` for
  the usual structural reason — the marks are positioned and the rows are not — and
  distributes with `space-evenly`, which is symmetric by construction. The card is
  `--bg-elevated` so the `--bg` turf inside it reads as a field rather than as more card.
- **Cards are the art alone** — `STATIC_CARD` passes `footer: false`, the same call
  `pickView`'s opponent grid makes. The strip under each card repeated the region and
  nation, and this screen shows up to 46 cards at once; the artwork already carries the
  name, the position and both ratings.
- **Footers** — both are in the markup; `data-stage` hides one.

## No aggregates anywhere on this screen

Nothing here counts or averages. Removed, in order: the bench's `AVG`, the head's
`n/11 XI`, and finally the whole `#smStats` comparison row — AVG RATING, SQUAD DEPTH,
FORMATION, STARTING XI, AVG AGE — along with `averageOf`, `barStat`, `textStat` and the
`.sm-stat*` rules. The screen's one job is to show the two squads, and five numbers per
side competed with them for the space.

This deleted a whole masking path: every one of those cells was an aggregate of the
opponent's squad, so `hidden` reveal mode had to blank each one or hand back in numbers
what the hidden column withheld. **If you reinstate any aggregate, reinstate its mask**
— see the reveal-mode section below.

`renderTeams` guards its DOM write with a state key (`data-teams-key`), because
`renderDraftUi` runs on every presence poll. **Both usernames are in the key**: they were
not, and a name arriving after the first paint left the column reading "Opponent" for the
rest of the match.

## Formation is synced — it used to be guessed

`entry.formations = { host, guest }` on the room, sent up with **`/picks-confirm`** and
read back by `applyPresenceSnapshot`. `formationOf()` reads *both* sides off the room.

Two bugs this replaced, both worth not reintroducing:

- The opponent's pitch was drawn with `DEFAULT_FORMATION` because nothing carried theirs.
  Slot numbers come from the formation's rows, so that did not merely mislabel the
  shape — it laid their players out in the **wrong rows** — and the FORMATION stat
  stated "4-3-3" for them as fact.
- My own came from `getPickFormation()`, the pick board's in-memory dropdown, which
  resets to the default on reload. A refresh here redrew my own squad in a shape I had
  never picked.

It rides on the confirmation rather than on `/picks` because changing the shape on the
pick board re-renders locally and posts nothing — the last lineup write is not a reliable
carrier. There is **no whitelist server-side**: `normalizeFormation` answers with the
default for anything outside its fifteen-row table, so an unknown string can never reach
a pitch or a stat cell, and a third copy of the list (there are already two — see
CLAUDE.md) would be one more thing to keep in step for no added safety.

## Reveal mode carries onto this screen

All three modes mean here what they meant during the draft — revealing at Start Match
would make the lobby setting a draft-only promise:

- `instant` — their squad and the full stats row.
- `blur` — `.sm-squad.is-concealed`, which is `filter: blur(7px)` plus
  `user-select: none`, with `aria-hidden` set in `readyView`. **The blur is the whole
  mechanism**, and it was missing: the rule set `opacity` alone, so every name under a
  mode whose only job is to hide them was perfectly legible. The team head stays outside
  the blur on purpose — the name and the READY chip are what blur still promises you.
  Stats stay live; blur conceals identities, not shape.
- `hidden` — the column is replaced wholesale by `.sm-team.is-hidden`. Their ids and
  their formation also stay out of `data-teams-key`, which is written to the DOM and
  would otherwise publish exactly what the column refuses to draw. There is nothing else
  left to mask now the stats row is gone — which is the point of the warning above.

`.pick-opp-grid.is-concealed` on the pick board has the **same missing blur** and is not
fixed here — see `pick-phase.md`.

## READY

`#draftReadyBtn` → `setMatchReady()` → `POST /api/rooms/:code/match-ready`. When both
sides are ready the server sets `status = "done"` and `cb.enterMatchLive()` runs.

The pressed state is `data-ready="1"` on the button, **not** a class swap. It toggled
`btn--ghost` from JS, which `.sm-ready-btn` overrode on cascade order, so pressing READY
changed the word and kept its accent — you could not tell at a glance whether you had
confirmed. An attribute on the same selector cannot lose that fight.

`.sm-ready-btn` is the confirm stage's single `--accent` element (DESIGN.md §3.2). The
rule reserving the accent for the turn clock does not bite: the clock is not on screen
here and nothing is counting down.

The stage indicator reads **start** for this whole screen. It read `ban` before, because
the only thing that ever reached "start" was the deleted done screen — so the indicator
walked backwards from pick to ban at the exact moment the draft finished.

---

# The three ways out (`#postMatchActions`, `ready/postMatch.js`)

The `live` footer. **Presence keeps polling in the `done` phase** — `pollPresence`
allows it, `setMatchReady` does not stop it, and `tryEnterDraftFromRoomSnapshot` no
longer stops it when reconnecting into a finished room. A rematch offer the other side
never receives is not an offer.

Listeners bind **once** per page load (`bindPostMatchOnce`); `renderPostMatch` runs on
every poll and would otherwise stack a listener per tick.

All three actions go to `POST /api/rooms/:code/post-match`, and the route **409s unless
`status === "done"`**: mid-draft these are a way to wipe the other player's picks.

| Action | Server effect | Where each client ends up |
| --- | --- | --- |
| `close` | `closed = true`, both seats cleared, reason "X closed the room." | initiator → `/`; other side's poll hits `closed` → `showRoomClosed` countdown |
| `new-match` | identical to `close`, reason "X started a new match." | initiator → `/room/<fresh code>?mode=host`; other side → room-closed countdown |
| `rematch-propose` | `entry.rematch = { by: side }` | offer appears in the other side's next poll |
| `rematch-accept` | `resetDraftToLobby(entry)`, seats kept | both reload into the lobby (ban settings) |
| `rematch-decline` | clears the offer | footer returns to its resting state |

`close` and `new-match` both ask first (`askConfirm`) — they end the room for the *other*
player too and cannot be taken back, the same reason Leave and Close room ask everywhere
else.

**Only the other side can accept** (`entry.rematch?.by !== other` → 409). Without it a
player could propose and accept their own rematch and drag the opponent back into a ban
phase they never agreed to.

**`applyPresenceSnapshot` must copy `sr.rematch`** — including the snapshots that clear
it. It did not, so `state.room.rematch` was permanently undefined and no offer ever
reached either screen. The server side of the feature tested clean the whole time; only
rendering the page caught it.

`entry.rematch` is cleared by `resetDraftToLobby`, so an offer never outlives the draft
it was made about.

The footer's three shapes come from `data-rematch` (`none` / `pending` / `incoming`)
rather than toggling `hidden` on five buttons — one attribute, and `ready.css` owns which
buttons each state shows, plus which one carries the accent (REMATCH while nothing is
pending, ACCEPT once something is; never both). In `pending` the REMATCH button stays on
screen at `opacity: .5` and `pointer-events: none` so the state is legible but spent.

`new-match` mints its code with `genRoomCode()` from `@/shared/lib/roomCode.js`, shared
with the home page's Rooms tab. There is no create-room endpoint — a room exists as soon
as somebody sends presence for its code.
