import { Router } from "express";
import db from "../db.js";
import { asyncHandler, requireUserIdQuery, describeError } from "../lib/http.js";

const router = Router();

const MAX_PLANS_PER_USER = 20;
const LINEUP_SLOTS = 11;
const MAX_SLOT = 23;
const DEFAULT_FORMATION = "4-3-3";

const ALLOWED_FORMATIONS = new Set([
  "4-3-3", "4-4-2", "4-5-1", "3-6-1", "3-4-3", "3-5-2", "5-2-3", "5-3-2", "5-4-1",
]);

/** Slots 1–11 are the starting lineup; 12–23 are substitutes. */
const roleForSlot = (slot) => (slot <= LINEUP_SLOTS ? "LINEUP" : "SUB");

const isValidSlot = (slot) => slot >= 1 && slot <= MAX_SLOT;

/** Confirms the plan exists and belongs to the user. */
async function planIsOwnedBy(planId, userId) {
  const [[plan]] = await db.query(
    "SELECT id FROM game_plans WHERE id = ? AND user_id = ?",
    [planId, Number(userId)],
  );
  return Boolean(plan);
}

router.get("/", async (req, res) => {
  const userId = requireUserIdQuery(req, res, { plans: [] });
  if (!userId) return;

  try {
    const [plans] = await db.query(
      `SELECT gp.id, gp.name, gp.formation, gp.created_at,
              COALESCE(SUM(gpp.role = 'LINEUP'), 0) AS lineup_count,
              COALESCE(SUM(gpp.role = 'SUB'), 0)    AS sub_count
       FROM   game_plans gp
       LEFT JOIN game_plan_players gpp ON gpp.game_plan_id = gp.id
       WHERE  gp.user_id = ?
       GROUP  BY gp.id
       ORDER  BY gp.created_at ASC`,
      [userId],
    );
    res.json({ plans });
  } catch (err) {
    console.error("game-plans error:", describeError(err));
    res.status(503).json({ error: "Database unavailable", plans: [] });
  }
});

router.post("/", asyncHandler(async (req, res) => {
  const { userId, name } = req.body;
  if (!userId || !name?.trim()) {
    return res.status(400).json({ error: "userId and name required." });
  }

  try {
    const [[{ count }]] = await db.query(
      "SELECT COUNT(*) AS count FROM game_plans WHERE user_id = ?",
      [Number(userId)],
    );
    if (count >= MAX_PLANS_PER_USER) {
      return res.status(400).json({ error: `Maximum ${MAX_PLANS_PER_USER} game plans allowed.` });
    }

    const [result] = await db.query(
      "INSERT INTO game_plans (user_id, name, formation) VALUES (?, ?, ?)",
      [Number(userId), name.trim(), DEFAULT_FORMATION],
    );
    const [[plan]] = await db.query(
      `SELECT id, name, formation, created_at, 0 AS lineup_count, 0 AS sub_count
       FROM game_plans WHERE id = ?`,
      [result.insertId],
    );
    res.status(201).json({ plan });
  } catch (err) {
    console.error("create game-plan error:", describeError(err));
    res.status(500).json({ error: "Something went wrong." });
  }
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const planId = Number(req.params.id);
  const { userId, name, formation } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required." });

  const sets = [];
  const vals = [];

  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: "Name cannot be empty." });
    sets.push("name = ?");
    vals.push(String(name).trim());
  }

  if (formation !== undefined) {
    const f = formation === null || formation === "" ? DEFAULT_FORMATION : String(formation);
    if (!ALLOWED_FORMATIONS.has(f)) return res.status(400).json({ error: "Invalid formation." });
    sets.push("formation = ?");
    vals.push(f);
  }

  if (!sets.length) return res.status(400).json({ error: "Nothing to update." });

  vals.push(planId, Number(userId));

  try {
    const [result] = await db.query(
      `UPDATE game_plans SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
      vals,
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Plan not found." });
    res.json({ message: "Plan updated." });
  } catch (err) {
    console.error("update game-plan error:", describeError(err));
    res.status(500).json({ error: "Something went wrong." });
  }
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const planId = Number(req.params.id);
  const userId = requireUserIdQuery(req, res);
  if (!userId) return;

  try {
    const [result] = await db.query(
      "DELETE FROM game_plans WHERE id = ? AND user_id = ?",
      [planId, userId],
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Plan not found." });
    res.json({ message: "Plan deleted." });
  } catch (err) {
    console.error("delete game-plan error:", describeError(err));
    res.status(500).json({ error: "Something went wrong." });
  }
}));

router.get("/:id/players", asyncHandler(async (req, res) => {
  const planId = Number(req.params.id);
  const userId = requireUserIdQuery(req, res);
  if (!userId) return;

  try {
    const [rows] = await db.query(
      `SELECT gpp.slot, gpp.role,
              p.id AS player_id, p.name, p.position, p.overall, p.club, p.pesdb_id,
              c.overall_max
       FROM   game_plan_players gpp
       JOIN   players p     ON p.id   = gpp.player_id
       JOIN   game_plans gp ON gp.id  = gpp.game_plan_id
       LEFT JOIN players_catalog c ON c.pesdb_id = p.pesdb_id
       WHERE  gpp.game_plan_id = ? AND gp.user_id = ?
       ORDER  BY gpp.slot ASC`,
      [planId, userId],
    );
    res.json({ players: rows });
  } catch (err) {
    console.error("game-plan players error:", describeError(err));
    res.status(500).json({ error: "Something went wrong." });
  }
}));

/** Swaps the occupants of two slots, re-deriving each player's role from its new slot. */
router.put("/:id/swap", asyncHandler(async (req, res) => {
  const planId = Number(req.params.id);
  const { userId, slotA, slotB } = req.body;

  if (!userId) return res.status(400).json({ error: "userId required." });
  if (!isValidSlot(slotA) || !isValidSlot(slotB)) {
    return res.status(400).json({ error: `Invalid slot (1–${MAX_SLOT}).` });
  }

  try {
    if (!(await planIsOwnedBy(planId, userId))) {
      return res.status(404).json({ error: "Plan not found." });
    }

    const [rows] = await db.query(
      "SELECT slot, player_id FROM game_plan_players WHERE game_plan_id = ? AND slot IN (?, ?)",
      [planId, slotA, slotB],
    );
    const occupantOf = (slot) =>
      rows.find((r) => Number(r.slot) === Number(slot))?.player_id ?? null;
    const playerA = occupantOf(slotA);
    const playerB = occupantOf(slotB);

    // Clear both slots first so the unique (plan, slot) key can't collide mid-swap.
    await db.query(
      "DELETE FROM game_plan_players WHERE game_plan_id = ? AND slot IN (?, ?)",
      [planId, slotA, slotB],
    );

    const moves = [
      { playerId: playerB, slot: slotA },
      { playerId: playerA, slot: slotB },
    ].filter((m) => m.playerId !== null);

    for (const { playerId, slot } of moves) {
      await db.query(
        "INSERT INTO game_plan_players (game_plan_id, player_id, role, slot) VALUES (?, ?, ?, ?)",
        [planId, playerId, roleForSlot(slot), slot],
      );
    }

    res.json({ message: "Slots swapped." });
  } catch (err) {
    console.error("swap slots error:", describeError(err));
    res.status(500).json({ error: "Something went wrong." });
  }
}));

/** Assigns a player to a slot, or clears the slot when playerId is null. */
router.put("/:id/players/:slot", asyncHandler(async (req, res) => {
  const planId = Number(req.params.id);
  const slot = Number(req.params.slot);
  const { userId, playerId } = req.body;

  if (!userId) return res.status(400).json({ error: "userId required." });
  if (!isValidSlot(slot)) return res.status(400).json({ error: `Invalid slot (1–${MAX_SLOT}).` });

  try {
    if (!(await planIsOwnedBy(planId, userId))) {
      return res.status(404).json({ error: "Plan not found." });
    }

    if (playerId == null) {
      await db.query(
        "DELETE FROM game_plan_players WHERE game_plan_id = ? AND slot = ?",
        [planId, slot],
      );
    } else {
      await db.query(
        `INSERT INTO game_plan_players (game_plan_id, player_id, role, slot)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE player_id = VALUES(player_id), role = VALUES(role)`,
        [planId, Number(playerId), roleForSlot(slot), slot],
      );
    }
    res.json({ message: "Slot updated." });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Player is already in this game plan." });
    }
    console.error("update slot error:", describeError(err));
    res.status(500).json({ error: "Something went wrong." });
  }
}));

export default router;
