/**
 * HTTP helpers.
 *
 * `requestBaseUrl` is here because it is the function behind a real deployment
 * failure mode: without `APP_BASE_URL`, a proxy that terminates TLS makes
 * `req.protocol` report `http`, and every confirmation link in every email goes
 * out pointing at a scheme the site does not serve.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { requestBaseUrl, duplicateUserField, describeError } from "./http.js";

const fakeReq = (protocol, host) => ({ protocol, get: () => host });

test("APP_BASE_URL wins over the request's own host", () => {
  const prev = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = "https://example.com";
  try {
    assert.equal(requestBaseUrl(fakeReq("http", "localhost:3000")), "https://example.com");
  } finally {
    if (prev === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = prev;
  }
});

test("a trailing slash is trimmed, so links never double up", () => {
  const prev = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = "https://example.com///";
  try {
    assert.equal(requestBaseUrl(fakeReq("http", "x")), "https://example.com");
  } finally {
    if (prev === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = prev;
  }
});

test("with nothing configured it falls back to the request", () => {
  const prev = process.env.APP_BASE_URL;
  delete process.env.APP_BASE_URL;
  try {
    assert.equal(requestBaseUrl(fakeReq("http", "localhost:3000")), "http://localhost:3000");
  } finally {
    if (prev !== undefined) process.env.APP_BASE_URL = prev;
  }
});

test("a duplicate key names the field the user has to change", () => {
  assert.equal(duplicateUserField({ message: "Duplicate entry for key 'uq_users_email'" }), "email");
  assert.equal(duplicateUserField({ message: "Duplicate entry for key 'users.username'" }), "username");
});

test("a mysql2 connection error describes itself by code, not as blank", () => {
  assert.equal(describeError({ code: "ECONNREFUSED", message: "" }), "ECONNREFUSED");
  assert.equal(describeError({ code: "ER_NO", message: "nope" }), "ER_NO: nope");
  assert.equal(describeError(null), "unknown error");
});
