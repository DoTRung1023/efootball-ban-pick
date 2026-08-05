---
paths:
  - "public/js/room/ban.js"
  - "public/js/room/banView.js"
  - "public/js/room.js"
---

# Ban phase (`ban.js` + `room.js`)

## Layout

Ban phase right panel: `.ban-phase-right` sidebar with two `.ban-side-section` blocks
(bans-on-me / my-bans). The BANS ON ME header contains a `.ban-opponent-badge` pill
showing the opponent's username, a colored presence dot (`.ban-opponent-dot.is-online`),
and a status text (`· is choosing...` / `· confirmed ✓` / `· left the room`).

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
## "Consult this plan" reference panel

The third `.ban-side-section` in `.ban-phase-right` (`#banPlanSection`) shows a read-only
view of one of the user's saved game plans, so they can see their intended lineup while
choosing bans. It is purely a reference — nothing in it affects the draft.

- Rendered by `renderBanPlanPanel()` in `room/planPreview.js`, called at the end of
  `renderBanBoard()`. Guarded by `data-planKey` on `#banPlanPreview`, since
  `renderBanBoard` runs on every presence poll.
- The plan `<select>` (`#banPlanSelect`) and the collapse toggle (`#banPlanToggle`) are
  wired in `draftControls.js`. Collapsed state lives in `state.banPlanPanelOpen` and is
  per-session only.
- The panel is `flex: 0 0 auto` so it does not squeeze the two ban strips; the preview
  scrolls internally at `max-height: 260px`.
- The `.formation-*` markup is shared with the full-size preview; `room.css` scopes a
  compact variant under `.ban-plan-panel` for the 320 px sidebar (vertical slot cards,
  nationality hidden, rows use `grid-auto-flow: column` so any slot count fits).
- If the markup is absent, `renderBanPlanPanel()` returns early — removing the panel from
  `room.html` degrades to a no-op rather than an error.
