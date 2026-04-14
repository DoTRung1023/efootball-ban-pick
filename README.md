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

## Features (Planned)

- **Authentication** — sign up / sign in with username + password or Google OAuth
- **Player Catalog** — full database of eFootball players scraped from [pesdb.net](https://pesdb.net/efootball/), including position, overall rating, club, nationality, height, weight, and age
- **Game Plans** — each user can create up to 20 game plans of 23 players (11 starters + 12 subs)
- **Ban & Pick Session** — real-time or turn-based draft between two users
- **Smart Scraper** — `npm run scrape` keeps the player catalog up to date; incremental runs only fetch newly added cards

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 18 |
| Server | Express.js |
| Database | MySQL 8+ |
| Scraper | `cheerio` (HTML parsing) + native `fetch` |
| Auth | bcrypt (password hashing) + Google OAuth (planned) |
| Frontend | Vanilla HTML / CSS / JS |

---

## Project Structure

```
ban-pick-efb/
├── database/
│   └── schema.sql          # All CREATE TABLE statements
├── public/
│   ├── css/
│   │   ├── styles.css
│   │   └── signin.css
│   ├── js/
│   │   └── signin.js
│   ├── logo/
│   ├── index.html
│   ├── signin.html
│   └── 404.html
├── src/
│   ├── db.js               # MySQL connection pool
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
players            — user-owned player selections
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

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/top-players` | Top 20 players by overall rating |
| `GET` | `/api/players` | Searchable player list (see params below) |

### `GET /api/players` query params

| Param | Example | Description |
|---|---|---|
| `q` | `?q=mbappe` | Search by name |
| `position` | `?position=CF` | Filter by position |
| `limit` | `?limit=50` | Results per page (default 50) |
| `offset` | `?offset=100` | Pagination offset |

---

## NPM Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with auto-reload |
| `npm start` | Start production server |
| `npm run scrape` | Update player catalog from pesdb.net |

---

## Roadmap

- [x] Sign-in page UI
- [x] Player catalog (scraped + stored in MySQL)
- [x] Incremental scraper with resume support and scrape logs
- [ ] User registration & authentication (bcrypt + sessions)
- [ ] Google OAuth sign-in
- [ ] Game plan builder (drag-and-drop formation view)
- [ ] Ban & pick session (real-time with WebSockets)
- [ ] Match history & stats
