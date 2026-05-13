# eFootball Ban & Pick

A web app that brings a structured **ban & pick draft system** to eFootball — letting players build, manage, and compete with curated squads through a fair and strategic selection process.

---

## Idea

In competitive eFootball, matches are often unbalanced because one side can field any combination of the strongest cards. **Ban & Pick** solves this by introducing a draft phase before each match:

1. Both players **ban** a set of players they don't want the opponent to use.
2. Both players then **pick** from the remaining pool to build their lineup.
3. The result is a fairer, more strategic match where preparation and knowledge of the player pool matter as much as in-game skill.

Think of it like a champion draft in League of Legends or Valorant — but for eFootball.

---

## Features

- **Authentication** — sign up / sign in with username + hashed password (bcryptjs)
- **Player Catalog** — full database of ~41 k eFootball players scraped from [pesdb.net](https://pesdb.net/efootball/), including position, overall rating, club, **league**, nationality, height, weight, age, and more detail fields
- **My Team** — build a personal squad: search, sort, and filter the catalog; add or remove players; manage your roster with multi-select delete
- **Team Search & Filter** — client-side search, sort (name, overall, position, height, weight, age, club, nationality), and position multi-filter for your own team list
- **Player Detail Popup** — click any catalog row or squad card to open a full-screen popup with the player's card art and stats
- **Game Plans** — view your saved game plans (up to 20 plans of 23 players each)
- **Smart Scraper** — `npm run scrape` keeps the player catalog up to date; auto-backs up `players_catalog` before every fresh run, then enriches players concurrently (4× parallel) for ~5–6× faster throughput; incremental runs only fetch newly added cards
- **Rooms (lobby)** — **Rooms** tab: create a room (generates a code) or join with a code. Host sets ban/pick rules on the room page before starting.
- **Room page** (`/room/:code`) — full-screen multiplayer flow: **lobby** (share invite link, set ban settings & category allowances, lobby chat, kick guest), **ban phase** (both players simultaneously ban from the opponent's squad — click any card to ban instantly; bans sync to the opponent within ~500 ms via polling), **pick phase** (both players simultaneously pick from the allowance-filtered pool — search/sort/position filter, instant sync via polling, opponent strip shown in instant-reveal mode), **ready phase** (shows both squads side by side; both players hit READY to confirm and transition to the summary), **summary** on completion. Sync is polling-based (every ~500 ms during draft); WebSocket integration is planned.
- **Room security** — duplicate host connections and over-capacity guest connections are rejected server-side (HTTP 409/403) with distinct error screens: “Host slot taken”, “Room is full”, or “Access denied” (kicked).
- **Reconnect on reload** — reloading during an active draft skips the lobby flash and returns directly to the draft view using a `sessionStorage` phase cache. No “unsaved changes” browser dialog is shown on reload — the draft is always safely recoverable.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 18 |
| Server | Express.js |
| Database | MySQL 8+ |
| Scraper | `cheerio` (HTML parsing) + native `fetch` |
| Auth | `bcryptjs` (password hashing) |
| Frontend | Vanilla HTML / CSS / JS |

---

## Project Structure

```
ban-pick-efb/
├── database/
│   └── schema.sql              # All CREATE TABLE statements
├── public/
│   ├── css/
│   │   ├── home.css            # Home page styles
│   │   ├── room.css            # Dedicated room page (lobby / draft / done)
│   │   └── signin.css          # Sign-in / sign-up styles
│   ├── js/
│   │   ├── home.js             # Home page logic (includes room modal + join)
│   │   ├── room.js             # Room page entry point — wires sub-modules, draft timer, submit handlers
│   │   ├── signin.js           # Auth modal logic
│   │   └── room/
│   │       ├── callbacks.js    # Shared mutable callback registry (breaks circular imports)
│   │       ├── state.js        # state singleton, defaultRoomConfig, applyPresenceSnapshot
│   │       ├── utils.js        # escapeHtml, showToast, showView, getUser, getCurrentIdentity
│   │       ├── players.js      # Player normalisation helpers, miniCardHtml, formation/slot utils
│   │       ├── ban.js          # Ban phase: filter/sort, toolbar, grid event binding, fetchFilterOptions
│   │       ├── pick.js         # Pick phase: toolbar, grid binding, fetchPlayers, loadDraftPlayers
│   │       ├── lobby.js        # Full lobby UI: renderLobby, initLobby, config push, chat
│   │       ├── presence.js     # Presence polling: register, fetchSnapshot, leave, pollPresence
│   │       ├── allowance.js    # Allowance/cap logic shared with server
│   │       └── constants.js    # POSITION_OPTIONS, CARD_TYPE_OPTIONS, REGION_OPTIONS, etc.
│   ├── logo/
│   ├── home.html               # Main app page
│   ├── room.html               # Ban & pick room (lobby → draft → summary)
│   ├── signin.html             # Sign-in / sign-up page
│   └── 404.html
├── src/
│   ├── db.js                   # MySQL connection pool
│   ├── cardImageCacheR2.js     # R2 card image cache (/img/card/:id.png)
│   ├── scrape.js               # Player catalog scraper (full + incremental)
│   ├── scrape-missing.js       # Missing-only repair: diffs site vs DB, fills gaps
│   └── server.js               # Express app + API routes
├── .env.example                # Environment variable template
└── package.json
```

---

## Database Schema

```
scrape_logs             — history of every scrape run
players_catalog         — all eFootball players (from pesdb.net)
players_catalog_backup  — snapshot taken automatically before each fresh scrape
users                   — registered accounts
players                 — user-owned team rosters
game_plans              — up to 20 plans per user (11 starters + 12 subs)
game_plan_players       — junction: which players are in which plan
```

---

## Getting Started

### 1. Prerequisites

- Node.js ≥ 18
- MySQL 8+

Install MySQL on macOS:
```bash
brew install mysql
brew services start mysql
```

### 2. Clone & install dependencies

```bash
git clone <repo-url>
cd ban-pick-efb
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your database credentials:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=banpick
DB_PASSWORD=
DB_NAME=ban_pick_efb
PORT=3000
```

### (Optional) Card image caching (Cloudflare R2)

By default the UI loads card images via your server at `/img/card/<pesdb_id>.png`.

- If R2 is **not** configured, the server will fall back to redirecting to pesdb.net.
- If R2 **is** configured, the server will cache each image as `cards/f<pesdb_id>.png`.
- If you set `R2_PUBLIC_BASE_URL`, the server will **302 redirect** to:
  `R2_PUBLIC_BASE_URL/cards/f<pesdb_id>.png` after the first cache fill (best for production + CDN).

Required environment variables:

```
R2_BUCKET=
R2_REGION=auto
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
```

Recommended (public bucket or CDN):

```
R2_PUBLIC_BASE_URL=
```

### 4. Set up the database

Create the database user and tables:
```bash
# Create a dedicated user (no password)
mysql -u root -e "
  CREATE USER IF NOT EXISTS 'banpick'@'localhost' IDENTIFIED BY '';
  GRANT ALL PRIVILEGES ON ban_pick_efb.* TO 'banpick'@'localhost';
  FLUSH PRIVILEGES;
"

# Run the schema
mysql -u root < database/schema.sql
```

### 5. Scrape player data

```bash
npm run scrape
```

Additional scraping commands:

- **`npm run scrape`**: Smart scrape
  - **Backup**: drops and recreates `players_catalog_backup` from `players_catalog` before starting any fresh run
  - First run: **full** catalog scrape (walks all list pages + fetches detail pages for all ~41 k players)
  - Subsequent runs: **incremental** (only fetches newly added cards since last finished run)
  - **Concurrent enrichment**: fetches up to 4 player detail pages in parallel, spaced 400 ms apart — ~5–6× faster than sequential
  - Resume: if interrupted, re-run `npm run scrape` to resume from `.scrape-state.json` (no backup on resume)

- **`npm run scrape:missing`**: Missing-only repair
  - Backs up `players_catalog` to `players_catalog_backup` before starting
  - Scans all pesdb list pages to collect every `pesdb_id`
  - Diffs against `players_catalog`
  - Fetches detail pages and upserts **only missing IDs** (concurrently, 4 at a time)

Optional environment flags:

- **`SCRAPE_SHOW_LOGS=1`**: print the “last 5 runs” scrape log table at the end of `npm run scrape`

**First run** — full scrape (~41 k players):
```
💾 Backing up players_catalog → players_catalog_backup…
   41,314 rows backed up.

📦 Mode: FULL  (list by overall_rating + Dream Team detail per player)
   41,314 players · ~1181 pages
   [████████████████████████████] 41,314/41,314  page 1181  NNNs
✅ Done!  41,314 players upserted.
```

**Subsequent runs** — incremental (seconds):
```
📬 Mode: INCREMENTAL  (new players since 2026-04-14)
   Cutoff pesdb_id: 387,113,187,158,919
   Found 12 new players  page 1  2s
✅ Done!  12 players upserted.
```

If a run is interrupted, just run `npm run scrape` again — it resumes automatically from the last saved page.

### 6. Start the server

```bash
npm run dev    # development (auto-reload)
npm start      # production
```

Visit [http://localhost:3000](http://localhost:3000).

### Rooms and the room page

1. Sign in, open the **Rooms** tab, then **CREATE ROOM** (or **JOIN** with a code). Creating a room navigates to `/room/<CODE>` (host view); sharing the **Copy invite link** button sends the guest to `/room/<CODE>?mode=join`.
2. On the **room page**, the host configures **bans per side**, **ban/pick durations**, **reveal mode** (show picks each turn vs. reveal at end), and **category allowances** (restrict the pick pool by position, overall, card type, region, etc. with per-category caps). The guest clicks **READY**; the host then **START DRAFT**.
3. Presence is maintained via `POST /api/rooms/:code/presence` (heartbeat every ~5 s). The client polls `GET /api/rooms/:code` to detect guest join, config changes, and draft start. During an active draft the TTL extends to 30 s so page reloads don't drop the session.
4. If a second user tries to open the host URL, they receive a **"Host slot taken"** error with a suggestion to use the invite link. If both slots are filled, any additional attempt gets a **"Room is full"** error.

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/rooms/:code/presence` | Heartbeat — register/refresh as host or guest (in-memory, 12 s lobby / 30 s draft TTL) |
| `GET` | `/api/rooms/:code` | Poll current room snapshot (host, guest, config, bans, picks, status) |
| `POST` | `/api/rooms/:code/leave` | Remove self from room; closes room if host |
| `POST` | `/api/rooms/:code/start` | Host starts the draft (requires guest ready) |
| `POST` | `/api/rooms/:code/ready` | Guest toggles ready state |
| `POST` | `/api/rooms/:code/ban` | Submit a ban during the ban phase |
| `POST` | `/api/rooms/:code/pick` | Submit a pick during the pick phase |
| `POST` | `/api/rooms/:code/match-ready` | Toggle post-draft match-ready state |
| `POST` | `/api/rooms/:code/kick-guest` | Host removes the current guest |
| `POST` | `/api/rooms/:code/config` | Host updates ban/pick settings |
| `GET` | `/img/card/:id.png` | Player card image (cached to R2 if configured) |
| `GET` | `/api/top-players` | Curated carousel of featured legends & top stars |
| `GET` | `/api/players` | Searchable, filterable, sortable player catalog |
| `GET` | `/api/players/filter-options` | Distinct filter values (card types, leagues, playing styles, regions) |
| `GET` | `/api/players/distinct` | Distinct values for autocomplete (club, nationality) |
| `GET` | `/api/my-players` | Get a user's team roster |
| `POST` | `/api/my-players` | Add a player to a user's team |
| `DELETE` | `/api/my-players` | Remove one or more players from a user's team |
| `GET` | `/api/game-plans` | Get a user's game plans |
| `POST` | `/api/signup` | Register a new account |
| `POST` | `/api/signin` | Sign in and return user info |

### `GET /api/players` query params

| Param | Example | Description |
|---|---|---|
| `q` | `?q=mbappe` | Search by name |
| `positions` | `?positions=CF,SS,RWF` | Filter by one or more positions (comma-separated) |
| `sortBy` | `?sortBy=overall_max_desc` | Sort order (see values below; default is max rating descending) |
| `club` | `?club=Barcelona` | Filter by club name |
| `nationality` | `?nationality=France` | Filter by nationality |
| `heightMin` / `heightMax` | `?heightMin=180&heightMax=195` | Height range in cm |
| `weightMin` / `weightMax` | `?weightMin=70&weightMax=90` | Weight range in kg |
| `ageMin` / `ageMax` | `?ageMin=20&ageMax=30` | Age range |
| `limit` | `?limit=50` | Results per page (default 50; pick phase loads up to 500) |
| `offset` | `?offset=60` | Pagination offset |

**`sortBy` values:** `overall_max_desc`, `overall_max_asc`, `overall_desc`, `overall_asc`, `name_asc`, `name_desc`, `position_asc`, `position_desc`, `height_desc`, `height_asc`, `weight_desc`, `weight_asc`, `age_desc`, `age_asc`, `club_asc`, `club_desc`, `nationality_asc`, `nationality_desc`

### `GET /api/players/distinct` query params

| Param | Example | Description |
|---|---|---|
| `field` | `?field=club` | Field to get distinct values for (`club` or `nationality`) |
| `q` | `?q=barca` | Prefix search for autocomplete |

---

## NPM Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with auto-reload |
| `npm start` | Start production server |
| `npm run scrape` | Full or incremental catalog update (backs up DB first) |
| `npm run scrape:missing` | Repair gaps: diff site vs DB, fill missing entries |

---

## Bug found

- [x] username length to 50 characters
- [x] player list info: region - country / league - club / foot - playing style / height - weight - age
- [x] in databased, change card label = card type
- [x] sort: overall, overall max
- [x] filter: foot, playing style, overall, overall max, card type, league
- [x] select mode in game plans: tick box should always show, an abandon tick box appears on that select string
- [x] change my team to my players on section strip
- [x] add option in my players tab to show and hide players info
- [x] create room page: make it prettier and more smoothly
- [x] add limit number of each categories
- [x] mode: reveal team after ban pick or in turn
- [x] categories undone: league, clubs, nationality
- [x] host can kick other roomates
- [ ] fix rooms tab
- [x] auto-backup `players_catalog` → `players_catalog_backup` before every fresh scrape run
- [x] reloading the page during a draft now reconnects directly to the draft (no lobby flash, no draft state loss)
- [x] "reload site / changes not saved" browser dialog removed — draft is always safely recoverable via sessionStorage cache
- [x] room security: duplicate host or over-capacity guest connections are rejected with distinct error screens (Host slot taken / Room is full / Access denied)
- [ ] after scraping, some players have empty playing styles, need to fix the scraper / data cleaning
- [ ] run scrape missing should be record in scrape logs, and show in the end of scrape logs table 
- [ ] ban pick page:
  - [x] for ban phase: I can see opponents squad and ban, also both users can see other opponent's ban player card
  - [x] for pick phase: both players pick simultaneously from the allowance-filtered pool; search/sort/position filter; MY PICKS strip + OPPONENT PICKS strip (instant-reveal mode); ready phase shows both squads for confirmation
- [x] ban grid: player cards no longer continuously scale up/down on hover (two root causes fixed: (1) replaced innerHTML string comparison with a state-key diff guard — browsers normalize whitespace and strip void-element slashes on serialization so the old comparison always failed and the grid rebuilt every 500 ms poll cycle; (2) removed `translateY` from the hover transform — moving the card upward pushes its bottom edge above the cursor, deactivating `:hover` mid-transition and causing a jitter loop)
- [ ] fix tab in setting, ban page
- [ ] fix the ban duration, pick duration text to avoid text overflow when resize window
- [ ] add username on the right of tab, close/leave room button on the left

---

## Roadmap

- [x] Sign-in / sign-up page with hashed passwords
- [x] Player catalog (scraped + stored in MySQL)
- [x] Incremental scraper with resume support and scrape logs
- [x] Home page with My Team panel and Game Plans panel
- [x] Add / remove players from team with search, sort, and multi-filter
- [x] Player detail popup with card art and full stats
- [x] Team-side search, sort, and position filter
- [x] edit profile
- [x] Game plan builder (drag-and-drop formation view)
- [x] clean data
- [x] Rooms tab + create/join flow (home)
- [x] Dedicated room page (lobby UI, draft UI, end summary; local + demo opponent)
- [ ] Ban & pick session (real-time with WebSockets; replace polling in `room.js`)
   + [x] mode: reveal after finishing or show after every turn
   + [x] host: determine the rules of ban pick, can kick other roomates
   + [x] finalise rules: ban categories, number of ban players
   + [x] room security: prevent duplicate hosts and over-capacity guests
   + [x] reliable reconnect on page reload (sessionStorage phase cache + 30 s draft TTL)
   + [x] clean leave flow (no spurious "unsaved changes" browser dialog)
   + [ ] procedure: finalise rules → start ban category → ban players & pick loop
   + [ ] rule:
      + [x] ban category: player name, position, overall, overall_max, club, nationality, height, weight, age, card type, region, foot, playing style, league
      + [x] allow: card type — number of players, overall rating
      + [x] compulsory: card type — number of players, overall rating
      + [x] ban players: ban exact player card (click-to-ban; syncs to opponent via polling)
      + [x] pick players: pick exact player card (click-to-pick; syncs to opponent via polling; allowance cap validation)
   + [x] a player can see opponent's picks (instant-reveal mode) / picks hidden until ready phase (hidden mode)
   + [ ] players can view their game plans to build accordingly during the pick phase
   + [x] a list of my current squad (allowance-filtered) visible during pick phase; search, sort, position filter
   + [x] after finish picking, ready phase shows both squads; both players confirm with READY to go to summary
- [x] update database
- [ ] admin page
- [ ] responsive design
- [ ] set up cloud server + database
- [ ] set up R2 + CDN for card image caching
- [ ] analytics + error monitoring
- [ ] testing (unit + integration)
- [ ] documentation
- [ ] code cleanup and refactoring
   + [x] `room.css` — merged all duplicate/late-override rule blocks into single canonical definitions (timer ring, stage progress dots & labels, connecting line, chat item, lobby container)
   + [x] `room.js` — ban grid and ban strips use state-key diffing (not innerHTML) to avoid unnecessary DOM recreation during 500 ms polling cycles; `is-hovered` removed from `.player-card` elements (CSS `:hover` only) to prevent DOM mutation breaking the guard
   + [x] `room.css` — ban grid hover consolidated to single `.ban-phase-grid .player-card:not(.is-unavailable):hover` rule; `scale` only (no `translateY`) to prevent hover jitter; `--bg-card`, `--bg-card-hover`, `--transition` added to `:root` to match `home.css`
   + [x] `room.js` split into phase-based modules: `callbacks.js`, `state.js`, `utils.js`, `players.js`, `ban.js`, `pick.js`, `lobby.js`, `presence.js` — entry `room.js` reduced from ~5000 lines to ~1200; circular imports broken via shared mutable `cb` registry
- [ ] UI polish and animations
- [ ] deploy
