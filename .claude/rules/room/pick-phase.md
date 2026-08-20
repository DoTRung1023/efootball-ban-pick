---
paths:
  - "public/js/features/draft/pick/**"
  - "public/css/features/draft/pick.css"
---

# Pick phase (`pick/pick.js` + `pick/pickView.js`)

## The board starts empty

There is no quick-load banner and no auto-selected plan. `loadDraftGamePlans()`
fetches the list but selects **nothing** — the pitch opens blank on
`DEFAULT_FORMATION`, and the only way to fill it in one go is LOAD GAME PLAN.

`getPickFormation()` reads `state.pickManualFormation` and nothing else. The
selected plan used to win outright, which silently defeated the formation
dropdown: you could not change formation after loading a plan because the plan
overrode the choice on the next render. Loading a plan now *writes* its formation
into `pickManualFormation`, so the dropdown stays authoritative afterwards.

## Layout

`#draftPickPhaseBoard` → `.pick-phase-layout`, a 3-column grid
(`380px | 1fr | 252px`; `360 | 1fr | 220` at ≤1100 px; single column at ≤860 px):

- **Left** (`.pick-phase-left`): a `.squad-pool-header` reading "MY SQUAD POOL",
  then a toolbar carrying the same controls as the ban board's — search, sort +
  direction, **FILTER**, **SHOW INFO** — then the ALL/GK/DEF/MID/ATT tab bar and
  `#pickGrid`. The grid holds **your whole squad**, with what you cannot act on
  marked; see "The pool is marked" below.
  The toolbar is **two fixed rows** (search alone, then the other three) and its
  buttons run tighter than the ban board's, because the column is ~360 px wide
  rather than the width of the page — see `css.md`.
- **Center** (`.pick-phase-center`): a `.pick-lineup-head` row carrying the two
  lineup-level controls on the left — `.pick-plan-row` with `#pickLoadPlanBtn`
  and `#pickFormationBtn`/`#pickFormationPanel` — and CLEAR ALL on the right.
  Then `#pickPitch`, then `.pick-bench-wrap` (`#pickBench` draws **every** slot
  past the starting XI as a real rectangle, which is what the old "23 MORE"
  label used to summarise), then the bottom bar with `#confirmPicksBtn`. The bench header is the title alone — `#pickBenchCount`
  is gone, because twelve visible rectangles already say what "1/12" said.

### The pitch sizes itself

`applyPitchSlotWidth()` measures `.pick-pitch-wrap` and writes `--pick-slot-w`
on `#pickPitch`: the largest slot at which the formation's rows fit without
scrolling, capped 116 px, floored 34 px. Same approach as `applyBanSlotHeight()`
in `banView.js`, and for the same reason — a fixed width is right at exactly one
window size. Four things it depends on:

- **The row count is read per render, never assumed.** It was a `PITCH_ROWS = 4`
  constant while every layout was four rows; eFootball's list runs to five
  (4-2-1-3, 3-2-4-1 …) and a five-row pitch measured as four overflows its column
  by a whole row. The floor moved 40 → 34 px for the same reason: 34 is what
  keeps five rows inside the 276 px the wrap gets at 1024 × 768. The empty-slot
  label is now the slot's **position** — `getFormationLayout` carries it per slot
  — with `BENCH_ROW_LABEL` from `shared/players/formations.js` for substitutes.
- **The widest row is the horizontal constraint** (5 slots in a back five, 3 in
  4-3-3), so the width bound is computed from `getFormationLayout(formation)`
  rather than assumed. `PITCH_INSET_X` / `PITCH_INSET_Y` cover what `.pick-pitch`
  itself costs inside the measured wrap now that it is a drawn field with padding
  and a border — keep them in step with `pick.css`.
- **It runs last in `renderPickBoard`.** Everything else in that function can
  change the column's height — the bench wrapping to a second row, CONFIRM PICKS
  appearing — so measuring earlier sizes the slots against a box that is about to
  change. This cost two window sizes a 3 px scrollbar
  before the call was moved.
- **It then verifies.** The arithmetic only knows the gaps and padding this
  module knows about, so after writing it shrinks 1 px at a time while
  `scrollHeight > clientHeight`, bounded at 8 steps and at the floor. Measuring
  beats predicting; it converges in one step and then costs a single read.

`.pick-pitch-wrap` takes its height from flex, not from its contents, so
resizing the slots cannot feed back into the measurement — the same guarantee
`applyBanSlotHeight` relies on. Verified across eleven window sizes from
1024 × 768 to 2560 × 1440 and every formation's widest row: nothing scrolls,
slots run 42 px → 116 px.

  There is **no lineup meta strip**. `#pickLineupMeta` and `renderLineupMeta`
  are gone, along with the pick count / formation pill / Avg OVR / plan badge
  they drew; the formation is stated by the dropdown button itself and the
  counts by the bench header and the slots. `averageOf` went with it — nothing
  else in `pickView.js` used it.
- **Right** (`.pick-phase-right`): LIVE label, opponent identity + count +
  progress bar, then `#pickOppGrid` — the opponent's picks as ordinary
  `playerCardHtml` cards — with `#pickOppLocked` in its place under the `hidden`
  reveal mode.

  There is **no conceal note**. `#pickOppConcealNote` printed "REVEALED AFTER
  MATCH" under the feed whenever the mode was not `instant`, and it outlived the
  thing it described: concealment now ends at Start Match, not after the match
  (see `ready-phase.md`), so the line was promising a later reveal than the one
  that happens. `#pickOppLocked` already says PICKS HIDDEN in the mode that hides
  the most.

`renderPickBoard()` is the **only** export of `pickView.js`; the plan dialog's
list is rendered from inside it, so opening the dialog just calls `renderDraftUi()`.

## Picks are per-side, and slot-addressed

Two properties of `room.picks[side]` that everything else follows from:

**Per-side.** Each player drafts from their *own* squad, so both sides owning the
same player is normal and neither blocks the other — exactly like bans. The
global `pickedPlayerIds` union is **gone** from the entry, the snapshot and the
client; it was the authority for pick conflicts and it made the opponent taking
Messi grey Messi out in *your* pool under a green "PICKED" badge. The only
conflict now is a duplicate within your own lineup. The opponent's *bans* still
make a player unavailable to you — those are aimed at you.

**Slot-addressed.** Index is the pitch slot and an empty slot is a `null` hole,
so removing a player leaves his slot empty rather than sliding everyone after him
along. Consequences, all of which have bitten:

- **`picks.length` is the highest filled slot, not the number of picks.** Use
  `pickCount(picks)` / `filledPicks(picks)` from `players.js`. Every count, cap
  check, average and progress bar goes through them.
- `buildOrderedSlotMap` skips holes, so an empty slot renders as an empty slot
  rather than a blank player card.
- `applyPresenceSnapshot` maps `null` through untouched — normalising it would
  turn every hole into a nameless player object.
- The holes are **sent**, not inferred. `POST /:code/picks` preserves the array
  exactly as given (bar trailing holes, which it trims), because that array *is*
  the pitch.

## LOAD GAME PLAN

`loadGamePlanIntoPicks(planId)` in `gamePlans.js`:

1. Fetches `/api/game-plans/:id/players` (ordered by slot).
2. Resolves each row against `state.mySquadPlayers` by pesdb id. Matching rather
   than using the returned row is deliberate — the plan endpoint does not carry
   the footer fields (foot, league, region, physicals) a player card renders.
3. Drops anything the opponent banned, and anything no longer in your squad.
4. Caps at `pickCountPerSide`, writes the plan's formation into
   `state.pickManualFormation`, and calls `replaceMyPicks()`.

It resolves to `{ loaded, dropped }` and the caller toasts both numbers.

**Clicking a row closes the dialog first, then confirms.** Choosing a plan is a
decision made, so the list goes away and the "Replace lineup" confirm is what
you are left looking at; cancelling drops you back to the board, not back to the
list. It used to load *then* close, which left the list sitting on top of the
confirm — both are `.confirm-overlay` and this one is later in the markup — so
the question was invisible until you dismissed the list yourself. `pick.css` now
also stacks the two explicitly, but the ordering here is the fix that makes it
read right. The row's `aria-busy` is purely a re-entrancy guard now: it is out
of sight by the time it is set, but the list can be reopened mid-fetch.

**No plan is ever marked as "current".** Every row in the dialog renders
identically — there is no tick, no highlight, and no `draftGamePlanSelectedId`
on state. Loading is a one-shot action, not a selection: the lineup is yours to
edit afterwards, so flagging a plan as current would claim a link between the two
that stops being true the moment you swap a slot. `getSelectedPlan()` went with
it; once the tick was gone nothing read the field.

## Every pick names its slot

**A click on a card never picks anyone by itself.** It takes two clicks — a card
and a slot — and they may come in either order. This is the game-plan pitch's
click-pair model, and it is the *whole* model here: there is no append path left.

Two pieces of state, one set at a time (`state.js`):

| | Set by | Means |
| --- | --- | --- |
| `pickActiveSlot` | a slot click | a slot is waiting for a player |
| `pickPendingPlayerId` | a card click | a card is chosen, waiting for a slot |

| Click | Then | Result |
| --- | --- | --- |
| a slot | — | selected (`.is-active`), empty or filled |
| a selected slot | again | deselected |
| a slot | a second slot | the two are exchanged |
| a slot | a card | the player lands in **that** slot |
| a card | — | chosen (`.is-pending`); the board gets `.is-placing` |
| the same card | again | the choice is dropped |
| a card | a slot | the player lands in **that** slot |
| a slot's `data-pick-slot-remove` × | — | the slot is emptied, and stays empty |
| anywhere else | — | whichever half is armed is dropped |

Pitch and bench slots both carry `data-pick-slot="<index>"` and one delegated
handler in `draftControls.js` (`initSlotControls`) serves both ends. **No drag
and drop**, so it works identically on touch.

Four things this depends on, each of which broke a working flow when it was
missing:

- **The outside-click guard reads `e.composedPath()`, not `e.target.closest()`.**
  The grid's own handler runs first and re-renders synchronously, which replaces
  the node that was clicked; by the time the document handler sees the event
  `e.target` is detached and `closest("#pickGrid")` walks up to nothing. It then
  reports the click as "outside the grid" and clears the choice `submitPick` had
  just made — measured: `pendingId: null` on every card-first click.
  `composedPath()` is fixed at dispatch and still holds the original ancestors.
- **`submitPick` reads `state.pickActiveSlot` before its first `await`**, for the
  same ordering reason.
- **The pool has no pick-limit gate.** Every card in it is clickable — being in
  it is what says it is available. A full lineup is still editable because a
  pick names its slot and landing on a filled one replaces its occupant — a
  23-pick lock would kill "change this player" at exactly the point you want it.
- **The pending player is resolved from `state.players`, not the filtered pool**,
  so changing the search or the position tab between the two clicks does not
  strand the choice.

## The pool is marked, not filtered

`renderPickGrid` shows all 35 of your cards and marks the two states you cannot
act on: **BANNED** (the opponent took him) and **PICKED** (he is already in your
lineup). Both drop the art to a dimmed grey, keep the badge at full strength, and
lose `is-clickable`.

It filtered instead for one release, with a `#pickPoolCount` line reading
`32 of 35 · 3 picked` over the grid to explain the shrinking. Two things were
wrong with it, and the second is the one that decided it:

- the pool stopped being a view of your squad and became a list of what was left,
  so *"did they ban him?"* and *"have I already got him in?"* — the two questions
  you actually ask here — could only be answered by a card's absence;
- **the BANNED badge is the only place in the pick phase that names which of your
  players the opponent took.** The count line said *how many*. Nothing said who.

Clearing a slot drops its card's PICKED badge on the next render. The card never
moved, so nothing reflows.

The badge is the carrier, not the hue: colour alone would leave a red-blind
player with two identical grey cards, so each state spells its word out and the
red on BANNED only reinforces it. CSS in `shell.css` — both boards draw it, so
neither phase sheet owns it.

Every change posts the whole lineup through `replaceMyPicks`. A write past the
end of a short lineup pads with holes first, or it would land nowhere.

### There is one pick write

`POST /api/rooms/:code/picks` is the whole surface. **`POST /:code/pick` — which
appended one player into the first free slot — has been removed**, along with
three things that existed only to serve it:

- `applyLocalAction` is now `applyLocalBan`, ban-only. Its second half
  (`firstFreeSlot`, write) had no caller once picks stopped being optimistic, and they stopped because `placePickInSlot` posts the whole
  lineup and takes the server's answer.
- `firstFreeSlot` is gone from `players.js`. Nothing anywhere decides where a
  pick goes any more — the client names the slot.
- The route's `requirePlayer` middleware stays: `/:code/ban` still uses it.

Do not reintroduce an append endpoint to "simplify" a single pick. A pick that
does not name its slot cannot express the empty rectangle you clicked, and the
UI is built entirely around that.

## Pick payload

`submitPick` and `replaceMyPicks` both send `pickPayload(player)`, which carries
position, overall and the nine footer fields — not the `{id, name}` that
`banPayload` sends. The room store is the only copy either side has of the
other's players, and the opponent's picks render as full cards here and again on
the Start Match screen; with id + name alone they came back as nameless dashes.
A ban only ever renders as a card image, so `banPayload` stays minimal.

## Confirming a squad

**Confirming does not advance the draft**, and that is the whole design. It sets
a flag; the *server* moves both players to `await-ready` once both flags are set
(`POST /:code/picks-confirm`, the twin of `/ban-confirm`). Until the opponent
confirms too, the decision is reversible.

`beginPostDraftReadyPhase()` is gone. It wrote `status`, `turnEndsAt` and
`matchReady` on the local copy, which meant one player pressing CONFIRM PICKS
walked into Start Match on their own while the other was still picking.
`enterReadyPhase()` replaces it: local state only — `state.phase = "ready"` and
the timer cleared — called from `renderDraftUi` when a snapshot arrives saying
`status: "await-ready"`. It is idempotent, because that runs every poll.

### The footer, in four states

The button is **never hidden**. It used to disappear until the squad was full,
which left the space under the bench blank and said nothing about what was
missing. `renderConfirmPicks` drives both it and `#pickConfirmHint`:

| Squad | Confirmed | Button | Hint |
| --- | --- | --- | --- |
| incomplete | — | `CONFIRM PICKS ▶`, **disabled** | `Pick all 23 players to confirm · 5/23` |
| full | no | `CONFIRM PICKS ▶` | empty, or `Opponent is ready and waiting for you` |
| any | yes | `UN-CONFIRM` | `Waiting for <name>…` (amber) |
| any | both | `UN-CONFIRM` | `Both squads confirmed — starting…` |

`.pick-confirm-hint` is always in flow with a `min-height` — the same lesson as
`.ban-status-hint`, where a line that came and went moved the footer under it.

### Confirmed means read-only

While your flag is set, every edit path refuses: `submitPick`, `replaceMyPicks`
and `initSlotControls` all check `isLineupLocked()`, the pool cards drop
`is-clickable`, and **the server returns 409 on `/picks`** so a stale tab cannot
slip an edit past a confirmation. Un-confirm, change, confirm again.

**And it now looks read-only.** `renderPickBoard` puts `is-locked` on
`#draftPickPhaseBoard` — the same shape as `is-placing`, and the flag every
locked rule in `pick.css` reads. Refusing a click is not the same as saying you
will: the pool cards still lifted and glowed under the pointer, the pitch still
drew its hover ring and still revealed the × on a slot that could not be
emptied, so the board advertised four affordances and honoured none. Locked, the
pool goes flat, grey and `not-allowed`, the slot rings and the × go, and a
banner above the grid says which button undoes it. See `room/css.md` for the
rules and what was measured.

Pick-timer expiry now confirms whatever you have rather than jumping to the
ready phase — the same shape as the ban stage flushing what you staged. Both
sides share one `turnEndsAt`, so both confirmations land and the server advances.

## Reveal mode

Three rungs of concealment, set in the lobby and normalised **twice** — in
`src/features/rooms/config.js` and `public/js/features/draft/state.js`, one of
the duplicated pairs CLAUDE.md lists. Anything unrecognised falls back to
`instant`, so an old room or a hand-edited config cannot conceal by accident.

| Mode | Pick board | Start Match |
| --- | --- | --- |
| `instant` | cards, count, progress bar | full squad + stats |
| `blur` | cards blurred; count + bar stay | squad blurred; stats stay |
| `hidden` | no cards, no count, no bar — status only | hidden column; stats masked |

The line between the two concealing modes: **`blur` hides identities, `hidden`
hides shape as well.** Blur keeps the count and the progress bar on purpose —
knowing they are 9 picks in tells you nothing about who those nine are. Hidden
does not, because a count *is* the shape of their squad, one number at a time.

- `blur` puts `.is-concealed` on `#pickOppGrid` — a blur, not a removal. The rule
  also sets `user-select: none` (the names are otherwise recoverable by dragging
  across the blur) and `renderOpponentPicks` sets `aria-hidden`, or a screen
  reader would read out exactly what the setting withholds.
- `hidden` never writes the opponent's players to the DOM at all — the grid is
  emptied and `hidden`, the count and `#pickOppProgressWrap` are `hidden`, and
  `#pickOppLocked` shows their name plus one of **Still picking** /
  **Squad complete** / **Left the room**. The state key drops their ids too: it
  is written to a `data-` attribute, so leaving them in would publish in the DOM
  exactly what the mode refuses to draw.

Do not "simplify" `hidden` back to a blur, or `blur` to a `display: none` — they
are two settings now and each is somebody's answer.

**`playerCardHtml` emits no `title`.** It used to, and `blur` leaked through it:
the cards are blurred and `aria-hidden`, and the native tooltip still printed the
opponent's names in full on hover. Card tooltips are now the styled panel in
`@/shared/ui/playerHoverCard.js`, which grids **opt into** — `#pickGrid`,
`#pickPitch`, `#pickBench` and the ban grid do; `#pickOppGrid` does not. Do not
add a `title` back to a card, in this file or `playerCards.js`.

## Interaction

- Clicking a card calls `submitPick(player)`. With a slot selected it routes to
  `placePickInSlot`; otherwise it just marks the card chosen and posts nothing —
  see "Every pick names its slot" above.
- `getPickListPlayers()` filters `state.players` — your own squad from
  `/api/my-players`, **not** the catalog — through the shared 18-field filter.
- The position tabs are a **shortcut onto `state.pickFilterPositions`**, the same
  array the FILTER panel's POSITION multi-select edits. Which tab is highlighted is
  *derived* from that array each render (`activePickTab`), not stored — a
  remembered tab would go stale the moment a position was toggled in the panel.
  There is no separate `pickFilterPosition` and no `pickPosTab` state.
- CLEAR ALL confirms, then posts an empty array. **`renderClearAll` disables it
  when it has nothing to do** — an empty lineup, or a confirmed one, where
  `replaceMyPicks` refuses the write and the server answers 409 anyway. Both used
  to open a confirm dialog that then changed nothing. The emptiness test is
  `pickCount(myPicks) === 0`, **not** `myPicks.length`: the array is slot-addressed
  with `null` holes, so a single pick in slot 3 has length 3.
- The opponent's cards render with `playerCardHtml(p, { footer: false })` — their
  lineup is context, not something you act on, and the four metadata lines are
  unreadable in a 252px column.
- The pick grid's diff guard is a **`rowsKey`**, not a state key: it is the
  ordered player ids and **nothing about their state**. Picking someone changes
  only his flags, so it repaints them in place (`paintCardFlags`) instead of
  rebuilding. Rebuilding threw away 40 `<img loading="lazy">` elements and made
  40 more; combined with images that had no declared size, that collapsed the
  grid and scrolled the roster upward on every pick — the visible bug. Those
  classes are deliberately absent from `rowsKey`, so mutating them cannot desync
  the guard the way `is-hovered` would (see `ban-phase.md`). An `innerHTML`
  comparison still must not be substituted for either.
  **The ban grid works the same way now**, and this entry used to note that it
  did not. Both grids key on `rowsKey` and share the one `paintCardFlags` in
  `shell/cardGrid.js`, so a staged ban no longer re-requests the lazy images
  below the fold either.
- **The pitch and bench keys carry the lineup, not the selection.**
  `is-active` is painted in place by `paintActiveSlot()` and appears in neither
  key, nor in `pickSlotHtml` — the same treatment `paintCardFlags` gives the
  pool, for a sharper reason. With `active` in the key, clicking a slot rebuilt
  the pitch, and the replacement element is not hovered until the engine
  re-resolves hover: the slot painted its selected look for a frame and then
  dropped into its hovered one, a visible two-step where the game-plan pitch
  changes once. `selectPlanSlot` in `plans.js` toggles the class over the
  elements already on screen; this now does the same. Verified by stamping every
  slot element and re-rendering: selecting, moving and clearing the selection
  all keep **every element identical**, `aria-pressed` moves with the class, and
  a real pick still rebuilds.
  `active` is `null` for "nothing selected" — `paintActiveSlot` tests for it
  explicitly, because `Number(null)` is `0` and would light up the first slot.
- **Hovering a pitch or bench slot floats the player's info.** The lineup needs
  it more than the pool does: a slot is artwork and an ×, with no footer to turn
  on, so it is the only place the four metadata lines are otherwise unreachable.
  Wired in `bindPickPhaseUiOnce` via `bindCardGridHover`; `data-pick-slot` is the
  index into `picks`, holes and all, so an empty slot resolves to null and shows
  nothing. See `room/modules.md`.
- CONFIRM PICKS is covered in its own section below.

> **Colour system note.** This file predates the efhub re-skin. The token *names* below
> are current, but the reasoning often says "green", "cyan" or "glow" — those hues and
> that glow are gone. Green meant "you" and cyan meant "the opponent"; both are greyscale
> now, and the only accent left on this page is the turn clock and the pick slot waiting
> on you. Read `DESIGN.md` §3 and §12 for what replaced what; treat colour claims here as
> history and the structural claims as current.

## CONFIRM PICKS

The only condition is a full squad: `#confirmPicksBtn` is disabled until the
lineup holds `pickCountPerSide` players, and `#pickConfirmHint` carries the count
(`Pick all 23 players to confirm · 3/23`). **Un-confirming is never blocked.**

There used to be a second gate here — a per-category minimum, checked at CONFIRM
because an empty board breaks every minimum. The category system is gone; see
the note at the end of `lobby.md`.
