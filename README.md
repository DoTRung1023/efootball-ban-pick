# eFootball Ban & Pick

A draft system for eFootball. Instead of both sides fielding whatever they like, each
player bans from the *opponent's* squad first, then picks a lineup from what survives —
the same idea as a champion draft in League of Legends, applied to football cards.

**How a session goes:** set the rules → ban phase → pick phase → start match.

1. **Ban** — each side bans independently from the opponent's squad. Both may ban the
   same player; a ban only restricts the other side.
2. **Pick** — each side builds a 23-player squad from the remaining pool, subject to
   whatever category allowances the host configured.
3. **Start match** — both squads are revealed side by side, and you go play the game.

---

## Features

**Squad building** (`/`)
- Catalog of ~41 k eFootball players scraped from [pesdb.net](https://pesdb.net/efootball/)
  — position, overall, overall max, club, league, region, nationality, foot, playing
  style, height, weight, age.
- Personal squad with search, sort, position multi-filter, and multi-select delete.
- Up to 20 game plans of 23 players each (11 starters + 12 subs), built on a formation
  pitch with a player picker.
- Every filter panel shares one grouped layout: IDENTITY / STATS / CLUB & ORIGIN /
  PHYSICAL.

**Draft room** (`/room/:code`)
- **Lobby** — invite link, chat, and host-set rules: bans per side, ban/pick durations,
  reveal mode (instant vs hidden), and per-category allowance caps (position, overall,
  card type, region, league, club…). Host can kick the guest.
- **Ban phase** — stage bans off the opponent's squad, then CONFIRM. Staged bans appear
  on the opponent's screen live; when both confirm, the pick phase starts.
- **Pick phase** — squad pool with PICKED/BANNED overlays, a formation pitch with live
  average OVR and allowance pills, and an opponent feed. A quick-load bar pre-fills the
  formation from a saved game plan.
- **Start match** — both lineups as full pitches with real card art, bench strips, and a
  stats comparison bar. In hidden mode the opponent's column stays masked until here.
- Reloading mid-draft reconnects straight back into it. Duplicate hosts and
  over-capacity guests are rejected server-side with distinct error screens, and if your
  opponent disappears you get a countdown popup rather than a frozen room.

**Console** (`/console`) — reached from **Admin Console** in your account menu, which
only appears for an account with `users.is_admin = 1`; opening it re-confirms your
password. Four tabs: OVERVIEW (catalog / user / room counts, catalog health, scrape
history), ROOMS (live rooms), USERS, and CATALOG (paginated browser with CSV export).

Grant yourself access once, in MySQL — there is deliberately no UI for it:

```sql
UPDATE users SET is_admin = 1 WHERE email = 'you@example.com';
```

Both pages are responsive down to 320 px.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 18, ESM |
| Server | Express 4 |
| Database | MySQL 8+ (`mysql2`) |
| Frontend | Vanilla HTML / CSS / JS — no build step |
| Scraper | `cheerio` + native `fetch` |
| Auth | `bcryptjs` |
| Image cache | Cloudflare R2 (optional) |

Real-time sync is **polling**, not WebSockets — a ~500 ms presence heartbeat during the
draft.

---

## Getting started

**Prerequisites:** Node.js ≥ 18 and MySQL 8+ (`brew install mysql && brew services start mysql`).

```bash
npm install
```

**Environment** — create a `.env` in the project root:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=banpick
DB_PASSWORD=
DB_NAME=ban_pick_efb
PORT=3000
ADMIN_SECRET=              # signs console session tokens; random per boot if unset
```

Optional Cloudflare R2 card-image cache. Without it the server redirects
`/img/card/:id.png` straight to pesdb.net; with it, images are cached as
`cards/f<pesdb_id>.png`. Setting `R2_PUBLIC_BASE_URL` makes the server 302 to your CDN
after the first fill — best for production.

```
R2_BUCKET=
R2_REGION=auto
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PUBLIC_BASE_URL=
```

**Database:**

```bash
mysql -u root -e "
  CREATE USER IF NOT EXISTS 'banpick'@'localhost' IDENTIFIED BY '';
  GRANT ALL PRIVILEGES ON ban_pick_efb.* TO 'banpick'@'localhost';
  FLUSH PRIVILEGES;
"
mysql -u root < database/schema.sql
```

**Player data** — the first `npm run scrape` is a full ~41 k-player run and takes a
while; later runs are incremental and take seconds.

```bash
npm run scrape
```

**Run it:**

```bash
npm run dev      # auto-reload
npm start        # production
```

Then open <http://localhost:3000>.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server with `node --watch` |
| `npm start` | Production server |
| `npm run scrape` | Full on first run, incremental after. Backs up `players_catalog` before a fresh run, enriches 4 detail pages in parallel, and resumes from `.scrape-state.json` if interrupted. `SCRAPE_SHOW_LOGS=1` prints the last 5 runs. |
| `npm run scrape:missing` | Repair gaps — diff every pesdb list page against the DB and fetch only the missing IDs. |

---

## Layout

```
src/
├── server.js              # composition root: middleware, router mounts, static, errors
├── db.js                  # mysql2 pool
├── cardImageCacheR2.js    # /img/card/:id.png — R2 cache or pesdb redirect
├── scrape.js              # catalog scraper (full + incremental, resumable)
├── scrape-missing.js      # missing-only repair
├── routes/                # players, auth, gamePlans, rooms, admin, pages
├── rooms/                 # store.js (in-memory room map), config.js (TTLs, allowances)
├── players/               # catalogQuery.js — SORT_MAP, filter + sort builders
└── lib/                   # http.js (handlers, error middleware), paths.js

public/
├── home.html   room.html   signin.html   console.html
├── css/home/              # 8 files: base, player-card, squad, plans, catalog,
│                          #   modals, rooms, responsive
├── css/room.css           # the whole draft page
└── js/
    ├── home.js  + home/   # utils, callbacks, squad, catalog, plans, rooms
    └── room.js  + room/   # ~25 modules: state, presence, api, ban/pick/ready views,
                           #   draft flow + session + controls, lobby/, allowance
database/schema.sql
```

Room state lives **in memory only** and does not survive a server restart.

---

## API

All routes are JSON. Auth is stateless — there is no session middleware; `userId` is
passed in the request body or query string and trusted client-side, so this is **not
hardened for untrusted public deployment**.

| Area | Endpoints |
|---|---|
| Health | `GET /api/health` |
| Auth | `POST /api/signup` · `POST /api/signin` · `PUT /api/profile` |
| Catalog | `GET /api/players` · `/api/players/filter-options` · `/api/players/distinct` · `/api/top-players` |
| Squad | `GET`/`POST`/`DELETE /api/my-players` |
| Game plans | `GET`/`POST /api/game-plans` · `PUT`/`DELETE /api/game-plans/:id` · `GET`/`PUT /api/game-plans/:id/players[/:slot]` · `PUT /api/game-plans/:id/swap` |
| Room | `GET /api/rooms/:code` · `POST /api/rooms/:code/` + `presence` `leave` `ready` `start` `config` `chat` `kick-guest` `ban` `ban-confirm` `pick` `match-ready` |
| Console | `POST /api/admin/session` (password → token) · `GET /api/admin/` + `me` `stats` `rooms` `scrape-logs` `users` `data-quality` — all but `session` require `x-admin-token` |
| Images | `GET /img/card/:id.png` |

**`GET /api/players`** takes `q`, `positions` (comma-separated), `club`, `nationality`,
`heightMin`/`Max`, `weightMin`/`Max`, `ageMin`/`Max`, `limit` (default 50), `offset`, and
`sortBy` — `{overall_max,overall,name,position,height,weight,age,club,nationality}_{asc,desc}`,
defaulting to `overall_max_desc`.

---

## Database

```
players_catalog          — every eFootball player from pesdb.net
players_catalog_backup   — snapshot taken by the scraper before each fresh run
scrape_logs              — history of scrape runs
users                    — accounts (bcrypt password hashes)
players                  — user-owned squads
game_plans               — up to 20 per user
game_plan_players        — plan ↔ player, slot 1–11 lineup / 12–23 subs
```

---

## Known gaps

- Card art occasionally missing playing style / region — a scraper data-cleaning issue.
- `npm run scrape:missing` doesn't write to `scrape_logs`.
- Ban room: toggling player info shifts the grid as the scrollbar appears.
- Pick and start-match screens haven't had the design pass the lobby got.
- No tests, no analytics or error monitoring, and nothing is deployed yet — no cloud
  server, database, or CDN.
