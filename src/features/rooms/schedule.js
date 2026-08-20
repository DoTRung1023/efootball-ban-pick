/**
 * The turn schedule — whose turn it is, doing what, in order.
 *
 * **The server owns this, and publishes it on every snapshot.** It used to be
 * built on the client (`buildTurnSchedule` in `state.js`), which was fine only
 * while it was a two-entry constant: the server hardcoded the indices that
 * constant implied (`turnIndex = 0` at START, `= 1` on the ban→pick advance).
 * An alternating ban phase is `2 × banCountPerSide + 1` entries and the server
 * has to walk them, so the schedule has to be something it knows.
 *
 * The client only ever *reads* it — the same split as `ROOM_STATUS`, where the
 * server owns every transition and the client only compares.
 */

export const BAN_ORDER_SIMULTANEOUS = "simultaneous";
export const BAN_ORDER_ALTERNATING = "alternating";

const BAN_ORDERS = new Set([BAN_ORDER_SIMULTANEOUS, BAN_ORDER_ALTERNATING]);

export function normalizeBanOrder(raw) {
  const order = String(raw || "").trim().toLowerCase();
  return BAN_ORDERS.has(order) ? order : BAN_ORDER_SIMULTANEOUS;
}

const asCount = (raw) => Math.max(0, Math.floor(Number(raw) || 0));

/**
 * `[{ side, action }]`, front to back.
 *
 * - simultaneous — one `both` ban turn, then the `both` pick turn.
 * - alternating — one turn per ban, host first, then the pick turn.
 *
 * **Zero bans produces no ban turn at all**, so `turnIndex = 0` is the pick and
 * the draft opens straight into it. That used to be a client-side correction
 * (`draftSession.js` jumped the index while the server left it at 0), which is
 * exactly the kind of divergence moving this here removes.
 */
export function buildTurnSchedule(config) {
  const bans = asCount(config?.banCountPerSide);
  const turns = [];

  if (bans > 0) {
    if (normalizeBanOrder(config?.banOrder) === BAN_ORDER_ALTERNATING) {
      for (let i = 0; i < bans * 2; i += 1) {
        turns.push({ side: i % 2 === 0 ? "host" : "guest", action: "ban" });
      }
    } else {
      turns.push({ side: "both", action: "ban" });
    }
  }

  turns.push({ side: "both", action: "pick" });
  return turns;
}

/** The turn at an index, or `null` past the end. */
export const turnAt = (config, index) => buildTurnSchedule(config)[index] || null;

/** True while the turn at `index` belongs to one side alone. */
export function isSoloBanTurn(config, index) {
  const turn = turnAt(config, index);
  return Boolean(turn) && turn.action === "ban" && turn.side !== "both";
}
