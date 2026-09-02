/**
 * Room config normalisation.
 *
 * The rule under test is the one CLAUDE.md flags as a standing hazard: **`0`
 * means unlimited**, and it is the one value that must escape the clamp. It has
 * to be caught before the `|| DEFAULT`, which reads `0` as "absent" and hands
 * back 120 seconds — turning "no timer" into a two-minute timer, on a live
 * draft, silently.
 *
 * There is a second copy of this logic in `public/js/features/draft/state.js`
 * that no test can reach from here, because it runs in the browser and there is
 * no bundler. These tests pin the server half; the client half stays a review
 * question.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  UNLIMITED_DURATION_SEC,
  DEFAULT_BAN_DURATION_SECONDS,
  MIN_BAN_DURATION_SECONDS,
  MAX_BAN_DURATION_SECONDS,
  MAX_PICK_DURATION_SECONDS,
  REVEAL_MODE_INSTANT,
  REVEAL_MODE_HIDDEN,
  isUnlimitedDuration,
  normalizeBanDurationSec,
  normalizePickDurationSec,
  normalizeRevealMode,
  turnDeadline,
} from "./config.js";

test("0 survives as unlimited instead of becoming the default", () => {
  assert.equal(normalizeBanDurationSec(0), UNLIMITED_DURATION_SEC);
  assert.equal(normalizeBanDurationSec("0"), UNLIMITED_DURATION_SEC);
  assert.equal(normalizePickDurationSec(0), UNLIMITED_DURATION_SEC);
});

test("absent is not unlimited — the distinction the `||` erases", () => {
  for (const absent of [undefined, null, "", "   ", "abc", {}]) {
    assert.equal(isUnlimitedDuration(absent), false, `${JSON.stringify(absent)} must not read as unlimited`);
  }
  assert.equal(normalizeBanDurationSec(undefined), DEFAULT_BAN_DURATION_SECONDS);
  assert.equal(normalizeBanDurationSec(""), DEFAULT_BAN_DURATION_SECONDS);
});

test("everything else is clamped to its rung", () => {
  assert.equal(normalizeBanDurationSec(1), MIN_BAN_DURATION_SECONDS);
  assert.equal(normalizeBanDurationSec(99999), MAX_BAN_DURATION_SECONDS);
  assert.equal(normalizePickDurationSec(99999), MAX_PICK_DURATION_SECONDS);
  assert.equal(normalizeBanDurationSec(45.9), 45);
});

test("unlimited means no deadline, not a deadline far away", () => {
  assert.equal(turnDeadline(0), null);
  assert.ok(turnDeadline(60) > Date.now());
});

test("an unknown reveal mode falls back to instant, never to a masked board", () => {
  assert.equal(normalizeRevealMode("nonsense"), REVEAL_MODE_INSTANT);
  assert.equal(normalizeRevealMode(undefined), REVEAL_MODE_INSTANT);
  assert.equal(normalizeRevealMode("HIDDEN"), REVEAL_MODE_HIDDEN);
});
