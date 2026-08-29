/**
 * Test cards — catalog rows an admin has marked as not-real.
 *
 * pesdb.net carries a handful of placeholder entries (116-rated goalkeepers on
 * blank art, that sort of thing). They are legitimate rows of the catalog and
 * the scrape has no way to tell them apart, so the judgement is an admin's and
 * it is stored beside the card rather than hardcoded in a list somewhere.
 *
 * Marked cards are hidden from the **catalog search a user sees** — the Add
 * Player modal, and the autocomplete and filter options that read the same
 * table. They are not hidden from:
 *
 *   - the console's CATALOG and TEST CARDS tabs, which is where an admin has to
 *     be able to see them to mark them at all;
 *   - the sign-in page's list, if an admin deliberately puts one there. Marking
 *     a card as test says "do not offer this to a user picking a squad", not
 *     "pretend it does not exist";
 *   - a squad that already holds one. Marking is not a delete, and reaching
 *     into somebody's saved squad because an admin tidied the catalog is a
 *     bigger action than the one being asked for.
 *
 * The automatic top-30 rebuild does skip them — see `topCatalogPlayers`.
 */

import db from "#lib/db.js";
import { describeError } from "#lib/http.js";

/**
 * The two cards this codebase already knew about, seeded once so an existing
 * database arrives with them marked rather than with an empty list and no clue
 * what the tab is for. Only on the boot that creates the column: after that the
 * flag is the admin's, and re-seeding would undo an unmark on every restart.
 */
const SEED_TEST_IDS = [8554053, 8554076];

/**
 * Adds `players_catalog.is_test` to a database created before test cards
 * existed. MySQL has no `ADD COLUMN IF NOT EXISTS`, so the column is looked up
 * first; this runs on every boot and is a no-op on all but one of them — the
 * same bargain as the other schema healers in this codebase.
 */
export async function ensureTestPlayerColumn() {
  try {
    await ensureTestPlayerColumnOrThrow();
  } catch (err) {
    /* Swallowed like the other boot tasks — an unreachable database must not
       take the server down with it. See `ensureAuthSchema`. */
    console.error("test-player column check skipped:", describeError(err));
  }
}

async function ensureTestPlayerColumnOrThrow() {
  const [[{ cnt }]] = await db.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'players_catalog'
       AND column_name = 'is_test'`,
  );
  if (cnt) return;

  await db.query(
    `ALTER TABLE players_catalog
       ADD COLUMN is_test TINYINT(1) NOT NULL DEFAULT 0 AFTER playing_style`,
  );
  const [res] = await db.query(
    `UPDATE players_catalog SET is_test = 1 WHERE pesdb_id IN (?, ?)`,
    SEED_TEST_IDS,
  );
  console.log(`players: added players_catalog.is_test, seeded ${res.affectedRows}`);
}

/** Every marked card, for the console's right-hand list. */
export async function readTestPlayers() {
  const [rows] = await db.query(
    `SELECT pesdb_id AS id, name
     FROM   players_catalog
     WHERE  is_test = 1
     ORDER  BY name ASC, pesdb_id ASC`,
  );
  return rows.map((r) => ({ id: String(r.id), name: r.name }));
}

/**
 * Marks or unmarks one card.
 *
 * Returns `false` for an id the catalog does not have, so a stale grid cannot
 * quietly write nothing and be told it worked.
 */
export async function setTestPlayer(id, isTest) {
  const pesdbId = Number(id);
  if (!Number.isFinite(pesdbId)) return false;
  const [res] = await db.query(
    `UPDATE players_catalog SET is_test = ? WHERE pesdb_id = ?`,
    [isTest ? 1 : 0, pesdbId],
  );
  return res.affectedRows > 0;
}
