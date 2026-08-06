---
paths:
  - "public/js/room/ban.js"
  - "public/js/room/banView.js"
  - "public/js/room.js"
---

# Ban phase (`ban.js` + `room.js`)

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
  `room.bans[mySide]` in both `applyLocalAction` and `submitBan`. The ban grid renderer
  computes `myConfirmedBanIds` from `room.bans[mySide]` — a card is greyed out only if
  YOU already confirmed that ban, not if the opponent banned it. `bannedPlayerIds` (the
  union of all bans) is still maintained in `entry`/`room` for other uses but is no
  longer the authority for ban-phase duplicate detection.
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

- The ban grid state key uses `myConfirmedBanIds` (`"b"` suffix), staged ban IDs (`"s"`
  suffix), and picked IDs (`"p"` suffix).
- The BANS ON ME strip key encodes confirmed bans (`"c"` suffix), opponent staged bans
  (`"s"` suffix), and the remaining empty-slot count — all three must agree before a
  write is skipped.

Related invariants:

- When a new thumb is added to either ban strip, `is-new` is added to the last child via
  JS to play the `thumbAppear` spring animation (`@keyframes thumbAppear` in `room.css`).
- The `is-hovered` class is **only added to `.mini-card` elements** (JS-driven hover for
  the pick grid). `.player-card` elements in the ban grid rely purely on the CSS
  `:hover` pseudo-class — adding `is-hovered` to them would mutate the DOM and break the
  state-key guard.

## Filter & sort

- `getBanListPlayers()` filters `state.opponentBanPlayers` entirely client-side — 16
  filter state fields cover position, foot, playing style, card type, league, region,
  overall level 1/max ranges, club, nationality, height/weight/age ranges.
- Sort supports 9 categories: overall_max, overall, name, position, club, nationality,
  height, weight, age. `normalizeBanSortValue()` is the validator.
- `BAN_LEAGUE_OPTIONS` is a module-level mutable array populated by
  `fetchFilterOptions()` alongside `CARD_TYPE_OPTIONS`, `PLAYING_STYLE_OPTIONS`,
  `REGION_OPTIONS`. All are fetched from `GET /api/players/filter-options`.
- `comparePlayersByBanSort()` reads `height/weight/age` from both `player._raw.*` and
  top-level fields — ban players from `/api/my-players` store these at the top level
  (not under `_raw`).
- The filter dropdown panel is grouped into 4 labelled sections — **IDENTITY**
  (Position, Card Type, Playing Style, Foot), **STATS** (Overall Level 1, Overall Max),
  **CLUB & ORIGIN** (League, Region, Club, Nationality), **PHYSICAL** (Age, Height,
  Weight) — using `.filter-group-label` dividers. Built in `renderBanToolbar()` and
  event-delegated in `bindBanPhaseUiOnce()` (runs once; guarded by `state.banUiBound`).
  Clearing all filters resets all 16 state fields.
## Removed: the "Consult this plan" reference panel

`.ban-phase-right` used to carry a third `.ban-side-section` (`#banPlanSection`) showing
a read-only preview of a saved game plan while banning. **It has been removed** — along
with `room/planPreview.js`, its `draftControls.js` wiring, `state.banPlanPanelOpen`, and
the `.ban-plan-*` / `.draft-plan-*` / `.formation-*` rules in `room.css` (the panel was
their only consumer).

The sidebar is now BANS ON ME → MY BANS → CONFIRM BANS, and the two ban strips stretch
to fill the column. The pick phase's own plan chips and live pitch are unaffected — they
are a separate feature and still use `gamePlans.js`
(`state.draftGamePlanSelectedId`, `loadDraftGamePlanPlayers`).
