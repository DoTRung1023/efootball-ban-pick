---
paths:
  - "database/**/*.sql"
  - "src/lib/db.js"
  - "src/features/players/**/*.js"
  - "src/features/ingestion/**/*.js"
---

# Database schema (MySQL 8+)

- `players_catalog` — ~41k scraped players; `pesdb_id` is the stable external key
  (BIGINT, up to 15 digits for newer cards). Carries a `(name, overall_max)` index
  purely for the top-N rebuild below, which joins the table to itself on `name`;
  without it that join is a scan and the rebuild goes from ~50 ms to 293 ms.
- `top_players_snapshot` — the materialised showcase pool: what the sign-in page shows
  and what an expired empty seat is auto-banned from. Up to 50 rows, either the
  automatic top 30 or a list curated in the console's SHOWCASE tab. Ranking it live costs 293 ms and
  the sign-in page was paying that on **every load**; stored, the read is ~1.5 ms.
  Rebuilt or hand-picked from the console, never on a timer — the catalog only moves
  when a scrape runs. Empty self-heals on first read, which is why saving an empty
  list is refused rather than stored. `src/features/players/topPlayers.js`
  owns it and creates it on boot.
- `players` — user roster; links to `players_catalog.pesdb_id` via nullable FK.
- `game_plans` / `game_plan_players` — up to 20 plans per user; slots 1–11 = LINEUP,
  12–23 = SUB.
- `scrape_logs` — one row per scrape run; `max_pesdb_id` drives incremental cutoff.
- `users` — `is_admin` grants the console; `is_master_admin` is the only thing that
  may grant or revoke either flag. See `admin-dashboard.md`.
- `app_settings` — key/value, one row so far: `console_password`, the bcrypt hash of
  the shared console password.
- `user_settings` — per-account console preferences, one row per (user, key),
  value a JSON column. So far one key: `catalogColumns`. Allow-listed and
  shape-checked in `src/features/admin/preferences.js`, which also creates the
  table on boot.
- `email_verifications` — one live confirmation link per account: the SHA-256 of the
  token (never the token), the address it was minted for, an expiry and a
  `consumed_at`. `users.email_verified` is the flag `/api/signin` refuses on.
  Created and backfilled by `ensureAuthSchema` in `src/features/auth/verification.js`
  — see `auth.md` for why the backfill only runs on the boot that adds the column.

**Two tables/columns are created by the server, not by `schema.sql` alone**, because
an existing database would otherwise serve a broken console until somebody ran the
`ALTER` by hand: `users.is_master_admin` (`ensureMasterColumn` in
`src/features/admin/bootstrap.js`) and `app_settings` (`ensureSettingsTable` in
`src/features/admin/consolePassword.js`). Both are idempotent and run on every boot.
`schema.sql` still declares them, so a fresh install needs neither.

**`schema.sql` is idempotent and no longer destructive.** It used to open with
`DROP DATABASE IF EXISTS`, so running it twice deleted every account, squad and game
plan — which meant it could never be pointed at anything but an empty local database.
The drop is gone; resetting a local database means dropping it by hand first, and the
file itself can now be run against a deployment to add a table that is missing.

**TLS lives in `src/lib/db.js`, behind `DB_SSL`.** Every managed MySQL requires it and a
local socket has none, so the switch is explicit rather than inferred from the host name
— "not localhost" is a different question and gets this one wrong on a LAN. `DB_CA`
carries a provider's own root where there is one (Aiven ships a `ca.pem`); TiDB Cloud and
most others are publicly signed and need nothing. `rejectUnauthorized: false` is the
usual first result for a certificate error and is not an option here: it keeps the
handshake and throws away the only thing the handshake proves.

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
