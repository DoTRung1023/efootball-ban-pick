import { Router } from "express";
import db from "#lib/db.js";
import { asyncHandler, describeError, requireAdminKey } from "#lib/http.js";
import { isActiveDraft, listActiveRooms, roomPhase } from "#features/rooms/index.js";

const router = Router();

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

/** Admin key is required for every route in this router. */
router.use(requireAdminKey);

const readLimit = (raw) => Math.min(Number(raw) || DEFAULT_LIMIT, MAX_LIMIT);

/** Reports the underlying error to the client — these routes are admin-only. */
function sendAdminError(res, err) {
  console.error("admin route error:", describeError(err));
  res.status(500).json({ error: describeError(err) });
}

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

router.get("/rooms", (_req, res) => {
  const now = Date.now();
  const rooms = listActiveRooms(now).map(([code, entry]) => ({
    code,
    host: entry.host?.username || null,
    guest: entry.guest?.username || null,
    phase: roomPhase(entry),
    ageSec: Math.floor((now - entry.updatedAt) / 1000),
    startedAt: entry.updatedAt,
  }));
  rooms.sort((a, b) => a.ageSec - b.ageSec);
  res.json({ rooms });
});

router.get("/scrape-logs", asyncHandler(async (req, res) => {
  try {
    const [logs] = await db.query(
      `SELECT id, scrape_type, started_at, finished_at, players_upserted, max_pesdb_id
       FROM scrape_logs ORDER BY id DESC LIMIT ?`,
      [readLimit(req.query.limit)],
    );
    res.json({ logs });
  } catch (err) {
    sendAdminError(res, err);
  }
}));

router.get("/recent-users", asyncHandler(async (req, res) => {
  try {
    const [users] = await db.query(
      `SELECT u.id, u.username, u.email, u.created_at,
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
