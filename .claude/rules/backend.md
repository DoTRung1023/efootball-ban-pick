---
paths:
  - "src/**/*.js"
---

# Backend (`src/`)

`server.js` is a ~38-line composition root: JSON/urlencoded middleware, the card-image
handler, router mounts, static serving from `public/`, then `notFoundHandler` +
`errorHandler`. Routes themselves live in `src/routes/`.

Router mounts:

| Mount | Module |
| --- | --- |
| `/api` | `routes/players.js` |
| `/api` | `routes/auth.js` |
| `/api/game-plans` | `routes/gamePlans.js` |
| `/api/rooms` | `routes/rooms.js` |
| `/api/admin` | `routes/admin.js` |
| `/` (page routes) | `routes/pages.js` |

Supporting modules:

- `db.js` — mysql2 connection pool, exported as default.
- `lib/http.js` — `asyncHandler`, `requireAdminKey`, `requireUserIdQuery`,
  `duplicateUserField`, `describeError`, `errorHandler`, `notFoundHandler`.
  **Log with `describeError(err)`, never bare `err.message`** — mysql2 connection
  failures have an empty message and put the cause in `err.code`, so `err.message`
  alone prints nothing and hides outages like `ECONNREFUSED`.
- `lib/paths.js` — `ROOT_DIR`, `PUBLIC_DIR`.
- `rooms/store.js` — the in-memory `roomPresence` Map plus every helper that reads or
  mutates it (`ensureRoomEntry`, `serializeRoomEntry`, `roomPhase`, `listActiveRooms`,
  `pruneStalePresence`, `resolveSide`, …).
- `rooms/config.js` — TTL and duration constants, reveal modes, `PICK_COUNT_PER_SIDE`,
  and all room-config / allowance-cap normalisation.
- `players/catalogQuery.js` — `SORT_MAP`, `POS_GROUPS`, `CATALOG_COLUMNS`,
  `buildCatalogFilter`, `resolveSortOrder`.
- `cardImageCacheR2.js` — proxies player card images; caches to Cloudflare R2 if
  configured, otherwise redirects to pesdb.net.
- `scrape.js` / `scrape-missing.js` — scrape pesdb.net with cheerio. `scrape.js` uses
  `.scrape-state.json` for resume support; incremental runs use `max_pesdb_id` from
  `scrape_logs`.

**Auth is stateless.** There is no session middleware — `userId` is passed in request
bodies/query params and trusted client-side.