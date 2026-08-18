/**
 * How many players each seat has to draft with.
 *
 * `store.js` is pure in-memory state and does not talk to the database; this is
 * the one place a room reads a squad, and it reads it from `players` — the same
 * table `/api/my-players` serves the ban and pick boards from.
 *
 * **An anonymous seat answers `null`, not 0.** Its id is `anon-<time>-<rand>`,
 * there is no account and so no squad to count, and the draft falls back to a
 * demo pool. Reporting 0 would block every room in the testing harness from
 * ever starting; `null` means "nothing to check here" and the start rule skips it.
 */

import db from "#lib/db.js";
import { describeError } from "#lib/http.js";

async function fetchSquadSize(participant) {
  const userId = Number(participant?.id);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  const [[row]] = await db.query(
    "SELECT COUNT(*) AS cnt FROM players WHERE user_id = ?",
    [userId],
  );
  return Number(row?.cnt ?? 0);
}

/**
 * Re-reads both seats and writes the sizes onto the entry.
 *
 * Called when a seat changes hands and again at START. It is deliberately not
 * on the presence path: that runs every 500 ms per client, and a squad only
 * changes when its owner edits it somewhere else — the count that has to be
 * right is the one taken as the draft begins, and START takes it fresh.
 */
export async function refreshSquadSizes(entry) {
  try {
    const [host, guest] = await Promise.all([
      fetchSquadSize(entry.host),
      fetchSquadSize(entry.guest),
    ]);
    if (entry.host) entry.host.playerCount = host;
    if (entry.guest) entry.guest.playerCount = guest;
    entry.squadSizesCheckedAt = Date.now();
    return { host, guest };
  } catch (err) {
    /* A database outage must not wedge the lobby. Unknown sizes read the same
       as an anonymous seat: the start rule has nothing to check. */
    console.error("squad size lookup failed:", describeError(err));
    return { host: entry.host?.playerCount ?? null, guest: entry.guest?.playerCount ?? null };
  }
}

/* How often a room in the lobby re-reads squads that nobody asked it to. Long
   enough to be nothing (one COUNT per room per interval), short enough that
   somebody who adds players in another tab sees the lobby unblock itself. */
const RECHECK_MS = 10000;

/**
 * Re-reads the squads if it has been a while.
 *
 * The seat-claim lookup happens once per join, so without this a player who
 * fixes a short squad in another tab would sit behind a banner that never
 * clears — the room has no other way to learn their roster changed.
 */
export function maybeRefreshSquadSizes(entry) {
  const now = Date.now();
  if (now - (entry.squadSizesCheckedAt || 0) < RECHECK_MS) return;
  entry.squadSizesCheckedAt = now;
  void refreshSquadSizes(entry);
}

/** The sizes already on the entry, without touching the database. */
export function cachedSquadSizes(entry) {
  return {
    host: entry.host?.playerCount ?? null,
    guest: entry.guest?.playerCount ?? null,
  };
}
