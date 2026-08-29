/**
 * One account's squad, as the boards draw it.
 *
 * Its own module because there are two callers and they must not drift: the
 * owner reading their own squad (`GET /api/my-players`) and the *opponent*
 * reading it during a ban phase, through the rooms feature — a ban is chosen
 * out of the other side's collection, so that read is the point of the phase.
 *
 * The difference is who is allowed to ask, and that is deliberately not decided
 * here. `/api/my-players` answers for the signed-in account and nobody else;
 * `GET /api/rooms/:code/opponent-squad` answers for whoever holds the other
 * seat in that room. The query is the same either way, which is why it is
 * written once.
 */

import db from "#lib/db.js";

export async function readSquad(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return [];
  const [rows] = await db.query(
    `SELECT p.id, p.name, p.position, p.overall, p.club, p.pesdb_id,
            c.league, c.nationality, c.height, c.weight, c.age,
            c.overall_max, c.card_type, c.region, c.foot, c.playing_style
     FROM   players p
     LEFT JOIN players_catalog c ON c.pesdb_id = p.pesdb_id
     WHERE  p.user_id = ?
     ORDER  BY p.overall DESC, p.name ASC`,
    [id],
  );
  return rows;
}
