---
paths:
  - "public/js/features/draft/pick/pick.js"
  - "public/js/features/draft/pick/pickView.js"
  - "public/js/room.js"
---

# Pick phase (`pick.js` + `room.js`)

## Layout

`#draftPickPhaseBoard` with a horizontal **quick-load bar** (`.pick-quickload-bar`) at
the top — plan chip cards (`#pickQlCards`) + formation dropdown (`#pickQlFormationBtn` /
`#pickQlFormationPanel`). Below it, `.pick-phase-layout` is a 3-column CSS grid
(`300px | 1fr | 252px`):

- **Left** (`.pick-phase-left`): "MY SQUAD POOL" header + search/sort controls +
  position tab bar (`#pickPosTabs` with ALL/GK/DEF/MID/ATT buttons) + `#pickGrid`. Cards
  are rendered with `banPlayerCardHtml` and carry `is-pick-taken` (green "PICKED"
  overlay) or `is-ban-taken` (red "BANNED" overlay) classes based on what you've picked
  or what the opponent has banned.
- **Center** (`.pick-phase-center`): `#pickLineupMeta` (pick count / formation badge /
  avg OVR / active plan name) + CLEAR ALL button + `#pickPitch` (formation rows rendered
  by `renderPickPitch` using `buildOrderedSlotMap` and `getFormationLayout`) + bottom bar
  with `#pickAllowanceBar` (allowance pills) and `#confirmPicksBtn` / `#pickMoreLabel`.
- **Right** (`.pick-phase-right`): LIVE label + opponent identity row (`#pickOppDot`,
  `#pickOppName`, `#pickOppCount`) + progress bar (`#pickOppProgressFill`) + scrollable
  pick feed (`#pickOppFeed`) + footer with sync timestamp. Hidden-mode shows a "picks
  hidden" placeholder instead of the feed.

Render functions in `room.js`: `getPickFormation()` resolves the active formation
(selected game plan's formation → `state.pickManualFormation` → `DEFAULT_FORMATION`);
`renderPickQuickLoad()` builds the plan chip cards and formation panel;
`renderPickPitch()` renders the pitch slots; `renderPickAllowanceBar()` renders pills and
shows/hides CONFIRM PICKS; `renderPickLiveFeed()` updates the live opponent section.

## Interaction

- Clicking a player card in the pick grid calls `submitPick(player)` — **no intermediate
  pending/confirm step.**
- `submitPick` validates allowance cap violations (via `getAllowanceCapViolation`) and
  the `pickCountPerSide` limit before calling `applyLocalAction(room, player)` for an
  optimistic update, then fires `POST /api/rooms/:code/pick`. On API failure a toast is
  shown and the next presence poll restores authoritative state.
- The pick grid shows `getPickListPlayers()` which filters `state.players` client-side by
  `state.pickSearch`, `state.pickFilterPosition` (set by the position tabs), and
  `state.pickSort`. `state.players` is loaded once at draft start by `loadDraftPlayers()`
  → `fetchPlayers()` which reads from `/api/my-players` (the user's own squad), **not the
  catalog.**
- Position tabs (ALL/GK/DEF/MID/ATT) set `state.pickPosTab` and
  `state.pickFilterPosition` via `PICK_TAB_GROUPS` in `pick.js`.
- The formation pitch is rendered by `renderPickPitch()`: picks are mapped to slots in
  order via `buildOrderedSlotMap(myPicks.slice(0, 11))` — pick[0] → slot 1 (GK),
  pick[1-4] → DEF row, etc. A state-key (`formation|pick-ids`) prevents re-renders when
  nothing changes.
- CLEAR ALL (`#pickClearAllBtn`) shows a confirm dialog then zeroes `room.picks[mySide]`
  locally; the next presence poll will restore authoritative state if the API disagrees.
- Opponent picks sync identically to bans: every 500 ms presence poll returns the full
  room snapshot including `picks`, which triggers `renderDraftUi()` on the opponent's
  next poll.
- The pick grid uses the same **state-key diff guard** as the ban phase —
  `data-stateKey` prevents DOM rebuilds on every poll cycle. See the ban phase rule for
  why an `innerHTML` string comparison must not be substituted.
- When all allowed picks are completed, CONFIRM PICKS (`#confirmPicksBtn`) appears;
  clicking it calls `beginPostDraftReadyPhase()`. The pick timer expiry also calls it.