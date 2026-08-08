---
paths:
  - "src/**/*.js"
---

# Backend (`src/`)

Grouped by feature. `server.js` is a ~38-line composition root: JSON/urlencoded
middleware, the card-image handler, router mounts, static serving from `public/`, then
`notFoundHandler` + `errorHandler`.

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

`src/pages.js` is the one router outside `features/`, and deliberately so: it maps four
URLs to four static HTML files and holds no domain logic, so it belongs to the
composition root rather than to a feature. `server.js` imports it as `./pages.js`.

Supporting modules:

- `lib/db.js` — mysql2 connection pool, exported as default.
- `lib/http.js` — `asyncHandler`, `requireAdminKey`, `requireUserIdQuery`,
  `duplicateUserField`, `describeError`, `errorHandler`, `notFoundHandler`.
  **Log with `describeError(err)`, never bare `err.message`** — mysql2 connection
  failures have an empty message and put the cause in `err.code`, so `err.message`
  alone prints nothing and hides outages like `ECONNREFUSED`.
- `lib/paths.js` — `PUBLIC_DIR` (`ROOT_DIR` backs it and is module-private).
- `lib/cli.js` — `isMainModule(import.meta.url)`, the guard that lets a file be both a
  script and an importable module.
- `features/rooms/store.js` — the in-memory `roomPresence` Map plus every helper that
  reads or mutates it (`ensureRoomEntry`, `serializeRoomEntry`, `roomPhase`,
  `listActiveRooms`, `pruneStalePresence`, `resolveSide`, …).
- `features/rooms/config.js` — duration constants, the three reveal modes,
  `ROOM_LIST_QUIET_MS`, `PICK_COUNT_PER_SIDE`, and all room-config /
  allowance-cap normalisation. **No presence TTL** — see
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
