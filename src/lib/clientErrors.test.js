/**
 * Client error reporting.
 *
 * This endpoint is unauthenticated and writes attacker-controllable text into
 * the log a human reads to find out what broke. That makes two properties worth
 * pinning rather than trusting: **one report is exactly one line**, and every
 * field is bounded. A stack arrives full of newlines, and a log reader splits on
 * newlines — so without the collapsing below, whoever posts gets to choose how
 * many entries appear and what they say, including a convincing forgery of a
 * line this app writes itself.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { handleClientError } from "./clientErrors.js";

/** Runs the handler and returns what it logged and what it answered. */
function report(body, identity = {}) {
  const lines = [];
  const original = console.error;
  console.error = (...args) => lines.push(args.join(" "));
  let status = null;
  const res = { status(s) { status = s; return this; }, end() {} };
  try {
    handleClientError({ body, ...identity }, res);
  } finally {
    console.error = original;
  }
  return { lines, status, line: lines.join("\n") };
}

test("answers 204 and logs one line", () => {
  const { status, lines } = report({ message: "boom", stack: "at a\nat b" });
  assert.equal(status, 204);
  assert.equal(lines.length, 1);
});

test("a newline in the payload cannot forge a second log line", () => {
  /* No arrow anywhere in this string on purpose. An earlier version of this
     test forged a line that already contained one, which made the "newline
     became an arrow" assertion below pass whether or not the code did it. */
  const forged = "ok\naudit: admin 1 PATCH /api/admin/users/9/master (designate a master)";
  const { line } = report({ message: forged });
  assert.equal(line.split("\n").length, 1, "must stay one line");
  assert.doesNotMatch(line, /^audit:/m, "must not begin a line of its own");
  assert.match(line, /ok → audit:/, "the break is marked, not silently closed up");
});

test("a stack's newlines are marked too, not just collapsed to spaces", () => {
  const { line } = report({ message: "x", stack: "at a (f.js:1)\nat b (g.js:2)" });
  assert.match(line, /at a \(f\.js:1\) → at b \(g\.js:2\)/);
});

test("every field is bounded", () => {
  const { line } = report({
    kind: "K".repeat(500), message: "M".repeat(5000),
    stack: "S".repeat(9000), url: "U".repeat(5000),
  });
  assert.ok(line.length < 2600, `one report must stay bounded, got ${line.length}`);
});

test("interpolated fields are quoted, so text cannot impersonate structure", () => {
  const { line } = report({ message: 'x", "injected": "', url: "/room/AB" });
  assert.match(line, /at "\/room\/AB"/);
});

test("identity comes from the request, never from the body", () => {
  const asUser = report({ message: "x", userId: 999 }, { userId: 7, identityId: "anon-1" });
  assert.match(asUser.line, /user 7/);
  assert.doesNotMatch(asUser.line, /999/);

  const asVisitor = report({ message: "x" }, { userId: null, identityId: "anon-1" });
  assert.match(asVisitor.line, /visitor anon-1/);
});

test("an absent or hostile body still answers 204 rather than throwing", () => {
  for (const body of [undefined, null, {}, { message: { toString() { throw new Error("nope"); } } }]) {
    assert.equal(report(body).status, 204);
  }
});

test("an empty message is named rather than logged blank", () => {
  assert.match(report({}).line, /\(no message\)/);
});
