/**
 * Catalog filter builder.
 *
 * Pure — no database, no network — which is why this file can exist at all:
 * `catalogQuery.js` imports nothing, so the WHERE-clause rules can be asserted
 * without standing a MySQL up.
 *
 * The region case is a **regression test**. That filter was offered by every
 * panel and sent by every client while this builder silently dropped it, and
 * nothing failed — `?region=<anything>` just returned everybody. A test that
 * only checked "the builder runs" would still pass today with the bug back in,
 * so each of these asserts the emitted SQL and its bound parameters.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalogFilter, resolveSortOrder, DEFAULT_SORT, NOT_TEST } from "./catalogQuery.js";

test("excludes test rows unless asked", () => {
  assert.match(buildCatalogFilter({}).where, new RegExp(NOT_TEST));
  assert.doesNotMatch(buildCatalogFilter({}, { includeTest: true }).where, new RegExp(NOT_TEST));
});

test("region is applied — the filter that used to be dropped", () => {
  const { where, params } = buildCatalogFilter({ region: "Europe" });
  assert.match(where, /region = \?/);
  assert.ok(params.includes("Europe"));
});

test("region takes a comma-separated any-of, like league beside it", () => {
  const { where, params } = buildCatalogFilter({ region: "Europe,Asia-Oceania" });
  assert.match(where, /\(region = \? OR region = \?\)/);
  assert.deepEqual(params, ["Europe", "Asia-Oceania"]);
});

test("region and league are independent", () => {
  const { params } = buildCatalogFilter({ region: "Africa", league: "Serie A" });
  assert.deepEqual(params, ["Serie A", "Africa"]);
});

test("an absent filter contributes no clause and no parameter", () => {
  for (const empty of [undefined, "", null]) {
    assert.deepEqual(buildCatalogFilter({ region: empty }).params, []);
  }
});

test("name and club are substring matches, wrapped here not by the caller", () => {
  const { where, params } = buildCatalogFilter({ q: "Messi", club: "Inter" });
  assert.match(where, /name LIKE \?/);
  assert.deepEqual(params, ["%Messi%", "%Inter%"]);
});

test("overall_max bounds guard against NULL, which SQL comparison would drop", () => {
  const { where } = buildCatalogFilter({ maxOverallMin: 90 });
  assert.match(where, /overall_max IS NOT NULL AND overall_max >= \?/);
});

test("an unknown sort falls back to the default rather than injecting", () => {
  assert.equal(resolveSortOrder("'; DROP TABLE players_catalog; --"), resolveSortOrder(DEFAULT_SORT));
  assert.equal(resolveSortOrder(undefined), resolveSortOrder(DEFAULT_SORT));
});
