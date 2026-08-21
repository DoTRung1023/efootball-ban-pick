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
only appears for an account with `users.is_admin = 1`. Four tabs:

- **OVERVIEW** — catalog / user / room counts, catalog health, scrape history, and the
  scrape controls below.
- **ROOMS** — live rooms with phase and idle time. **WATCH** opens a read-only
  inspection panel: seats, settings, turn schedule with the current turn marked, both
  sides' bans and picks, and the match steps. It reads the room and never writes, so
  watching a draft cannot disturb it — a draft room has exactly two seats, and opening
  `/room/<code>` as an admin would either be refused or take a seat from a player.
- **USERS** — accounts, roles, and console access.
- **CATALOG** — paginated browser over the player catalog with the **same sort and
  filter controls as My Players**, a column chooser (two fixed columns, fourteen
  optional), and CSV export that follows whichever columns you have on. Turn enough of
  them on and the table scrolls sideways rather than squeezing.

**Getting in** takes a password, and which one depends on your `.env`. Set
`ADMIN_CONSOLE_PASSWORD` and every admin unlocks the console with that single console
password instead of retyping their own account password; leave it unset and the account
password is used. A master admin can rotate it from the USERS tab, and the rotation
survives restarts.

> A shared console password has no identity behind it — the signed-in user id is not
> cryptographically bound, so anyone holding that password can open a session as any
> admin. That is a reasonable trade for a solo or trusted-team install and a poor one
> for a public host; there, leave `ADMIN_CONSOLE_PASSWORD` unset.

**Master admins** (`users.is_master_admin`) are the only accounts that may grant or
revoke console access, reset another account's password, designate another master, or
change the console password. A plain admin sees the same USERS table with the controls
replaced by labels. The account named by `ADMIN_EMAIL` is restored as a master on every
boot, so a database can never end up with admins and nobody able to change who they are.

**The first admin is built in.** Start the server against a database with no admin
in it and it creates one, printing the generated password to the log exactly once:

```
┌─────────────────────────────────────────────────────────┐
│ FIRST RUN — console admin created                       │
│                                                         │
│   username   admin                                      │
│   email      admin@localhost                            │
│   password   jw7bx-qydte-9q7d2-tefs3                    │
└─────────────────────────────────────────────────────────┘
```

The console can also **run a scrape**: UPDATE (new cards since the last cutoff) and
REPAIR GAPS (diff every site id against the DB) on the OVERVIEW tab, with the script's
live output and a STOP button. Stopping is safe — the run resumes where it left off.

Sign in with it, change the password under Edit Profile, and promote anyone else from
the console's USERS tab — that account is a master admin, so it can. Set `ADMIN_EMAIL`
+ `ADMIN_PASSWORD` in `.env` to name the account yourself; that pair is enforced on
every boot, which is also how you get back in if you forget the password. No default
password ships in this repo: the generated one is minted per installation.

Home, room and console are all responsive down to 320 px, each with its own breakpoint
ladder.

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

# ── Console ─────────────────────────────────────────────────
ADMIN_SECRET=                    # signs console session tokens; random per boot if unset

# The built-in master admin. Enforced on every boot, which is how you get back
# in after a forgotten password.
ADMIN_USERNAME=
ADMIN_EMAIL=
ADMIN_PASSWORD=

# One shared password for the console gate. Set it and admins stop retyping their
# own account passwords. It only *seeds* the stored value — a master can rotate it
# from the console afterwards, and the rotation survives restarts.
ADMIN_CONSOLE_PASSWORD=
# Set to 1 and restart to force the seed back over a rotation nobody remembers.
ADMIN_CONSOLE_PASSWORD_RESET=
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
| `npm run check` | Static gate — import paths and casing, unused/undeclared bindings, import cycles, DOM ids referenced but absent, dead CSS, stray debug code. **Run it before committing:** there is no bundler and no type checker, so this is the only thing that catches a bad import path, and a casing mistake works on macOS and 404s in production. |
| `npm run check:self` | Proves those checks can still fail — a gate that cannot fail is not a gate. |
| `npm run scrape` | Full on first run, incremental after. Backs up `players_catalog` before a fresh run, enriches 4 detail pages in parallel, and resumes from `.scrape-state.json` if interrupted. `SCRAPE_SHOW_LOGS=1` prints the last 5 runs. |
| `npm run scrape:missing` | Repair gaps — diff every pesdb list page against the DB and fetch only the missing IDs. |

---

## Layout

Code is grouped **by feature, not by file type**. Each backend feature exposes its
public surface through an `index.js` barrel; each frontend feature has a matching
folder under `public/js/features/` and a stylesheet under `public/css/features/`.

```
src/
├── server.js                 # composition root: middleware, router mounts, static, errors
├── pages.js                  # every page URL → one of four static HTML files
├── features/
│   ├── admin/                # console: routes, session tokens, master admins,
│   │                         #   the shared console password, first-admin bootstrap,
│   │                         #   and the child-process scrape runner
│   ├── auth/                 # sign-up, sign-in, profile
│   ├── gamePlans/            # saved 23-player plans
│   ├── ingestion/            # scrape.js + scrapeMissing.js — npm-script entry points,
│   │                         #   deliberately no barrel: nothing imports them
│   ├── media/                # /img/card/:id.png — R2 cache or pesdb redirect
│   ├── players/              # catalog + squad; catalogQuery.js holds SORT_MAP and
│   │                         #   the WHERE/ORDER BY builders
│   └── rooms/                # in-memory room map, draft config, turn schedule
└── lib/                      # db.js, http.js, paths.js, cli.js

public/
├── home.html   room.html   console.html   signin.html
├── css/
│   ├── shared/               # tokens (first on every page), controls (last),
│   │                         #   filterPanel, playerCard, playerHoverCard,
│   │                         #   pitchField, modals, numberInput
│   ├── features/<name>/      # admin, auth, catalog, draft (7 sheets), gamePlans,
│   │                         #   rooms, squad
│   └── pages/home/           # base.css, responsive.css
└── js/
    ├── pages/                # one entry file per page
    ├── features/             # admin (13), auth, catalog, draft (36 modules across
    │                         #   ban/pick/ready/lobby/shell/engine), gamePlans,
    │                         #   rooms, squad
    └── shared/               # players/ (playerMeta, positions, sort, formations,
                              #   filterPanel), ui/ (toast, confirm, dropdown,
                              #   playerHoverCard…), lib/ (session, roomCode)

scripts/                      # check.js + checks/ — the static gate, one file per check
database/schema.sql
```

**Path aliases** — there is no bundler, so each is resolved by the platform itself:

| Alias | Resolves to | Configured in |
|---|---|---|
| `@/…` | `public/js/…` | the `<script type="importmap">` in each page's `<head>` |
| `#features/…`, `#lib/…` | `src/features/…`, `src/lib/…` | the `imports` field in `package.json` |

There is no build step: the frontend is served straight from `public/`, and a page's
`<link>` order **is** its cascade — `shared/tokens.css` first, `shared/controls.css`
last.

Room state lives **in memory only** and does not survive a server restart.

---

## API

All routes are JSON. App auth is stateless — there is no session middleware; `userId` is
passed in the request body or query string and trusted client-side, so this is **not
hardened for untrusted public deployment**. The console is the exception: it carries a
signed, expiring token in an `x-admin-token` header.

| Area | Endpoints |
|---|---|
| Health | `GET /api/health` |
| Auth | `POST /api/signup` · `POST /api/signin` · `PUT /api/profile` |
| Catalog | `GET /api/players` · `/api/players/filter-options` · `/api/players/distinct` · `/api/top-players` |
| Squad | `GET`/`POST`/`DELETE /api/my-players` |
| Game plans | `GET`/`POST /api/game-plans` · `PUT`/`DELETE /api/game-plans/:id` · `GET /api/game-plans/:id/players` · `PUT /api/game-plans/:id/players/:slot` · `PUT /api/game-plans/:id/swap` |
| Room | `GET /api/rooms/mine` · `GET /api/rooms/:code` · `POST /api/rooms/:code/` + `presence` `leave` `start` `config` `chat` `ready` `kick-guest` `ban` `ban-confirm` `picks` `picks-confirm` `match-step` `post-match` |
| Console — session | `POST /api/admin/session` (password → token) · `GET /api/admin/me` |
| Console — read | `GET /api/admin/` + `stats` `rooms` `rooms/:code` `scrape-logs` `users` `data-quality` `console-password` |
| Console — master only | `PATCH /api/admin/users/:id/` + `role` `master` `password` · `PUT /api/admin/console-password` |
| Console — scrape | `POST /api/admin/scrape` · `POST /api/admin/scrape/stop` · `GET /api/admin/scrape/status` |
| Images | `GET /img/card/:id.png` |

Everything under `/api/admin` except `POST /session` requires the token. The
master-only routes re-read `is_master_admin` from the database on every call rather
than trusting the token's claim — a token outlives a demotion by up to eight hours.

**`GET /api/players`** takes:

- `q` (name), `positions` (comma-separated) or `posGroup` (`GK`/`DEF`/`MID`/`FWD`)
- `club`, `nationality` — substring match
- `foot`, `playingStyle`, `cardType`, `league` — comma-separated, any-of
- `overallMin`/`Max`, `maxOverallMin`/`Max`, `heightMin`/`Max`, `weightMin`/`Max`,
  `ageMin`/`Max`
- `limit` (default 50), `offset`
- `sortBy` — `{overall_max,overall,name,position,height,weight,age,club,nationality}_{asc,desc}`,
  defaulting to `overall_max_desc`

---

## Database

```
players_catalog          — every eFootball player from pesdb.net
players_catalog_backup   — snapshot taken by the scraper before each fresh run
scrape_logs              — history of scrape runs
users                    — accounts (bcrypt hashes); is_admin grants the console,
                           is_master_admin may grant or revoke it
players                  — user-owned squads
game_plans               — up to 20 per user
game_plan_players        — plan ↔ player, slot 1–11 lineup / 12–23 subs
app_settings             — key/value; holds the bcrypt hash of the console password
```

`users.is_master_admin` and `app_settings` are declared in `schema.sql` **and** created
by the server on boot if missing, so an existing database heals itself instead of
serving a broken console until someone runs the `ALTER` by hand.

---

## Known gaps

- **The REGION filter does nothing.** Every filter panel offers it and the client sends
  `region=…`, but `buildCatalogFilter` in `src/features/players/catalogQuery.js` never
  destructures or applies it, so the parameter is silently ignored. (`league`, the
  filter beside it, works — `?league=NOT_A_LEAGUE` returns 0 rows where
  `?region=NOT_A_REGION` returns a full page.)
- Card art occasionally missing playing style / region — a scraper data-cleaning issue.
- `npm run scrape:missing` doesn't write to `scrape_logs`.
- Ban room: toggling player info shifts the grid as the scrollbar appears.
- A shared `ADMIN_CONSOLE_PASSWORD` is not bound to an identity — see the note in the
  Console section above.
- **No runtime tests.** `npm run check` is a static gate (imports, bindings, cycles, DOM
  ids, dead CSS), not a test suite: it cannot tell you a draft still works. No analytics
  or error monitoring either, and nothing is deployed — no cloud server, database, or CDN.
