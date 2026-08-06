import { Router } from "express";
import db from "#lib/db.js";
import { asyncHandler, requireUserIdQuery, describeError } from "#lib/http.js";
import {
  CATALOG_COLUMNS,
  DEFAULT_SORT,
  DISTINCT_FIELDS,
  FILTER_OPTION_COLUMNS,
  buildCatalogFilter,
  resolveSortOrder,
} from "./catalogQuery.js";

const router = Router();

/** Cards excluded from the featured list (duplicate/placeholder entries on pesdb). */
const EXCLUDED_TOP_PLAYER_IDS = [8554076, 8554053];
const TOP_PLAYER_LIMIT = 25;

/**
 * Top players: Epic/Highlight only, best card per name.
 * The self-join keeps the row with no better-ranked card of the same name.
 */
router.get("/top-players", async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.pesdb_id AS id, p.name
       FROM players_catalog p
       LEFT JOIN players_catalog p2
         ON  p.name = p2.name
         AND p2.card_type IN ('Epic','Highlight')
         AND p2.pesdb_id NOT IN (?, ?)
         AND (p2.overall_max > p.overall_max
              OR (p2.overall_max = p.overall_max AND p2.pesdb_id > p.pesdb_id))
       WHERE p.card_type IN ('Epic','Highlight')
         AND p.pesdb_id NOT IN (?, ?)
         AND p2.pesdb_id IS NULL
       ORDER BY p.overall_max DESC, p.pesdb_id DESC
       LIMIT ?`,
      [...EXCLUDED_TOP_PLAYER_IDS, ...EXCLUDED_TOP_PLAYER_IDS, TOP_PLAYER_LIMIT],
    );
    res.json({ players: rows.map((r) => ({ id: String(r.id), name: r.name })) });
  } catch {
    res.status(500).json({ players: [] });
  }
});

/** Distinct values for autocomplete inputs. */
router.get("/players/distinct", asyncHandler(async (req, res) => {
  const { field, q = "" } = req.query;
  if (!DISTINCT_FIELDS.includes(field)) {
    return res.status(400).json({ error: "Invalid field" });
  }
  const [rows] = await db.query(
    `SELECT DISTINCT ${field} FROM players_catalog
     WHERE ${field} IS NOT NULL AND ${field} != '' AND ${field} LIKE ?
     ORDER BY ${field} ASC LIMIT 10`,
    [`%${q}%`],
  );
  res.json(rows.map((r) => r[field]));
}));

/** Distinct values for the multiselect filters (Add Player catalog). */
router.get("/players/filter-options", async (_req, res) => {
  try {
    const entries = await Promise.all(
      FILTER_OPTION_COLUMNS.map(async (col) => {
        const [rows] = await db.query(
          `SELECT DISTINCT ${col} AS v FROM players_catalog
           WHERE ${col} IS NOT NULL AND TRIM(${col}) != ''
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

/** Catalog search for the Add Player modal. */
router.get("/players", async (req, res) => {
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

router.get("/my-players", async (req, res) => {
  const userId = requireUserIdQuery(req, res, { players: [] });
  if (!userId) return;

  try {
    const [rows] = await db.query(
      `SELECT p.id, p.name, p.position, p.overall, p.club, p.pesdb_id,
              c.league, c.nationality, c.height, c.weight, c.age,
              c.overall_max, c.card_type, c.region, c.foot, c.playing_style
       FROM   players p
       LEFT JOIN players_catalog c ON c.pesdb_id = p.pesdb_id
       WHERE  p.user_id = ?
       ORDER  BY p.overall DESC, p.name ASC`,
      [userId],
    );
    res.json({ players: rows });
  } catch (err) {
    console.error("my-players error:", describeError(err));
    res.status(503).json({ error: "Database unavailable", players: [] });
  }
});

router.post("/my-players", asyncHandler(async (req, res) => {
  const { userId, name, position, club, overall, pesdbId } = req.body;

  if (!userId || !name || !position) {
    return res.status(400).json({ error: "userId, name, and position are required." });
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

router.delete("/my-players", asyncHandler(async (req, res) => {
  const { userId, playerIds } = req.body;

  if (!userId || !Array.isArray(playerIds) || !playerIds.length) {
    return res.status(400).json({ error: "userId and playerIds[] required." });
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
