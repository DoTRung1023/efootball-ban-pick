---
paths:
  - "public/admin.html"
  - "public/js/admin.js"
  - "public/css/admin.css"
  - "src/routes/admin.js"
---

# Admin dashboard (`/admin`)

`admin.html` + `public/js/admin.js` + `public/css/admin.css`. Single vanilla ES module;
no build step.

**Auth**: login overlay on first visit stores the key in `sessionStorage`
(`efb_admin_key`). Every API call appends `?adminKey=<key>`. The server checks
`req.headers["x-admin-key"] || req.query.adminKey` against `process.env.ADMIN_KEY`
(defaults to `"admin-dev"` if unset).

**Tabs**: OVERVIEW · SCRAPES · PLAYERS · USERS · ROOMS. All share a single
`switchTab(tab)` function; inactive panels are `hidden`.

- **OVERVIEW**: stats row (catalog count, user count, active rooms + draft count, last
  scrape age) + 2×2 grid of panels: Scrape Runs, Active Rooms (auto-refreshes every
  10 s), Recent Signups, Data Quality.
- **SCRAPES**: full `scrape_logs` table (up to 50 rows) showing run id, type, players
  upserted, duration, started/finished timestamps, max pesdb_id, status pill.
- **PLAYERS**: paginated catalog browser (`/api/players`) with search-by-name, cycling
  sort (OVERALL MAX ↓ / ↑ / OVERALL / NAME / POSITION), and client-side CSV export of
  up to 5 000 rows.
- **USERS**: all users via `/api/admin/recent-users?limit=50` with id, username, email,
  player count, plan count, join date.
- **ROOMS**: active in-memory rooms via `/api/admin/rooms` with phase pills
  (BAN / PICK / LOBBY / READY / DONE) and WATCH links to `/room/:code`.

## Admin API routes

All in `src/routes/admin.js`, all behind `requireAdminKey` (`src/lib/http.js`):

- `GET /api/admin/stats` — catalog count, user count, new users this week,
  active/draft room counts, last scrape row.
- `GET /api/admin/rooms` — iterates `roomPresence`, filters closed/stale entries
  (TTL × 3), returns `{ code, host, guest, phase, ageSec }`.
- `GET /api/admin/scrape-logs?limit=N` — reads `scrape_logs` DESC.
- `GET /api/admin/recent-users?limit=N` — users JOIN players + game_plans, most recent
  first.
- `GET /api/admin/data-quality` — four COUNT queries on `players_catalog`: missing
  `playing_style`, `region`, `overall_max`, duplicate `pesdb_id`.

## CSS (`admin.css`)

Self-contained; reuses the same `:root` CSS variables as `home/base.css` (green/black
theme, Rajdhani + Orbitron fonts). Key blocks: `.login-overlay` / `.login-card`,
`.admin-nav` (sticky 56 px), `.stats-row` (4-column grid), `.panel-grid-2` (2-column
grid), `.admin-table` (sticky thead, hover rows), phase pills
(`.phase-pill.is-ban/pick/lobby/ready/done`), status pills
(`.status-pill.is-running/success`), data-quality bars (`.dq-bar.is-ok/warn/bad`),
pagination bar.