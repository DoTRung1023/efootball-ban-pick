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

**Reload / reconnect behaviour** (`room.js`):
- When entering the draft view, `state.phase` is written to `sessionStorage` under key `efb_room_${code}_phase`.
- On page load, `initLobby` reads this key: if the cached phase is `"draft"` or `"ready"`, the lobby view is skipped entirely while the async reconnect completes (`registerAndPollPresence`). If the server confirms the room is still drafting, `tryEnterDraftFromRoomSnapshot` transitions directly to the draft view; otherwise the cache is cleared and the lobby is shown.
- The cache is cleared on: `leavePresence()`, `showDone()`, `showRoomClosed()`, and any failed reconnect.

**Leave button** (`room.js`):
- There is no `beforeunload` guard. The dialog was removed because the `sessionStorage` phase cache makes reloading safe — the draft is fully restored on reconnect. Both `#lobbyLeaveBtn` and `#draftLeaveBtn` call `leavePresence()` then set `window.location.href = "/"` directly.

**Frontend** (`public/`):
- `home.html` + `public/js/home.js` — main app: My Players tab, Game Plans tab, Rooms tab.
- `room.html` + `public/js/room.js` — full ban/pick room flow: lobby → drafting → await-ready → done.
- `public/js/room/allowance.js` — all allowance/cap logic (position caps, card type caps, range checks) shared between room.js and the server normalizes the same data independently.
- `public/js/room/constants.js` — canonical lists: `POSITION_OPTIONS`, `CARD_TYPE_OPTIONS`, `REGION_OPTIONS`, etc.

**Room page layout** (`#viewDraft`):
- There is no topbar and no turn pill (`#turnPill` / `.turn-pill-*` fully removed from HTML, CSS, and JS). Phase context comes from the stage dots alone.
- The `.stage-progress-container` is `justify-content: space-between` with the timer ring (`#timerRing`) in `.stage-header-left` on the left and the Leave button (`#draftLeaveBtn`) in `.stage-header-right` on the right. The `.stage-progress-bar` sits between them with `flex: 1; max-width: 620px`.
- The timer ring is **56×56 px** with a **44×44 px** inner circle; JS drives the conic-gradient via `ring.style.background`. There is a single canonical `.timer-ring` / `.timer-inner` definition in `room.css` — no context-specific overrides. There is no READY button in the topbar — `#draftTopReadyBtn` has been removed from HTML (JS already null-guards it).
- The draft schedule (`buildTurnSchedule`) always returns exactly two entries: `{ side: "both", action: "ban" }` then `{ side: "both", action: "pick" }`. Both phases are simultaneous — there are no per-player turns.
- Ban phase right panel: `.ban-phase-right` sidebar with two `.ban-side-section` blocks (bans-on-me / my-bans). There is **no pending/confirm step** — clicking a player card in the ban grid directly submits the ban via `submitBan()` (optimistic `applyLocalAction` + API call). The old `.ban-side-confirm` block (SELECTED label, preview card, Clear/Confirm buttons) has been removed.

**Ban phase interaction** (`room.js`):
- Clicking a player card in the ban grid calls `submitBan(player)` directly — no intermediate pending/confirm step.
- `submitBan` first calls `applyLocalAction(room, player)` + `renderDraftUi()` for instant feedback, then fires `POST /api/rooms/:code/ban`. If the API fails, a toast is shown and the next presence poll restores the authoritative server state.
- Ban sync to the opponent: every 500 ms poll cycle calls `registerPresence()` which returns the full room snapshot (including `bans`). The ban endpoint also sets `entry.updatedAt` and pushes a system chat message, both of which trigger `renderDraftUi()` on the opponent's next poll via `configChanged` and `presenceChanged`.
- `renderDraftUi()` runs unconditionally every 500 ms (driven by `pollPresence`). To avoid destroying and recreating DOM nodes on every cycle — which would reset CSS hover transitions and cause a continuous scale pulse — the ban grid and both ban strips use an **innerHTML-diff guard**: compute the new HTML string first, then only assign to `innerHTML` if it differs from the current content.

**Ban phase filter & sort** (`room.js`):
- `getBanListPlayers()` filters `state.opponentBanPlayers` entirely client-side — 15 filter state fields cover position, foot, playing style, card type, league, overall level 1/max ranges, club, nationality, height/weight/age ranges.
- Sort supports 9 categories: overall_max, overall, name, position, club, nationality, height, weight, age. `normalizeBanSortValue()` is the validator.
- `BAN_LEAGUE_OPTIONS` is a module-level mutable array populated by `fetchFilterOptions()` alongside `CARD_TYPE_OPTIONS`, `PLAYING_STYLE_OPTIONS`, `REGION_OPTIONS`. All are fetched from `GET /api/players/filter-options`.
- `comparePlayersByBanSort()` reads `height/weight/age` from both `player._raw.*` and top-level fields — ban players from `/api/my-players` store these at the top level (not under `_raw`).
- The filter dropdown panel is built in `renderBanToolbar()` and event-delegated in `bindBanPhaseUiOnce()` (runs once; guarded by `state.banUiBound`). Clearing all filters resets all 15 state fields.

**Ban card thumbnails** (`.ban-phase-thumb` in `room.css`):
- `border-radius: 0` — no rounded corners on cards in "Bans on Me" / "My Bans" strips.
- `height` is fixed (96 px for `--md`); **no explicit width** — the `img` is set to `height: 100%; width: auto` so the card's natural aspect ratio determines the container width. This avoids letterboxing since pesdb.net card images are taller than the old 3:4 container ratio.
- The empty-state dashed placeholder (`.ban-side-strip:empty::before`) uses `68×96 px` with `border-radius: 0` to match the natural card proportions.

**CSS parity — `room.css` vs `home.css`**: The ban page uses `.ap-dd-btn`, `.sort-dir-btn`, `.filter-input`, `.range-pair`, `.filter-clear-btn` etc. These are defined in `room.css` and kept visually in sync with `home.css`. Key rules: `.ap-dd-btn.has-active` (green highlight when filter active), `.filter-clear-btn` (red destructive style), `.select-mode-btn` (`border-radius: 7px`).

**CSS conventions for `room.css`**: Each component has a **single canonical rule block** — do not add a second rule for the same selector later in the file to tweak values; update the existing block instead. Late overrides with the same selector caused widespread redundancy (`.timer-ring`, `.stage-progress-dot`, `.stage-progress-dot::before`, `.stage-progress-dot .stage-dot-label`, `.stage-progress-line`, `.chat-item`, `.stage-progress-container--lobby` all had duplicate blocks that have since been merged). Context-specific variants use modifier classes (e.g. `.is-active`, `.is-completed`, `.is-mine`) or scoped parent selectors, not repeated base selectors.

**Key architectural pattern — allowance system**: The room config holds `allowanceEnabled` (which categories are active), `allowance` (the filter values per category), and `allowanceCaps` (per-category per-value player count caps). The server normalizes cap values on write; the client enforces caps in `getAllowanceCapViolation()` during pick selection. Both sides share the same normalization logic (duplicated between `server.js` and `public/js/room/allowance.js`).

**Database schema** (MySQL 8+):
- `players_catalog` — ~41k scraped players; `pesdb_id` is the stable external key (BIGINT, up to 15 digits for newer cards).
- `players` — user roster; links to `players_catalog.pesdb_id` via nullable FK.
- `game_plans` / `game_plan_players` — up to 20 plans per user; slots 1–11 = LINEUP, 12–23 = SUB.
- `scrape_logs` — one row per scrape run; `max_pesdb_id` drives incremental cutoff.

**Position order**: Throughout the codebase, positions follow the canonical order CF → SS → RWF → LWF → AMF → RMF → LMF → CMF → DMF → RB → LB → CB → GK (forward-first). This order is mirrored in `SORT_MAP` in `server.js` and in the client constants.
