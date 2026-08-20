---
paths:
  - "public/js/features/draft/ban/**/*.js"
  - "public/js/features/draft/playerQuery.js"
  - "public/js/features/draft/playerCards.js"
  - "public/js/features/draft/filterOptions.js"
  - "public/js/pages/room.js"
---

# Ban phase


## Where the code lives

`ban.js` was a 791-line module that seven other modules reached into, mostly for things
that were not ban-specific. It is now:

| Module | Holds |
| --- | --- |
| `ban/banView.js` | renders the board and the sidebar; owns `--ban-slot-h` |
| `ban/banToolbar.js` | search, sort and the filter multi-selects |
| `ban/banInteractions.js` | `bindBanPhaseUiOnce` (idempotent — the board re-renders on every poll), the grid info toggle |
| `ban/opponentSquad.js` | `loadOpponentBanPlayers` — you ban from the *opponent's* squad |
| `../playerQuery.js` | the list query and sort, shared with the pick phase |
| `../playerCards.js` | `playerCardHtml` + the sidebar thumbnails, shared with pick and ready |
| `../filterOptions.js` | `fetchFilterOptions`, also used by the lobby |

The three modules at the draft root are there because more than one phase imports them,
and their symbols are named for what they do rather than for the phase they were born
in — `playerCardHtml`, `normalizeSortValue`, `toValidPosition`, `LEAGUE_OPTIONS`. The old
`Ban`-prefixed names were what let the leak build up in the first place, so **keep a
`ban` prefix for things that really are ban-only.** `getBanListPlayers` and the staged-ban
thumbnails earn theirs; a shared helper does not.

## Layout

Ban phase left panel: a `.squad-pool-header` — "OPPONENT SQUAD" and
`#banPoolCount` — then the toolbar and `#banGrid`. The grid had no label at all
until the count needed somewhere to live. It is 14 px tall and stays on one line
at 320 / 480 / 620 / 900 / 1440 (measured); the count wraps rather than
truncating, because every clause after the first is the part that explains why
the grid is short.

**The grid holds only cards you can still ban.** One you have already taken —
staged or confirmed — leaves it, and `#draftMyBansStrip` on the right is where
you read your bans back. `renderPoolCount` writes `34 players`, or
`33 of 34 · 1 banned` once you have started.

Ban phase right panel: `.ban-phase-right` sidebar with two `.ban-side-section` blocks
(bans-on-me / my-bans) and a `.ban-side-actions` footer. Each section header contains a
`.ban-opponent-badge` pill showing the username, a colored presence dot
(`.ban-opponent-dot.is-online`), and a status text (`· is choosing...` /
`· confirmed ✓` / `· left the room`).

**Keep the two sections structurally identical — head + badge + strip, nothing else.**
Both are `flex: 1` (basis 0), so they always get the same height, but anything extra
placed *inside* one section eats into that section's strip and the two ban boxes stop
matching. CONFIRM BANS (`#confirmBansBtn`) and the confirm-status line
(`#draftMyBansStatus`) used to live inside the MY BANS section and made its strip ~54 px
shorter than the other; they now sit in the `.ban-side-actions` footer, which is
`flex: 0 0 auto` and spans the panel. Measured: both strips are pixel-identical at
760 / 900 / 1100 px viewport heights.

A high ban cap no longer scrolls: `applyBanSlotHeight()` shrinks the shared
`--ban-slot-h` so every slot fits its strip. See the ban-thumbnail section in
`room/css.md` for the sizing rule and the measured results — the short version is that
the cards stay height-driven (`width: auto`), so one number scales the strip without
letterboxing the art. It runs on every presence poll but only writes when the value
changes, and the strip's height comes from the flex layout rather than its contents, so
the measurement cannot feed back into what it sets.

## BAN ORDER — simultaneous or alternating

`banOrder` decides the **shape of the turn schedule**, and everything else
follows from that. `src/features/rooms/schedule.js` owns it:

- `simultaneous` (default) — one `{ side: "both", action: "ban" }` turn. Both
  sides stage bans against one clock and the phase ends on both confirming.
- `alternating` — `2 × banCountPerSide` turns, `host` first. One ban per turn.

**The client never reads `banOrder`.** It asks the schedule whose turn it is:
`isSoloTurn()` in `draftFlow.js` is `turn.side !== "both"`, and both `isMyTurn`
call sites already compared `turn.side` against `mySide` before any of this
existed. The two order constants are declared on both sides for the config
round-trip and nothing else.

### One ban is the turn

- `submitBan` posts immediately on a solo turn instead of staging —
  `submitSoloBan`, which takes the server's snapshot back. There is nothing to
  stage and nothing to confirm, so `#confirmBansBtn` is `hidden` and
  `renderTurnHint` takes over the line beneath it ("Your turn — pick one player
  to ban" / "Waiting for X to ban…"). A board that just stops responding says
  nothing about why.
- **The server refuses an out-of-turn ban** (409), not just the client. A tab
  that missed a turn change would otherwise ban through the other player's slot.
  Verified over the API: 409 for the guest at index 0, 200 for the host, and 409
  for the host immediately after.
- `advanceBanTurnIfSolo` runs on the ban write and hands over, re-arming
  `turnEndsAt` per turn. `turnDeadline` already answers `null` for the unlimited
  sentinel, so ∞ still means ∞.
- **BAN DURATION is per turn here, not per phase** — three bans a side at 120 s
  is a twelve-minute ban phase.

### A turn that runs out is auto-banned

The highest-rated player left in the opponent's squad, chosen by the **server**
so both clients see the same name (`topBannableFrom` in `squads.js`, ordered
`overall_max DESC, name ASC` — a total order, so two equal ratings cannot
resolve differently on two reads). An anonymous seat has no squad and its board
is showing the demo pool, so the auto-ban comes from `topCatalogPlayers()` — the
same helper `/api/top-players` uses, extracted for exactly this reason.

**Resolved on read, because there are no server-side timers.** Polling-only, no
WebSocket, and presence deliberately has no TTL — so `maybeResolveExpiredBanTurn`
hangs off the presence path and the next heartbeat from either client is what
notices. Worst case 500 ms. `entry.resolvingBanTurn` guards it: measured with
twelve simultaneous heartbeats against one expired turn, exactly one ban and one
chat line. It re-checks the turn after its `await` too, in case the player got
their own ban in first. Every outcome is announced in chat, including the one
where there is nothing left to take.

## BAN REVEAL — what the opponent's strip shows

`banRevealMode` is the second half of what MODE used to be. `revealMode` governs
the pick board and Start Match; this governs `#draftBannedOnMeStrip` and
`#draftBannedOnMeCount`. Both use the same three rungs and the same
`normalizeRevealMode`, and the lobby builds both card groups from one
`REVEAL_GROUPS` table.

It exists because the ban phase is **simultaneous** and `syncStagedBans` mirrors
the opponent's staged bans on every 500 ms heartbeat — so without it you watch
which of your players they are taking before they have confirmed, and can react
while choosing your own.

| Mode | Their strip | Their count |
| --- | --- | --- |
| `instant` | faces, live | live |
| `blur` | `concealedBanThumbHtml` — the real card, blurred | live |
| `hidden` | nothing; the slots read as un-banned | their **confirmed** count only |

Three things that are easy to get wrong, all of them measured:

- **It only ever governs their *staged* bans.** `bans[theirSide]` does not fill
  until they confirm, and once they have you need to know what you lost before
  you pick — so `concealTheirs` is `""` the moment `theirConfirmed` is true.
  Verified: under `hidden`, two confirmed bans render in full, with their ids.
- **`hidden` has to give back the slots too.** Dropping the thumbs while still
  reserving their places left the strip two short of full, which says "they have
  banned two" as plainly as the faces would. `remaining` counts what is *shown*,
  not what exists. This was a real leak and the harness caught it: 2 empty slots
  where there should have been 4.
- **`blur` renders the real card, blurred — and that is the point.** The first
  cut drew the anonymous portrait with `grayscale(1)` on top, which concealed
  perfectly and told you nothing: every blurred ban was the same grey smudge, so
  the mode was `hidden` with extra steps. A rung between "see everything" and
  "see nothing" has to leave *something* to infer from, and on a card that is its
  colour — the rarity band, the kit, roughly how bright the art is.
  So: real image, **no grayscale**, `opacity: 0.9` (0.55 washed the colour back
  out), and `blur(4px)` rather than 7 — a ban thumb is ~40px wide, and 7px
  flattened each card to a single block. The name on the art is 4-5px tall at
  that size, so 4px still takes it well past reading. Verified by screenshot,
  because "can you still infer the colour" is not a thing an assertion answers.
  The name and the id stay out of the markup either way (`alt=""`, no
  `data-player-id`, `aria-hidden`), so nothing recovers them by selecting,
  hovering or reading the page aloud — but the image URL carries the id, so this
  conceals from the player and not from their devtools.

`concealKey` is part of `renderBanStrip`'s diff key, or switching the mode
mid-phase repaints nothing.

**Still concealment, not secrecy** in one respect: under `blur` and `hidden` the
snapshot itself continues to carry the opponent's staged bans, so a determined
player can read them out of the network tab. Making it real means withholding
them in `serializeRoomEntry`, which is a server change and has not been made.

## Interaction

- Bans are **per-side and independent**: each user bans from the opponent's squad
  (User A bans to restrict User B's picks; User B bans to restrict User A's picks). Both
  users can ban the same player without conflict — the duplicate-ban check only prevents
  a user from banning the same player twice on their own side.
- Clicking a player card in the ban grid calls `submitBan(player)` which **stages** the
  ban in `state.stagedBans[]` and calls `renderDraftUi()` — **no API call at this
  point.** Staged bans appear in the MY BANS strip alongside confirmed bans.
- **CONFIRM BANS is a toggle, and stays enabled once confirmed.** While you wait
  for the opponent the label reads UN-CONFIRM and `unconfirmBans()` posts
  `ban-confirm { confirmed: false }`. The server hands that side's bans back as
  **staged** ones — so the strip's × and counter, which put them there, can take
  them away again, and re-confirming is the same button it always was. It used
  to disable itself on confirm, which left a page reload as the only way back.
  While confirmed the grid's cards are not clickable and the server 409s `/ban`.
- `confirmStagedBans()` (CONFIRM BANS button) flushes the staged array via
  `flushStagedBansLocally()` + `submitBansToApi()` (`POST /api/rooms/:code/ban`), then
  calls `callBanConfirm()` → `POST /api/rooms/:code/ban-confirm`. The server marks
  `bansConfirmed[side] = true`; if both sides are confirmed it advances `turnIndex = 1`
  (pick phase), sets `turnEndsAt`, clears `stagedBans`/`bansConfirmed`, and returns the
  updated room snapshot. The client that called confirm starts the pick timer
  immediately in `callBanConfirm`; the other client's `renderDraftUi` detects
  `!isBanPhase && !state.turnTimer` and starts it on the next render cycle.
- **Duplicate-ban prevention** uses only the current user's own bans: the server checks
  `entry.bans[sideKey]` (not the shared `bannedPlayerIds` union); the client checks
  `room.bans[mySide]` in both `applyLocalBan` and `submitBan`. The ban grid renderer
  computes `myConfirmedBanIds` from `room.bans[mySide]` — a card is greyed out only if
  YOU already confirmed that ban, not if the opponent banned it. `bannedPlayerIds` (the
  union of all bans) is still maintained in `entry`/`room` for other uses but is no
  longer the authority for ban-phase duplicate detection.
- **Picks work the same way**, and did not always: they were globally exclusive
  through a `pickedPlayerIds` union, which has since been removed entirely. See
  `pick-phase.md`. The ban grid no longer carries a "picked" flag at all — bans
  are resolved before any pick exists, so it was always dead.
- Staged bans sync to the opponent in real-time via the presence heartbeat:
  `registerPresence()` sends `state.stagedBans` as `{ id, name }` objects; the server
  stores them under `entry.stagedBans[role]` and returns them in the snapshot.
  `applyPresenceSnapshot` reads the opponent's array into `state.opponentStagedBans` and
  `renderDraftUi()` renders them in the BANS ON ME strip using
  `opponentStagedBanThumbHtml` (dimmed, red inset outline).

## State-key diff guard (do not remove)

`renderDraftUi()` runs unconditionally every 500 ms (driven by `pollPresence`). To avoid
destroying and recreating DOM nodes on every cycle, the ban grid and both ban strips use
a **state-key diff guard**: a compact fingerprint of the current data (player IDs in
sorted/filtered order + ban/pick flags + turn state) is stored as a `data-state-key` /
`data-bans-key` attribute and compared before any `innerHTML` write.

**Do not replace this with an `innerHTML` string comparison** — browsers normalize
whitespace and drop the `/` on void elements (`<img />` → `<img>`) when serializing, so
the strings never match and the grid would rebuild every poll cycle.

- The ban grid state key uses `myConfirmedBanIds` (`"b"` suffix) and staged ban IDs
  (`"s"` suffix). There is no picked flag — bans are resolved before any pick exists.
  Because the flags are *in* the key, staging a ban rebuilds the whole grid. The
  pick grid no longer works this way: it keys on the player list alone and repaints
  flags in place, which is what stopped its roster jumping on every pick. See
  `pick-phase.md`; the ban grid would benefit from the same treatment.
- The BANS ON ME strip key encodes confirmed bans (`"c"` suffix), opponent staged bans
  (`"s"` suffix), and the remaining empty-slot count — all three must agree before a
  write is skipped.

Related invariants:

- When a new thumb is added to either ban strip, `is-new` is added to the last child via
  JS to play the `thumbAppear` spring animation (`@keyframes thumbAppear` in `ban.css`).
- The `is-hovered` class is **only added to `.mini-card` elements** (JS-driven hover for
  the pick grid). `.player-card` elements in the ban grid rely purely on the CSS
  `:hover` pseudo-class — adding `is-hovered` to them would mutate the DOM and break the
  state-key guard.

## Filter & sort

**The 18-field filter is shared with the pick board** — `playerFilters.js` at the
draft root owns the field tables, the panel markup, the event wiring and the
predicate, parameterised by a `prefix` of `"ban"` or `"pick"`. The prefix names
both the state keys (`banFilterClub` / `pickFilterClub`) and the element ids
(`banFcClub` / `pickFcClub`). Adding a filter means adding one row to
`MULTI_FILTERS`, `RANGE_FILTERS` or `TEXT_FILTERS`; markup, clearing, the
active-dot and filtering all follow from it.

### The panel is written once and then left alone

`renderDraftFilterPanel` writes the markup on its first call and never again.
That is the same shape as `buildPlayerFilterPanel` on the home page, and it is
not a preference — it is the only shape that works here.

It used to rebuild from state on every call, which is **twice a second**, because
both boards re-render on the presence poll. That made every control in the panel
unusable, in two ways:

- an expanded multi-select was thrown away within half a second — it opened on
  the click, and the next poll deleted the element carrying `.open`;
- a focused CLUB / NATIONALITY / Min / Max box was destroyed by the keystroke
  that filled it (`input` → `onChange()` → re-render). You could type exactly one
  character, then focus was gone.

The rule that falls out: **nothing in a panel a poll rebuilds can hold state**,
so do not rebuild. After the first write the DOM *is* the record of what the user
typed and expanded, and the handlers in `bindDraftFilterPanel` own it — each
writes state and then patches what it changed (`item.classList.toggle("checked")`
plus `paintMsButton`). A handler that leaves a repaint to "the next render" is a
bug; there is no next render.

Two things still run per call, both idempotent and neither structural:

- the FILTER dot;
- **`syncMsOptions`**, which is why build-once is safe here at all.
  `CARD_TYPE_OPTIONS` and friends are mutable arrays filled by
  `fetchFilterOptions()`, which the lobby starts *without awaiting*, so the lists
  can still be empty when the panel is built. It compares each list's
  `data-options` key and refills only the ones that changed, replacing the items
  *inside* a list and never the list itself — so an expanded one stays expanded.
  Verified: built with 0 card types, 3 present after the fetch lands, still open.

`CLEAR ALL FILTERS` is the one place the markup is legitimately rewritten — every
box, label and tick returns to empty at once. Nothing is focused (you clicked a
button) and no list needs to stay open.

Two import constraints keep that module a leaf, and both matter:

- **`state` is passed in, never imported.** `state.js` spreads
  `createDraftFilterState()` into its own literal, so importing `state` there
  would be a cycle. `shared/players/filterPanel.js` takes `state` the same way.
- `escapeHtml` comes from `shared/players/playerMeta.js`, not the draft's own
  `utils.js`, because `utils.js` imports `state`.

`toValidPosition` lives there too, next to the table that uses it. It coerces a
*single* value to a valid position or `""`.

Per-phase pieces that remain:

- `getBanListPlayers()` / `getPickListPlayers()` in `playerQuery.js` are both
  thin wrappers over one `queryPlayers(base, { search, sort, prefix })`. Only the
  source array and the search field differ.
- Sort supports the 7 categories in `SORT_CATEGORIES`
  (`@/shared/players/sort.js`) — **the whole app's one sort table**, shared with
  My Players, Game Plans and Add Player, all five identical.
  `normalizeSortValue()` derives its accepted values from it and
  `renderSortPanel()` builds both phases' panels from it. Order is load-bearing:
  `[0]` is the default sort. Club and Nationality were dropped from the UI on
  purpose; `SORT_MAP` on the server still maps them, so restoring is two rows.
- `LEAGUE_OPTIONS` is a module-level mutable array filled at runtime by
  `fetchFilterOptions()`, which is why `playerFilters.js` reads every option list
  through a thunk rather than capturing it at module load.
- `comparePlayersBySort()` reads `height/weight/age` from both `player._raw.*`
  and top-level fields — ban players from `/api/my-players` store these at the
  top level, not under `_raw`.
- The panel is grouped into 4 labelled sections — **IDENTITY**, **STATS**,
  **CLUB & ORIGIN**, **PHYSICAL** — with `.filter-group-label` dividers, matching
  the catalog page.

The ban toolbar keeps a pair of hidden `<select>`s (`#banSort`, `#banPosition`)
as its sort source of truth; the pick toolbar drives `state.pickSort` directly.

## Removed: the "Consult this plan" reference panel

`.ban-phase-right` used to carry a third `.ban-side-section` (`#banPlanSection`) showing
a read-only preview of a saved game plan while banning. **It has been removed** — along
with `room/planPreview.js`, its `draftControls.js` wiring, `state.banPlanPanelOpen`, and
the `.ban-plan-*` / `.draft-plan-*` / `.formation-*` rules in the room CSS (the panel was
their only consumer).

The sidebar is now BANS ON ME → MY BANS → CONFIRM BANS, and the two ban strips stretch
to fill the column. The pick phase's own plan chips and live pitch are unaffected — they
are a separate feature and still use `gamePlans.js`
(`state.draftGamePlanSelectedId`, `loadGamePlanIntoPicks`). `loadDraftGamePlanPlayers`
and `state.draftGamePlanPlayers` went with the panel — they had no reader left.

## Card hover

Hovering a card in `#banGrid` floats the player's four metadata lines — the same
block the footer prints, so it reads the same with SHOW INFO off. It replaced the
native `title` these cards carried; the panel lives in
`@/shared/ui/playerHoverCard.js` and is wired once from `bindBanPhaseUiOnce`
through `bindCardGridHover`, resolving ids against `state.opponentBanPlayers` —
the grid shows the **opponent's** squad, which is what you ban from. See
`room/modules.md`.

## Confirmed is read-only, and looks it

`renderBanBoard` puts `is-locked` on `#draftBanPhaseBoard` whenever
`bansConfirmed[mySide]` is set. The grid was already inert — `renderBanGrid`
drops `clickable` and `submitBan` refuses with a toast — but it did not *read*
as inert: cards still scaled and glowed under the pointer, which is the page's
one signal that a card can be clicked. Locked, they go flat, grey and
`not-allowed`, and a banner above the grid names UN-CONFIRM, which lives in the
sidebar where a hand on the cards will not find it.

Your own bans keep their 0.45 opacity — the locked dim is
`:not(.is-unavailable)` precisely so it cannot flatten them into the rest of the
grid, which is the only thing marking them out here. The CSS is in
`room/css.md`; `myConfirmed` is already in the grid's state key, so no extra
rebuild comes with this.

> **Colour system note.** This file predates the efhub re-skin. The token *names* below
> are current, but the reasoning often says "green", "cyan" or "glow" — those hues and
> that glow are gone. Green meant "you" and cyan meant "the opponent"; both are greyscale
> now, and the only accent left on this page is the turn clock and the pick slot waiting
> on you. Read `DESIGN.md` §3 and §12 for what replaced what; treat colour claims here as
> history and the structural claims as current.
