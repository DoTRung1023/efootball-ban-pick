---
paths:
  - "database/**/*.sql"
  - "src/lib/db.js"
  - "src/features/players/**/*.js"
  - "src/features/ingestion/**/*.js"
---

# Database schema (MySQL 8+)

- `players_catalog` — ~41k scraped players; `pesdb_id` is the stable external key
  (BIGINT, up to 15 digits for newer cards).
- `players` — user roster; links to `players_catalog.pesdb_id` via nullable FK.
- `game_plans` / `game_plan_players` — up to 20 plans per user; slots 1–11 = LINEUP,
  12–23 = SUB.
- `scrape_logs` — one row per scrape run; `max_pesdb_id` drives incremental cutoff.
- `users` — `is_admin` grants the console; `is_master_admin` is the only thing that
  may grant or revoke either flag. See `admin-dashboard.md`.
- `app_settings` — key/value, one row so far: `console_password`, the bcrypt hash of
  the shared console password.

**Two tables/columns are created by the server, not by `schema.sql` alone**, because
an existing database would otherwise serve a broken console until somebody ran the
`ALTER` by hand: `users.is_master_admin` (`ensureMasterColumn` in
`src/features/admin/bootstrap.js`) and `app_settings` (`ensureSettingsTable` in
`src/features/admin/consolePassword.js`). Both are idempotent and run on every boot.
`schema.sql` still declares them, so a fresh install needs neither.

## Running a scrape

`npm run scrape` (new cards since the last cutoff) and `npm run scrape:missing`
(diff every site id against the DB). Both can also be started from the admin
console — see `admin-dashboard.md`; the console spawns these same scripts as
child processes rather than importing them, because **both end with
`await db.end()`** and would otherwise close the pool the server is using.

**`.scrape-state.json` at the repo root is the resume file**, rewritten after each
row, which is what makes a killed run recoverable — and why the console offers a
STOP button at all.

Its path used to be built as
`new URL("../.scrape-state.json", import.meta.url).pathname`, which was wrong
twice: `..` from `ingestion/` is `src/features/`, not the root, and `.pathname`
keeps the URL's percent-encoding — so on any checkout whose path contains a space
(this one does) every write hit a directory that does not exist and killed the
run. That is what run #8 in `scrape_logs` is: started 7 Aug, no `finished_at`,
ever. It now joins `ROOT_DIR` from `#lib/paths.js`. **`fileURLToPath` is the only
correct way to turn a file URL into a path.**

`getLastLog` reads the cutoff from the most recent row `WHERE finished_at IS NOT
NULL`, so a stopped or crashed run is skipped rather than read as "no cutoff" —
without that filter, stopping a scrape would make the next one a full rebuild.
`scrape_logs` has **no status column**: an unfinished row is a run that did not
finish, whether it was stopped or it died, and the console reads one older than
an hour as STALLED.
