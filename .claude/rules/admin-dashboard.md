---
paths:
  - "public/admin.html"
  - "public/js/pages/admin.js"
  - "public/css/features/admin/admin.css"
  - "src/features/admin/routes.js"
---

# Admin dashboard (`/admin`)

`admin.html` + `public/js/pages/admin.js` + `public/css/features/admin/admin.css`. No build step.

`admin.js` is a three-line entry; the dashboard lives in `public/js/features/admin/`:

| Module | Role |
| --- | --- |
| `adminApi.js` | the key in sessionStorage + `apiFetch` (appends `?adminKey=`) |
| `loginGate.js` | `initLoginGate(onAuthed)` wires the form; `tryStoredKey(onAuthed)` re-auths silently |
| `tabs.js` | `getActiveTab` — each tab fetches on activation; `switchTab` is internal |
| `format.js` | `fmt*`, the pills, `tableMessage(colspan, text)` |
| `statsPanel.js`, `scrapePanels.js`, `roomPanels.js`, `userPanels.js`, `dataQualityPanel.js`, `catalogTable.js` | one module per panel |
| `dashboard.js` | `initDashboard()` — the OVERVIEW fetches + the 10 s refresh loop |
| `index.js` | `initAdminApp()` |

`initAdminApp` wires every panel **before** calling `tryStoredKey`, so a stored key can
never reveal a half-wired dashboard. Panel wiring lives in `init*` functions rather than
at module top level; keep it that way, or that ordering guarantee is lost.

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

All in `src/features/admin/routes.js`, all behind `requireAdminKey` (`src/lib/http.js`):

- `GET /api/admin/stats` — catalog count, user count, new users this week,
  active/draft room counts, last scrape row.
- `GET /api/admin/rooms` — iterates `roomPresence`, filters out closed rooms and
  ones quiet for `ROOM_LIST_QUIET_MS` (90 s), returns
  `{ code, host, guest, phase, ageSec }`. That cutoff is **display only** — it
  hides a stale room from this list and does not end it. There is no presence
  TTL; see `room/presence-and-reconnect.md`.
- `GET /api/admin/scrape-logs?limit=N` — reads `scrape_logs` DESC.
- `GET /api/admin/recent-users?limit=N` — users JOIN players + game_plans, most recent
  first.
- `GET /api/admin/data-quality` — four COUNT queries on `players_catalog`: missing
  `playing_style`, `region`, `overall_max`, duplicate `pesdb_id`.

## CSS (`admin.css`)

Self-contained; reads its colours from `shared/tokens.css` like every other page — there
is no `:root` block here any more (see `DESIGN.md` §2). Key blocks: `.login-overlay` / `.login-card`,
`.admin-nav` (sticky 56 px), `.stats-row` (4-column grid), `.panel-grid-2` (2-column
grid), `.admin-table` (sticky thead, hover rows), phase pills
(`.phase-pill.is-ban/pick/lobby/ready/done`), status pills
(`.status-pill.is-running/success`), data-quality bars (`.dq-bar.is-ok/warn/bad`),

> **Colour system note.** This file predates the efhub re-skin. The token *names* below
> are current, but the reasoning often says "green", "cyan" or "glow" — those hues and
> that glow are gone. Green meant "you" and cyan meant "the opponent"; both are greyscale
> now, and the only accent left on this page is the turn clock and the pick slot waiting
> on you. Read `DESIGN.md` §3 and §12 for what replaced what; treat colour claims here as
> history and the structural claims as current.
pagination bar.