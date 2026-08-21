import { Router } from "express";
import bcrypt from "bcryptjs";
import db from "#lib/db.js";
import { asyncHandler, describeError } from "#lib/http.js";
import {
  findRoomEntry,
  isActiveDraft,
  isValidRoomCode,
  listActiveRooms,
  normalizeRoomCodeParam,
  roomPhase,
  serializeRoomEntry,
} from "#features/rooms/index.js";
import { SCRAPE_MODES, scrapeStatus, startScrape, stopScrape } from "./scrapeRunner.js";
import {
  clearFailures,
  consolePasswordMatches,
  lockoutSeconds,
  mintAdminToken,
  recordFailure,
  requireAdmin,
  usesConsolePassword,
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
      "SELECT id, username, password, is_admin, is_master_admin FROM users WHERE id = ?",
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

    /* One shared console password when `ADMIN_CONSOLE_PASSWORD` is set,
       otherwise this account's own — see the note in `adminSession.js`. The
       lockout counts either kind of failure and is keyed by account, so the
       shared password does not turn into a shared five attempts. */
    const ok = usesConsolePassword()
      ? consolePasswordMatches(password)
      : await bcrypt.compare(password, user.password ?? "");
    if (!ok) {
      recordFailure(user.id);
      return res.status(401).json({
        error: usesConsolePassword() ? "Incorrect console password." : "Incorrect password.",
      });
    }

    clearFailures(user.id);
    res.json({
      token: mintAdminToken(user),
      username: user.username,
      isMaster: Boolean(user.is_master_admin),
    });
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
  res.json({
    userId: req.admin.uid,
    username: req.admin.username,
    isMaster: Boolean(req.admin.mst),
    expiresAt: req.admin.exp,
  });
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

/**
 * One room in full — what the ROOMS tab's detail panel renders.
 *
 * **The console inspects a room from here rather than by opening `/room/<code>`.**
 * That page has exactly two seats and claims one on load, so the old WATCH link
 * into it was answered with 409 "Room already has an active host" — and on a
 * room with an empty guest seat it would have done something worse than fail,
 * by seating the admin in a chair a player was about to sit in. Nothing on this
 * route writes.
 *
 * Unlike `GET /rooms` it does **not** hide a room that has gone quiet: that
 * list is a dashboard and quiet means uninteresting, but this is an
 * inspection, and a room nobody has beaten in two minutes is exactly the one an
 * admin has clicked through to look at. Only `closed` and never-existed are
 * 404s here.
 *
 * The body is the same `serializeRoomEntry` the players' own snapshot uses,
 * plus the three fields only a dashboard wants. Re-serializing it here would be
 * a second copy of twenty fields to keep in step with the first.
 */
router.get("/rooms/:code", (req, res) => {
  const code = normalizeRoomCodeParam(req.params.code);
  const entry = isValidRoomCode(code) ? findRoomEntry(code) : null;
  if (!entry) {
    return res.status(404).json({ error: "That room is not in memory — it ended, or the server restarted." });
  }
  res.json({
    room: {
      ...serializeRoomEntry(entry),
      code,
      phase: roomPhase(entry),
      idleSec: Math.floor((Date.now() - entry.updatedAt) / 1000),
    },
  });
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
      `SELECT u.id, u.username, u.email, u.created_at, u.is_admin, u.is_master_admin,
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
/**
 * Is the caller a master admin *right now*?
 *
 * Read from the database rather than from the token's `mst` claim, and the
 * difference is the point: a token stays valid for up to eight hours after the
 * account behind it is demoted, so trusting the claim would leave a revoked
 * master able to hand the role back to themselves for the rest of the day.
 *
 * Under `ADMIN_CONSOLE_PASSWORD` this is the only thing standing between an
 * ordinary admin and a role change — and it is not much, because the shared
 * password lets a caller open a session under any admin id they like. That
 * limitation belongs to the shared-password mode, not to this check; see the
 * note at the top of `adminSession.js`.
 */
async function isMasterAdmin(userId) {
  const [[row]] = await db.query(
    "SELECT is_master_admin FROM users WHERE id = ?",
    [Number(userId)],
  );
  return Boolean(row?.is_master_admin);
}

/** 403 unless the caller is a master, in the words the USERS tab prints as-is. */
async function requireMaster(req, res) {
  if (await isMasterAdmin(req.admin.uid)) return true;
  res.status(403).json({ error: "Only a master admin can change roles." });
  return false;
}

/**
 * PATCH `{ isAdmin }` — grant or revoke console access.
 *
 * **Four ways to end up with a console nobody can administer, all refused:**
 * demoting yourself (you are standing on the page you would lose), demoting the
 * last admin, demoting a master admin (clear the master flag first, so losing
 * the role is always a deliberate two-step), and — via `/master` below —
 * clearing the last master.
 *
 * The last-admin check is not theoretical: a token outlives the account's role
 * by up to eight hours, so a revoked admin can still reach this route.
 */
router.patch("/users/:id/role", asyncHandler(async (req, res) => {
  const targetId = Number(req.params.id);
  const makeAdmin = Boolean(req.body?.isAdmin);
  if (!targetId) return res.status(400).json({ error: "Unknown user." });

  if (!makeAdmin && targetId === Number(req.admin.uid)) {
    return res.status(400).json({ error: "You cannot remove your own console access." });
  }

  try {
    if (!(await requireMaster(req, res))) return;

    if (!makeAdmin) {
      const [[{ cnt }]] = await db.query("SELECT COUNT(*) AS cnt FROM users WHERE is_admin = 1");
      if (cnt <= 1) {
        return res.status(400).json({ error: "The last admin cannot be removed." });
      }
      if (await isMasterAdmin(targetId)) {
        return res.status(400).json({
          error: "Remove master admin from this account before revoking its access.",
        });
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

/**
 * PATCH `{ isMaster }` — designate or stand down a master admin.
 *
 * Granting master implies console access, so it grants `is_admin` in the same
 * statement: a master who is not an admin could not open the console to use the
 * role, and would read as a bug rather than as a policy.
 *
 * Standing yourself down is allowed — unlike revoking your own access — because
 * it is how a master hands the role on and it cannot lock the console: the
 * account keeps `is_admin`, and the last-master check below keeps somebody in
 * the role. `ADMIN_EMAIL` restores itself on the next boot regardless.
 */
router.patch("/users/:id/master", asyncHandler(async (req, res) => {
  const targetId = Number(req.params.id);
  const makeMaster = Boolean(req.body?.isMaster);
  if (!targetId) return res.status(400).json({ error: "Unknown user." });

  try {
    if (!(await requireMaster(req, res))) return;

    if (!makeMaster) {
      const [[{ cnt }]] = await db.query(
        "SELECT COUNT(*) AS cnt FROM users WHERE is_master_admin = 1",
      );
      if (cnt <= 1) {
        return res.status(400).json({ error: "The last master admin cannot stand down." });
      }
    }

    const [result] = await db.query(
      makeMaster
        ? "UPDATE users SET is_master_admin = 1, is_admin = 1 WHERE id = ?"
        : "UPDATE users SET is_master_admin = 0 WHERE id = ?",
      [targetId],
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Unknown user." });

    res.json({ userId: targetId, isMaster: makeMaster });
  } catch (err) {
    sendAdminError(res, err);
  }
}));

router.post("/scrape", asyncHandler(async (req, res) => {
  const mode = String(req.body?.mode || "");
  if (!SCRAPE_MODES.includes(mode)) {
    return res.status(400).json({ error: "Unknown scrape mode." });
  }
  const result = await startScrape(mode);
  if (!result.ok) return res.status(409).json({ error: result.error });
  res.status(202).json({ mode });
}));

router.post("/scrape/stop", (_req, res) => {
  const result = stopScrape();
  if (!result.ok) return res.status(409).json({ error: result.error });
  res.json({ stopped: true });
});

router.get("/scrape/status", (_req, res) => res.json(scrapeStatus()));

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
