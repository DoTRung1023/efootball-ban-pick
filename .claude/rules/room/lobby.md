---
paths:
  - "public/js/features/draft/lobby/lobby.js"
  - "public/room.html"
---

# Lobby settings UI (`room.html` + `lobby.js` + `css/features/draft/lobby.css`)

- `.prep-col--settings` is a three-part card: `.prep-title` → `.prep-scroll` →
  `.lobby-cta-bar`, so the "BAN SETTING" heading and the START/READY footer stay pinned.
  Do not move `overflow-y` back onto `.prep-col--settings` — that is what let the header
  scroll out of view.

**Inside the ban-setting box, `.allowance-list` is the only scroller.** Above the
`max-width: 1200px` / `max-height: 820px` rung the lobby is `100vh` with
`overflow: hidden`, so the settings column is bounded and something inside it has to
absorb a long category list. That must be the list. Everything above it — BAN PER SIDE,
the two durations, the MODE cards, the CATEGORY ALLOWANCE header — is fixed furniture;
scrolling `.prep-scroll` instead slides it up underneath the panel header, and the panel
header is what the user is reading the labels against.

Four separate causes have produced that symptom, all now fixed:

- **`.prep-section--allowance` was `flex: 1 0 auto`.** `flex-shrink: 0` meant it could
  never give up height, so `.allowance-list`'s `overflow-y: auto` was inert — the section
  grew to fit every row and pushed the overflow outward. It is `flex: 1 1 auto` with
  `min-height: 0` now; without the `min-height` a flex item still floors at its content.
- **`.allowance-list` had `min-height: 80px`.** Same failure one level down: the list is
  the panel's shock absorber, and a floor on it means the shortfall lands on
  `.prep-scroll` instead. It is `min-height: 0` in the desktop regime, and
  `.allowance-empty` carries no floor either or a squeezed list clips its own
  placeholder. Both floors are restored in the auto-height regime by responsive.css,
  which is the only regime that needs them: there the list has no definite height to
  stretch a placeholder into.
- **`.allowance-category-panel` was hidden with `opacity: 0` alone.** An absolutely
  positioned box still extends its scroll container's scrollable area, so the closed
  "Choose a category" dropdown — up to 280px of it — added phantom scroll to the settings
  column that revealed nothing. It toggles `display` now, like every sibling panel
  (`.allowance-pos-panel`, `.allowance-multi-panel`, `.allowance-cap-panel`) already did.
- **…and the same panel *open* added 143px of real scroll** at 1440×830, because it hangs
  below the scroller's bottom edge. `clampDropdownToScroller()` in `lobby.js` caps it to
  the room left under its trigger when `.prep-scroll` is actually clipping (it is
  `overflow: visible` in the auto regime, where clamping would only shorten the menu for
  nothing). Below a 96px floor it gives up and lets the scroller take the overflow — one
  scrollbar beats a two-line menu.

**The guest gets to scroll it too.** `.allowance-list` used to sit in the readonly
`pointer-events: none` list, which on a *scroll container* is a wheel that does nothing:
the guest could see the first two of the host's twelve categories and had no way to reach
the rest. It is out of that selector now — everything inside it is a button, input or
label, so the guest scrolls the list and edits nothing. Verified at 1440×830: list
`pointer-events: auto` with 1167px of scroll range, and `button` / `input` / `label` /
`.allowance-pos-dropdown` / `.allowance-cap-wrap` inside it all still `none`.

Measured with twelve categories (1287px of rows): `.prep-scroll` scrollable **0** at
1440×830 and 1440×900, `.allowance-list` the only inner scroller in both, host and guest
alike. At 1440×762 the layout is in the auto regime instead — page scroll, list capped at
`45vh`, panel scroll still 0.

**"The host scrolls wrong, the guest is fine" was two windows either side of the height
rung**, not a host/guest difference at all: the guest's settings column is read-only, not
hidden, so the two render identically. Do not reach for a `state.mySide` explanation
before checking the viewport heights.

- `#lobbySettings` (`.lv-settings-panel`) and `.prep-section--allowance` are siblings
  inside `.prep-scroll` — no `.prep-section` wrapper around the settings panel.

## Hidden-input source-of-truth pattern

`pushLobbyConfig()` reads `#lobbyBansInput.value`, `#lobbyBanDurationInput.value`,
`#lobbyPickDurationInput.value`, `#lobbyRevealModeInput.value` directly. Visual controls
write to these hidden inputs and call `scheduleLobbyConfigPush()`. `renderLobby()` syncs
hidden inputs *from* `room.config` on every 500 ms poll (guarded by `data-touched` for
inputs the user is actively editing).

**Never update the visual display by writing to these inputs directly** — always update
`state.room.config` then call `renderLobby()`.

## CSS system

`.lv-settings-panel` (`flex column; gap: 14px`) → `.lv-field-row` → `.lv-field-group`
(`flex column; gap: 6px`) → controls:

- `.lv-field-row` — `grid-template-columns: repeat(auto-fit, minmax(136px, 190px))`.
  BAN PER SIDE, BAN DURATION and PICK DURATION share one row; the 190 px track cap stops
  a three-digit field from stretching across a third of a wide panel. MODE sits outside
  the row and spans the full width.
- `.lv-stepper` — `display: flex; align-self: stretch` so it fills its grid track and the
  three controls read as one row of equal-width fields. Contains `.lv-stepper-btn`
  (36×36 px, green, transparent bg) and `.lv-stepper-val` (`flex: 1`, centered, green
  inner borders).
- `.lv-duration-field` — free-entry duration control for BAN DURATION and PICK
  DURATION. `display: flex; align-self: stretch`, wrapping a flexing
  `.lv-duration-input` (`type="number"`, native spinners suppressed) plus a
  `.lv-duration-unit` "SEC" label, and mirrors `.lv-stepper`'s framing so all three
  settings read as one control family. `:focus-within` gives the green ring;
  `:out-of-range` turns the value red. The old `.lv-time-pill` preset row was replaced
  by this — fixed presets could not express arbitrary durations.
- `.lv-field-hint` — every field in `.lv-field-row` carries one so the three controls
  share a baseline. The durations state their range; `#banCountHint` is written by
  `renderLobby()` as `"<2×count> bans in total"`. Note `banCountPerSide: 0` does **not**
  skip the ban phase (`maybeAutoAdvanceFromBan` returns early on a falsy limit), so the
  hint must not claim it does.
- `.lv-reveal-cards` / `.lv-reveal-card` — always-visible mode option cards;
  `is-selected` = green border + glow. Each card carries
  `data-lobby-reveal-mode-option`. **Three cards** — INSTANT, BLUR, HIDDEN — laid out
  `repeat(auto-fit, minmax(200px, 1fr))` rather than a fixed column count, so the row
  folds to two and then one instead of squeezing all three. Adding a mode is a fourth
  card plus a `REVEAL_MODE_*` constant on **both** sides of the client/server pair; see
  `pick-phase.md` for what each mode conceals. The old trigger+panel dropdown pattern
  is gone — `renderLobby()` toggles `is-selected` on each card directly, and the
  existing click-delegation in `initLobby()` handles selection.
  - The BLUR card's icon is `🌫️` **with the U+FE0F variation selector**. U+1F32B is
    `Emoji_Presentation=No`, so bare it renders as a monochrome text glyph.

Layout:

- `.prep-col` sets `text-align: left`. `.centered-box` (shared with the error/abandoned
  boxes) centers text, and without this override every `.lv-field-label`,
  `.lv-field-hint` and `.prep-section-title` floats centered above a left-aligned
  control.
- `.prep-title` — `border-left: 2px solid var(--text); padding-left: 10px;
  margin-bottom: 16px`. The "BAN SETTING" heading; do not add a second rule for this
  selector.
- `.lobby-bottom-row` — one column. It was `minmax(0, 1fr) minmax(270px, 0.4fr)` with the
  chat on the right until the chat became the floating dock (`shell.css` +
  `features/draft/chat.js`); the settings panel now has the board to itself. It stays a
  grid so the ≤900 rung has something to restate.
- `.lobby-cta-bar` — settings-panel footer, `space-between`: `#lobbyWaiting` (why the CTA
  is blocked) on the left, `.lobby-actions` on the right. `.lobby-actions` carries
  `margin-left: auto` so the button stays right when the status is hidden. It carried a
  right gutter for the floating chat launcher for one round; the launcher clears the bar
  by sitting 84px up instead, so the button is flush with the panel edge again — see
  `css.md`.

## Squad size gates START

A draft deals a full squad to each side, so the lobby refuses to start one it
cannot finish. Two conditions, and they are the same arithmetic seen twice:

- every seat needs at least `PICK_COUNT_PER_SIDE` (23) players, and
- `banCountPerSide` may not exceed `smaller squad − 23`, because you pick out of
  your **own** squad and your opponent bans out of it.

**The rule lives on the server** (`squadStartProblem` / `maxBansForSquads` in
`rooms/config.js`) and is enforced in `POST /:code/start`, which re-counts both
squads at that moment — a squad can change in another tab while its owner sits in
the lobby, so the lobby's numbers are for display and the start-time count is the
one that decides.

The lobby holds **no copy of that arithmetic**. The snapshot carries
`maxBanCountPerSide`, already computed, plus a `playerCount` per participant;
`renderLobby` only compares a count against `FIXED_PICKS_PER_SIDE` — which it has
to print anyway — and reads the ceiling off the room. What it does with them:

- **`#lobbyWaiting` is the announcement**, and the only one. It sits in the CTA
  bar beside the button it is explaining, and turns red (`.ls-waiting.is-blocked`,
  dot included) whenever START cannot run. It began as a full-width red banner
  between the band and the settings; that was one warning too many next to a
  status line already saying the same thing, and the status line is where a
  reader looks for the reason a button is dead.
  - **Worded from where the reader sits**: `You have 10 of 23 players` to the one
    who has to fix it, `Minh has 10 of 23 players` — by name — to the one waiting,
    `Both squads need 23 players` when neither can field a draft. It read
    "Guest needs 23 players" to *the guest* before that.
  - It is 12 px uppercase mono in a bar it shares with the button, so **keep new
    strings short**; the banner's two-sentence copy does not fit here.
  - Red is spent only on a blocked start. The other things this pill says are
    ordinary waiting, and colouring those would spend the signal.
- `#lobbyHostSquad` / `#lobbyGuestSquad` (`.ls-squad`) print "35 players", or
  "10 of 23 players" with `.is-short` when the squad cannot field a draft. **The
  only red in the matchup band**, because it is the only thing there that blocks
  START.
- `#banCountPlus` disables at the ceiling and `_stepBans` clamps to it.
- `#banCountCapHint` reads "max 11 with these squads", and only when there is a
  ceiling to state (`maxBanCountPerSide >= 0`). It is **not** the old
  `#banCountHint`, which restated the number above it; this number comes from the
  squads and appears nowhere else. Below zero the squad line already says it.
- START is disabled and `#lobbyWaiting` carries the reason. The pill's
  `hidden = bothReady` had to become `bothReady && !squadBlockReason`, or the
  host reads "Opponent ready" beside a dead button.

**The counts refresh themselves, or the announcement would be a lie.** Squads are
counted when a seat is claimed and again at START, but a player fixing a short
squad does it in *another tab* — nothing about that reaches the room. So a lobby
heartbeat also tops the counts up, throttled to once every `RECHECK_MS` (10 s)
per room in `squads.js`. Measured: a guest going 10 → 23 in the database cleared
at t+12 s with no rejoin. Without it the banner would tell people to do something
that changes nothing they can see.

**An anonymous seat counts as unknown, not zero** — `null` playerCount, skipped by
the rule. There is no account behind it and so no squad, and the draft falls back
to a demo pool; counting it as 0 would stop every room in `draft-testing` from
ever starting.

## An allowance row is two labelled halves

`.allowance-item-row` is a grid of `main | cap | remove`, and **anything in the
right-hand column must declare `grid-area: cap`**. Without it the block
auto-places into the grid's empty first cell, landing *above* the control it
belongs beside and leaving the right half of the row blank — which is how the
card-type and position rows had always rendered, and how the new count pair
rendered until it was given the area. `.allowance-count-pair`,
`.allowance-cap-wrap` and `.allowance-pos-cap-wrap` all claim it.

Both halves carry a small heading, so a row reads as two labelled questions —
*which players* on the left, *how many* on the right:

- ranges → the **unit** (`def.unit`: YEARS, cm, kg, Rating), never the category
  name, which the row title already carries;
- foot → SIDE, and its two options are a `1fr 1fr` grid so they fill the column
  instead of sitting as small buttons against a wide empty track;
- the count pair → PLAYERS.

Measured at 320 / 480 / 620 / 900 / 1100: every row keeps both halves on one
line, with no overflow on the page or inside `#allowanceList`.

## Typing in the allowance list

Two separate bugs made the range fields almost unusable, and both came from
work happening while the user was still typing.

**1. The inverted-pair swap belongs on `change`, not on `input`.**
`normalizeAllowanceRangeValue` reorders a pair whose min exceeds its max. Run per
keystroke, that fires *mid-number*: with 30 in the min, the "3" of "35" made
`30 > 3` true, the two swapped, both boxes were rewritten under the cursor, and
the rest of the number landed in the wrong field. The `input` handler now stores
what is in the boxes verbatim (`rawAllowanceRangeValue`) and the `change` handler
clamps, swaps and writes back — **the same split the duration fields already
used**.

**2. `renderAllowanceList` rebuilds `#allowanceList` from `innerHTML` on every
render**, and a render follows every config echo. So about a second after a
keystroke the focused field was destroyed and recreated: focus went to `<body>`,
and that forced blur fired `change` — which ran the swap on a half-typed number.
Fixing the first bug alone did **not** fix the symptom; both were producing it.

The rebuild is now skipped while an `<input>` inside the list holds focus and the
category set is unchanged (`els.list.dataset.signature`). Deliberately narrow:

- a focused **button** is not typing, so Remove can still rebuild the list it
  sits in;
- a changed category set rebuilds regardless, so Add and Remove both work — both
  verified with focus held in a field, and a half-typed value survived the add;
- the **guest** never holds focus here (their inputs are disabled), so their
  view keeps updating live.

## Matchup band (`.lobby-summary`)

Three columns: `.ls-player--host` | `.ls-center` | `.ls-player--guest`. Each `.ls-player`
centres one `.ls-meta` stack — role / name / stats / connection. **There are no avatars
anywhere in this app** (`.ls-avatar` in the lobby, `.sm-col-avatar` in Start Match, and a
dead `#userAvatar` reference on home were all removed): there is no profile-image
feature, so an initial in a circle carried no information. Do not reintroduce one.

`.ls-center` carries the hairline side borders (the old single `.lobby-summary::after`
centre line does not work with three columns). `.lobby-kick-btn` positions `#kickGuestBtn`
absolutely in the guest slot's top-right corner; it is shown only while a guest is in the
seat. There is **no** counterpart button — a kick is permanent by design, so nothing in
the UI lifts one. Under 620 px the band stacks vertically.

`is-ready` on `.ls-player` tracks **slot occupancy**, not readiness — it only drives
`.ls-player--guest:not(.is-ready) .ls-name` (the italic "Waiting…" placeholder). Actual
ready state is the `.ls-conn` text.

Status is stated **once**: the guest slot says whether an opponent is present, and
`#lobbyWaiting` in the CTA bar says why START is disabled. The host's START button label
therefore stays "START DRAFT" and carries the reason in `title` only — do not put the
waiting text back on the button.

Guest read-only: `.prep-col--settings.is-readonly .prep-scroll :is(button, ...)` disables
all interactive elements including `.lv-stepper-btn` and `.lv-reveal-card` — no extra CSS
needed for new controls. `renderLobby()` additionally sets `.disabled` on the two
duration inputs directly (`banDurationEl.disabled = !isHost`).

**The `.prep-scroll` in that selector is load-bearing — never widen it back to the whole
panel.** `.lobby-cta-bar` is also inside `.prep-col--settings`, and the guest's own
READY button lives there; a panel-wide rule gives it `pointer-events: none`, so the
button looks live but swallows every click and the guest can never ready up. The dim
(`opacity: 0.58`) is scoped the same way so the CTA stays full strength. The readonly
click-guard in `initLobby()` skips `.lobby-cta-bar` for the same reason.

## Chat message accents

Chat itself has left this file — it is `features/draft/chat.js` plus the dock rules at the
end of `shell.css`. The message styling is unchanged: `.chat-item:not(.is-mine)` is the
**opponent** and is deliberately the louder of the two, because a new message from the
other side is what needs noticing; `.is-mine` is the quieter equivalent. The accent bar is
an `inset 3px 0 0` shadow, not a border, so neither variant shifts layout.

## Duration input ranges

The `min`/`max` attributes must match `MIN/MAX_BAN_DURATION_SECONDS` and
`MIN/MAX_PICK_DURATION_SECONDS` in `features/draft/constants.js`, which in turn mirror
`src/features/rooms/config.js`: **ban 5–900 s, pick 5–1200 s**. The `input` handler updates
`state.room.config` as the user types without pushing; the `change` handler (blur or
Enter) clamps through `normalizeBanDurationSec` / `normalizePickDurationSec`, writes the
clamped value back into the field, and schedules the config push. `startDraftFromLobby`

> **Colour system note.** This file predates the efhub re-skin. The token *names* below
> are current, but the reasoning often says "green", "cyan" or "glow" — those hues and
> that glow are gone. Green meant "you" and cyan meant "the opponent"; both are greyscale
> now, and the only accent left on this page is the turn clock and the pick slot waiting
> on you. Read `DESIGN.md` §3 and §12 for what replaced what; treat colour claims here as
> history and the structural claims as current.
re-validates both fields and refuses to start on an out-of-range value.
## Unlimited ban / pick time

The host can turn either clock off. **`0` is the sentinel** (`UNLIMITED_DURATION_SEC`,
declared in `src/features/rooms/config.js` and `public/js/features/draft/constants.js`);
that phase then runs with no deadline and ends the only other way a phase ever ends — both
sides confirming.

Four places had to learn it, and each was a real trap:

- **Both normalisers test for it first.** They are written `Number(raw) || DEFAULT`, which
  reads `0` as absent and hands back 120 / 300 — the one value that must not be clamped is
  the one that means "do not clamp me". `isUnlimitedDuration` is deliberately strict: `""`,
  `null` and `undefined` are *not* unlimited, they are missing, and still fall back to the
  default. Verified in a browser against the client copy and over the API against the
  server's: `0` and `"0"` → 0; `""`, `null`, `undefined` → the default; `2` → 5; `9999` →
  the max.
- **`turnDeadline(sec)` on the server** is the single place a live turn's `turnEndsAt` is
  computed, and it answers `null` for unlimited. Every reader already handled a null
  deadline, so nothing downstream needed a second case.
- **`ensureDraftTimer` must not invent one.** It fills in a missing `turnEndsAt` on
  reconnect; left alone it would have given this client a countdown the server never set,
  the opponent never sees, and that expires — taking the player's turn with it.
- **`validateDuration` accepts it.** It gates START on `min ≤ value ≤ max`, so without the
  case the UNLIMITED button set a value START then refused.

In the draft, a `draft`-phase room with `turnEndsAt === null` is *by definition* untimed —
the server writes null there for no other reason — so `startTurnTimer`'s tick paints `∞`
with a full bar and returns without scheduling an expiry.

The field swaps rather than dims: `.lv-duration-field.is-unlimited` hides the number and
its `sec` unit and shows "No limit". A disabled box reading `0 sec` says the opposite of
what it means. Measured: normal → input/unit `block`, no-limit `none`; unlimited → the
reverse. The input keeps carrying the 0 (so `readLobbyConfigFromDom` needs no special
case) and remembers the last real number in `dataset.lastFinite`, so turning unlimited off
gives the host their 90s back instead of the default.

**The ∞ toggle is a segment of the field**, mirroring `.lv-duration-unit` on the other side
of the number — same height, same divider, no radius of its own. It began as a pill on its
own row underneath, which gave the two duration columns a row the ban-count column did not
have; the settings row is three columns of *label · one control · one line of hint*, and
anything that only modifies the value beside it has to sit beside it.

`.lv-duration-field` carries `min-height: 38px` for the same reason: that is what
`.lv-stepper` measures (36px buttons plus its own borders), and the three controls share a
row. Measured at 1440: all three tops at y=303, all three 38px tall, all three groups 78px.

`#banCountHint` is gone — it read "6 bans in total" under a stepper showing 3, beside a
label reading BAN PER SIDE. Doubling a number the user just set is not information.
