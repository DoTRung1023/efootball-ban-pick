/**
 * The demo pool — the highest-rated Epic/Highlight card per player name.
 *
 * Two callers with one requirement between them: `/api/top-players` fills a
 * board when a seat has no account behind it, and the rooms feature auto-bans
 * out of the same pool when such a seat's turn expires. If those two disagreed
 * the auto-ban would take somebody who is not on the board. Both go through
 * `readTopPlayers`, which is what keeps them the same list.
 *
 * ## Why there is a snapshot table
 *
 * `topCatalogPlayers` is not cheap. It anti-joins `players_catalog` against
 * itself on `name` to keep one card per player, over ~42k rows — **measured at
 * 293ms**, and the sign-in page ran it on every single page load. The snapshot
 * turns that into a thirty-row read of a primary key.
 *
 * The snapshot is refreshed **on demand from the console**, not on a timer: the
 * catalog only changes when a scrape runs, so anything automatic would either
 * lag a scrape or repeat work nothing asked for. An empty snapshot self-heals
 * on the first read, so a fresh database — or one that predates this table —
 * serves the right list without an admin having to know to press anything.
 */

import db from "#lib/db.js";

const EXCLUDED_TOP_PLAYER_IDS = [8554076, 8554053];
export const TOP_PLAYER_LIMIT = 30;

/**
 * Computes the pool from the catalog. The expensive path — prefer
 * `readTopPlayers`, which only lands here when the snapshot is empty.
 */
export async function topCatalogPlayers(limit = TOP_PLAYER_LIMIT) {
  const [rows] = await db.query(
    `SELECT p.pesdb_id AS id, p.name
     FROM players_catalog p
     LEFT JOIN players_catalog p2
       ON  p.name = p2.name
       AND p2.card_type IN ('Epic','Highlight')
       AND p2.pesdb_id NOT IN (?, ?)
       AND (p2.overall_max > p.overall_max
            OR (p2.overall_max = p.overall_max AND p2.pesdb_id > p.pesdb_id))
     WHERE p.card_type IN ('Epic','Highlight')
       AND p.pesdb_id NOT IN (?, ?)
       AND p2.pesdb_id IS NULL
     ORDER BY p.overall_max DESC, p.pesdb_id DESC
     LIMIT ?`,
    [...EXCLUDED_TOP_PLAYER_IDS, ...EXCLUDED_TOP_PLAYER_IDS, limit],
  );
  return rows.map((r) => ({ id: String(r.id), name: r.name }));
}

/* ============================================================
   The snapshot
   ============================================================ */

/** The index that makes the anti-join above cheap: 293ms → 43ms measured on
    ~42k rows. `name` carries no index of its own, and the join is entirely on
    it. MySQL has no `CREATE INDEX IF NOT EXISTS`, hence the catalogue check. */
const CATALOG_NAME_INDEX = "idx_catalog_name_overall";

/** Runs on every boot and does nothing on all but one of them — the same
    bargain as the other schema healers in this codebase. */
export async function ensureTopPlayersSchema() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS top_players_snapshot (
       rank_no      TINYINT UNSIGNED NOT NULL,
       pesdb_id     BIGINT UNSIGNED  NOT NULL,
       name         VARCHAR(100)     NOT NULL,
       refreshed_at TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (rank_no)
     ) ENGINE=InnoDB`,
  );

  const [[{ present }]] = await db.query(
    `SELECT COUNT(*) AS present FROM information_schema.STATISTICS
     WHERE table_schema = DATABASE() AND table_name = 'players_catalog'
       AND index_name = ?`,
    [CATALOG_NAME_INDEX],
  );
  if (!present) {
    await db.query(
      `CREATE INDEX ${CATALOG_NAME_INDEX} ON players_catalog (name, overall_max)`,
    );
  }
}

/* One in-flight rebuild at a time. Without this, a cold snapshot plus a burst
   of sign-in loads would each start their own 293ms query and then each write
   the same rows over the top of one another. */
let rebuilding = null;

/** Recomputes the pool and replaces the snapshot. Returns the new list. */
export async function refreshTopPlayers() {
  if (rebuilding) return rebuilding;

  rebuilding = (async () => {
    const players = await topCatalogPlayers();
    const conn = await db.getConnection();
    try {
      /* Replace, not upsert: a shorter new list has to shrink the table, or
         yesterday's ranks 31-40 would survive underneath today's top 30. */
      await conn.beginTransaction();
      await conn.query("DELETE FROM top_players_snapshot");
      if (players.length) {
        await conn.query(
          "INSERT INTO top_players_snapshot (rank_no, pesdb_id, name) VALUES ?",
          [players.map((p, i) => [i + 1, p.id, p.name])],
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return players;
  })().finally(() => { rebuilding = null; });

  return rebuilding;
}

/** Reads the snapshot as it stands. Empty array when nothing is stored — no
    side effects, so a status call cannot trigger a 293ms rebuild. */
async function storedTopPlayers() {
  const [rows] = await db.query(
    "SELECT pesdb_id AS id, name, refreshed_at FROM top_players_snapshot ORDER BY rank_no",
  );
  return rows;
}

/** What both callers use. A thirty-row primary-key read, or one rebuild. */
export async function readTopPlayers() {
  const rows = await storedTopPlayers();
  if (rows.length) return rows.map((r) => ({ id: String(r.id), name: r.name }));
  return refreshTopPlayers();
}

/**
 * For the console: what is stored, and when it was built.
 *
 * Carries the players themselves, not just a count. The panel exists to show an
 * admin which names are live right now, and a count alone left it printing
 * "Loading…" forever over a perfectly healthy snapshot. It is the same thirty
 * rows the sign-in page reads, so it costs nothing to include them.
 */
export async function topPlayersStatus() {
  const rows = await storedTopPlayers();
  return {
    count: rows.length,
    refreshedAt: rows.length ? new Date(rows[0].refreshed_at).toISOString() : null,
    limit: TOP_PLAYER_LIMIT,
    players: rows.map((r) => ({ id: String(r.id), name: r.name })),
  };
}
