# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start dev server with auto-reload (node --watch)
npm start            # start production server
npm run scrape       # full or incremental player catalog update
npm run scrape:missing  # repair gaps: diff site vs DB, fill missing entries
```

No build step — frontend is vanilla HTML/CSS/JS served directly from `public/`.

Database setup (first time):
```bash
mysql -u root -e "CREATE USER IF NOT EXISTS 'banpick'@'localhost' IDENTIFIED BY ''; GRANT ALL PRIVILEGES ON ban_pick_efb.* TO 'banpick'@'localhost'; FLUSH PRIVILEGES;"
mysql -u root < database/schema.sql
```

## Architecture

**Runtime**: Node.js ≥ 18 with ESM (`"type": "module"`). Express serves both the API and static files from `public/`.

**Backend** (`src/`):
- `server.js` — all Express routes in a single file. No session middleware; auth is stateless (userId is passed in request bodies/query params and trusted client-side).
- `db.js` — mysql2 connection pool, exported as default.
- `cardImageCacheR2.js` — proxies player card images; caches to Cloudflare R2 if configured, otherwise redirects to pesdb.net.
- `scrape.js` / `scrape-missing.js` — scrape pesdb.net with cheerio. `scrape.js` uses `.scrape-state.json` for resume support; incremental runs use `max_pesdb_id` from `scrape_logs`.

**Room state is fully in-memory** (`roomPresence` Map in `server.js`). Room data does not persist across server restarts. Presence TTL is **12 s in lobby** and **30 s during an active draft** (`PRESENCE_TTL_MS` / `DRAFT_PRESENCE_TTL_MS`) — clients must POST `/api/rooms/:code/presence` every ~5 s to stay connected. The longer draft TTL gives enough headroom for a page reload without losing draft state. Real-time sync is polling-only; WebSocket integration is not yet implemented.

**Room security**: The server rejects duplicate connections via HTTP 409:
- A second host attempt (different userId) → 409 "Room already has an active host."
- A second guest attempt (different userId) → 409 "Room already has an active guest."
- A kicked guest → 403.
The client maps these to three distinct error states (`is-host-lock`, `is-room-full`, `is-access-denied`) in `#viewError`, each with its own CSS color theme in `room.css`.

**Reload / reconnect behaviour** (`presence.js` + `room.js`):
- When entering the draft view, `state.phase` is written to `sessionStorage` under key `efb_room_${code}_phase`.
- On page load, `initLobby` reads this key: if the cached phase is `"draft"` or `"ready"`, the lobby view is skipped entirely while the async reconnect completes (`registerAndPollPresence`). If the server confirms the room is still drafting, `tryEnterDraftFromRoomSnapshot` transitions directly to the draft view; otherwise the cache is cleared and the lobby is shown.
- The cache is cleared on: `leavePresence()`, `showDone()`, `showRoomClosed()`, `showOpponentLeft()`, and any failed reconnect.

**Leave button** (`presence.js` + `room.js`):
- There is no `beforeunload` guard. The dialog was removed because the `sessionStorage` phase cache makes reloading safe — the draft is fully restored on reconnect. Both `#lobbyLeaveBtn` and `#draftLeaveBtn` call `leavePresence()` then set `window.location.href = "/"` directly.

**Frontend** (`public/`):
- `home.html` + `public/js/home.js` — main app entry point (`type="module"`); 23-line ESM boot file that imports from `public/js/home/` sub-modules.
- `public/js/home/` — home page split into ES modules:
  - `utils.js` — shared helpers: `getUser`, `requireAuth`, `showToast`, `showConfirm`, `initTabs`, `initUserMenu`, `initEditProfile`, sort helpers (`POSITION_LINE_ORDER`, `positionLineRank`, `tiebreakOverallDescThenName`, `ovrMaxForSort`, `compareByPositionLine`), DD panel helpers (`openDdPanel`, `closeDdPanel`, `toggleDdPanel`), player detail helpers (`playerDetailSublineHtml`, `playerDetailTooltipText`, `ovrPairInnerHtml`).
  - `callbacks.js` — shared mutable callback registry (identical pattern to `room/callbacks.js`). Squad sets `getSquadPlayers`, `addToSquadState`, `removeFromSquadState`, `renderSquad`; catalog sets `openPlayerPopup`, `openAddPlayerModal`, `onPlayersDeleted`.
  - `squad.js` — My Players tab: player grid, search/sort/filter, select mode, single + bulk delete, card click → popup via `cb.openPlayerPopup`. Exports `loadSquad`, `initSquadSearchSortFilter`, `initSquadControls`.
  - `catalog.js` — Add Player modal and player popup: catalog list, sort/filter dropdowns, add/remove player, `initAutocomplete`, `wireAttributeMultiselects`, `playerFilterOptionsCache` / `getPlayerFilterOptions` (shared with `squad.js` and `plans.js`). Exports `openAddPlayerModal`, `initAddPlayerModal`, `initPlayerPopup`.
  - `plans.js` — Game Plans tab: plan list, pitch formation view, plan picker, slot assignment. Exports `loadGamePlans`, `initGamePlans`.
  - `rooms.js` — Rooms tab: create/join room modal, room hub card. Exports `initRoomModal`, `initRoomHub`.
- `public/css/home/` — home page CSS split into 8 focused files (loaded in order via `<link>` tags):
  - `base.css` — `:root` variables, resets, scrollbar, body, pitch background, glow orbs, app shell, topbar.
  - `player-card.css` — `.player-card`, `.pc-img-wrap`, `.pc-footer`, skeleton, empty state, load-more.
  - `squad.css` — main content, tab panels, squad toolbar (search bar, sort/filter, select mode, empty state).
  - `plans.css` — game plans panel, plan cards, plan toolbar, plan detail modal.
  - `catalog.css` — add player modal + shared sort/filter dropdown UI (`.ap-dd-btn`, `.ap-dd-panel`, `.filter-dd-panel`, `.pos-multiselect`, `.catalog-list`).
  - `modals.css` — shared modal overlay/card base, room modal body, spinner, player popup, toast, confirm dialog, edit profile modal.
  - `rooms.css` — rooms tab, room hub card, rooms hero/steps.
  - `responsive.css` — cross-cutting media queries (`≤768px`, `≤480px`). Mobile fix: `.team-search-wrap { flex: 1 0 100% }` forces the search input to its own row so the FILTER button stays right-aligned and its `right: 0` dropdown panel does not overflow off the left screen edge.
- `room.html` + `public/js/room.js` — entry point for the room page; imports all sub-modules and wires up callbacks. Keeps: draft timer, stage advancement, `applyLocalAction`, `submitBan`, `submitPick`, `renderDraftUi`, `showDone`, `showOpponentLeft` (5-second countdown to home when opponent leaves during draft), `showRoomClosed` (10-second countdown to home when room closes), `initDraftControls`, and all side-panel / formation rendering.
- `public/js/room/callbacks.js` — shared mutable callback registry (`cb`) that breaks circular imports between sub-modules. Sub-modules call `cb.renderDraftUi()` etc.; `room.js` sets the real implementations after defining them. Registered callbacks: `renderDraftUi`, `renderLobby`, `tryEnterDraftFromRoomSnapshot`, `isBothMatchReady`, `showDone`, `showRoomClosed`, `startDraftFromLobby`, `onOpponentLeft`.
- `public/js/room/state.js` — `state` singleton (includes `stagedBans[]`, `opponentStagedBans[]`, `banFilterRegion[]`), `defaultRoomConfig`, `applyPresenceSnapshot` (reads `bansConfirmed` and opponent's `stagedBans` from each snapshot), `buildTurnSchedule`, and all room-config normalisation helpers.
- `public/js/room/utils.js` — `escapeHtml`, `showToast`, `askConfirm`, `showView`, `getRoomCodeFromUrl`, `getUser`, `getAnonId`, `getCurrentIdentity`.
- `public/js/room/players.js` — pure player-data helpers: `normalizeApiPlayer`, `normalizeMySquadPlayerForDraft`, `normalizeDraftPlayer`, `miniCardHtml`, `playerDetailTooltipText`, formation/slot utilities.
- `public/js/room/ban.js` — ban phase logic: `getBanListPlayers`, `getPickListPlayers`, `renderBanToolbar`, `bindBanPhaseUiOnce`, `attachMiniCardGridHandlers`, `fetchFilterOptions`, `imageOnlyThumbHtml`, `stagedBanThumbHtml`, `opponentStagedBanThumbHtml`. All render calls go through `cb.renderDraftUi()`.
- `public/js/room/pick.js` — pick phase logic: `renderPickToolbar`, `bindPickPhaseUiOnce`, `fetchPlayers`, `loadDraftPlayers`.
- `public/js/room/lobby.js` — full lobby: `renderLobby`, `initLobby`, config push, club autocomplete, lobby chat. Sets `cb.renderLobby = renderLobby` during module init.
- `public/js/room/presence.js` — presence polling: `registerPresence`, `fetchRoomSnapshot`, `leavePresence`, `pollPresence`, `registerAndPollPresence`, `stopPresencePolling`. Detects opponent departure: if guest disappears (`prevGuestId` present but `nextGuestId` absent) while `state.phase` is `"draft"` or `"ready"`, sets `state.phase = "abandoned"`, stops polling, and calls `cb.onOpponentLeft()`. All cross-module render calls use `cb.*`.
- `public/js/room/allowance.js` — all allowance/cap logic (position caps, card type caps, range checks) shared between room.js and the server normalizes the same data independently.
- `public/js/room/constants.js` — canonical lists: `POSITION_OPTIONS`, `CARD_TYPE_OPTIONS`, `REGION_OPTIONS`, etc.

**Room page layout** (`#viewDraft`):
- There is no topbar and no turn pill (`#turnPill` / `.turn-pill-*` fully removed from HTML, CSS, and JS). Phase context comes from the stage dots alone.
- The `.stage-progress-container` is `justify-content: space-between` with the timer ring (`#timerRing`) in `.stage-header-left` on the left and the Leave button (`#draftLeaveBtn`) in `.stage-header-right` on the right. The `.stage-progress-bar` sits between them with `flex: 1; max-width: 620px`.
- The timer ring is **56×56 px** with a **44×44 px** inner circle; JS drives the conic-gradient via `ring.style.background`. There is a single canonical `.timer-ring` / `.timer-inner` definition in `room.css` — no context-specific overrides. There is no READY button in the topbar — `#draftTopReadyBtn` has been removed from HTML (JS already null-guards it).
- The draft schedule (`buildTurnSchedule`) always returns exactly two entries: `{ side: "both", action: "ban" }` then `{ side: "both", action: "pick" }`. Both phases are simultaneous — there are no per-player turns.
- Ban phase right panel: `.ban-phase-right` sidebar with two `.ban-side-section` blocks (bans-on-me / my-bans). Bans are **staged** before submitting: clicking a card calls `submitBan(player)` which appends to `state.stagedBans[]` and re-renders — no API call yet. Staged bans appear in the MY BANS strip alongside confirmed bans, and sync to the opponent's BANS ON ME section via the presence heartbeat (every ~500 ms). Once satisfied, the user clicks **CONFIRM BANS** → `confirmStagedBans()` flushes staged bans to `POST /api/rooms/:code/ban` then calls `POST /api/rooms/:code/ban-confirm`. When both sides confirm, the server advances `turnIndex = 1` (pick phase) and sets `turnEndsAt`. The BANS ON ME header contains a `.ban-opponent-badge` pill showing the opponent's username, a colored presence dot (`.ban-opponent-dot.is-online`), and a status text (`· is choosing...` / `· confirmed ✓` / `· left the room`).
- Pick phase board: `#draftPickPhaseBoard` with `.pick-phase-layout` (same grid structure as ban phase). Left: search/sort/position-filter toolbar + `#pickGrid` (your own allowance-filtered players). Right: `.pick-phase-right` with two `.pick-side-section` blocks — MY PICKS strip (`#draftMyPicksStrip`) and OPPONENT PICKS strip (`#draftOpponentPicksStrip`, hidden when `revealMode === "hidden"`).
- Ready phase board: `#draftReadyPhaseBoard` shown when `isReadyPhase`. Contains both players' pick summaries side by side (`#readyPhaseColumns`), a READY/UNREADY button (`#draftReadyBtn`), and a live status hint. In `hidden` reveal mode the opponent column shows a "picks hidden" message instead of cards.

**Ban phase interaction** (`ban.js` + `room.js`):
- Bans are **per-side and independent**: each user bans from the opponent's squad (User A bans to restrict User B's picks; User B bans to restrict User A's picks). Both users can ban the same player without conflict — the duplicate-ban check only prevents a user from banning the same player twice on their own side.
- Clicking a player card in the ban grid calls `submitBan(player)` which **stages** the ban in `state.stagedBans[]` and calls `renderDraftUi()` — no API call at this point.
- `confirmStagedBans()` (CONFIRM BANS button) flushes the staged array via `flushStagedBansLocally()` + `submitBansToApi()`, then calls `callBanConfirm()` → `POST /api/rooms/:code/ban-confirm`. The server marks `bansConfirmed[side] = true`; if both sides are confirmed it advances `turnIndex = 1` (pick phase), sets `turnEndsAt`, clears `stagedBans`/`bansConfirmed`, and returns the updated room snapshot. The client that called confirm starts the pick timer immediately in `callBanConfirm`; the other client's `renderDraftUi` detects `!isBanPhase && !state.turnTimer` and starts it on the next render cycle.
- **Duplicate-ban prevention** uses only the current user's own bans: the server checks `entry.bans[sideKey]` (not the shared `bannedPlayerIds` union); the client checks `room.bans[mySide]` in both `applyLocalAction` and `submitBan`. The ban grid renderer computes `myConfirmedBanIds` from `room.bans[mySide]` — a card is greyed out only if YOU already confirmed that ban, not if the opponent banned it. `bannedPlayerIds` (the union of all bans) is still maintained in `entry`/`room` for other uses but is no longer the authority for ban-phase duplicate detection.
- Staged bans sync to the opponent in real-time via the presence heartbeat: `registerPresence()` sends `state.stagedBans` as `{ id, name }` objects; the server stores them under `entry.stagedBans[role]` and returns them in the snapshot. `applyPresenceSnapshot` reads the opponent's array into `state.opponentStagedBans` and `renderDraftUi()` renders them in the BANS ON ME strip using `opponentStagedBanThumbHtml` (dimmed, red inset outline).
- `renderDraftUi()` runs unconditionally every 500 ms (driven by `pollPresence`). To avoid destroying and recreating DOM nodes on every cycle, the ban grid and both ban strips use a **state-key diff guard**: a compact fingerprint of the current data (player IDs in sorted/filtered order + ban/pick flags + turn state) is stored as a `data-state-key` / `data-bans-key` attribute and compared before any `innerHTML` write. **Do not replace this with an `innerHTML` string comparison** — browsers normalize whitespace and drop the `/` on void elements (`<img />` → `<img>`) when serializing, so the strings never match and the grid would rebuild every poll cycle. The ban grid state key uses `myConfirmedBanIds` (`"b"` suffix), staged ban IDs (`"s"` suffix), and picked IDs (`"p"` suffix). The BANS ON ME strip key encodes confirmed bans (`"c"` suffix), opponent staged bans (`"s"` suffix), and the remaining empty-slot count — all three must agree before a write is skipped.
- When a new thumb is added to either ban strip, `is-new` is added to the last child via JS to play the `thumbAppear` spring animation (`@keyframes thumbAppear` in `room.css`).
- The `is-hovered` class is **only added to `.mini-card` elements** (JS-driven hover for the pick grid). `.player-card` elements in the ban grid rely purely on the CSS `:hover` pseudo-class — adding `is-hovered` to them would mutate the DOM and break the state-key guard.

**Pick phase interaction** (`pick.js` + `room.js`):
- Clicking a player card in the pick grid calls `submitPick(player)` — no intermediate pending/confirm step.
- `submitPick` validates allowance cap violations (via `getAllowanceCapViolation`) and the `pickCountPerSide` limit before calling `applyLocalAction(room, player)` for an optimistic update, then fires `POST /api/rooms/:code/pick`. On API failure a toast is shown and the next presence poll restores authoritative state.
- The pick grid shows `getPickListPlayers()` which filters `state.players` client-side by `state.pickSearch`, `state.pickFilterPosition`, and `state.pickSort` — same pattern as `getBanListPlayers()` for the ban phase. `state.players` is loaded once at draft start by `fetchPlayers()` with a 500-player limit to cover the full allowed pool.
- Opponent picks sync identically to bans: every 500 ms presence poll returns the full room snapshot including `picks`, which triggers `renderDraftUi()` on the opponent's next poll.
- Both the pick grid and the MY PICKS / OPPONENT PICKS strips use the same **state-key diff guard** as the ban phase — `data-stateKey` / `data-picksKey` attributes prevent DOM rebuilds on every poll cycle.
- When all allowed picks are completed (or the pick timer expires), `beginPostDraftReadyPhase()` transitions to the ready phase locally; clicking READY calls `setMatchReady()` → `POST /api/rooms/:code/match-ready`. When both sides are ready the server sets `status = "done"` and `showDone()` is called.

**Ban phase filter & sort** (`ban.js`):
- `getBanListPlayers()` filters `state.opponentBanPlayers` entirely client-side — 16 filter state fields cover position, foot, playing style, card type, league, region, overall level 1/max ranges, club, nationality, height/weight/age ranges.
- Sort supports 9 categories: overall_max, overall, name, position, club, nationality, height, weight, age. `normalizeBanSortValue()` is the validator.
- `BAN_LEAGUE_OPTIONS` is a module-level mutable array populated by `fetchFilterOptions()` alongside `CARD_TYPE_OPTIONS`, `PLAYING_STYLE_OPTIONS`, `REGION_OPTIONS`. All are fetched from `GET /api/players/filter-options`.
- `comparePlayersByBanSort()` reads `height/weight/age` from both `player._raw.*` and top-level fields — ban players from `/api/my-players` store these at the top level (not under `_raw`).
- The filter dropdown panel is grouped into 4 labelled sections — **IDENTITY** (Position, Card Type, Playing Style, Foot), **STATS** (Overall Level 1, Overall Max), **CLUB & ORIGIN** (League, Region, Club, Nationality), **PHYSICAL** (Age, Height, Weight) — using `.filter-group-label` dividers. Built in `renderBanToolbar()` and event-delegated in `bindBanPhaseUiOnce()` (runs once; guarded by `state.banUiBound`). Clearing all filters resets all 16 state fields.

**Ban phase card hover** (`room.css`):
- The sole hover rule for ban grid cards is `.ban-phase-grid .player-card:not(.is-unavailable):hover` — applies to all non-unavailable cards (including non-clickable browse-mode cards), not just `is-clickable` ones. Uses `scale(1.04)` only — **no `translateY`**. Removing the vertical translate prevents CSS hover jitter: `translateY(-Npx)` moves the card's bottom edge above the cursor when near the bottom, deactivating `:hover`, causing the card to snap back into the cursor, reactivating it, and looping visually.
- There is no separate `.player-card.is-clickable:hover` rule — it was removed as dead code (always overridden by the more specific ban-grid rule for every element in scope).
- `room.css` `:root` defines `--bg-card`, `--bg-card-hover`, and `--transition` to match `home/base.css` values so shared components like `.player-card` look identical across both pages.

**Ban card thumbnails** (`.ban-phase-thumb` in `room.css`):
- `border-radius: 0` — no rounded corners on cards in "Bans on Me" / "My Bans" strips.
- `height` is fixed (96 px for `--md`); **no explicit width** — the `img` is set to `height: 100%; width: auto` so the card's natural aspect ratio determines the container width. This avoids letterboxing since pesdb.net card images are taller than the old 3:4 container ratio.
- The empty-state dashed placeholder (`.ban-side-strip:empty::before`) uses `68×96 px` with `border-radius: 0` to match the natural card proportions.

**CSS parity — `room.css` vs `home/catalog.css`**: The ban page uses `.ap-dd-btn`, `.sort-dir-btn`, `.filter-input`, `.range-pair`, `.filter-clear-btn`, `.filter-group-label` etc. These are defined in `room.css` and kept visually in sync with `public/css/home/catalog.css`. Key rules: `.ap-dd-btn.has-active` (green highlight when filter active), `.filter-clear-btn` (red destructive style), `.select-mode-btn` (`border-radius: 7px`), `.filter-group-label` (section divider: uppercase label, subtle green tint, top/bottom border — both files share an identical definition).

**Pick phase CSS** (`room.css`): `.pick-phase-layout` / `.pick-phase-left` / `.pick-phase-right` mirror the ban phase structure. `.pick-phase-grid` uses the same `player-card` component as `.ban-phase-grid` — hover uses CSS `:hover` only (no `is-hovered` mutation) and `scale(1.04)` only (no `translateY`) for the same anti-jitter reason. Accent colour is `--cyan` instead of nothing special. `.pick-phase-strip` borrows `.ban-phase-thumb` for thumbnails (the `is-new` spring animation applies automatically). Ready phase uses `.ready-phase-layout` centred column with `.ready-phase-col` pick-row list and READY button.

**CSS conventions for `room.css`**: Each component has a **single canonical rule block** — do not add a second rule for the same selector later in the file to tweak values; update the existing block instead. Late overrides with the same selector caused widespread redundancy (`.timer-ring`, `.stage-progress-dot`, `.stage-progress-dot::before`, `.stage-progress-dot .stage-dot-label`, `.stage-progress-line`, `.chat-item`, `.stage-progress-container--lobby` all had duplicate blocks that have since been merged). Context-specific variants use modifier classes (e.g. `.is-active`, `.is-completed`, `.is-mine`) or scoped parent selectors, not repeated base selectors.

**Key architectural pattern — allowance system**: The room config holds `allowanceEnabled` (which categories are active), `allowance` (the filter values per category), and `allowanceCaps` (per-category per-value player count caps). The server normalizes cap values on write; the client enforces caps in `getAllowanceCapViolation()` during pick selection. Both sides share the same normalization logic (duplicated between `server.js` and `public/js/room/allowance.js`).

**Database schema** (MySQL 8+):
- `players_catalog` — ~41k scraped players; `pesdb_id` is the stable external key (BIGINT, up to 15 digits for newer cards).
- `players` — user roster; links to `players_catalog.pesdb_id` via nullable FK.
- `game_plans` / `game_plan_players` — up to 20 plans per user; slots 1–11 = LINEUP, 12–23 = SUB.
- `scrape_logs` — one row per scrape run; `max_pesdb_id` drives incremental cutoff.

**Position order**: Throughout the codebase, positions follow the canonical order CF → SS → RWF → LWF → AMF → RMF → LMF → CMF → DMF → RB → LB → CB → GK (forward-first). This order is mirrored in `SORT_MAP` in `server.js` and in the client constants.
