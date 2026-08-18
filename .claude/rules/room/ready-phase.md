---
paths:
  - "public/js/features/draft/ready/readyView.js"
  - "public/js/features/draft/ready/matchSteps.js"
  - "public/js/features/draft/ready/postMatch.js"
  - "public/js/features/draft/shell/exitScreens.js"
  - "public/js/pages/room.js"
---

# Start Match — the last screen of a room (`#draftReadyPhaseBoard`)

**There is no screen after this one.** It has four stages and it does not navigate
between them — `data-stage` on the board, written by `renderReadyBoard`, swaps the
footer and nothing else moves:

| `data-stage` | Room status | Footer | Means |
| --- | --- | --- | --- |
| `confirm` | `await-ready` | READY | my squad is set up in the game |
| `start` | `await-start` | START MATCH | I have kicked off |
| `live` | `live` | FINISH MATCH | the match is being played |
| `post` | `done` | rematch / new match (`.sm-foot--post`) | it is over |

**The first three are one footer** (`.sm-foot--step`) reading its words out of a row of
`ready/matchSteps.js`: the button label, the chip on each team head, and the three things
the hint can say. Adding or reordering a step is a row there; nothing branches on which
step is open. Only `post` is different markup.

**Every one of the three needs both sides.** The server owns the transition, so the
button on your screen is always the step the room is actually on — you cannot press ahead
into the next one. `renderReadyBoard` takes no stage argument for the same reason: it
reads `room.status`, which is the one answer both clients share.

Each step is undoable while the other side has not answered — press again and the room
walks back a stage with you. **Finish is the exception and must stay one**: see
`/match-step` in `backend.md`.

You reach `confirm` only when **both** sides have confirmed their squads: the server
sets `status: "await-ready"` and `renderDraftUi` calls `enterReadyPhase()` on the
snapshot carrying it. Confirming alone leaves you on the pick board waiting — see
`pick-phase.md`.

The client keeps **one phase, `ready`, for the first three stages** — they are one screen
with one set of rules about what else is on it, and `isReadyPhase()` is what every other
module asks. Only the finished room gets its own phase, because the exit guard and the
rematch watch turn on it.

`enterPostMatch()` (in `shell/draftView.js`) is the one-way move to `post`. It sets
`state.phase = "done"`, stands the exit guard down, and renders. The guard stays **up**
through `live`: a match in progress is very much something to warn about walking out of.
It **does not** change the view and **does not** clear the cached phase — that cache is
what lets a reload come straight back here, and the room is still open while a rematch
can be offered.

> There used to be a separate `#viewDone` screen for the second stage: it re-listed as
> plain text the same two squads this screen already draws as cards. It is gone —
> along with `showDone`, `.view--done` and every `.done-*` rule. `showRoomClosed` is now
> the only terminal screen in `exitScreens.js`.

`renderDraftUi` therefore renders in the `done` phase as well as `draft` and `ready`
(`RENDERED_PHASES`), and `enterReadyPhase()` is **not** called once the match is live —
it would walk the phase back out of `done` on the next poll.

## Layout

- **There is no tip line.** A rotating row of encouragement sat under the button during
  `live`. It said nothing about the room and nothing about the match, and it was the only
  text on the screen not answering a question the player had — the hint above the button
  already says what the room is waiting for, which is the footer's whole job.
- **In `live` the hint reads before the button** (`order: -1` on `.sm-foot-hint`, scoped
  to that stage). In the two stages before it the button *is* the message; once the match
  is on, "Match in progress" is, and the button answers it. Measured at 1440×900: hint at
  y=859, button at 888 — against button 859 / hint 913 in the other stages.
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
`n/11 XI`, the whole `#smStats` comparison row — AVG RATING, SQUAD DEPTH, FORMATION,
STARTING XI, AVG AGE — along with `averageOf`, `barStat`, `textStat` and the `.sm-stat*`
rules, and finally the bench head's own `· n`. The strip prints `BENCH` and the cards
under it are the count. The screen's one job is to show the two squads, and five numbers
per side competed with them for the space.

`bench.length` is still read — it chooses between the strip and "No substitutes picked."
It just is not printed.

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
- `hidden` — the column is replaced wholesale by `.sm-team.is-hidden`. The chip stays:
  it says how far along the *step* the opponent is, not anything about their squad. Their ids and
  their formation also stay out of `data-teams-key`, which is written to the DOM and
  would otherwise publish exactly what the column refuses to draw. There is nothing else
  left to mask now the stats row is gone — which is the point of the warning above.

`.pick-opp-grid.is-concealed` on the pick board has the **same missing blur** and is not
fixed here — see `pick-phase.md`.

## The one button

`#draftStepBtn` → `setMatchStep(step, value)` → `POST /api/rooms/:code/match-step`.
`draftControls` looks the open step up by room status and posts the negation of this
side's current flag; it does not know there are three.

The client **does not work out whether the room should advance** — it posts an answer and
re-renders from the status that comes back. `isBothMatchReady()` used to do exactly that
from the client's copy of the flags, a second implementation of a rule the server already
owned, and with three handshakes it would have needed a step argument to keep saying the
same thing. It is gone, along with its `cb` entry.

The pressed state is `data-pressed="1"` on the button, **not** a class swap. It toggled
`btn--ghost` from JS, which `.sm-step-btn` overrode on cascade order, so pressing it
changed the word and kept its accent — you could not tell at a glance whether you had
answered. An attribute on the same selector cannot lose that fight.

`.sm-step-btn` is each handshake stage's single `--accent` element (DESIGN.md §3.2). The
rule reserving the accent for the turn clock does not bite: the clock is **hidden** for
this whole screen — see `draft-shell.md`.

The chip on each team head takes its words from the same row: READY / NOT READY, then
STARTING / NOT STARTED, then FINISHED / PLAYING. It answers "where is this player up to",
so it has to move with the step or it answers a question nobody is asking any more.

The stage indicator reads **start** for this whole screen. It read `ban` before, because
the only thing that ever reached "start" was the deleted done screen — so the indicator
walked backwards from pick to ban at the exact moment the draft finished.

---

# The three ways out (`#postMatchActions`, `ready/postMatch.js`)

The `post` footer. **Presence keeps polling in the `done` phase** — `pollPresence`
allows it, `setMatchReady` does not stop it, and `tryEnterDraftFromRoomSnapshot` no
longer stops it when reconnecting into a finished room. A rematch offer the other side
never receives is not an offer.

Listeners bind **once** per page load (`bindPostMatchOnce`); `renderPostMatch` runs on
every poll and would otherwise stack a listener per tick.

All three actions go to `POST /api/rooms/:code/post-match`, and the route **409s unless
`status === "done"`**: mid-draft these are a way to wipe the other player's picks.

| Action | Server effect | Where each client ends up |
| --- | --- | --- |
| `new-match` | `entry.newMatch = { by: side }`, any offer cleared. **Nothing else** | initiator → `/room/<fresh code>?mode=host`; other side **stays on this screen** with REMATCH disabled |
| `rematch-propose` | `entry.rematch = { by: side }` | offer appears in the other side's next poll |
| `rematch-cancel` | clears the offer; **proposer only** | offer disappears from both screens |
| `rematch-accept` | `resetDraftToLobby(entry)`, seats kept | both reload into the lobby (ban settings) |
| `rematch-decline` | clears the offer | footer returns to its resting state |

## NEW MATCH does not end the room

It sets a flag and stops. The room stays open, the status stays `done`, both seats stay
put, the squads stay on screen — the player who did not press it keeps looking at the
match they just played, now told that nobody is coming back.

It used to set `closed`, clear both seats and reset the draft, which put the other player
on the "Room closed" countdown and then on the home page. Being left behind is not the
same as being thrown out, and only one of those is a thing the other player did to you.

`newMatch.by` is read off **every** snapshot (`applyPresenceSnapshot`), same rule as
`rematch`. When it names the *other* side, `renderPostMatch`:

- toasts `X started a different match.` — **once**, guarded by `announcedNewMatch`,
  because the render runs twice a second;
- sets `disabled` on `#pmRematchBtn`. The attribute, not a class: it has to stop the
  click as well as look spent. `[data-opponent="gone"]` on the row carries the look;
- moves the accent to NEW MATCH, which with nobody to play is the only thing left to do.
  DESIGN.md §3.2 still holds — one accent, it has just changed hands.

Nothing clears the flag but `resetDraftToLobby`. There is no way back into a room whose
other seat has walked out, and pretending otherwise would be the offer failing silently.

## An offer can be withdrawn, and every answer is announced

`pending` used to leave REMATCH on screen at half opacity: legible, and a dead end — once
offered, the only way out was leaving the room. **CANCEL REMATCH** takes that slot, and
the server allows it only for the side that made the offer (`entry.rematch?.by !== side`
→ 409). Cancelling somebody else's offer is declining it, and decline already exists.

Every answer reaches the other player as the offer **disappearing**, which on its own is
silent — you would be left looking at a button with no idea anybody had responded. So
`renderPostMatch` compares against the shape it last painted:

| transition | announcement |
| --- | --- |
| `pending → none` | `X declined the rematch.` |
| `incoming → none` | `X cancelled the rematch offer.` |

Both are suppressed by `iAnswered`, set just before I decline or cancel myself — those
clear the offer exactly like the other side's answer does, and without the flag the
screen would tell me my own news. An **accept** never reaches this comparison at all: it
puts the room back in the lobby, and the poll routes a non-`done` status to
`onRematchAccepted` before any of this runs.

`new-match` asks first (`askConfirm`) — it ends the room for the *other* player too and
cannot be taken back, the same reason Leave and Close room ask everywhere else.

**There is no CLOSE ROOM button, and no `close` action behind it.** The stage header
carries Close room (host) / Leave (guest) on every screen of the room including this one,
so the footer was a second door into an action that already had one. `/leave` is what the
header button posts; the post-match branch had no caller left once the button went.

**Only the other side can accept** (`entry.rematch?.by !== other` → 409). Without it a
player could propose and accept their own rematch and drag the opponent back into a ban
phase they never agreed to.

**`applyPresenceSnapshot` must copy `sr.rematch`** — including the snapshots that clear
it. It did not, so `state.room.rematch` was permanently undefined and no offer ever
reached either screen. The server side of the feature tested clean the whole time; only
rendering the page caught it.

`entry.rematch` is cleared by `resetDraftToLobby`, so an offer never outlives the draft
it was made about.

**What each button does is a `title` on the button**, and all five carry one — including
ACCEPT and DECLINE, which the old copy did not cover. It was a line of small print under
the row (`.sm-foot-note`) naming three of the five, on screen permanently, for something
you read once. Native `title` is what the rest of the app uses for exactly this; the
styled hover panel in `shared/ui/playerHoverCard.js` is not a general tooltip component,
it exists because a `title` on a *concealed* player card leaks the name it is hiding.
Nothing here is concealed.

The footer's three shapes come from `data-rematch` (`none` / `pending` / `incoming`)
rather than toggling `hidden` on five buttons — one attribute, and `ready.css` owns which
buttons each state shows, plus which one carries the accent (REMATCH while nothing is
pending, ACCEPT once something is; never both). In `pending` the REMATCH button stays on
screen at `opacity: .5` and `pointer-events: none` so the state is legible but spent.

`new-match` mints its code with `genRoomCode()` from `@/shared/lib/roomCode.js`, shared
with the home page's Rooms tab. There is no create-room endpoint — a room exists as soon
as somebody sends presence for its code.
