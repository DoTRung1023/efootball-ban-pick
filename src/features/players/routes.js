import { Router } from "express";
import db from "#lib/db.js";
import { asyncHandler, describeError } from "#lib/http.js";
import { requireSession } from "#features/auth/index.js";
import { catalogLimiter } from "#lib/rateLimit.js";
import {
  CATALOG_COLUMNS,
  DEFAULT_SORT,
  DISTINCT_FIELDS,
  FILTER_OPTION_COLUMNS,
  NOT_TEST,
  buildCatalogFilter,
  resolveSortOrder,
} from "./catalogQuery.js";
import { readTopPlayers } from "./topPlayers.js";
import { readSquad } from "./squad.js";

const router = Router();

/**
 * The demo pool for a seat with no account behind it. The query moved to
 * `topPlayers.js` because the rooms feature auto-bans out of the same pool and
 * the two must not drift — see the note there.
 */
router.get("/top-players", catalogLimiter, async (_req, res) => {
  try {
    res.json({ players: await readTopPlayers() });
  } catch {
    res.status(500).json({ players: [] });
  }
});

/** Distinct values for autocomplete inputs. */
router.get("/players/distinct", catalogLimiter, asyncHandler(async (req, res) => {
  const { field, q = "" } = req.query;
  if (!DISTINCT_FIELDS.includes(field)) {
    return res.status(400).json({ error: "Invalid field" });
  }
  /* `NOT_TEST` here as well as on the search itself: without it a placeholder
     card's club still autocompletes, which offers the user a filter that then
     matches nothing. */
  const [rows] = await db.query(
    `SELECT DISTINCT ${field} FROM players_catalog
     WHERE ${NOT_TEST} AND ${field} IS NOT NULL AND ${field} != '' AND ${field} LIKE ?
     ORDER BY ${field} ASC LIMIT 10`,
    [`%${q}%`],
  );
  res.json(rows.map((r) => r[field]));
}));

/** Distinct values for the multiselect filters (Add Player catalog). */
router.get("/players/filter-options", catalogLimiter, async (_req, res) => {
  try {
    const entries = await Promise.all(
      FILTER_OPTION_COLUMNS.map(async (col) => {
        const [rows] = await db.query(
          `SELECT DISTINCT ${col} AS v FROM players_catalog
           WHERE ${NOT_TEST} AND ${col} IS NOT NULL AND TRIM(${col}) != ''
           ORDER BY ${col} ASC LIMIT 500`,
        );
        return [col, rows.map((r) => r.v).filter(Boolean)];
      }),
    );
    res.json(Object.fromEntries(entries));
  } catch (err) {
    console.error("filter-options error:", describeError(err));
    res.status(503).json(Object.fromEntries(FILTER_OPTION_COLUMNS.map((col) => [col, []])));
  }
});

/**
 * Catalog search for the Add Player modal.
 *
 * Cards marked as test data are absent, and there is no query parameter that
 * brings them back — the console has its own route for that, behind the admin
 * token. See `testPlayers.js` for what marking does and does not do.
 */
router.get("/players", catalogLimiter, async (req, res) => {
  try {
    const { sortBy = DEFAULT_SORT, limit = 50, offset = 0 } = req.query;
    const { where, params } = buildCatalogFilter(req.query);

    const [rows] = await db.query(
      `SELECT ${CATALOG_COLUMNS}
       FROM   players_catalog
       ${where}
       ORDER  BY ${resolveSortOrder(sortBy)}
       LIMIT  ? OFFSET ?`,
      [...params, Number(limit), Number(offset)],
    );

    res.json({ players: rows });
  } catch (err) {
    console.error("players db error:", describeError(err));
    res.status(503).json({ error: "Database unavailable", players: [] });
  }
});

// ── My Squad ────────────────────────────────────────────────

/**
 * Your squad — and only ever yours.
 *
 * This route used to take `?userId=`, which is how the ban phase read the
 * opponent's collection and also how anybody could read anybody's. The draft
 * asks `rooms` for that now, where holding the other seat is checked; here the
 * id comes from the session cookie and there is no parameter to point
 * somewhere else.
 */
router.get("/my-players", requireSession, async (req, res) => {
  try {
    res.json({ players: await readSquad(req.userId) });
  } catch (err) {
    console.error("my-players error:", describeError(err));
    res.status(503).json({ error: "Database unavailable", players: [] });
  }
});

router.post("/my-players", requireSession, asyncHandler(async (req, res) => {
  const { name, position, club, overall, pesdbId } = req.body;
  const userId = req.userId;

  if (!name || !position) {
    return res.status(400).json({ error: "name and position are required." });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO players (user_id, name, position, club, overall, pesdb_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [Number(userId), name.trim(), position, club || null, overall || null, pesdbId || null],
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Player is already in your squad." });
    }
    console.error("add player error:", describeError(err));
    res.status(500).json({ error: "Something went wrong." });
  }
}));

router.delete("/my-players", requireSession, asyncHandler(async (req, res) => {
  const { playerIds } = req.body;
  const userId = req.userId;

  if (!Array.isArray(playerIds) || !playerIds.length) {
    return res.status(400).json({ error: "playerIds[] required." });
  }

  try {
    const placeholders = playerIds.map(() => "?").join(",");
    await db.query(
      `DELETE FROM players WHERE user_id = ? AND id IN (${placeholders})`,
      [Number(userId), ...playerIds],
    );
    res.json({ message: "Removed." });
  } catch (err) {
    console.error("delete player error:", describeError(err));
    res.status(500).json({ error: "Something went wrong." });
  }
}));

export default router;
