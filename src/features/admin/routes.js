import { Router } from "express";
import bcrypt from "bcryptjs";
import db from "#lib/db.js";
import { asyncHandler, describeError } from "#lib/http.js";
import { isActiveDraft, listActiveRooms, roomPhase } from "#features/rooms/index.js";
import {
  clearFailures,
  lockoutSeconds,
  mintAdminToken,
  recordFailure,
  requireAdmin,
} from "./adminSession.js";

const router = Router();

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

/** At least 1, at most MAX_LIMIT — a negative or NaN limit is a SQL error. */
const readLimit = (raw) => {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_LIMIT) : DEFAULT_LIMIT;
};

/** Reports the underlying error to the client — these routes are admin-only. */
function sendAdminError(res, err) {
  console.error("admin route error:", describeError(err));
  res.status(500).json({ error: describeError(err) });
}

// ── Opening a session ────────────────────────────────────────
// The one route in this router that is not behind `requireAdmin`: it is what
// hands out the token the others require.

router.post("/session", asyncHandler(async (req, res) => {
  const userId = Number(req.body?.userId);
  const password = String(req.body?.password || "");
  if (!userId || !password) {
    return res.status(400).json({ error: "Sign in again to open the console." });
  }

  try {
    const [[user]] = await db.query(
      "SELECT id, username, password, is_admin FROM users WHERE id = ?",
      [userId],
    );

    /* A non-admin is told the same thing as a missing account: whether a given
       user id is an admin is not something an unauthenticated caller learns. */
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: "This account does not have console access." });
    }

    const locked = lockoutSeconds(user.id);
    if (locked) {
      return res.status(429).json({
        error: `Too many attempts. Try again in ${Math.ceil(locked / 60)} min.`,
      });
    }

    if (!(await bcrypt.compare(password, user.password ?? ""))) {
      recordFailure(user.id);
      return res.status(401).json({ error: "Incorrect password." });
    }

    clearFailures(user.id);
    res.json({ token: mintAdminToken(user), username: user.username });
  } catch (err) {
    console.error("admin session error:", describeError(err));
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}));

/** Every route below needs a valid token. */
router.use(requireAdmin);

/** Silent re-auth on load: proves the stored token is still good. `userId` is
    what lets the USERS tab know which row is you, and refuse to demote it. */
router.get("/me", (req, res) => {
  res.json({ userId: req.admin.uid, username: req.admin.username, expiresAt: req.admin.exp });
});

// ── Dashboard data ───────────────────────────────────────────

router.get("/stats", asyncHandler(async (_req, res) => {
  try {
    const [
      [[catalogRow]],
      [[usersRow]],
      [[weekRow]],
      [[lastScrape]],
    ] = await Promise.all([
      db.query("SELECT COUNT(*) AS cnt FROM players_catalog"),
      db.query("SELECT COUNT(*) AS cnt FROM users"),
      db.query("SELECT COUNT(*) AS cnt FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"),
      db.query(
        `SELECT id, scrape_type, started_at, finished_at, players_upserted
         FROM scrape_logs ORDER BY id DESC LIMIT 1`,
      ),
    ]);

    const activeRooms = listActiveRooms();
    res.json({
      catalogCount: catalogRow.cnt,
      userCount: usersRow.cnt,
      newUsersThisWeek: weekRow.cnt,
      activeRoomCount: activeRooms.length,
      draftRoomCount: activeRooms.filter(([, entry]) => isActiveDraft(entry)).length,
      lastScrape: lastScrape || null,
    });
  } catch (err) {
    sendAdminError(res, err);
  }
}));

/** `idleSec` is time since the room's last heartbeat, not the room's age. */
router.get("/rooms", (_req, res) => {
  const now = Date.now();
  const rooms = listActiveRooms(now).map(([code, entry]) => ({
    code,
    host: entry.host?.username || null,
    guest: entry.guest?.username || null,
    phase: roomPhase(entry),
    idleSec: Math.floor((now - entry.updatedAt) / 1000),
  }));
  rooms.sort((a, b) => a.idleSec - b.idleSec);
  res.json({ rooms });
});

router.get("/scrape-logs", asyncHandler(async (req, res) => {
  try {
    const [logs] = await db.query(
      `SELECT id, scrape_type, started_at, finished_at, players_upserted
       FROM scrape_logs ORDER BY id DESC LIMIT ?`,
      [readLimit(req.query.limit)],
    );
    res.json({ logs });
  } catch (err) {
    sendAdminError(res, err);
  }
}));

router.get("/users", asyncHandler(async (req, res) => {
  try {
    const [users] = await db.query(
      `SELECT u.id, u.username, u.email, u.created_at, u.is_admin,
              COUNT(DISTINCT p.id) AS playerCount,
              COUNT(DISTINCT gp.id) AS planCount
       FROM users u
       LEFT JOIN players p ON p.user_id = u.id
       LEFT JOIN game_plans gp ON gp.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT ?`,
      [readLimit(req.query.limit)],
    );
    res.json({ users });
  } catch (err) {
    sendAdminError(res, err);
  }
}));

/**
 * Grants or removes console access.
 *
 * Two ways to lock everyone out, both refused here: demoting yourself (you are
 * standing on the page you would lose), and demoting the last admin left.
 */
router.patch("/users/:id/role", asyncHandler(async (req, res) => {
  const targetId = Number(req.params.id);
  const makeAdmin = Boolean(req.body?.isAdmin);
  if (!targetId) return res.status(400).json({ error: "Unknown user." });

  if (!makeAdmin && targetId === Number(req.admin.uid)) {
    return res.status(400).json({ error: "You cannot remove your own console access." });
  }

  try {
    if (!makeAdmin) {
      const [[{ cnt }]] = await db.query("SELECT COUNT(*) AS cnt FROM users WHERE is_admin = 1");
      if (cnt <= 1) {
        return res.status(400).json({ error: "The last admin cannot be removed." });
      }
    }

    const [result] = await db.query(
      "UPDATE users SET is_admin = ? WHERE id = ?",
      [makeAdmin ? 1 : 0, targetId],
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Unknown user." });

    res.json({ userId: targetId, isAdmin: makeAdmin });
  } catch (err) {
    sendAdminError(res, err);
  }
}));

router.get("/data-quality", asyncHandler(async (_req, res) => {
  try {
    const [
      [[{ total }]],
      [[{ missingStyle }]],
      [[{ missingRegion }]],
      [[{ missingOverallMax }]],
      [[{ dupCount }]],
    ] = await Promise.all([
      db.query("SELECT COUNT(*) AS total FROM players_catalog"),
      db.query("SELECT COUNT(*) AS missingStyle FROM players_catalog WHERE playing_style IS NULL OR playing_style = ''"),
      db.query("SELECT COUNT(*) AS missingRegion FROM players_catalog WHERE region IS NULL OR region = ''"),
      db.query("SELECT COUNT(*) AS missingOverallMax FROM players_catalog WHERE overall_max IS NULL"),
      db.query("SELECT COUNT(*) AS dupCount FROM (SELECT pesdb_id FROM players_catalog GROUP BY pesdb_id HAVING COUNT(*) > 1) t"),
    ]);

    res.json({ total, missingStyle, missingRegion, missingOverallMax, dupPesdbId: dupCount });
  } catch (err) {
    sendAdminError(res, err);
  }
}));

export default router;
