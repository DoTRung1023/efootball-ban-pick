---
name: scraping
description: Refreshing the player catalog from pesdb.net — take a real backup, then run the right mode. Full scrape ONLY when the catalog has never been scraped or the user explicitly asks for one; otherwise incremental (`npm run scrape`, new cards since the last cutoff) or gap repair (`npm run scrape:missing`, diff every site id against the DB). Use for "update the players", "scrape", "new players", "missing players", "the catalog is out of date", or any run of the ingestion scripts.
---

# Scraping the player catalog

Two entry points, both in `src/features/ingestion/`, both npm scripts:

```bash
npm run scrape           # mode decided automatically: full on a virgin DB, else incremental
npm run scrape:missing   # diff every id on the site against the DB, fill the gaps
```

**Never start either one without doing §1 first**, and never assume which mode
`npm run scrape` will pick — §2 is how you find out before it costs five hours.

## 1. Back up first — the built-in backup is not one

Both scripts call `backupCatalog()` on start, which does
`DROP TABLE IF EXISTS players_catalog_backup` then copies `players_catalog` into
it. That is a useful undo for a bad parse, and nothing more:

- **one generation** — the next run drops it,
- **`players_catalog` only** — not `users`, `players`, `game_plans`, `game_plan_players`,
- **inside the same database** — so `database/schema.sql` takes it too, that file
  opens with `DROP DATABASE IF EXISTS ban_pick_efb`,
- **skipped entirely on a resume** (`if (!isResume) await backupCatalog()`), which
  is deliberate: re-copying half-mutated data over the pre-run snapshot would
  destroy the only copy of the original. It also means a resumed run has no
  in-DB backup at all.

So take a file dump, every time, before the scrape:

```bash
set -a; . ./.env; set +a                      # DB_* creds, never echo them
mkdir -p database/backups
OUT="database/backups/${DB_NAME}_$(date +%Y%m%d-%H%M%S).sql"
mysqldump -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} \
  --single-transaction --routines --triggers "$DB_NAME" > "$OUT"
tail -1 "$OUT"; ls -lh "$OUT"                 # expect "-- Dump completed"
gzip "$OUT"                                   # optional; ~40k rows compresses hard
```

`database/backups/` is gitignored — the dump contains user accounts and
password hashes, so **it must never be committed and must not be published or
attached anywhere**. (`-p"$PASSWORD"` is briefly visible in `ps` on a shared
machine; on a local dev box that is fine.)

Restore into an existing database — the dump has no `CREATE DATABASE`:

```bash
gunzip -c database/backups/<file>.sql.gz | mysql -h "$DB_HOST" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} "$DB_NAME"
```

**After restoring a dump, read §2 before scraping.** A restore that omits
`scrape_logs` makes the next `npm run scrape` a full one.

## 2. Which mode will run — check, do not guess

There is **no CLI flag**. `main()` in `scrape.js` reads `scrape_logs`:

```sql
SELECT max_pesdb_id, finished_at FROM scrape_logs
WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1;
```

- no such row, or its `max_pesdb_id` is NULL → **full**
- otherwise → **incremental**, with that id as the cutoff

**The decision reads `scrape_logs`, never `players_catalog`.** Both mismatches
happen for real:

| State | What runs | Why it matters |
| --- | --- | --- |
| catalog restored, `scrape_logs` empty | full (~5 h) | the data is already there; it re-fetches all of it |
| catalog truncated, `scrape_logs` intact | incremental | no page is fully known, so the stop rule never fires and it walks the whole site anyway, by id order |

Run this before scraping, and read `.scrape-state.json` in the same breath:

```bash
node --input-type=module -e '
import "dotenv/config"; import db from "#lib/db.js";
const [[c]] = await db.query("SELECT COUNT(*) AS n FROM players_catalog");
const [l] = await db.query("SELECT id, scrape_type, started_at, finished_at, players_upserted, max_pesdb_id FROM scrape_logs ORDER BY id DESC LIMIT 5");
console.log("catalog rows:", c.n); console.table(l); await db.end();'
cat .scrape-state.json    # {} = clean start; anything else = the next run RESUMES
```

Scale reference (2026-08-17): **41,902 catalog rows**; a healthy incremental adds
tens. A diff in the thousands means something is wrong — stop and read the log.

A row with `finished_at = NULL` is a run that died. It is **inert** (the query
above skips it) so it never forces a mode, but it is the record that a scrape was
interrupted; if `.scrape-state.json` is also non-empty, the next run resumes it.

## 3. Choosing the run

| The user wants | Command | Cost |
| --- | --- | --- |
| "what's new since last time" (the default) | `npm run scrape` | seconds when nothing is new; minutes for a normal batch |
| "we're missing players / there are gaps" | `npm run scrape:missing` | ~30 min of scanning **before** it enriches anything |
| a full rebuild, **explicitly asked for**, or a virgin DB | `npm run scrape` after §4 | **~5 hours** |

How the two incremental strategies differ, and why both exist:

- **`npm run scrape`** lists by `id` DESC (newest first) and checks each page
  against the DB, so it also catches cards added *retroactively* below the
  cutoff. It stops after 5 consecutive fully-known pages **once it is past the
  cutoff** — cheap, but a gap further back than that window survives it.
- **`npm run scrape:missing`** is what closes that gap: it collects **every** id
  on the site (~1,200 pages), diffs against `SELECT pesdb_id FROM
  players_catalog`, and enriches only the difference. It has **no resume state**
  — interrupting it restarts the whole scan.

Neither ever deletes: `upsertPlayers` is `INSERT … ON DUPLICATE KEY UPDATE`, so a
card removed from the site stays in the catalog.

## 4. Forcing a full scrape (only on an explicit request)

Append a sentinel log row — non-destructive, and it leaves the real cutoff
history intact:

```sql
INSERT INTO scrape_logs (scrape_type, finished_at, max_pesdb_id)
VALUES ('full', CURRENT_TIMESTAMP, NULL);
```

The next `npm run scrape` then sees a finished row with a NULL `max_pesdb_id` and
runs full. Confirm `.scrape-state.json` is `{}` first, or it resumes instead.
Once the real run finishes it writes its own log row, and the sentinel is just
history (delete it if it clutters the admin scrape panel).

Do **not** force full to fix missing players — that is what `scrape:missing` is
for, at a twentieth of the cost.

## 5. Running a job that outlives a tool call

A full scrape is ~5 hours; the foreground Bash timeout is 10 minutes. Always
background it and poll the log (`*.log` is gitignored):

```bash
npm run scrape > scrape-$(date +%Y%m%d-%H%M).log 2>&1 &     # run_in_background
tail -5 scrape-*.log                                        # progress bar + page number
```

Pacing is deliberate and **must not be raised**: one player start per 400 ms
globally (`pacePlayerRate` hands out slots to all 4 concurrent workers), 1.5 s
between list pages, exponential backoff on network errors, and 15–60 s waits on
HTTP 429. pesdb.net is someone else's server and it does rate-limit. If a run is
too slow, run it in the background and wait — do not turn the dials.

Interrupted? `.scrape-state.json` holds mode, page, row and running totals,
written after every batch. **Re-run the same command** — it prints
`RESUME  Resuming interrupted <mode> scrape…`. To abandon a resume instead, reset the
file to `{}` (and remember §1: no in-DB backup is taken on a resume).

## 6. After the run

```bash
SCRAPE_SHOW_LOGS=1 npm run scrape     # prints the last 5 runs after a (fast) incremental
```

- Compare the row count against §2's before-number; the delta should match
  `players_upserted`.
- Spot-check one new row for enrichment: `overall_max`, `card_type`, `region`,
  `foot`, `playing_style` should be populated, not NULL. All five come from the
  detail pages, and a site markup change breaks the parsers **silently** — the
  list-page columns (name, club, age, overall) keep working, so the run still
  reports success. If a whole batch comes back NULL, the parsers in
  `parseDetailLevel1` / `parsePlayingStyle` are what to check, not the network.
- `finished_at` on the newest log row is set.

## 7. Related edits

- Adding a column to `players_catalog` means: `database/schema.sql` (plus the
  commented `ALTER TABLE` block for existing DBs), the parser + the `upsertPlayers`
  column list in `scrape.js`, and `CATALOG_COLUMNS` in
  `src/features/players/catalogQuery.js`. See `database.md`.
- Both ingestion files run `main()` behind `isMainModule(import.meta.url)`, and
  must keep doing so — `scrapeMissing.js` *imports* from `scrape.js`, so without
  the guard an import would start a scrape. `ingestion` has no barrel on purpose.
- `console.log`/`console.table` are fine here: `debug-leftovers` only bans them
  in `public/js`.
