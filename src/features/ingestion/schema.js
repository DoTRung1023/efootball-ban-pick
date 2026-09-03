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
 * Adds the 'missing' enum member to a `scrape_logs` created before gap-repair
 * runs were logged. Same bargain as the other boot-time healers in this repo:
 * MySQL has no `ADD VALUE IF NOT EXISTS`, and an install that must find an
 * `ALTER` in `schema.sql` before `npm run scrape:missing` can record anything
 * is an install that is quietly broken. Runs on every scrape; does nothing on
 * all but one of them.
 */
export async function ensureScrapeLogSchema() {
  try {
    const [[col]] = await db.query(
      `SELECT COLUMN_TYPE AS type FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'scrape_logs'
         AND column_name = 'scrape_type'`,
    );
    if (col && !String(col.type).includes("'missing'")) {
      await db.query(
        `ALTER TABLE scrape_logs MODIFY scrape_type
         ENUM('full','incremental','missing') NOT NULL DEFAULT 'full'`,
      );
      console.log("scrape schema: added 'missing' to scrape_logs.scrape_type");
    }

    const [[failedCol]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'scrape_logs'
         AND column_name = 'failed'`,
    );
    if (!failedCol.cnt) {
      await db.query(
        "ALTER TABLE scrape_logs ADD COLUMN failed TINYINT(1) NOT NULL DEFAULT 0",
      );
      console.log("scrape schema: added scrape_logs.failed");
    }
  } catch (err) {
    /* A repair run that cannot widen the enum should still repair. It just
       will not be able to log itself, which `startLog` degrades to on its own. */
    console.error("scrape schema check skipped:", err.message);
  }
}
