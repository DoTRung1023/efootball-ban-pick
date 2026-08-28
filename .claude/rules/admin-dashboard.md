---
paths:
  - "public/console.html"
  - "public/js/pages/console.js"
  - "public/js/features/admin/**/*.js"
  - "public/css/features/admin/*.css"
  - "src/features/admin/**/*.js"
---

# Admin console (`/console`)

`console.html` + `public/js/pages/console.js` + the eight sheets in
`public/css/features/admin/`. No build step.

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
ACCESS column reduced to labels and **no ACTIONS column at all** — `<th
id="usersActionsHead" hidden>` and every cell under it carry `hidden` together,
so the column is removed from the table rather than left standing empty. Measured
at 1440: the header alone was holding 552px, and hiding it hands that back to the
columns that have something in them (EMAIL 186 → 308, ACCOUNT 129 → 213). Both
master-only pieces of chrome — this and CONSOLE PASSWORD — are set off
`isSessionMaster()` before the fetch, not off the response, or the header appears
for a frame over "Loading…" and is then taken away.

`COLS` stays 8: a `colspan="8"` message row over seven visible columns still
spans the whole table (a `display: none` column contributes no width), and
measured it does — 1398 of 1398 in both roles.

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

**And one rule that is not about lockouts: nobody acts on their own row.** Every
write in this table — the role, the master flag, a password reset — is refused
against the caller's own account, so the USERS tab draws your own row with its
three action slots empty and the YOU badge as the reason. Standing yourself down
was the one self-write allowed; it is not any more, and a master hands the role
on by having another master take it.

## Routes are grouped by what they act on

`routes.js` is one file and its only organising principle is that **a route sits
next to the other routes for the same thing**. The four destructive ones were
first appended to the end of the file, which put `POST /rooms/:code/close` 713
lines from `GET /rooms` and the account delete 334 from the other user writes;
they are now 26–40 lines from their nearest sibling. Express matches on
method+path, so position carries no behaviour — it is purely whether the next
reader can find the set.

A helper used by exactly one route lives directly above it (`passwordConfirms`
over `POST /catalog/clear`), not in the file's helper block. The helper block at
the top is for what several routes share: `readLimit`, `sendAdminError`,
`isMasterAdmin`, `requireMaster`.

**The file is 958 lines and the next feature should split it**, by these same
groups, into `session` · `stats` · `users` · `rooms` · `catalog` · `scrape` ·
`settings` mounted from a composition root — the shape `public/js/features/admin/`
already has on the client side.

## Tooltips say what the label cannot

Every button on this console carries a `title` **except** the three whose label
is already the whole story — CANCEL, SAVE, UNLOCK CONSOLE. A tooltip that
restates its own label is noise, so those stay bare; adding one there is the
mistake, not the omission.

What a good one adds:

- **the unit the label leaves out** — `NEXT ›` → "The next 25 players".
- **the consequence** — `CLEAR HISTORY` → "Empty the run log. This also clears
  the incremental cutoff"; `CLOSE` on the ROOMS table → "The code cannot be
  reopened".
- **which of two same-named buttons this is.** The room panel's CLOSE reads
  "Close this panel. The room is not affected", because the table behind it has
  a CLOSE that ends the room. That pair is the reason this section exists.
- **the difference between neighbours** — `UPDATE` fetches what is new,
  `REPAIR` re-fetches players with empty fields; neither label says so, and they
  no longer sit together to be compared.

`RESET PW` and `DELETE` build theirs per row, naming the account and the address
they would act on. The four role buttons take theirs from `ROLE_TIPS` in
`usersTab.js`, keyed by label — add a label without adding a tip and the button
renders `title="undefined"`, so keep the two in step.

## Destructive actions, and what each one costs

Four, and they are gated three different ways. The gate is chosen by **how hard
the thing is to undo**, not by how alarming it sounds.

| Action | Who | Confirm | Undo |
| --- | --- | --- | --- |
| `DELETE /users/:id` | master: anyone but self · plain admin: non-admins only | two clicks | none |
| `POST /catalog/clear` | master | **password** | a full scrape, hours |
| `DELETE /scrape-logs` | master | two clicks | none needed; costs one full scrape |
| `POST /rooms/:code/close` | any admin | two clicks | make a new room |

**Deleting an account leans on the schema, not on code.** `ON DELETE CASCADE`
from `users` takes the squad (`players`), the game plans and their rows,
`user_settings` and any pending `email_verifications`. Nothing in the route
enumerates them and nothing can be half-done. The guards are: never yourself,
never the last admin, and a plain admin never reaches a row with console access —
that last one because deleting a colleague *is* revoking their access, and access
is a master's to change.

**Clearing the catalog empties three tables, and the two extra ones are what stop
it leaving an install that cannot be refilled.** `top_players_snapshot` names
`pesdb_id`s that would no longer exist, and it is both the sign-in backdrop and
the pool an anonymous opponent is drafted from. `scrape_logs` **is the
incremental cutoff** — `scrape.js` reads the newest finished row's `max_pesdb_id`
and fetches only what is newer, so keeping it would mean `npm run scrape` never
refetches a single deleted row. Squads and game plans are deliberately untouched:
`players.pesdb_id` has no foreign key to the catalog, so nothing cascades, and a
squad is a user's work rather than a copy of the catalog.

**That same cutoff is why clearing the scrape log is not a cosmetic wipe.** The
next scrape becomes a full one — ~128k players, several hours — so the armed
button says `NEXT SCRAPE = FULL. CONFIRM?` rather than making an admin find out
afterwards.

**Closing a room needs `adminClosed`, and that flag is load-bearing.** A host
walking back into a closed room *reopens* it (`reopenRoom`), which is right for
their own close and wrong for an administrator's: the host's heartbeat is a 500ms
interval, so without the flag the console's close would be undone before the
table finished repainting. `closeRoomEntry` in `rooms/store.js` sets it, and
nothing clears it — the code is spent, which is the intended reading and costs
nothing, since rooms are in-memory and a new room is a new code. The entry itself
**survives its own seats**: `closed` + `closeReason` is the only thing that puts
a player on the "Room closed" screen.

The catalog wipe is the one action that asks for a password, and it is the one
the *gate* took — shared console password where the install has one, the
account's own otherwise, decided by `consolePassword.js`. `openConfirmPasswordForm`
re-uses the console-password modal with its new/confirm pair hidden.

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
| `format.js` | `fmt*`, the pills, `tableMessage(colspan, text)`, and `notice(id, message, isError)` — the one line a panel says out loud. Three tabs had a byte-identical private copy of that last one |
| `confirmButton.js` | the two-click arm every irreversible button on this console uses. **A button confirms iff it carries `data-confirm-label`** — the attribute names what to disarm back to, and only destructive buttons have one, so no handler needs a "does this need arming" test. One armed button at a time, process-wide |
| `overviewTab.js`, `roomsTab.js`, `usersTab.js`, `catalogTab.js` | one module per tab |
| `roomDetail.js` | the read-only room inspection panel behind WATCH |
| `catalogColumns.js` | which CATALOG columns are fixed, which optional, which on — and the per-account load/save behind it |
| `passwordModal.js` | the password dialog. It takes a `fields` list and a `validate` — not mode booleans: rotating the console password asks for three fields, confirming a catalog wipe asks for one, and `open()` has no branch for the difference |
| `topPlayersControl.js` | the SIGN-IN SHOWCASE panel — the REBUILD button and the ranked chips. Holds no ranking logic; the server owns what "top" means |
| `index.js` | `initConsole()` |

`initConsole` wires every tab **before** calling `resume`, so a stored token can
never reveal a half-wired dashboard. Panel wiring lives in the `init*` functions
rather than at module top level; keep it that way, or that ordering guarantee is
lost.

**The corollary, and it has bitten once: an `init*` runs before any session
exists, so it cannot ask who is signed in.** `isSessionMaster()` and
`getSessionUserId()` are module state that `openSession`/`resumeSession` fill in,
and both of those run *after* every `init*`. Reading either during init gets the
initial `false`/`null`, not an answer. CLEAR CATALOG and CLEAR HISTORY were
hidden in `initOverviewTab` on exactly that read, so they were hidden from
masters too and nothing ever set them back — the feature was unreachable from
the UI. Anything that depends on *who* is looking belongs in the tab's `load*`,
which `startTabs()` calls once the dashboard opens. `loadUsers` had it right for
`consolePwBtn`; `loadOverview` does now.

## Tabs

One dataset, one place. The old dashboard showed rooms, scrape runs and signups on
OVERVIEW *and* again on their own tabs, with a second row template each.

| Tab | Shows | Refetch |
| --- | --- | --- |
| OVERVIEW | four tiles, catalog health, last 8 scrape runs | 60 s |
| ROOMS | live rooms, phase pill, idle time, WATCH button | 10 s |
| USERS | 50 newest accounts, squad/plan counts, and the ACCESS column | on activation |
| CATALOG | paginated `/api/players` browser, search, sort, filter, column chooser | on activation |

**The whole row is coloured by rung**: `tr.role-row.is-master` puts the accent on
every cell, `.is-admin` full-strength text, `.is-user` the muted rung — so which
accounts carry power is answerable by scanning the table, not by reading one
column. The rule is written against `td`, because `.admin-table td` sets a colour
and a rule on the row would lose to it; it outranks `.td-dim`, so a dimmed cell
follows its row. The pills and the buttons keep their own colours — their rules
apply to the element rather than being inherited — and for the buttons that is
the point: a MAKE ADMIN in accent on a master's row would read as the one thing
on screen asking to be pressed.

The role word itself is stated once, in ACCESS (`.access-role`), and every row
gets one whoever is looking. A master sees it followed by the buttons
that act on it, which is the argument for that column: the word and the controls
that change it belong together. It was briefly a pill beside the username as
well, which put the same word twice in one row.

`roleLabel` answers `USER` rather than the em-dash it used to: `—` in a column of
real values reads as missing data, when what it means is an account with no
console access. The column header is **ACCOUNT**, not USER, so a plain row does
not read `USER · USER`.

**Your own row carries a YOU badge in a last, unheaded column** (`.col-you`,
right-aligned so the badge sits at one x down the table). It was `· YOU` trailing
the role, which put a fact about the *reader* in the column that states the
*account's* role. Below 620px the cell drops its label gutter, and on everyone
else's row it is `display: none` rather than an empty line in every card.

**No panel on this console carries a standing note.** There were four — how
roles work over USERS, what a live room is over ROOMS, what to do about a
data-quality count over CATALOG HEALTH, and the cap and thin-list advisories
under CHOSEN. They were removed, class and copy together, and `.panel-hint`
went with them. `#scWarn` and `#tcWarn` survive because they are not notes: a
box that speaks only when a write is refused is feedback, and nothing else on
the page reports a failed save. Do not reintroduce a standing paragraph in a
panel — the column headers and the counts beside each title carry it.

`TABS` in `tabs.js` is the whole controller: one 5 s tick reads the active tab's
`refreshMs` and skips entirely when `document.hidden`, so a background tab costs
nothing. The active tab is mirrored into the URL hash.

CATALOG reads the **public** `/api/players`, so those are the only fetches on
the page that carry no token. The endpoint returns a page and never a count, so
there is no total to print and no last page to jump *to*.

**Whether there is a next page is still exact, and it has to be.** The fetch asks
for `PAGE_SIZE + 1` and throws the extra row away: a page that comes back
over-full has a page after it, and one that does not is the last. It used to
infer this from a full page meaning "there is probably more", which is wrong on
any catalog that divides evenly by 25 — it put NEXT on the true last page and
sent you to an empty one. That was survivable while NEXT merely greyed out; it
is not, now that **PREV and NEXT are hidden at the ends rather than disabled**.
A control that disappears is making a claim, so it has to be right.

`.pagination-bar` is a three-column grid with each of PREV, the count and NEXT
placed by `grid-column`, so a hidden button leaves its slot empty. As a centred
flex row the count slid sideways every time you crossed page one.

### CATALOG's sort, filter and columns

Sort and filter are the **same controls as My Players** — `SORT_CATEGORIES` from
`shared/players/sort.js` and `buildPlayerFilterPanel` from
`shared/players/filterPanel.js`, mounted as that panel's fourth call site with a
`cc`-prefixed id map. Not console-local copies: two tables over one endpoint must
not drift into offering different options. The filter→query-string mapping is
`playerFilterParams`, extracted from `features/catalog/catalog.js` when this tab
became its second caller.

Columns are the console's own, in `catalogColumns.js`: `#` and PLAYER fixed, the
other fourteen optional and eight of them on by default. Where the selection is
stored, and why, is **CATALOG columns belong to the account** below.

With every column on, the table is wider than the panel. `.table-wrap` already
had `overflow-x: auto`, but `.admin-table { width: 100% }` was squeezing the
table back inside it — `.catalog-table` overrides that to `width: auto;
min-width: 100%` with `white-space: nowrap` cells, so the table sizes to its
content and the wrapper scrolls it. Measured 1440 → 320: the page body never
scrolls horizontally at any width; the table does, inside its wrapper.

**This is the one table the 14px row size costs anything**, and it is paid inside
that wrapper: with the eight default columns on, the in-wrapper drag went 54 → 106px
at 700 and 238 → 290px at 500. USERS and ROOMS fit their wrapper with no drag at
every width from 1440 to 500, before and after, and the page body still never
scrolls.

## Running a scrape from the console

`scrapeRunner.js` (server) + `scrapeControl.js` (client). The OVERVIEW tab's
SCRAPE RUNS panel gains an UPDATE button, a live output pane and a STOP button.

**`REPAIR` is the odd one out: it starts a scrape but lives in CATALOG HEALTH.**
Both buttons run `scrapeRunner`, both report into the SCRAPE RUNS pane, and both
are disabled together while a run is going — nothing about the mechanism changed
when it moved. What moved is where you reach for it. `REPAIR` is the answer to a
non-zero count in the health list, and it now sits in the header of the panel
that shows you that count instead of in the one next door. Its `title` says the
progress appears in SCRAPE RUNS, because that is the one thing the new position
makes less obvious.

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

### The panel repaints per stage, and keeps its card nodes

A 3 s poll into `innerHTML =` rebuilds every `<img>` it replaces, and a fresh
`<img>` paints empty for a frame even when the bytes are cached. Two guards, and
they answer different questions:

1. **A string compare per stage**, not one for the panel. `painted` is
   `{ lobby, ban, pick, ready }` and each stage is patched only when its own
   markup changed. A whole-panel compare had fixed the idle case and nothing
   else: pressing READY repainted all four stages, so a button toggle reloaded
   every card on screen. Now READY rewrites the READY stage and the PICK cards
   are never touched.
2. **`patchStage` lifts the live `<img>` nodes out and puts them back.** Inside
   the stage that *did* change, the cards still present are the same cards, so
   their already-decoded nodes are reused rather than recreated. A pick landing
   creates exactly one new node.

Keyed on `data-card-src`, not `src`: a card whose art 404s has had its `src`
swapped to the anonymous placeholder, and matching on the live value would fail
to recognise it and re-request the 404 on every repaint.

**The compare only works while nothing in the body varies with the clock.** The
idle counter and the last-beat line are deliberately in the header for that
reason — put an elapsed time in a stage and every poll repaints it silently.

Verified by driving the real module with synthetic snapshots over a stubbed
`fetch`: a READY toggle creates 0 new card nodes, a new pick creates exactly 1
and every existing card survives, and an unchanged poll repaints nothing.

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

  It also writes a **`planCount` onto each seat**, the one field not in that
  snapshot: the two draft clients read `serializeRoomEntry` too, and what your
  opponent has saved in their planner is none of their business. The count is
  seeded at zero for both seat ids before the rows are merged in, because
  `GROUP BY` returns no row at all for a user with no plans — read straight off
  the result, an empty planner is indistinguishable from a user nobody asked
  about. A query that *throws* answers `null`, which the panel prints as
  `unknown`: the room is in memory and is what the admin clicked WATCH to see,
  so a database hiccup costs one line of a seat card rather than the panel.
- `GET /preferences` · `PUT /preferences` — this admin's console settings,
  always for `req.admin.uid` and never for an id in the body. The PUT takes one
  `{ key, value }`; the key is allow-listed and the value shape-checked in
  `preferences.js`, and a rejected one is a **400 rather than a silent no-op** —
  the console would otherwise go on showing a choice it never stored. So far one
  key, `catalogColumns`.
- `GET /users` also returns `email_verified`; the tab marks an unconfirmed address
  with a dashed UNCONFIRMED pill, which is both why that account cannot sign in and
  why a reset would be mailed somewhere nobody has proved they read. Not red —
  unfinished is not destructive (DESIGN.md §3).
- `GET /scrape-logs?limit=N`, `GET /users?limit=N` — `readLimit` clamps to 1…50;
  a negative or NaN limit falls back to the default rather than reaching SQL.
- `PATCH /users/:id/role` — `{ isAdmin }`. Master-only. **Ways to lock everyone
  out, all refused**: demoting yourself (you are standing on the page you would
  lose — and see the self-write rule above), demoting the last admin, and
  revoking access from a master. The
  last-admin one is not theoretical — a token stays valid for up to 8 hours after
  the account behind it is demoted, so a revoked admin can still reach this route,
  and without the check could take the last one with them.
- `PATCH /users/:id/master` — `{ isMaster }`. Master-only. Granting sets `is_admin`
  too. **Refused against your own account in either direction**, alongside the
  last-master check; the self-check sits after `requireMaster` so a plain admin
  gets the 403 rather than a rule that was never going to apply to it.
- `PATCH /users/:id/password` — no body. Master-only. **Refused against your own
  account** — Edit Profile is where you choose your own, and this route neither
  asks for the old password nor returns the new one. Generates the password,
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
- `GET /top-players` · `POST /top-players/refresh` — the SIGN-IN SHOWCASE panel.
  Both answer the same shape (`count`, `refreshedAt`, `limit`, `players`), so the
  panel has one renderer and cannot show a count that disagrees with the names
  under it. The GET has **no side effects** — it reads the snapshot as it stands
  and never triggers a rebuild, or opening the console would sometimes cost the
  slow query. The POST rebuilds, then reads back what was stored rather than
  returning what it just computed.

**`scrape_logs` has no status column**, and a crashed run never writes
`finished_at`. `scrapeRunState` therefore reads an unfinished run older than an
hour as `stalled`, not `running` — the dashboard used to report a run that died in
April as still going, under a progress bar whose width was hardcoded.

## CATALOG columns belong to the account

The column selection is stored server-side in `user_settings`, not in the
browser: it used to live in `sessionStorage`, which made "my columns" a property
of one page load. The shape to keep:

- **The in-memory selection is the authority during a session.** The server is
  where it is saved, not where it is read on every render — a write that fails
  leaves the table as chosen instead of snapping back, and a failed *read* falls
  back to the defaults silently. A dashboard that will not open because a view
  preference did not load would be a worse trade than a dashboard with the
  default columns.
- **`loadColumnPrefs()` runs before `startTabs()`**, in the `openDashboard`
  callback both ways in share. The columns are only knowable once a session is
  open, and CATALOG rendering defaults and then swapping is worse than waiting a
  round trip for them.
- **A changed selection rebuilds the chooser.** Each item's tick is written when
  the item is built, and `initCatalogTab` has already built a panel full of
  defaults by then — hence `rebuildColumnsPanel()`, which RESET also uses.
- Unknown keys are filtered on read, so a column this build has dropped cannot
  come back from an older stored selection, and a selection that filters down to
  nothing falls back to the defaults rather than drawing two fixed columns with
  no explanation.

## CSS (`public/css/features/admin/`)

**Eight sheets, one per component, and the `<link>` order in `console.html` is
the cascade.** They
were one 2080-line `admin.css`, cut on its own section boundaries with the order
kept exactly — verified by reading `getComputedStyle` for 102 specimen elements
at six viewport widths before and after: all 612 readings identical. Keep it that
way. A rule here can win by nothing but coming later (`.role-btn.is-pw:hover`
over `.role-btn:hover` at equal specificity), and every media query beats its
base rule by source order alone.

| Sheet | Owns |
| --- | --- |
| `shell.css` | the reset, `[hidden]`, scrollbars, `body`, the gate, the masthead, the button family, the top nav, `.tab-panel` |
| `panels.css` | `.panel` and its header, the four stat tiles, `.panel-grid-2`, `.panel-notice`, the scrape-run status block |
| `tables.css` | `.admin-table` and everything inside a cell — phase / status / role pills, ACCESS, the row tint, the action slots — then the data-quality bars |
| `playerBrowser.css` | the SIGN-IN PAGE and TEST CARDS browser and the column beside it |
| `catalog.css` | the catalog table, pagination, `.link-btn`, the column chooser |
| `passwordModal.css` | the scrim and card behind `passwordModal.js` |
| `roomDetail.css` | the WATCH panel — every selector is `.rd-` |
| `responsive.css` | every media query — **linked last of the eight** |

Adding a file means deciding where its lines would have been, and linking it
there. `controls.css` still comes after all eight, page-wide, because its focus
ring has to beat feature sheets that set `outline: none`.

### One component, one rule

Three families, and a component belongs to exactly one:

- **An action button in a table row** is `.role-btn` *or* `.link-btn`, and they
  are **one rule in `tables.css`** — `--text` on a `--line-hover` hairline,
  `--line-active` under the pointer, the `--danger` rung when armed. They used to
  be two identical rules in two sheets, so raising the label rung on USERS left
  WATCH, CLOSE and the CATALOG id link a rung behind, reading as disabled.
  `.link-btn` adds only what an `<a>` needs. `.role-btn.is-pw` lives here too, not
  in `passwordModal.css` where the sheet split had stranded it.
- **A badge in a cell** — `.phase-pill`, `.status-pill`, `.role-pill`,
  `.card-type-badge`, `.live-badge` — is 12px/700, `--radius-sm`, `padding: 2px
  8px`. What a badge varies is its **hue**, and only where the hue means
  something. `.access-role` is not in this family: it is a coloured word, no
  chip. `.role-pill.is-you` keeps its opaque `--bg` and `--line-active` edge,
  because it is the one badge that only ever sits on a tinted row.
- **Table text**: cells 14px/400 `--text`, headers 12px/600 `--text-dim`
  uppercase. `.td-dim` is the secondary rung for EMAIL, JOINED, MODE, DURATION,
  STARTED, CLUB, IDLE — and it is written `.admin-table .td-dim`, because a bare
  `.td-dim` (0,1,0) loses to `.admin-table td` (0,1,1) and silently did nothing
  on every table for as long as it existed. At (0,2,0) it wins that, and still
  loses to `tr.role-row.is-*` (0,3,1), so a USERS row stays uniformly its rung.

`.load-more-btn` and `.select-mode-btn` look like they belong to the first family
and do not: they live in `shared/`, the home page is the other consumer, and they
are consistent with their twins there. Leave them alone.

Colours come from `shared/tokens.css` like every other page — **including the
console hues, which are this page's alone**: blue (access / running), violet
(pick), amber (ready / warning), green (done / healthy), on top of the app's lime
and red. `DESIGN.md` §3.4b is the contract: a hue means one thing, colour states
rather than counts, and controls stay neutral. Nothing here may introduce a
colour that is not one of those tokens. The one sheet this
page does not own is `shared/filterPanel.css`, linked between tokens and
these sheets: the sort/filter dropdown chrome moved there out of
`features/catalog/catalog.css` when the CATALOG tab became a consumer on a second
page — it is linked before all eight of these. Key blocks, wherever they now live: `.gate-overlay` / `.gate-card`, `.admin-nav`, `.stats-row` (4-column grid),
`.panel-grid-2`, `.admin-table` (sticky thead; **rows are 14px, the list-row rung
in DESIGN.md §4, and the `th` above them is 12px, the label rung** — the two were
both 12 and the header did not read as a header. Nothing inside a cell moves with
it: every element that lands in one declares its own 12px. **The two exceptions
were `.td-mono` and `.catalog-table .td-rank`** — both were sized to match the old
12px row and both now inherit 14, since a mono id is a *face* choice and a rank
gutter is still part of its line. `.td-mono` also drops its `0.05em`, which is the
uppercase-label tracking and not something an id wants; `.td-rank` widens 36 → 40px
to hold a four-digit rank at the larger size. `tabular-nums` on the table, because
SQUAD, PLANS, RUN and every timestamp are read *down* the column), phase pills
(`.phase-pill.is-ban/pick/lobby/ready/done`), status pills
(`.status-pill.is-running/done/stalled`), `.role-pill` — two variants,
`.is-unverified` for an unconfirmed address and `.is-you` for your own row;
**it carries no `margin-left` of its own**, because it is alone in its cell
everywhere except the one place it trails a value (UNCONFIRMED after an email on
USERS), and that one site gets the 6px. The margin used to be on the pill and
subtracted again per site, which the catalog's TEST pill never did: measured
across the nine catalog columns it was the only one whose cells did not line up
with their header, and by exactly 6px — `.access-role` and `tr.role-row` (the three
role rungs — accent, text, muted — on the word and on the whole row), `.role-btn` (`.is-armed` — removing access takes two clicks, and the
second one is the red one), `.panel-notice`, the data-quality bars
(`.dq-bar.is-ok/warn/bad`), `.link-btn`, the pagination bar, `.adm-modal` (the
password forms), `.rd-*` (the room detail panel) and `.cols-dd-panel` (the column
chooser, which rides on the shared dropdown chrome).

**A dropdown on the right-hand end of a toolbar has to anchor right.**
`.ap-dd-panel` in `shared/filterPanel.css` anchors `left: 0`, which opens a panel
*rightward* from its button — fine mid-toolbar, and off the end of the card for
the last control. `.panel` is `overflow: hidden`, so what runs past it is cut,
not scrolled: COLUMNS measured 115px past the card's right edge and 11px past its
bottom at every width, which is why its labels read `NATIONALIT…` and
`RESET TO DEFA…`. The correction is the one `.filter-dd-panel` already carries —
`right: 0; left: auto; transform-origin: top right`, plus `max-height: 70vh;
overflow-y: auto` so a long list scrolls itself instead of being clipped, plus a
`:not(.open)` restatement of the origin because the base rule sets `top left`
there. Add a fourth control to this toolbar and it inherits the same problem.
Panel widths are `min-width`, never `width`: the chooser's longest line
(`ALWAYS SHOWN: # · PLAYER`) measures 218px, and a fixed 240 left no room for the
scrollbar `overflow-y` puts beside it.

`.link-btn` is a `<button>` on the ROOMS tab now, which is why it carries
`font-family: inherit` — a button does not inherit the page font on its own.

**`[hidden] { display: none !important }` is load-bearing**, and is the first rule in
the sheet. Tabs are switched by setting `hidden` on `.tab-panel`, and the browser
applies that attribute as an ordinary `display: none` that **any** `display` rule
here outranks — `.tab-panel { display: flex }` did, so all four panels rendered at
once and the console was one long scroll with a tab bar that appeared to do
nothing. `features/draft/base.css` carries the same rule for the same reason.
Never style a panel's `display` without checking which of the two wins.

### The tables are responsive by dropping columns, then by stopping being tables

Every table here sets `white-space: nowrap`, so a narrow viewport cannot shrink
one — it can only scroll it sideways, and a table you have to drag to read is not
a responsive table. Two mechanisms, in this order:

- **Priority columns.** `.col-lo` (SQUAD, PLANS, DURATION, IDLE) goes at 1000;
  `.col-mid` (JOINED, STARTED) at 700. Counts before dates, dates before
  identity; state and controls never go. Add a new column to one of these tables
  and give it a priority class, or it will be the one that breaks the fit.
- **A half-width panel is the third mechanism**, and it is why `.panel-grid-2`
  stacks at 1100 rather than 860. SCRAPE RUNS is the only table that lives in
  one, and it needs 523px for its six columns: half of an 1100px window is 520,
  so the pair had a band — measured 861 → 1105 — where the log was a table you
  dragged inside a panel with room to spare beside it. It stacks on the rung the
  stats row already breaks on, so OVERVIEW goes narrow at one width and not two.
  What is left is 2px of in-wrapper drag across 1101 → 1105, which is not worth a
  rung of its own; the page body still never scrolls at any width.
- **Cards below 620.** `thead` is hidden and each row becomes a block whose cells
  print their own `data-label` — which is why every renderer writes one. The
  cell is `display: flex`, not grid: a grid gave the UNCONFIRMED pill and the
  `· YOU` marker rows of their own, and each of those belongs on the line with
  the value it qualifies. **`.catalog-table` is excluded** — sixteen switchable
  columns is a data grid, not a list of records, and horizontal scroll is the
  right answer for that one.

Measured after both: **zero sideways scroll at 320 · 390 · 480 · 620 · 700 · 900
· 1280**, where before this the USERS table needed 286px of drag at 320 and
194px at 900.

The ACTIONS column is four fixed 112px slots — promote · demote · password ·
delete — and a row with nothing for a slot leaves it empty rather than closing
the gap, so the buttons read as columns instead of a ragged run of pills. The
slot width buys **alignment**: MAKE ADMIN on one row sits under MAKE MASTER on
the next. Below 1200 the slots collapse to `auto` — 454px of table whether or not
a row fills it — and below 600 they wrap.

**Not resizing is a separate job, and it belongs to the button.** Every action
button in a table swaps its own label — `CONFIRM?` when armed, then `DELETING…` /
`SENDING…` / `CLOSING…` while the request is out — and a button that grows widens
its cell and reflows the table around it. `.role-btn`/`.link-btn` therefore carry
`min-width: 96px`, clear of the widest transient (measured at 12px/700: CONFIRM?
89, DELETING… 93, SENDING… 88, CLOSING… 88; resting labels run 64 to 114). The
slot grid could not do this job — it collapses to `auto` below 1200, so USERS
reflowed there, and ROOMS has no slot grid at all. Verified by arming every
table button through all four states at seven width/tab combinations: no cell
changes width, height or x.

Breakpoints: `1100 → 1000 → 860 → 700 → 620 → 600 → 480`. **At 1100** the stats row
goes to two columns and the OVERVIEW panel pair stacks (see the half-width panel
note above); 860 is now only the search input's width. **At 700** the nav wraps and the tab
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

## SIGN-IN SHOWCASE — why a button and not a schedule

The OVERVIEW tab's third panel rebuilds `top_players_snapshot`: the list the
sign-in page shows, **and** the pool `rooms/squads.js` auto-bans from when an
empty seat's turn expires. Those two must stay the same list or the auto-ban
takes somebody who was never on the board — see `src/features/players/topPlayers.js`.

It is a button because the catalog only moves when a scrape runs, and the person
who ran the scrape is the one who knows the new cards should go up. A timer would
either lag a scrape or repeat work nothing asked for.

**The snapshot exists for cost, and the numbers are worth keeping.** Ranking the
catalog live anti-joins ~42k rows on `name` — measured **293 ms**, which the
sign-in page was paying on *every page load*. Stored, that read is **~1.5 ms**.
The `(name, overall_max)` index added alongside it takes the rebuild itself from
293 ms to ~50 ms; without that index the join on `name` is a scan.

An empty snapshot **self-heals on the first read**, so a fresh database serves the
right list without an admin knowing to press anything — and a rebuild is guarded
by a single in-flight promise, or a cold snapshot plus a burst of sign-in loads
would each start their own copy of the slow query.
