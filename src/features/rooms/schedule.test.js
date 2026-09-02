/**
 * Turn schedule.
 *
 * The server owns this and publishes it on the snapshot; the client derives
 * whose turn it is from what it is told rather than rebuilding it. So a bug
 * here is a bug in both browsers at once, which is what makes it worth pinning.
 *
 * The zero-ban case is the one with history: it used to be corrected on the
 * client, which jumped the turn index while the server left it at 0.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  BAN_ORDER_SIMULTANEOUS,
  BAN_ORDER_ALTERNATING,
  normalizeBanOrder,
  buildTurnSchedule,
  turnAt,
  isSoloBanTurn,
} from "./schedule.js";

test("an unknown ban order falls back to simultaneous", () => {
  assert.equal(normalizeBanOrder("nonsense"), BAN_ORDER_SIMULTANEOUS);
  assert.equal(normalizeBanOrder(undefined), BAN_ORDER_SIMULTANEOUS);
  assert.equal(normalizeBanOrder("ALTERNATING"), BAN_ORDER_ALTERNATING);
});

test("simultaneous is one shared ban turn then the pick", () => {
  assert.deepEqual(buildTurnSchedule({ banCountPerSide: 5 }), [
    { side: "both", action: "ban" },
    { side: "both", action: "pick" },
  ]);
});

test("alternating is one turn per ban, host first", () => {
  const turns = buildTurnSchedule({ banCountPerSide: 2, banOrder: BAN_ORDER_ALTERNATING });
  assert.deepEqual(turns.map((t) => t.side), ["host", "guest", "host", "guest", "both"]);
  assert.equal(turns.filter((t) => t.action === "ban").length, 4);
});

test("zero bans produces no ban turn, so index 0 is the pick", () => {
  for (const order of [BAN_ORDER_SIMULTANEOUS, BAN_ORDER_ALTERNATING]) {
    const turns = buildTurnSchedule({ banCountPerSide: 0, banOrder: order });
    assert.deepEqual(turns, [{ side: "both", action: "pick" }]);
    assert.equal(turnAt({ banCountPerSide: 0, banOrder: order }, 0).action, "pick");
  }
});

test("a missing or nonsense ban count is zero, not NaN turns", () => {
  assert.deepEqual(buildTurnSchedule({}), [{ side: "both", action: "pick" }]);
  assert.deepEqual(buildTurnSchedule({ banCountPerSide: -4 }), [{ side: "both", action: "pick" }]);
});

test("turnAt past the end is null rather than undefined", () => {
  assert.equal(turnAt({ banCountPerSide: 1 }, 99), null);
});

test("isSoloBanTurn is true only for a one-sided ban turn", () => {
  const alt = { banCountPerSide: 1, banOrder: BAN_ORDER_ALTERNATING };
  assert.equal(isSoloBanTurn(alt, 0), true);
  assert.equal(isSoloBanTurn(alt, 2), false, "the pick turn is not a solo ban");
  assert.equal(isSoloBanTurn({ banCountPerSide: 1 }, 0), false, "simultaneous bans are shared");
});
