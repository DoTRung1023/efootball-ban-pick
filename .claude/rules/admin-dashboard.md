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
3. **A password is entered here** (step-up auth). `efb_user` lives in
   localStorage and nothing signs it, so "I am user 7" is a claim, not a proof —
   without this step `?userId=1` would be the whole gate.

`POST /api/admin/session` checks 2 and 3 against the database and answers with a
token; five wrong passwords lock that account out for 15 minutes, and the lockout
holds even against the right password.

### Which password step 3 wants

**One shared console password**, where one is configured, rather than each admin
retyping their own account password. `consolePassword.js` owns the answer:

- the bcrypt hash in `app_settings.console_password` **wins** — a rotation from
  inside the console survives a restart, or the rotate button would be a lie;
- `ADMIN_CONSOLE_PASSWORD` **seeds** that row, once, when nothing is stored;
- `ADMIN_CONSOLE_PASSWORD_RESET=1` **forces the seed** back over whatever it was
  rotated to, on the next boot. This is the way back in, and it is deliberately
  the same shape as the `ADMIN_EMAIL`/`ADMIN_PASSWORD` recovery below;
- with neither, the gate falls back to per-account passwords — the behaviour
  before any of this existed. **No default is baked into the repo.**

> **The trade is the one `ADMIN_KEY` used to make, and it is not hidden.** A single
> shared secret has no identity behind it: `efb_user` is unsigned, so a caller
> holding the console password can open a session as **any** admin id, master
> admins included. That is fine for a solo or trusted-team deployment and poor for
> a public host — there, leave `ADMIN_CONSOLE_PASSWORD` unset and the per-account
> step-up returns. The note is repeated at the top of `adminSession.js`, where it
> is felt.

## Master admins

`users.is_master_admin`. **Only a master may grant or revoke console access, or
designate another master.** A plain admin sees the same USERS table with the
ACCESS column reduced to labels.

The `ADMIN_EMAIL` account is seeded as a master **on every boot**, so a database
can never end up with admins and nobody able to change who they are — restarting
with that pair set is the recovery path, and it only works because it grants
master rather than plain admin.

Authorisation is read from the **database at write time**, never from the token's
`mst` claim: a token outlives its account's role by up to eight hours, so trusting
the claim would let a just-revoked master hand the role back to themselves for the
rest of the day. `mst` exists only so the USERS tab knows what to draw.

Five ways to end up with a console nobody can administer, all refused: demoting
yourself, demoting the last admin, revoking access from a master (stand them down
first — losing the role is always two deliberate steps), standing down the last
master, and granting master without console access (it grants both in one
statement, since a master who cannot open the console reads as a bug).

## Where the first admin comes from

`bootstrap.js`, run once per boot from `server.js` — not awaited, so a slow or
absent database delays the admin rather than the server, and it swallows its own
errors for the same reason.

1. `ADMIN_EMAIL` + `ADMIN_PASSWORD` both set → that account is created, or its
   password reset and its flags restored, **on every boot**. This is the way back
   in after a forgotten password: set the pair, restart, sign in.
2. Otherwise, no admin exists at all → one is created and its generated password
   printed to the log exactly once.
3. Otherwise → nothing. An existing admin is never touched.

**No default password is baked into the repo.** Rule 2 mints one per installation
from `crypto.randomBytes` over an alphabet with no `0/O/1/I/l`, because it gets
read off a terminal and typed back in. Rule 1 enforces `PASSWORD_MIN`, imported
from the auth barrel rather than copied, and refuses (loudly) rather than seeding
a weak account.

Both seeded accounts are **master** admins, and rule 1 restores that on every
boot — see **Master admins** above for why that matters.

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
| `roomDetail.js` | the read-only room inspection panel behind WATCH |
| `catalogColumns.js` | which CATALOG columns are fixed, which optional, which on |
| `passwordModal.js` | the console-password form. It carried a second form — a master typing a password for somebody else — until resets became generated-and-emailed and there was nothing left to type |
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
| ROOMS | live rooms, phase pill, idle time, WATCH button | 10 s |
| USERS | 50 newest accounts, squad/plan counts, and the ACCESS column | on activation |

**Every row carries a role pill, plain accounts included.** A blank beside a name
does not read as "no special role", it just reads as blank — and to a master the
ACCESS column opposite holds buttons rather than a label, so the pill is the only
place most rows say what they are. For the same reason `roleLabel` answers `USER`
rather than the em-dash it used to: `—` in a column of real values reads as
missing data, when what it means is an account with no console access.
| CATALOG | paginated `/api/players` browser, search, sort, filter, column chooser, CSV export | on activation |

`TABS` in `tabs.js` is the whole controller: one 5 s tick reads the active tab's
`refreshMs` and skips entirely when `document.hidden`, so a background tab costs
nothing. The active tab is mirrored into the URL hash.

CATALOG reads the **public** `/api/players`, so those are the only fetches on
the page that carry no token. The endpoint returns a page and never a count, so
there is no total and no last page: a full page means NEXT stays enabled.

### CATALOG's sort, filter and columns

Sort and filter are the **same controls as My Players** — `SORT_CATEGORIES` from
`shared/players/sort.js` and `buildPlayerFilterPanel` from
`shared/players/filterPanel.js`, mounted as that panel's fourth call site with a
`cc`-prefixed id map. Not console-local copies: two tables over one endpoint must
not drift into offering different options. The filter→query-string mapping is
`playerFilterParams`, extracted from `features/catalog/catalog.js` when this tab
became its second caller.

Columns are the console's own, in `catalogColumns.js`. `#` and PLAYER are fixed —
a table you can hide the name from is a list of numbers — and the other fourteen
are optional, defaulting to the eight the tab always showed. The choice lives in
`sessionStorage`, the same store the console token uses, so it survives a reload
and dies with the tab. A stored key naming a column this build no longer has is
dropped on read. CSV export follows the **visible** columns, so the file matches
the table rather than always being all fifteen fields.

With every column on, the table is wider than the panel. `.table-wrap` already
had `overflow-x: auto`, but `.admin-table { width: 100% }` was squeezing the
table back inside it — `.catalog-table` overrides that to `width: auto;
min-width: 100%` with `white-space: nowrap` cells, so the table sizes to its
content and the wrapper scrolls it. Measured 1440 → 320: the page body never
scrolls horizontally at any width; the table does, inside its wrapper.

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

## WATCH — inspecting a live room

**A room cannot be watched by opening `/room/<code>`, and the link that tried was
the bug.** The room page has exactly two seats and claims one on load: with no
`?mode=join` it posts `role: "host"`, `claimHostSeat` finds another id in the seat
and answers 409, and the admin got "Host slot taken". `?mode=join` would not have
fixed it — that claims the *guest* seat, so on a room waiting for its second
player the admin would have sat down in it. There is no seat-less viewer in the
draft client; `mySide` is `"host" | "guest"` across eighteen modules.

So WATCH is a **button**, not a link, and it opens `roomDetail.js` — a read-only
panel over `GET /api/admin/rooms/:code`. It polls at 3 s against the table's 10 s,
because a live ban phase is what you opened it to watch and the read is a map
lookup. Nothing on that route writes, so watching cannot disturb the draft.

The detail route deliberately does **not** hide a room that has gone quiet, unlike
`GET /rooms`: that list is a dashboard and quiet means uninteresting, but this is
an inspection, and a room nobody has beaten in two minutes is exactly the one an
admin clicked through to look at.

## Changing passwords from the console

Both forms are master-only, both live in `passwordModal.js`, and both are
re-authorised server-side:

- **`PUT /console-password`** rotates the shared console password. The current one
  is asked for again even though the session was opened with it — the session
  outlives its tab by up to eight hours, and a borrowed screen should not change
  the lock every admin uses. Existing tokens stay valid: this rotates the way
  *in*, not the sessions already through the door.
- **`PATCH /users/:id/password`** resets an account's sign-in password. **The body
  carries nothing**: the password is generated server-side, emailed to the address
  on the account, and never returned to the console. A master cannot choose a weak
  password for somebody else and cannot learn the one they set — taking over an
  account means locking its owner out of it loudly rather than borrowing it
  quietly. Still the "they forgot it" path and still the only way to give a Google
  OAuth account, whose `password` column is NULL, a password at all.

  **It sends before it writes.** A transport that refuses throws, and the account
  keeps the password it already had; the other order would mint a password that
  exists in no inbox and in no readable form. The trade — an account whose email
  does not work cannot be reset from here — is deliberate, and the way back for the
  built-in admin is still `ADMIN_EMAIL`/`ADMIN_PASSWORD` and a restart.

  The response is `{ userId, email, delivered }` and the USERS tab says which of
  the two happened: `delivered: false` means no `SMTP_HOST` is configured and the
  password went to the server log. Because none of it can be undone from this
  table, RESET PW is armed by a first click like the destructive role buttons.

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
- `GET /rooms/:code` — one room in full: `serializeRoomEntry` plus `code`, `phase`
  and `idleSec`. Reuses the players' own snapshot rather than re-listing twenty
  fields, which would be a second copy to keep in step. 404 when the code is not
  in memory. See **WATCH** above.
- `GET /users` also returns `email_verified`; the tab marks an unconfirmed address
  with a dashed UNCONFIRMED pill, which is both why that account cannot sign in and
  why a reset would be mailed somewhere nobody has proved they read. Not red —
  unfinished is not destructive (DESIGN.md §3).
- `GET /scrape-logs?limit=N`, `GET /users?limit=N` — `readLimit` clamps to 1…50;
  a negative or NaN limit falls back to the default rather than reaching SQL.
- `PATCH /users/:id/role` — `{ isAdmin }`. Master-only. **Ways to lock everyone
  out, all refused**: demoting yourself (you are standing on the page you would
  lose), demoting the last admin, and revoking access from a master. The
  last-admin one is not theoretical — a token stays valid for up to 8 hours after
  the account behind it is demoted, so a revoked admin can still reach this route,
  and without the check could take the last one with them.
- `PATCH /users/:id/master` — `{ isMaster }`. Master-only. Granting sets `is_admin`
  too. Standing *yourself* down is allowed, unlike revoking your own access: it is
  how a master hands the role on, the account keeps console access, and the
  last-master check keeps somebody in the role.
- `PATCH /users/:id/password` — no body. Master-only. Generates the password,
  emails it, then writes it. See above.
- `GET /console-password` → `{ configured }`, `PUT /console-password` —
  `{ currentPassword, newPassword }`. Master-only. See above.

Every master-gated route goes through `requireMaster(req, res, action)`, which
re-reads `is_master_admin` from the database and names its own action in the 403,
so a refusal never claims to be about roles when it was about a password.
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

Colours come from `shared/tokens.css` like every other page. The one sheet this
page does not own is `shared/filterPanel.css`, linked between tokens and
`admin.css`: the sort/filter dropdown chrome moved there out of
`features/catalog/catalog.css` when the CATALOG tab became a consumer on a second
page. Key blocks: `.gate-overlay` / `.gate-card`, `.admin-nav`, `.stats-row` (4-column grid),
`.panel-grid-2`, `.admin-table` (sticky thead), phase pills
(`.phase-pill.is-ban/pick/lobby/ready/done`), status pills
(`.status-pill.is-running/done/stalled`), `.role-pill` — a three-rung ladder,
MASTER (accent outline) > ADMIN (filled neutral) > USER (`.is-user`, outline
only), so a table that is mostly plain accounts reads as mostly quiet — plus
`.is-unverified` for an unconfirmed address, `.role-btn` (`.is-armed` — removing access takes two clicks, and the
second one is the red one), `.panel-notice`, the data-quality bars
(`.dq-bar.is-ok/warn/bad`), `.link-btn`, the pagination bar, `.adm-modal` (the
password forms), `.rd-*` (the room detail panel) and `.cols-dd-panel` (the column
chooser, which rides on the shared dropdown chrome and only sets its own width).

`.link-btn` is a `<button>` on the ROOMS tab now, which is why it carries
`font-family: inherit` — a button does not inherit the page font on its own.

**`[hidden] { display: none !important }` is load-bearing**, and is the first rule in
the sheet. Tabs are switched by setting `hidden` on `.tab-panel`, and the browser
applies that attribute as an ordinary `display: none` that **any** `display` rule
here outranks — `.tab-panel { display: flex }` did, so all four panels rendered at
once and the console was one long scroll with a tab bar that appeared to do
nothing. `features/draft/base.css` carries the same rule for the same reason.
Never style a panel's `display` without checking which of the two wins.

Breakpoints: `1100 → 860 → 700 → 600 → 480`. **At 700** the nav wraps and the tab
strip takes a row of its own and scrolls sideways — it used to be `display: none`,
which left the console with no navigation at all on a phone. That wrap lived at
600 while the brand was a 28px logo with the wordmark hidden; the home wordmark is
wider, and at 700 the account badge and EXIT measured 88px past the edge. **The
rung belongs at the width where the three nav blocks stop fitting, and that width
moved with the brand.** 700 also trims the wordmark to 20px and drops its second
line, the way the home topbar does at 768.

**480 is the phone rung** (the number home and sign-in already use, not one of this
sheet's own): the wordmark goes entirely and the CONSOLE tag is the corner, and the
badge gives back ~21px — its pulsing dot and two paddings — because at 320 the tag,
badge and EXIT came to ~317px inside a 296px content box and took a third row.

## The masthead says which page this is

`.admin-nav-brand` reproduces the home topbar's wordmark — same 22px/12px stack,
no image — with a `.admin-brand-tag` reading CONSOLE bound to it by a hairline,
and the account badge carries `#adminRole` (MASTER or ADMIN) next to the name.
**The tag is one word behind a rule, not a chip**: it was a filled pill with a
10px gap, and that is what it read as — a separate control parked beside the
brand rather than part of it. `align-self: stretch` overrides the row's
`align-items: center` so the rule runs the height of the mark and the two read as
one lockup; it is deliberately the same idiom `.admin-role` uses at the other end
of the nav. At ≤480 the wordmark goes and the rule goes with it, or a hairline
against the padding edge reads as a rendering fault. Two more consequences worth
keeping:

- **The wordmark is a copy, not a shared rule.** There is no bundler, so
  `pages/home/base.css` is not on this page and `.topbar-brand` is unavailable
  here. The four declarations under `.admin-nav-brand` exist to equal home's;
  change one and change the other.
- **Neither the tag nor the role wears the accent.** On this page the accent
  belongs to `.btn--primary` (DESIGN.md §9), and the USERS tab already spends it
  on the MASTER pills in its own table — a masthead that wore it too would leave
  three accented things on one screen. Full-strength text against the dim second
  line is what marks the tag; the role is the dim half of the same idiom.

`authGate.reveal` fills the role from `isSessionMaster()` — the session the gate
just opened, re-read from the database server-side — and never from `efb_user`,
which is unsigned and only ever a display hint.

The data-quality bar is a true percentage with a 3 % floor so a handful of rows is
still visible. It used to be scaled 8×, which drew a bar four times longer than the
number beside it.

> **Colour system note.** Some reasoning in this file predates the efhub re-skin.
> Token *names* are current; where older notes say "green", "cyan" or "glow", those
> hues and that glow are gone. Read `DESIGN.md` §3 and §12.
