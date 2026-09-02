<div align="center">

<img src="public/logo/logo.svg" alt="" width="110">

# eFootball Ban &amp; Pick

**A draft system for eFootball — ban out of your opponent's collection, then build a squad from what survived.**

[Live app](https://efootball-ban-pick.vercel.app/) · [Design system](DESIGN.md) · [Decisions](DECISIONS.md) · [Working rules](.claude/CLAUDE.md)

</div>

---

Instead of both sides fielding whatever they like, each player bans from the *opponent's*
squad first, then picks a lineup from what survives — the same idea as a champion draft in
League of Legends, applied to football cards. The app is not the game. It is the
negotiation before it, and its whole job is to make that negotiation fair, simultaneous,
and impossible to cheat by peeking.

**How a session goes:** set the rules → ban phase → pick phase → start match.

1. **Ban** — each side bans independently from the opponent's squad. Both may ban the same
   player; a ban only restricts the other side.
2. **Pick** — each side builds a 23-player squad from the remaining pool, subject to
   whatever category allowances the host configured.
3. **Start match** — both squads are revealed side by side, and you go play the game.

---

## Features

**Squad building** (`/players`) — a catalog of ~41 k eFootball players scraped from
[pesdb.net](https://pesdb.net/efootball/), searchable and filterable on position, overall,
club, league, region, nationality, foot, playing style, height, weight and age. Build a
personal squad from it, and up to 20 game plans of 23 players each (11 starters + 12 subs)
on a formation pitch.

**Draft room** (`/room/:code`) — an invite link, chat, and host-set rules: bans per side,
ban/pick durations, reveal mode (instant vs hidden), and per-category allowance caps. Bans
stage live on the opponent's screen and commit on CONFIRM; the pick phase gives each side a
pitch with running average OVR and allowance pills; Start Match reveals both lineups side by
side with card art and a stats comparison. Reloading mid-draft reconnects straight back into
it, and if your opponent disappears you get a countdown rather than a frozen room.

**Console** (`/console`) — for accounts with `users.is_admin = 1`, reached from the account
menu. Catalog and user stats, live rooms with a read-only WATCH panel that cannot disturb a
draft, user/role management, a catalog browser with CSV export, and scrape controls (UPDATE
for new cards, REPAIR GAPS to diff every site id against the DB) with live output and a STOP
button. Stopping is safe — the run resumes where it left off.

`/` is the entry point and serves the **sign-in page**. The server decides there
— it holds the signed session cookie, so a signed-in visitor is redirected straight
to `/players` without the sign-in page ever being fetched. `/signin` itself always
serves the page rather than redirecting, which is what a client whose localStorage
has been cleared needs in order to identify itself again.

All three are responsive down to 320 px.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 18, ESM |
| Server | Express 4 |
| Database | MySQL 8+ (`mysql2`) |
| Frontend | Vanilla HTML / CSS / JS — no build step |
| Scraper | `cheerio` + native `fetch` |
| Auth | `bcryptjs`, HMAC-signed httpOnly cookies |
| Mail | `nodemailer` |
| Image cache | Cloudflare R2 |

Real-time sync is **polling**, not WebSockets — a ~500 ms presence heartbeat during the draft.

> [!NOTE]
> Room state lives **in process memory only** and does not survive a server restart.
> Everything else — accounts, squads, game plans, the catalog — is in MySQL.

---

## Getting started

**Prerequisites:** Node.js ≥ 18 and MySQL 8+ (`brew install mysql && brew services start mysql`).

```bash
npm install
mysql -u root -e "
  CREATE USER IF NOT EXISTS 'banpick'@'localhost' IDENTIFIED BY '';
  GRANT ALL PRIVILEGES ON ban_pick_efb.* TO 'banpick'@'localhost';
  FLUSH PRIVILEGES;
"
mysql -u root < database/schema.sql
npm run scrape      # first run is a full ~41 k-player scrape and takes a while
npm run dev         # then open http://localhost:3000
```

`schema.sql` is safe to run again — every statement is `CREATE … IF NOT EXISTS`, and it does
not drop the database first, so it can also be pointed at a deployment to add a missing
table. Later scrapes are incremental and take seconds.

### Environment

Three files, and **only the first is ever loaded** — `dotenv/config` reads `.env` and
nothing else:

| file | what it is | committed |
|---|---|---|
| `.env` | what runs on your machine. Copy `.env.example` to it | no |
| `.env.production` | the deployment's values, pasted into Render's env editor. Never loaded by the app | no |
| `.env.example` | every variable with a placeholder and a note | **yes** |

On Render there is no `.env` at all: the platform supplies the variables, and dotenv never
overwrites one that is already set. So a value that exists only in `.env.production` has no
effect locally, and a local value cannot leak into the deployment.

> [!IMPORTANT]
> Keep `.env` pointed at a **local** database. It once held the TiDB connection, which
> meant every local run — a console DELETE, a scrape — read and wrote live production data.
> The server prints which database it is about to use on every boot, so you can check:
> `db: localhost:3306/ban_pick_efb — local`, or a line that says `REMOTE` in capitals.

`cp .env.example .env` and fill in the `DB_*` block; nothing else is needed to boot.

```ini
DB_HOST=localhost
DB_PORT=3306
DB_USER=banpick
DB_PASSWORD=
DB_NAME=ban_pick_efb
DB_SSL=                    # any value = require TLS; every managed MySQL needs it, a local socket cannot use it
DB_CA=                     # the provider's own root, PEM and all, where it uses one (Aiven ships a ca.pem)
PORT=3000

SESSION_SECRET=            # signs sign-in cookies; random per boot if unset, so every restart signs everyone out
ADMIN_SECRET=              # signs console session tokens; random per boot if unset

APP_BASE_URL=              # origin used in emailed links; required behind a proxy
TRUST_PROXY=               # hop count or "loopback"; required behind a proxy

# The built-in master admin, enforced on every boot — this is how you get back in
# after a forgotten password.
ADMIN_USERNAME=
ADMIN_EMAIL=
ADMIN_PASSWORD=

# One shared password for the console gate, so admins stop retyping their own.
# It only *seeds* the stored value; a master can rotate it from the console after.
ADMIN_CONSOLE_PASSWORD=
ADMIN_CONSOLE_PASSWORD_RESET=   # set to 1 and restart to force the seed back over a rotation

# Mail. Unset SMTP_HOST prints both messages to the server log instead.
SMTP_HOST=
SMTP_PORT=587              # 465 is TLS-on-connect; anything else uses STARTTLS
SMTP_USER=
SMTP_PASS=                 # for Gmail this is an app password, not the account one
MAIL_FROM="eFootball Ban & Pick <you@example.com>"

# Card images. Without these the server redirects /img/card/:id.png to pesdb.net.
# R2_PUBLIC_BASE_URL makes it 302 to your CDN after the first fill — production only,
# and wrong while the bucket is still private.
R2_BUCKET=
R2_REGION=auto
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PUBLIC_BASE_URL=
```

**Both proxy variables bite in production, for the same reason.** Without `APP_BASE_URL`,
emailed links are built from the request's own host, and a proxy terminating TLS makes that
`http://`. Without `TRUST_PROXY`, `req.ip` is the proxy for every request, so the rate
limiter puts the whole internet in one bucket and locks everyone out on the first busy
minute.

### Signing in the first time

Start the server against a database with no admin and it creates one, printing the generated
password to the log exactly once. No default password ships in this repo.

```
┌─────────────────────────────────────────────────────────┐
│ FIRST RUN — console admin created                       │
│                                                         │
│   username   admin                                      │
│   email      admin@localhost                            │
│   password   jw7bx-qydte-9q7d2-tefs3                    │
└─────────────────────────────────────────────────────────┘
```

Sign in, change it under Edit Profile, and promote anyone else from the console's USERS tab.
Master admins are the only accounts that may grant console access, reset another account's
password, or designate another master; the account named by `ADMIN_EMAIL` is restored as one
on every boot, so a database can never end up with admins and nobody able to change them.

> [!IMPORTANT]
> **Sign-up requires a confirmed email**, and `/api/signin` refuses an unverified account
> even with the right password. With no `SMTP_HOST` the confirmation link goes to the server
> log — fine locally, a dead end in production, where the only way anyone gets in is the host
> reading their link out of it.

---

## Deployment

The live app runs on **Render** (Node web service) against **TiDB Cloud**, with **Brevo** for
mail and **Cloudflare R2** for card images. Paste `.env.production` into Render's *Add from
.env* — minus `PORT`, which Render provides and which binds the wrong port if you set it. Set `APP_BASE_URL`, `TRUST_PROXY=1` and `DB_SSL`; TiDB is publicly signed, so no `DB_CA`.

> [!WARNING]
> **Render blocks outbound SMTP on ports 25, 465 and 587 for free web services**
> ([changelog](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports)).
> The port is not refused, it simply never answers — so sign-up hangs, then reports that the
> confirmation email could not be sent. Use **`SMTP_PORT=2525`**, which Brevo also listens on
> and Render does not block, or upgrade the instance.

### The wake page

A free Render service sleeps after 15 minutes idle and takes ~23 s to boot. During those 23 s
the app cannot draw its own loading screen, because it is not running — which is why visitors
get Render's generic holding page.

`wake/` replaces it: a small static site deployed separately to **Vercel**, which is always
warm. It shows a branded loading screen, polls `GET /api/health` across origins, and hands off
with `location.replace` the moment the app answers. A warm server stays invisible — the UI
only reveals itself after 600 ms — and `?to=/room?code=ABC` carries a shared room link through
the wait. Deploy it with Root Directory `wake/`, framework *Other*, no build command, then
hand out the Vercel URL as the address people visit.

> [!NOTE]
> `wake/` never requests anything from Render — that is the one rule it has, and it is why the
> page re-declares nine design tokens locally instead of linking `tokens.css`. `APP_ORIGIN` in
> `wake/wake.js` is the only place the app's host is named.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server with `node --watch` |
| `npm start` | Production server |
| `npm run check` | Static gate — import paths and casing, unused/undeclared bindings, cycles, missing DOM ids, dead CSS, icons, layer boundaries, stray debug code |
| `npm run check:self` | Proves those checks can still fail — a gate that cannot fail is not a gate |
| `npm test` | Unit tests (`node --test`, no dependency). Covers the pure rules both clients depend on: the turn schedule, the `0`-means-unlimited duration sentinel, the catalog WHERE builder and the base-URL helper |
| `npm run icons` | Regenerates `public/icons/svg/` from `sprite.svg`. Generated output: never edit it |
| `npm run scrape` | Full on first run, incremental after. Backs up the catalog first and resumes from `.scrape-state.json` if interrupted. `SCRAPE_SHOW_LOGS=1` prints the last 5 runs |
| `npm run scrape:missing` | Repair gaps — diff every pesdb list page against the DB and fetch only the missing IDs |

> [!IMPORTANT]
> **Run `npm run check` before committing.** With no bundler and no type checker it is the
> only thing that catches a bad import path — and a casing mistake works on macOS and 404s in
> production. CI runs it on Linux for exactly that reason, then runs `npm test`.

Between them they cover different things and neither covers the draft end to end: the gate is
static, and the tests are unit tests over pure modules. Two browsers in a room is still a
manual check.

---

## Project layout

Code is grouped **by feature, not by file type**. Backend features expose their surface
through an `index.js` barrel; each has a matching folder under `public/js/features/` and a
stylesheet under `public/css/features/`.

```
src/          server.js (composition root) · pages.js · features/ · lib/
public/       four pages, served straight from disk — no build step
wake/         static loading page for Vercel; NOT served by Render
scripts/      check.js + checks/ — the static gate, one file per check
database/     schema.sql
```

There is no bundler, so path aliases are resolved by the platform: `@/…` → `public/js/…` via
each page's importmap, and `#features/…` / `#lib/…` → `src/…` via `imports` in
`package.json`. A page's `<link>` order **is** its cascade — `shared/tokens.css` first,
`shared/controls.css` last.

[`.claude/CLAUDE.md`](.claude/CLAUDE.md) is the full map and the working rules,
[`DESIGN.md`](DESIGN.md) the visual system, [`DECISIONS.md`](DECISIONS.md) why the app is
shaped this way. Per-topic rules live in `.claude/rules/`.

---

## API

All routes are JSON, under `/api`. Read them from the routers in `src/features/*/routes.js`.

> [!IMPORTANT]
> **Identity is a signed httpOnly cookie the server mints, and a `userId` in a request is
> ignored.** Every route takes the caller from `req.userId` / `req.identityId`, installed
> app-wide as `attachIdentity`. A signed-out player gets a server-minted `efb_visitor` id
> rather than choosing one client-side, because a room snapshot carries both seats' ids and a
> self-asserted id is a seat anybody can take. The ban phase reads the opponent's squad
> through `GET /api/rooms/:code/opponent-squad`, which answers only for whoever holds the
> other chair.

Sessions are stateless — no sessions table, and they survive a restart. An individual
token cannot be revoked before `SESSION_TTL_MS` (30 days), but the account behind it can:
`requireSession` confirms the row still exists on every call, so a deleted account is
signed out at its next request rather than lingering for a month. `requireAdmin` does the
same for `is_admin`. `SESSION_SECRET` keeps sign-ins alive across a deploy.
`src/lib/rateLimit.js` fronts auth (15 / 15 min), email (5 / hr), catalog and the signed-in
app surface (300 / min each), room routes (600 / min), card images (1200 / min) and client
error reports (30 / min). The one deliberate exemption is `POST /api/rooms/:code/presence`:
it is a 500 ms heartbeat, so any threshold low enough to mean something would end the draft
it is meant to protect.

`POST /api/client-error` puts browser errors in the same log as the server's own. All four
pages install `shared/lib/errorReporter.js`, whose global `error` and `unhandledrejection`
handlers post to it fire-and-forget, capped at five per page load so a page stuck in a loop
stays one bug rather than a flood. How the *user* is told differs per page and is injected,
not imported — the room has its own `warn` toast, home and sign-in take `error`, and the
console has no toast element, so there it logs and reports without showing anything. It is a
log line and nothing more — no third party, no dependency, no error data leaving the box —
and it treats its body as hostile: every field is truncated and newlines are collapsed, so
a report cannot forge a second log entry.

The console is separate: `POST /api/admin/session` trades a password for a signed, expiring
token carried in an `x-admin-token` header, and `router.use(requireAdmin)` guards everything
else under `/api/admin`. The master-only routes — granting console access, designating a
master, resetting a password, changing the console password, clearing the catalog or the
scrape history — re-read `is_master_admin` from the database on every call rather than
trusting the token, because a token outlives a demotion by up to eight hours. Each of them
writes an `audit:` line to the server log naming the acting admin and the target, so a
password reset or a demotion leaves a trace rather than only an effect.

`GET /api/health` is the only CORS-enabled route; the wake page is why it has one.

