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

One name to be careful with: `toValidPosition` (playerQuery.js) coerces a **single**
value to a valid position or `""`. `normalizePositionValue` (allowance.js) is a different
function — it takes a comma-separated list and returns an **array**. They were nearly
merged during the rename; they are not interchangeable.

## Layout

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

Two import constraints keep that module a leaf, and both matter:

- **`state` is passed in, never imported.** `state.js` spreads
  `createDraftFilterState()` into its own literal, so importing `state` there
  would be a cycle. `shared/players/filterPanel.js` takes `state` the same way.
- `escapeHtml` comes from `shared/players/playerMeta.js`, not the draft's own
  `utils.js`, because `utils.js` imports `state`.

`toValidPosition` lives there too, next to the table that uses it. It coerces a
*single* value to a valid position or `""` — not to be confused with
`normalizePositionValue` in allowance.js, which takes a comma-separated list and
returns an array.

Per-phase pieces that remain:

- `getBanListPlayers()` / `getPickListPlayers()` in `playerQuery.js` are both
  thin wrappers over one `queryPlayers(base, { search, sort, prefix })`. Only the
  source array and the search field differ.
- Sort supports 9 categories declared once in `DRAFT_SORT_CATEGORIES`
  (`../sortPanel.js`); `normalizeSortValue()` derives its accepted values from
  that table and `renderSortPanel()` builds both phases' panels from it.
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
