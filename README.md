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
- **Smart Scraper** — `npm run scrape` keeps the player catalog up to date; incremental runs only fetch newly added cards
- **Rooms (lobby)** — **Rooms** tab: create a room (modal only asks for a generated room code) or join with a code. Ban/pick **counts default to 0** at creation; the host sets them on the **room page** before starting a draft. The top bar no longer duplicates “Create room” next to the user menu (use the Rooms tab instead).
- **Room page** (`/room/:code`) — dedicated full-screen flow: **lobby** (share code, optional **demo opponent** for solo testing, set bans/picks per side, start draft), **draft** (turns, timer, search/filter vs `/api/players`), **summary** when picks complete. Real-time sync is **not** wired yet (local / demo only); WebSocket hooks are called out in `public/js/room.js` for a future server.

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
│   └── schema.sql          # All CREATE TABLE statements
├── public/
│   ├── css/
│   │   ├── home.css        # Home page styles
│   │   ├── room.css        # Dedicated room page (lobby / draft / done)
│   │   └── signin.css      # Sign-in / sign-up styles
│   ├── js/
│   │   ├── home.js         # Home page logic (includes room modal + join)
│   │   ├── room.js         # Room page: lobby, local draft, demo opponent
│   │   └── signin.js       # Auth modal logic
│   ├── logo/
│   ├── home.html           # Main app page
│   ├── room.html           # Ban & pick room (lobby → draft → summary)
│   ├── signin.html         # Sign-in / sign-up page
│   └── 404.html
├── src/
│   ├── db.js               # MySQL connection pool
│   ├── cardImageCacheR2.js # R2 card image cache (/img/card/:id.png)
│   ├── scrape.js           # Player catalog scraper
│   └── server.js           # Express app + API routes
├── .env.example            # Environment variable template
└── package.json
```

---

## Database Schema

```
scrape_logs        — history of every scrape run
players_catalog    — all eFootball players (from pesdb.net)
users              — registered accounts
players            — user-owned team rosters
game_plans         — up to 20 plans per user (11 starters + 12 subs)
game_plan_players  — junction: which players are in which plan
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
  - First run: **full** catalog scrape (walks all list pages + fetches detail pages)
  - Subsequent runs: **incremental** (only fetches newly added cards since last finished run)
  - Resume: if interrupted, re-run `npm run scrape` to resume from `.scrape-state.json`

- **`npm run scrape:missing`**: Missing-only repair
  - Scans pesdb list pages to collect all `pesdb_id`s
  - Diffs against `players_catalog`
  - Fetches detail pages and upserts **only missing IDs**

Optional environment flags:

- **`SCRAPE_SHOW_LOGS=1`**: print the “last 5 runs” scrape log table at the end of `npm run scrape`

**First run** — full scrape (~41 k players, ~40 minutes):
```
📦 Mode: FULL  (first run — fetching all players)
   41,314 players · ~1181 pages
   [████████████████████████████] 41,314/41,314  page 1181  2403s
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

1. Sign in, open the **Rooms** tab, then **CREATE ROOM** (or join with a code). Creating a room opens a modal with a generated code; **Start room** navigates to `/room/<CODE>?bans=0&picks=0&mode=host` (or `mode=join` when joining).
2. On the **room page**, the host sets **bans per side** and **picks per side** (must be at least one total ban or pick step to start). Use **Add demo opponent** to run a draft locally without a second browser; the demo side auto-acts on its turns.
3. The draft loads player cards from **`GET /api/players`** (search + position filter). While in the lobby, the page registers with **`POST /api/rooms/:code/presence`** and polls **`GET /api/rooms/:code`** every few seconds so the **host sees when a guest has joined** (in-memory on the Node process; two browsers on the same server). Full draft sync still needs WebSockets or similar.

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/rooms/:code/presence` | Register as host or guest for lobby presence (in-memory) |
| `GET` | `/api/rooms/:code` | Current host/guest for a room code (for polling) |
| `GET` | `/img/card/:id.png` | Player card image (cached to R2 if configured) |
| `GET` | `/api/top-players` | Curated carousel of featured legends & top stars |
| `GET` | `/api/players` | Searchable, filterable, sortable player catalog |
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
| `limit` | `?limit=50` | Results per page (default 30) |
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
| `npm run scrape` | Update player catalog from pesdb.net |

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
- [ ] create room page: make it prettier and more smoothly
- [ ] add limit number of each categories
- [ ] mode: reveal team after ban pick or in turn

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
- [ ] Ban & pick session (real-time with WebSockets; replace local state in `room.js`)
   + [ ] mode: reaveal after finishing or show after every turn
   + [ ] host: determine the rules of ban pick, can kick other roomates
   + [ ] finalise rules: ban categories, number of ban players
   + [ ] procedure: finalise rules -> start ban category -> ban players & pick loop
   + [ ] rule: 
      + [ ] ban category: player name, position, overall, overall_max, club, nationality, height, weight, age, card type, region, foot, playing style, league
      + [ ] allow: card type: number of players, overall rating
      + [ ] compulsory: card type: number of players, overall rating
      + [ ] ban players: ban exact player card
      + [ ] pick players: pick exact player card
   + [ ] a player can see opponent's team then ban/pick
   + [ ] players can view their game plans to build accordingly
   + [ ] a list of my current squad / all my players / all other players
   + [ ] after finish picking, done then show two squads on screen
- [x] update database
- [ ] admin page 
- [ ] responsive design
- [ ] security
- [ ] deploy
