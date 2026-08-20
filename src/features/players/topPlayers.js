/**
 * The demo pool — the highest-rated Epic/Highlight card per player name.
 *
 * Two callers with one requirement between them: `/api/top-players` fills a
 * board when a seat has no account behind it, and the rooms feature auto-bans
 * out of the same pool when such a seat's turn expires. If those two disagreed
 * the auto-ban would take somebody who is not on the board.
 */

import db from "#lib/db.js";

const EXCLUDED_TOP_PLAYER_IDS = [8554076, 8554053];
export const TOP_PLAYER_LIMIT = 25;

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
