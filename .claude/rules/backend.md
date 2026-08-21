---
paths:
  - "src/**/*.js"
---

# Backend (`src/`)

Grouped by feature. `server.js` is a ~45-line composition root: JSON/urlencoded
middleware, the card-image handler, `/verify-email`, router mounts, static serving from
`public/`, then `notFoundHandler` + `errorHandler`.

Each feature exposes its surface through an `index.js` barrel, and `server.js` imports
only barrels. Cross-folder imports use the `#features/…` / `#lib/…` aliases from the
`imports` field in `package.json` — Node does not support the browser's `@/`. Only
`./sibling.js` stays relative.

Router mounts:

| Mount | Barrel | Router module |
| --- | --- | --- |
| `/api` | `#features/players/index.js` | `features/players/routes.js` |
| `/api` | `#features/auth/index.js` | `features/auth/routes.js` |
| `/api/game-plans` | `#features/gamePlans/index.js` | `features/gamePlans/routes.js` |
| `/api/rooms` | `#features/rooms/index.js` | `features/rooms/routes.js` |
| `/api/admin` | `#features/admin/index.js` | `features/admin/routes.js` |
| `/` (page routes) | — | `src/pages.js` |

Two handlers are registered directly on `app` rather than through a mount, both because
the URL is read by something outside this app: `/img/card/:id.png` (an `<img src>`) and
`/verify-email` (a link in an email, exported from the auth barrel as `verifyEmailPage`).
Neither belongs under `/api`, and neither is a page.

`src/pages.js` is the one router outside `features/`, and deliberately so: it maps every
page URL to one of four static HTML files and holds no domain logic, so it belongs to the
composition root rather than to a feature. `server.js` imports it as `./pages.js`.

`home.html` is served on four of those URLs — `/`, `/players`, `/game-plans` and
`/rooms` — one per home tab, so that reloading or sharing a link keeps the tab the user
was on. The server does not care which; `initTabs` in `public/js/pages/home.js` reads the
path, and rewrites `/` to the tab it shows. Adding a home tab means adding its URL here
too, or a reload on it 404s.

Supporting modules:

- `lib/db.js` — mysql2 connection pool, exported as default.
- `lib/http.js` — `asyncHandler`, `requireUserIdQuery`, `requestBaseUrl`,
  `duplicateUserField`, `describeError`, `errorHandler`, `notFoundHandler`.
  `requestBaseUrl(req)` builds the origin for a link that will be read outside the
  browser; **set `APP_BASE_URL` behind a proxy**, or `req.protocol` reports the hop
  into it and every emailed link comes out `http://`.
  **Log with `describeError(err)`, never bare `err.message`** — mysql2 connection
  failures have an empty message and put the cause in `err.code`, so `err.message`
  alone prints nothing and hides outages like `ECONNREFUSED`.
- `features/admin/adminSession.js` — the console gate: signs, verifies and throttles
  admin session tokens. It lives with the one feature that uses it rather than in
  `lib/http.js`, where the shared-key gate it replaced used to sit. See
  `admin-dashboard.md`.
- `features/rooms/squads.js` — the one place a room reads a squad from the
  database. `store.js` is pure in-memory state and stays that way. An anonymous
  seat answers `null`, not 0: no account, no squad, nothing to check.
- `features/admin/scrapeRunner.js` — spawns, tracks and stops the ingestion
  scripts as child processes. The only place in the server that starts one.
- `features/admin/bootstrap.js` — `ensureConsoleAdmin()`, called from `server.js`
  inside the `listen` callback and **deliberately not awaited**: the app must boot
  with or without a database. It is the reason a fresh install has an admin at all.
- `features/auth/verification.js` — `ensureAuthSchema()`, awaited **before**
  `ensureConsoleAdmin()` in that same callback, and that order is load-bearing: the
  seeder writes `email_verified` on the account it restores, and on a database created
  before confirmation existed the column is added right here. Both swallow their own
  failures, so a database that is down still leaves a server that boots.
- `features/mail/` — the one SMTP transport (`transport.js`) and the two messages the
  app sends (`templates.js`). **`sendMail` either delivers or throws**, and returns
  `{ delivered }` where `false` means "printed to the server log because `SMTP_HOST` is
  unset" — a real mode, not a stub, and the reason every caller has three sentences
  rather than two. Callers that have not written to the database yet send *first*: see
  the password reset in `admin-dashboard.md`.
- `lib/paths.js` — `ROOT_DIR` and `PUBLIC_DIR`. `ROOT_DIR` was module-private until
  the scraper's resume file needed it; deriving the root anywhere else is how that
  file ended up being written to a percent-encoded directory that did not exist.
  See `database.md`.
- `lib/cli.js` — `isMainModule(import.meta.url)`, the guard that lets a file be both a
  script and an importable module.
- `features/rooms/store.js` — the in-memory `roomPresence` Map plus every helper that
  reads or mutates it (`ensureRoomEntry`, `serializeRoomEntry`, `roomPhase`,
  `listActiveRooms`, `resolveSide`, …). `/leave` is the **only** thing that
  deletes an entry, and only when no seat is left and the room is not closed —
  see `room/presence-and-reconnect.md`.
- Two guards in `features/rooms/routes.js` worth not undoing:
  - **`/match-step` answers one handshake, and only in its own status.** The
    `MATCH_STEPS` table pairs each step with the status it is open in and the
    status *both* answers lead to: ready `await-ready → await-start`, start
    `await-start → live`, finish `live → done`. Its ancestor promoted a
    *drafting* room on the first call, so either player could post it mid-ban or
    mid-pick and skip the rest of the draft for both. The legitimate route into
    `await-ready` is both sides confirming in `/picks-confirm`; every status
    after it is reached from the one before it, by both sides, through here.

    **`finish` is not undoable and the other two are.** Ready and start may be
    taken back — the room walks the other player back a stage too and nothing
    has happened yet. Walking `done` back would look exactly like a rematch
    being accepted to the other client, which sits in the `done` phase watching
    for the status to *leave* `done` and reloads on it.
  - **A kick is permanent.** `/kick-guest` appends to `entry.kickedGuestIds` and
    **nothing ever removes an id from it** — not a different guest taking the
    seat, not host promotion, not `reopenRoom`. There is no `/unkick`; it existed
    briefly and was reversed on purpose. Read the list through
    `isKickedFromRoom(entry, userId)` in `store.js`, and note the check sits in
    the `/presence` handler **above the seat claim**, so it gates the host seat
    too: a closed room reopens for whoever posts `role: "host"`, so a
    guest-seat-only check let a kicked player take the room over.
- `features/rooms/config.js` — duration constants, the three reveal modes,
  `ROOM_LIST_QUIET_MS`, `PICK_COUNT_PER_SIDE`, and all room-config /
  ban/pick durations, both reveal modes and the ban order. `schedule.js` derives
  the turn schedule from that config and `turns.js` moves the room through it —
  including auto-banning an expired alternating turn, which is resolved on the
  presence path because there are no server-side timers. **No presence TTL** — see
  `room/presence-and-reconnect.md`.
- `features/players/catalogQuery.js` — `CATALOG_COLUMNS`, `buildCatalogFilter`,
  `resolveSortOrder`. The `SORT_MAP` and `POS_GROUPS` tables behind them are
  module-private.
- `features/media/cardImageCacheR2.js` — proxies player card images; caches to
  Cloudflare R2 if configured, otherwise redirects to pesdb.net.
- `features/ingestion/scrape.js` / `scrapeMissing.js` — scrape pesdb.net with cheerio.
  `scrape.js` uses `.scrape-state.json` for resume support; incremental runs use
  `max_pesdb_id` from `scrape_logs`.

## Scripts that are also modules

`npm run scrape` and `npm run scrape:missing` run the two ingestion files directly, but
`scrapeMissing.js` also *imports* fetch/parse/upsert helpers out of `scrape.js`, and the
ingestion barrel re-exports them. **Both files must therefore run `main()` behind
`isMainModule(import.meta.url)`** — without the guard, importing one starts a scrape as
a side effect. `scrapeMissing.js` was missing this guard until it was added alongside
`lib/cli.js`; keep any future script in `src/` to the same pattern.

**Auth is stateless.** There is no session middleware — `userId` is passed in request
bodies/query params and trusted client-side.
