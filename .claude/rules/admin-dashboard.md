---
paths:
  - "public/console.html"
  - "public/js/pages/console.js"
  - "public/js/features/admin/**/*.js"
  - "public/css/features/admin/admin.css"
  - "src/features/admin/**/*.js"
---

# Admin console (`/console`)

`console.html` + `public/js/pages/console.js` + `public/css/features/admin/admin.css`.
No build step.

## Getting in

There is no URL to memorise and no shared password. Three things have to be true,
and they are checked in this order:

1. **A session exists.** `initGate` calls `requireAuth()`; an anonymous visitor is
   redirected to `/signin` and none of the dashboard is wired.
2. **The account is an admin.** `users.is_admin`. `/api/signin` returns `isAdmin`
   in the session, and `initUserMenu` uses it to reveal **Admin Console** in the
   account dropdown on the home page. **That link is the entry point**; revealing
   it is cosmetic, and the server never trusts it.
3. **The password is re-entered here** (step-up auth). `efb_user` lives in
   localStorage and nothing signs it, so "I am user 7" is a claim, not a proof —
   without this step `?userId=1` would be the whole gate.

`POST /api/admin/session` checks 2 and 3 against the database and answers with a
token; five wrong passwords lock that account out for 15 minutes, and the lockout
holds even against the right password.

## Where the first admin comes from

`bootstrap.js`, run once per boot from `server.js` — not awaited, so a slow or
absent database delays the admin rather than the server, and it swallows its own
errors for the same reason.

1. `ADMIN_EMAIL` + `ADMIN_PASSWORD` both set → that account is created, or its
   password reset and its flag restored, **on every boot**. This is the way back
   in after a forgotten password: set the pair, restart, sign in.
2. Otherwise, no admin exists at all → one is created and its generated password
   printed to the log exactly once.
3. Otherwise → nothing. An existing admin is never touched.

**No default password is baked into the repo.** Rule 2 mints one per installation
from `crypto.randomBytes` over an alphabet with no `0/O/1/I/l`, because it gets
read off a terminal and typed back in. Rule 1 enforces `PASSWORD_MIN`, imported
from the auth barrel rather than copied, and refuses (loudly) rather than seeding
a weak account.

Every admin after the first is granted from the USERS tab, so `UPDATE users SET
is_admin = 1` is a last resort, not the setup instructions.

**The token** (`adminSession.js`) is `base64url(claims).hmac-sha256`, signed with
`ADMIN_SECRET` — or, when that is unset, a secret minted at boot, so there is no
default value to guess and sessions end with a restart. It lives in sessionStorage
(`efb_admin_token`), travels in the `x-admin-token` **header** rather than a query
string, and expires after 8 hours. It is stateless: revoking `is_admin` takes
effect at the next sign-in, not mid-session.

> This replaced `ADMIN_KEY` + `?adminKey=` + a `/admin` URL. One shared key, no
> expiry, no identity, and printed into every access log that saw the URL.

## Modules (`public/js/features/admin/`)

| Module | Role |
| --- | --- |
| `adminApi.js` | the token, `openSession`, `resumeSession`, and `apiFetch` (adds the header; a 401 clears the token and reloads to the gate) |
| `authGate.js` | `initGate(onOpen)` wires the form and returns the signed-in user or null; `resume(onOpen)` is the silent re-auth |
| `tabs.js` | the tab registry — which panel, what it loads, how often it refetches |
| `format.js` | `fmt*`, the pills, `tableMessage(colspan, text)` |
| `overviewTab.js`, `roomsTab.js`, `usersTab.js`, `catalogTab.js` | one module per tab |
| `index.js` | `initConsole()` |

`initConsole` wires every tab **before** calling `resume`, so a stored token can
never reveal a half-wired dashboard. Panel wiring lives in the `init*` functions
rather than at module top level; keep it that way, or that ordering guarantee is
lost.

## Tabs

One dataset, one place. The old dashboard showed rooms, scrape runs and signups on
OVERVIEW *and* again on their own tabs, with a second row template each.

| Tab | Shows | Refetch |
| --- | --- | --- |
| OVERVIEW | four tiles, catalog health, last 8 scrape runs | 60 s |
| ROOMS | live rooms, phase pill, idle time, WATCH link | 10 s |
| USERS | 50 newest accounts, squad/plan counts, and the ACCESS column | on activation |
| CATALOG | paginated `/api/players` browser, search, cycling sort, CSV export | on activation |

`TABS` in `tabs.js` is the whole controller: one 5 s tick reads the active tab's
`refreshMs` and skips entirely when `document.hidden`, so a background tab costs
nothing. The active tab is mirrored into the URL hash.

CATALOG reads the **public** `/api/players`, so those are the only two fetches on
the page that carry no token. The endpoint returns a page and never a count, so
there is no total and no last page: a full page means NEXT stays enabled.

## Running a scrape from the console

`scrapeRunner.js` (server) + `scrapeControl.js` (client). The OVERVIEW tab's
SCRAPE RUNS panel gains UPDATE and REPAIR GAPS buttons, a live output pane and a
STOP button.

- **Child processes, never in-process.** Both scrapers finish with
  `await db.end()`; importing and calling them would close the server's pool.
  Spawning also means a scrape that crashes cannot take the server with it.
- **Mode is a fixed table**, `SCRIPTS` in `scrapeRunner.js`. Nothing from the
  request ever reaches a path, and `spawn` is called with an argv array (no shell).
- **One run at a time**, enforced twice: the module's own `current` run, and a
  `scrape_logs` row that is unfinished *and* younger than an hour — which catches
  a run someone started in a terminal. Two at once would fight over
  `.scrape-state.json`.
- **The output pane is the child's real stdout**, kept in a 200-line ring buffer.
  The scrapers draw progress with `\r` and no newline, so `consume()` keeps only
  the last segment of each line and tracks the unterminated one separately — a
  progress bar would otherwise fill the buffer with its own frames, and the pane
  would sit blank for minutes. There is deliberately **no percentage**: the
  hardcoded one this page used to draw is exactly what this replaced.
- **The client polls only while a run is going** (2 s), not on the tab's 60 s
  cadence, and stops as soon as the run ends — then reloads the table, since the
  row is only complete once the child exits.
- **Stopping is safe**, and is why the button exists: `.scrape-state.json` is
  written per row, and `getLastLog` ignores unfinished rows when choosing the
  cutoff, so the next run resumes incrementally rather than rebuilding.
- A stopped run leaves an unfinished row, so the table shows RUNNING for an hour
  and STALLED after. The panel above it is the live truth; the table is history.

## Admin API routes

All in `src/features/admin/routes.js`. `POST /session` is public — it is what hands
out the token; everything below `router.use(requireAdmin)` needs one.

- `POST /session` — `{ userId, password }` → `{ token, username }`. 403 not an
  admin (same answer as "no such user"), 401 wrong password, 429 locked out.
- `GET /me` — the token's own claims. The silent re-auth, and no DB read.
- `GET /stats` — catalog count, user count, new users this week, active/draft room
  counts, last scrape row.
- `GET /rooms` — `{ code, host, guest, phase, idleSec }`. `idleSec` is time since
  the last heartbeat, not the room's age. The server drops rooms quiet for
  `ROOM_LIST_QUIET_MS` (90 s) from the list — **display only**, it does not end
  them. See `room/presence-and-reconnect.md`.
- `GET /scrape-logs?limit=N`, `GET /users?limit=N` — `readLimit` clamps to 1…50;
  a negative or NaN limit falls back to the default rather than reaching SQL.
- `PATCH /users/:id/role` — `{ isAdmin }`. **Two ways to lock everyone out, both
  refused**: demoting yourself (you are standing on the page you would lose), and
  demoting the last admin. The second is not theoretical — a token stays valid for
  up to 8 hours after the account behind it is demoted, so a revoked admin can
  still reach this route, and without the check could take the last one with them.
- `POST /scrape` — `{ mode: "update" | "missing" }`. 202 started, 409 one is
  already running, 400 unknown mode.
- `POST /scrape/stop` · `GET /scrape/status` — the runner's own state, including
  the captured output. The routes hold no policy; the runner decides.
- `GET /data-quality` — four COUNTs on `players_catalog`: missing `playing_style`,
  `region`, `overall_max`, duplicate `pesdb_id`.

**`scrape_logs` has no status column**, and a crashed run never writes
`finished_at`. `scrapeRunState` therefore reads an unfinished run older than an
hour as `stalled`, not `running` — the dashboard used to report a run that died in
April as still going, under a progress bar whose width was hardcoded.

## CSS (`admin.css`)

Self-contained; colours come from `shared/tokens.css` like every other page. Key
blocks: `.gate-overlay` / `.gate-card`, `.admin-nav`, `.stats-row` (4-column grid),
`.panel-grid-2`, `.admin-table` (sticky thead), phase pills
(`.phase-pill.is-ban/pick/lobby/ready/done`), status pills
(`.status-pill.is-running/done/stalled`), `.role-pill`, `.role-btn` (`.is-armed` — removing access takes two clicks, and the
second one is the red one), `.panel-notice`, the data-quality bars
(`.dq-bar.is-ok/warn/bad`), `.link-btn`, and the pagination bar.

**`[hidden] { display: none !important }` is load-bearing**, and is the first rule in
the sheet. Tabs are switched by setting `hidden` on `.tab-panel`, and the browser
applies that attribute as an ordinary `display: none` that **any** `display` rule
here outranks — `.tab-panel { display: flex }` did, so all four panels rendered at
once and the console was one long scroll with a tab bar that appeared to do
nothing. `features/draft/base.css` carries the same rule for the same reason.
Never style a panel's `display` without checking which of the two wins.

Breakpoints: `1100 → 860 → 700 → 600`. At 600 the nav wraps and **the tab strip
takes a row of its own and scrolls sideways** — it used to be `display: none`,
which left the console with no navigation at all on a phone.

The data-quality bar is a true percentage with a 3 % floor so a handful of rows is
still visible. It used to be scaled 8×, which drew a bar four times longer than the
number beside it.

> **Colour system note.** Some reasoning in this file predates the efhub re-skin.
> Token *names* are current; where older notes say "green", "cyan" or "glow", those
> hues and that glow are gone. Read `DESIGN.md` §3 and §12.
