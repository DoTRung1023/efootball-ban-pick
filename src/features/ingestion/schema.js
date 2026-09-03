/**
 * `scrape_logs`, brought up to date on a database that predates a column.
 *
 * **This lives apart from `scrape.js` because the web server needs it and
 * cannot afford that file.** The console SELECTs every column of this table, so
 * a database missing one answers `Unknown column 'failed' in 'field list'` and
 * the whole OVERVIEW tab fails to load — which is exactly what happened when
 * `failed` was added and only the scraper knew how to create it. The healer
 * therefore has to run at boot, and importing `scrape.js` to get it would pull
 * cheerio and the whole scraper into the web process for one ALTER.
 *
 * Imported by `server.js` at boot through the ingestion barrel, and by both
 * scrape scripts directly, so a run from a terminal heals the same way.
 */

import db from "#lib/db.js";

/**
 * One migration, guarded on its own.
 *
 * **Each step gets its own try, and that is the point.** They were in one
 * block, which meant a failure in the first — an `ALTER` a given engine will
 * not take — swallowed the second as well, so the column the console needs
 * would never appear and the only trace would be a log line. They are
 * unrelated changes to the same table; one being impossible here says nothing
 * about the other.
 */
async function step(what, needed, apply) {
  try {
    if (!(await needed())) return;
    await apply();
    console.log(`scrape schema: added ${what}`);
  } catch (err) {
    /* Never fatal. A scrape that cannot widen the enum should still scrape, and
       a server that cannot add a column should still boot and say why. */
    console.error(`scrape schema: could not add ${what} — ${err.message}`);
  }
}

/**
 * Brings `scrape_logs` up to date on a database created before either change.
 *
 * MySQL has no `ADD COLUMN IF NOT EXISTS` and no `ADD VALUE IF NOT EXISTS`, so
 * each step asks `information_schema` first. Runs at server boot and at the
 * start of every scrape; does nothing on all but the one boot that needs it.
 */
export async function ensureScrapeLogSchema() {
  await step(
    "'missing' to scrape_logs.scrape_type",
    async () => {
      const [[col]] = await db.query(
        `SELECT COLUMN_TYPE AS type FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'scrape_logs'
           AND column_name = 'scrape_type'`,
      );
      return col && !String(col.type).includes("'missing'");
    },
    () => db.query(
      `ALTER TABLE scrape_logs MODIFY scrape_type
       ENUM('full','incremental','missing') NOT NULL DEFAULT 'full'`,
    ),
  );

  await step(
    "the scrape_logs.failed column",
    async () => {
      const [[row]] = await db.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'scrape_logs'
           AND column_name = 'failed'`,
      );
      return !row.cnt;
    },
    () => db.query("ALTER TABLE scrape_logs ADD COLUMN failed TINYINT(1) NOT NULL DEFAULT 0"),
  );
}
