/**
 * Moving a room from one turn to the next, and what happens when a turn's clock
 * runs out.
 *
 * Separate from `routes.js` because two different paths need it — a ban write
 * ends its own turn, and the presence heartbeat is what notices an expired one
 * — and separate from `schedule.js` because that file is pure: it says what the
 * turns *are*, this one moves between them.
 */

import { buildTurnSchedule, isSoloBanTurn, turnAt } from "./schedule.js";
import {
  normalizeBanDurationSec,
  normalizePickDurationSec,
  turnDeadline,
} from "./config.js";
import { topBannableFrom } from "./squads.js";

/** Moves the room onto its pick turn and clears everything the ban phase held. */
export function enterPickTurn(entry) {
  const schedule = buildTurnSchedule(entry.config);
  const pickIdx = schedule.findIndex((t) => t.action === "pick");
  entry.turnIndex = pickIdx < 0 ? 0 : pickIdx;
  entry.turnEndsAt = turnDeadline(normalizePickDurationSec(entry.config?.pickDurationSec));
  entry.bansConfirmed = { host: false, guest: false };
  entry.stagedBans = { host: [], guest: [] };
}

/**
 * In an alternating ban phase a ban **is** the turn, so placing one ends it.
 *
 * Simultaneous rooms never reach the body of this: their single ban turn is
 * `side: "both"` and ends on both sides confirming, in `/ban-confirm`.
 */
export function advanceBanTurnIfSolo(entry) {
  if (!isSoloBanTurn(entry.config, entry.turnIndex)) return;

  const schedule = buildTurnSchedule(entry.config);
  const nextIdx = entry.turnIndex + 1;
  const next = schedule[nextIdx];

  if (!next || next.action === "pick") {
    enterPickTurn(entry);
    return;
  }
  entry.turnIndex = nextIdx;
  entry.turnEndsAt = turnDeadline(normalizeBanDurationSec(entry.config?.banDurationSec));
}

/**
 * An alternating ban turn whose clock has run out: ban the top player left in
 * the opponent's squad, and hand over.
 *
 * **Resolved on read, because there are no server-side timers.** The app is
 * polling-only with no WebSocket, and presence deliberately has no TTL, so
 * nothing on this side is scheduled to fire — the next heartbeat from either
 * client is what notices. Both poll every 500 ms, so that is the worst-case
 * delay, and it does not matter which of them triggers it: the write lands on
 * the entry and both read it from the snapshot.
 *
 * `resolving` is a plain flag rather than a lock because the work is one `await`
 * and the alternative is two heartbeats 20 ms apart auto-banning two players for
 * one expired turn.
 */
export function maybeResolveExpiredBanTurn(entry) {
  if (entry.resolvingBanTurn) return;
  if (!isSoloBanTurn(entry.config, entry.turnIndex)) return;
  // `null` is the unlimited sentinel's deadline: nothing to expire.
  if (entry.turnEndsAt == null || Date.now() < entry.turnEndsAt) return;

  entry.resolvingBanTurn = true;
  void resolveExpiredBanTurn(entry).finally(() => { entry.resolvingBanTurn = false; });
}

async function resolveExpiredBanTurn(entry) {
  const side = turnAt(entry.config, entry.turnIndex)?.side;
  if (side !== "host" && side !== "guest") return;

  const victim = side === "host" ? "guest" : "host";
  const already = (entry.bans?.[side] || []).map((b) => String(b.id));
  const player = await topBannableFrom(entry[victim], already);

  /* The turn is checked again: it is one `await` later, and the player whose
     clock it was may have got their ban in first. */
  if (!isSoloBanTurn(entry.config, entry.turnIndex)
      || turnAt(entry.config, entry.turnIndex)?.side !== side) return;

  if (player) {
    entry.bans[side].push({ id: String(player.id), name: String(player.name || "") });
    entry.bannedPlayerIds.push(String(player.id));
  }
  /* Nothing left to take, or the lookup failed: the turn still has to move or
     the draft deadlocks on a clock that has already expired. */

  advanceBanTurnIfSolo(entry);
  entry.updatedAt = Date.now();
}
