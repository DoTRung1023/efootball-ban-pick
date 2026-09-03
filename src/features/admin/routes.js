import { Router } from "express";
import bcrypt from "bcryptjs";
import db from "#lib/db.js";
import { asyncHandler, describeError, requestBaseUrl } from "#lib/http.js";
import {
  closeRoomEntry,
  findRoomEntry,
  isActiveDraft,
  isValidRoomCode,
  listActiveRooms,
  normalizeRoomCodeParam,
  roomPhase,
  serializeRoomEntry,
  VIEW_UNRESTRICTED,
} from "#features/rooms/index.js";
import { generatePassword, PASSWORD_MIN } from "#features/auth/index.js";
import {
  CATALOG_COLUMNS,
  DEFAULT_SORT,
  buildCatalogFilter,
  readTestPlayers,
  refreshTopPlayers,
  resolveSortOrder,
  setTestPlayer,
  setTopPlayers,
  topPlayersStatus,
} from "#features/players/index.js";
import { newPasswordEmail, sendMail } from "#features/mail/index.js";
import { SCRAPE_MODES, scrapeStatus, startScrape, stopScrape } from "./scrapeRunner.js";
import {
  clearFailures,
  lockoutSeconds,
  mintAdminToken,
  recordFailure,
  requireAdmin,
} from "./adminSession.js";
import {
  consolePasswordMatches,
  rotateConsolePassword,
  usesConsolePassword,
} from "./consolePassword.js";
import { preferenceError, readPreferences, writePreference } from "./preferences.js";

const router = Router();

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;
/* Matches `auth/routes.js` and `bootstrap.js`. Every hash this app writes is
   written at the same cost, or a rehash would be detectable by timing. */
const BCRYPT_ROUNDS = 12;

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
  /* The account is whoever is signed in, not whoever the body names. With a
     shared `ADMIN_CONSOLE_PASSWORD` configured, taking the id from the request
     meant that one password opened a console session as *any* admin, master
     admins included — the trade `adminSession.js` used to have to warn about.
     It is a real session cookie now, so there is nothing left to name. */
  const userId = Number(req.userId);
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

    /* The shared console password where one is configured, otherwise this
       account's own — `consolePassword.js` owns which. The lockout counts
       either kind of failure and is keyed by account, so a shared password does
       not turn into a shared five attempts. */
    const ok = await (usesConsolePassword()
      ? consolePasswordMatches(password)
      : bcrypt.compare(password, user.password ?? ""));
    if (!ok) {
      recordFailure(user.id);
      return res.status(401).json({
        error: usesConsolePassword() ? "Incorrect console password." : "Incorrect password.",
      });
    }

    clearFailures(user.id);
    res.json({
      token: mintAdminToken(user),
      /* Whose session this is, from the database row the cookie resolved to.
         The USERS tab refuses to demote this row, and it must not be able to
         disagree with the server about which row that is. */
      userId: user.id,
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
        `SELECT id, scrape_type, started_at, finished_at, players_upserted, failed
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

/**
 * `idleSec` is time since the room's last heartbeat, not the room's age, and it
 * is now the *only* thing that reports quiet — nothing filters on it. A room is
 * listed for as long as it exists; see `listActiveRooms`. The table sorts by it,
 * so a quiet room sinks rather than vanishes.
 */
router.get("/rooms", (_req, res) => {
  const now = Date.now();
  const rooms = listActiveRooms().map(([code, entry]) => ({
    code,
    host: entry.host?.username || null,
    guest: entry.guest?.username || null,
    phase: roomPhase(entry),
    /* Who walked out to open a room of their own, and under which name — their
       seat is already empty, so without this the row is a bare `—` and the
       console cannot tell "left for a new match" from "never sat down". The
       room is over either way: the one still in it can leave or start their
       own, but there is nobody left to rematch. */
    newMatch: entry.newMatch?.by
      ? { by: entry.newMatch.by, username: entry.newMatch.username || "" }
      : null,
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
/**
 * How many game plans each seat has saved.
 *
 * **Attached here rather than in `serializeRoomEntry`**, which the two draft
 * clients also read: what your opponent has in their planner is none of their
 * business, and this route is the only caller that wants it.
 *
 * A failed read answers `null` — "unknown" on the panel — rather than throwing.
 * The room itself is in memory and is what the admin clicked WATCH to see; a
 * database hiccup should cost one line of a seat card, not the whole panel.
 */
async function planCounts(ids) {
  const wanted = [...new Set(ids.map(Number).filter(Number.isFinite))];
  if (!wanted.length) return new Map();
  try {
    const [rows] = await db.query(
      `SELECT user_id, COUNT(*) AS planCount FROM game_plans
       WHERE user_id IN (?) GROUP BY user_id`,
      [wanted],
    );
    /* Seeded at zero, because `GROUP BY` returns no row at all for a user with
       no plans — read straight off the result, "has none" and "was never asked
       about" are the same absence, and a seat with an empty planner reported
       itself as unknown. */
    const counts = new Map(wanted.map((id) => [id, 0]));
    for (const row of rows) counts.set(Number(row.user_id), Number(row.planCount));
    return counts;
  } catch {
    return null;
  }
}

router.get("/rooms/:code", asyncHandler(async (req, res) => {
  const code = normalizeRoomCodeParam(req.params.code);
  const entry = isValidRoomCode(code) ? findRoomEntry(code) : null;
  if (!entry) {
    return res.status(404).json({ error: "That room is not in memory — it ended, or the server restarted." });
  }
  const room = {
    /* `VIEW_UNRESTRICTED`, explicitly: the players' own snapshots now conceal
       whatever the room's reveal modes hide, and the default conceals both
       sides. An admin watching a draft is the one reader that must see it
       whole, and saying so here is what keeps that an argument rather than an
       accident. */
    ...serializeRoomEntry(entry, VIEW_UNRESTRICTED),
    code,
    phase: roomPhase(entry),
    idleSec: Math.floor((Date.now() - entry.updatedAt) / 1000),
  };
  /* `serializeRoomEntry` builds fresh seat objects every call, so these are
     safe to write on — the in-memory room is untouched. */
  const counts = await planCounts([room.host?.id, room.guest?.id]);
  if (room.host) room.host.planCount = counts?.get(Number(room.host.id)) ?? null;
  if (room.guest) room.guest.planCount = counts?.get(Number(room.guest.id)) ?? null;
  res.json({ room });
}));

/**
 * POST — end a live room. Any admin, master or not.
 *
 * Not master-gated, unlike the three above: a room is in-memory and lasts
 * minutes, so closing one is nearer to moderation than to administration, and
 * nothing is destroyed that a new room does not replace.
 *
 * `closeRoomEntry` is where the mechanism lives, including why the entry has to
 * survive its own seats and why the host's heartbeat must not undo this.
 */
router.post("/rooms/:code/close", asyncHandler(async (req, res) => {
  const code = normalizeRoomCodeParam(req.params.code);
  if (!isValidRoomCode(code)) return res.status(400).json({ error: "Unknown room." });

  const entry = findRoomEntry(code);
  if (!entry || entry.closed) return res.status(404).json({ error: "Room is not live." });

  closeRoomEntry(entry, `Closed by ${req.admin.username}.`);
  res.json({ code });
}));

router.get("/scrape-logs", asyncHandler(async (req, res) => {
  try {
    const [logs] = await db.query(
      `SELECT id, scrape_type, started_at, finished_at, players_upserted, failed
       FROM scrape_logs ORDER BY id DESC LIMIT ?`,
      [readLimit(req.query.limit)],
    );
    res.json({ logs });
  } catch (err) {
    sendAdminError(res, err);
  }
}));

/**
 * DELETE — empty the scrape log. Master only.
 *
 * **This clears the incremental cutoff with it**, because the cutoff is not
 * stored anywhere else: `scrape.js` reads the newest finished row's
 * `max_pesdb_id`, and with no rows it has nothing to resume from and runs a
 * full scrape. That is a real cost — the whole catalog, several hours — so the
 * console says so on the confirm rather than letting an admin find out when the
 * next UPDATE takes all afternoon.
 *
 * The catalog itself is untouched; a full run upserts over what is already
 * there.
 */
router.delete("/scrape-logs", asyncHandler(async (req, res) => {
  try {
    if (!(await requireMaster(req, res, "clear the scrape history"))) return;

    const [[{ cnt }]] = await db.query("SELECT COUNT(*) AS cnt FROM scrape_logs");
    await db.query("DELETE FROM scrape_logs");

    res.json({ cleared: Number(cnt) || 0 });
  } catch (err) {
    sendAdminError(res, err);
  }
}));

router.get("/users", asyncHandler(async (req, res) => {
  try {
    const [users] = await db.query(
      `SELECT u.id, u.username, u.email, u.email_verified,
              u.created_at, u.is_admin, u.is_master_admin,
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
// ── Per-admin preferences ────────────────────────────────────
// Always the caller's own, never an id from the request: one admin has no
// business setting another's columns. Any admin may use these — they are a view
// setting, not a privilege.

router.get("/preferences", asyncHandler(async (req, res) => {
  try {
    res.json({ preferences: await readPreferences(req.admin.uid) });
  } catch (err) {
    sendAdminError(res, err);
  }
}));

/** PUT `{ key, value }` — one setting at a time, allow-listed and shape-checked
    in `preferences.js`. A rejected key is a 400 rather than a silent no-op:
    the console would otherwise go on showing a choice it never stored. */
router.put("/preferences", asyncHandler(async (req, res) => {
  const key = String(req.body?.key || "");
  const value = req.body?.value;
  const invalid = preferenceError(key, value);
  if (invalid) return res.status(400).json({ error: invalid });

  try {
    await writePreference(req.admin.uid, key, value);
    res.json({ key });
  } catch (err) {
    sendAdminError(res, err);
  }
}));

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

/**
 * 403 unless the caller is a master, in the words the USERS tab prints as-is —
 * so each caller names its own action rather than every refusal claiming to be
 * about roles.
 */
async function requireMaster(req, res, action = "do that") {
  if (await isMasterAdmin(req.admin.uid)) {
    /* The audit trail, such as it is: the six master-only actions are the ones
       that change who can get in and what they can reach, and until now they
       happened silently — a password reset or a demotion left nothing behind
       but its effect. One line to the server log names the actor, the target
       (it is in the URL) and, by the log's own timestamp, when.

       The log is the store on purpose. A table would need a schema, a retention
       policy and a console screen to read it, and would still be deletable by
       exactly the accounts it exists to watch. The platform's log is append-only
       from the app's point of view, which is the property that matters. */
    console.log(`audit: admin ${req.admin.uid} → ${req.method} ${req.originalUrl} (${action})`);
    return true;
  }
  console.warn(`audit: admin ${req.admin.uid} DENIED ${req.method} ${req.originalUrl} (${action})`);
  res.status(403).json({ error: `Only a master admin can ${action}.` });
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
    if (!(await requireMaster(req, res, "change console access"))) return;

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
 * **Nobody changes their own master flag**, in either direction — the same rule
 * that already refuses revoking your own access, and the USERS tab draws your
 * own row with no buttons because of it. Standing yourself down used to be the
 * exception, on the argument that it is how a master hands the role on; the way
 * a master hands it on now is that another master takes it, which is one fewer
 * account able to change what it is on its own say-so. The last-master check
 * below still stands behind it, and `ADMIN_EMAIL` still restores itself on the
 * next boot.
 *
 * The self-check sits *after* `requireMaster` so a plain admin reaching this
 * route is told it is not theirs to call, rather than being told about a rule
 * that was never going to apply to them.
 */
router.patch("/users/:id/master", asyncHandler(async (req, res) => {
  const targetId = Number(req.params.id);
  const makeMaster = Boolean(req.body?.isMaster);
  if (!targetId) return res.status(400).json({ error: "Unknown user." });

  try {
    if (!(await requireMaster(req, res, "designate a master admin"))) return;

    if (targetId === Number(req.admin.uid)) {
      return res.status(400).json({
        error: "You cannot change your own master admin status.",
      });
    }

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

/**
 * PATCH — a master resets another account's sign-in password.
 *
 * **The body carries nothing.** The password is generated here and emailed to
 * the address on the account; it is never chosen by the master, never returned
 * to the console, and never displayed. Two things follow from that, and both
 * are the point:
 *
 *   - a master cannot pick a weak password for somebody else, and cannot learn
 *     the one they set — taking over an account means locking its owner out of
 *     it noisily, rather than borrowing it quietly;
 *   - an account whose email does not work cannot be reset from here at all.
 *     The way back for the built-in admin is `ADMIN_EMAIL`/`ADMIN_PASSWORD` and
 *     a restart, as it has always been; for anyone else it is fixing the
 *     address first.
 *
 * Still the "they forgot it" path, and still the only way to give a Google
 * OAuth account — whose `password` column is NULL — a password at all. And
 * still worth naming: a master admin can take over any account on the
 * installation, which is why this is master-gated rather than admin-gated.
 *
 * **Not your own account.** The USERS tab has never offered it on your own row;
 * the refusal is here so that is a rule rather than a missing button. Your own
 * password is changed under Edit Profile, where you choose it and the old one
 * has to be given first — this route neither asks for the old one nor tells you
 * the new one, so aimed at yourself it is a way to lock yourself out and wait
 * for an email.
 */
router.patch("/users/:id/password", asyncHandler(async (req, res) => {
  const targetId = Number(req.params.id);
  if (!targetId) return res.status(400).json({ error: "Unknown user." });

  try {
    if (!(await requireMaster(req, res, "reset an account password"))) return;

    if (targetId === Number(req.admin.uid)) {
      return res.status(400).json({
        error: "Change your own password under Edit Profile.",
      });
    }

    const [[user]] = await db.query(
      "SELECT id, username, email FROM users WHERE id = ?",
      [targetId],
    );
    if (!user) return res.status(404).json({ error: "Unknown user." });

    const password = generatePassword();
    const { subject, text } = newPasswordEmail({
      username: user.username,
      password,
      signInUrl: `${requestBaseUrl(req)}/signin`,
    });

    /* **Send before writing.** A transport that refuses throws here, and the
       account is left with the password it already had — which is the whole
       reason this is not one UPDATE. The other order would mint a password
       that exists in no inbox and no database in readable form, and the only
       way back from that is `.env` and a restart. */
    const { delivered } = await sendMail({ to: user.email, subject, text });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await db.query("UPDATE users SET password = ? WHERE id = ?", [hash, targetId]);

    res.json({ userId: targetId, email: user.email, delivered });
  } catch (err) {
    /* A refused send reaches this as a plain Error whose message is already
       written for a person; `sendAdminError` answers 500 with it, which is what
       the USERS tab prints. */
    sendAdminError(res, err);
  }
}));

/**
 * DELETE — remove an account and everything it owns.
 *
 * **Who may delete whom** is the whole rule here, and it is two rules:
 *
 *   - a master may delete any account but their own;
 *   - a plain admin may delete only an account with no console access. Removing
 *     a colleague's account is removing their access, and access is a master's
 *     to change (`PATCH /users/:id/role`) — a delete that reached an admin would
 *     be that same power under a different button.
 *
 * Both are re-read from the database rather than taken from the token, for the
 * reason `isMasterAdmin` states: a token outlives its account's role by up to
 * eight hours.
 *
 * The last admin cannot go, for the same reason they cannot be demoted — it
 * would leave a console nobody can open. Your own row is refused ahead of that,
 * because it is the answer a self-delete actually wants.
 *
 * **The cascade is the schema's**, and it is wide: `ON DELETE CASCADE` from
 * `users` takes the account's squad (`players`), its game plans and their rows,
 * its saved settings and any outstanding email verification. Nothing here has
 * to enumerate them, and nothing here can be half-done.
 */
router.delete("/users/:id", asyncHandler(async (req, res) => {
  const targetId = Number(req.params.id);
  if (!targetId) return res.status(400).json({ error: "Unknown user." });

  if (targetId === Number(req.admin.uid)) {
    return res.status(400).json({ error: "You cannot delete your own account." });
  }

  try {
    const [[target]] = await db.query(
      "SELECT id, username, is_admin, is_master_admin FROM users WHERE id = ?",
      [targetId],
    );
    if (!target) return res.status(404).json({ error: "Unknown user." });

    const callerIsMaster = await isMasterAdmin(req.admin.uid);
    if (!callerIsMaster && target.is_admin) {
      return res.status(403).json({
        error: "Only a master admin can delete an account that has console access.",
      });
    }

    if (target.is_admin) {
      const [[{ cnt }]] = await db.query("SELECT COUNT(*) AS cnt FROM users WHERE is_admin = 1");
      if (cnt <= 1) {
        return res.status(400).json({ error: "The last admin cannot be removed." });
      }
    }

    const [result] = await db.query("DELETE FROM users WHERE id = ?", [targetId]);
    if (!result.affectedRows) return res.status(404).json({ error: "Unknown user." });

    res.json({ userId: targetId, username: target.username });
  } catch (err) {
    sendAdminError(res, err);
  }
}));

/** Whether a shared console password exists — the form asks before it decides
    whether to show a "current password" field. Deliberately a live read rather
    than a claim on the token: the first rotation flips this. */
router.get("/console-password", (_req, res) => {
  res.json({ configured: usesConsolePassword() });
});

/**
 * PUT `{ currentPassword, newPassword }` — rotate the shared console password.
 *
 * The current password is asked for again even though this session was opened
 * with it. The session outlives the tab it was opened in by up to eight hours,
 * and this is the credential every admin uses to get in: a borrowed screen
 * should not be able to change the lock silently.
 *
 * Where no shared password is configured yet there is nothing to confirm
 * against, so the current-password check is skipped and this route is what
 * switches the install over to one.
 */
router.put("/console-password", asyncHandler(async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");

  if (newPassword.length < PASSWORD_MIN) {
    return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN} characters.` });
  }

  try {
    if (!(await requireMaster(req, res, "change the console password"))) return;

    if (usesConsolePassword() && !(await consolePasswordMatches(currentPassword))) {
      return res.status(401).json({ error: "The current console password is incorrect." });
    }

    await rotateConsolePassword(newPassword);
    /* Existing tokens stay valid: this rotates the way *in*, not the sessions
       already through the door. Anyone still holding one keeps it until it
       expires, which is the same bound every other role change lives under. */
    res.json({ ok: true });
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

/* The sign-in page's showcase pool. Rebuilding is deliberately a button rather
   than a schedule: the catalog only moves when a scrape runs, and the person who
   ran the scrape is the one who knows the new cards should go up. */
router.get("/top-players", asyncHandler(async (_req, res) => {
  res.json(await topPlayersStatus());
}));

router.post("/top-players/refresh", asyncHandler(async (_req, res) => {
  await refreshTopPlayers();
  /* Read back rather than returning what the rebuild computed: the panel then
     shows what is actually stored, which is the thing the sign-in page serves. */
  res.json(await topPlayersStatus());
}));

/**
 * PUT body: { ids: [pesdb_id, …] } — the hand-picked list, in display order.
 *
 * Separate verb from the rebuild below it on purpose. REBUILD *computes* the
 * list and is idempotent; this *replaces* it with a choice, and the two want to
 * be distinguishable in a log. A bad pick is recoverable by pressing REBUILD,
 * which is why this needs no confirmation step.
 */
router.put("/top-players", asyncHandler(async (req, res) => {
  try {
    await setTopPlayers(req.body?.ids);
  } catch (err) {
    /* The two refusals `setTopPlayers` raises are both the admin's input, not
       a fault: an empty list, or ids the catalog does not know. */
    return res.status(400).json({ error: err.message });
  }
  res.json(await topPlayersStatus());
}));

/**
 * The catalog as an admin sees it: the same search `/api/players` runs, with
 * the cards marked as test data left in.
 *
 * A separate route rather than an `includeTest=1` on the public one. That flag
 * would be a query parameter anybody could send, and the whole point of the
 * mark is that a user's search does not return these — a switch that turns the
 * rule off is not much of a rule. Behind `requireAdmin` like everything else
 * on this router.
 */
router.get("/catalog", asyncHandler(async (req, res) => {
  const { sortBy = DEFAULT_SORT, limit = 50, offset = 0 } = req.query;
  const { where, params } = buildCatalogFilter(req.query, { includeTest: true });
  const [rows] = await db.query(
    `SELECT ${CATALOG_COLUMNS}
     FROM   players_catalog
     ${where}
     ORDER  BY ${resolveSortOrder(sortBy)}
     LIMIT  ? OFFSET ?`,
    [...params, Number(limit), Number(offset)],
  );
  res.json({ players: rows });
}));

/**
 * Re-checks the caller's password, the same way the gate does.
 *
 * The shared console password where one is configured, this account's own
 * otherwise — `consolePassword.js` owns which, and mirroring the gate is the
 * point: an admin should be re-typing the password they already know unlocks
 * this console, not a second one they have to remember which of.
 *
 * Used only by the catalog wipe. Everything else destructive here arms on a
 * first click and fires on a second, which is proportionate to something that
 * can be redone; a catalog you have to re-scrape for hours is not.
 */
async function passwordConfirms(req, candidate) {
  const supplied = String(candidate ?? "");
  if (!supplied) return false;
  if (usesConsolePassword()) return consolePasswordMatches(supplied);
  const [[row]] = await db.query("SELECT password FROM users WHERE id = ?", [req.admin.uid]);
  return bcrypt.compare(supplied, row?.password ?? "");
}

/**
 * POST — empty the player catalog. Master only, and password-confirmed.
 *
 * **Three tables go, not one**, and the two extra ones are what stop this from
 * leaving an install that cannot be put back:
 *
 *   - `players_catalog` — the ask.
 *   - `top_players_snapshot` — every row in it names a `pesdb_id` that no longer
 *     exists. It is the sign-in page's card backdrop *and* the ban pool an
 *     anonymous opponent is drafted from, so leaving it would point both at
 *     cards nothing can look up.
 *   - `scrape_logs` — **the incremental cutoff lives here**, not in a config: the
 *     scraper reads the newest finished row's `max_pesdb_id` and fetches only
 *     what is newer. Emptying the catalog and keeping that bookmark would mean
 *     `npm run scrape` never refetches one of the rows just deleted, and the
 *     catalog could not be refilled from the console at all. Clearing it puts
 *     the next run back to a full scrape, which is the only thing that refills
 *     an empty catalog.
 *
 * **What is deliberately left alone: everybody's squads and game plans.**
 * `players.pesdb_id` is a plain column with no foreign key to the catalog, so
 * nothing cascades, and that is the right answer — a squad is a user's work, not
 * a copy of the catalog. Those rows keep their name, position and card art
 * (which is proxied by id, not read from the catalog); what they lose is being
 * findable in a catalog search until a scrape refills it.
 */
router.post("/catalog/clear", asyncHandler(async (req, res) => {
  try {
    if (!(await requireMaster(req, res, "clear the player catalog"))) return;

    if (!(await passwordConfirms(req, req.body?.password))) {
      return res.status(401).json({
        error: usesConsolePassword()
          ? "Incorrect console password."
          : "Incorrect password.",
      });
    }

    const [[{ cnt }]] = await db.query("SELECT COUNT(*) AS cnt FROM players_catalog");
    await db.query("DELETE FROM players_catalog");
    await db.query("DELETE FROM top_players_snapshot");
    await db.query("DELETE FROM scrape_logs");

    res.json({ cleared: Number(cnt) || 0 });
  } catch (err) {
    sendAdminError(res, err);
  }
}));

/** Every card currently marked as test data. */
router.get("/test-players", asyncHandler(async (_req, res) => {
  res.json({ players: await readTestPlayers() });
}));

/**
 * PUT body: { id, isTest } — one card at a time.
 *
 * One card rather than the whole set, unlike the showcase list next door. That
 * one is an ordered list of at most fifty and the order is the value, so it is
 * written whole. This is a flag on a row: the marks are independent, there is
 * no order, and the set has no ceiling — sending all of it back on every click
 * would grow without bound for no gain.
 */
router.put("/test-players", asyncHandler(async (req, res) => {
  const { id, isTest } = req.body || {};
  if (id === undefined || id === null || typeof isTest !== "boolean") {
    return res.status(400).json({ error: "id and isTest (boolean) are required." });
  }
  if (!(await setTestPlayer(id, isTest))) {
    return res.status(404).json({ error: "The catalog has no card with that id." });
  }
  res.json({ id: String(id), isTest });
}));

/**
 * Catalog health: what is missing, what is impossible, and what points at
 * nothing.
 *
 * **One scan, not one per column.** Every gap and every range test is a
 * `SUM(condition)` in a single pass over ~42k rows. The version before this ran
 * a separate `COUNT(*)` per question and only asked four of them; asking
 * fifteen that way would have been fifteen scans.
 *
 * **The duplicate-`pesdb_id` row is gone.** `players_catalog` carries
 * `UNIQUE KEY uq_catalog_pesdb_id`, so that count was structurally incapable of
 * returning anything but zero — a permanently green row that told an admin
 * nothing. The database enforces it; the dashboard does not need to re-ask.
 *
 * **The bounds are set to impossible, not unusual.** A first pass used 15-50
 * for age and flagged two cards at 14 — but the age curve runs smoothly from
 * 14 (2 cards) through 15 (43) to 50 (1), so those are real youth and veteran
 * cards and the check was wrong, not the data. A range test that fires on
 * legitimate rows trains an admin to ignore the panel.
 *
 * A duplicate-card test was written and removed for the same reason. Grouping
 * on name + card type + max rating reported 3,441 "duplicates", and the largest
 * was seventeen Mbappé Trending cards at 97 — distinct weekly reissues with
 * distinct ids, all legitimate. It was noise wearing a warning's clothes.
 *
 * `name <> TRIM(name)` earns its place instead: `topCatalogPlayers` de-dupes
 * the showcase pool by joining on `name`, so one stray space silently splits a
 * player into two entries there.
 *
 * The reference checks are the ones that matter most and were not here at all.
 * A squad row or a showcase entry pointing at a card the catalog no longer has
 * is a blank in somebody's team or on the sign-in page, and neither is visible
 * from anywhere else in this console.
 */
router.get("/data-quality", asyncHandler(async (_req, res) => {
  try {
    const [[stats], [[orphanSquad]], [[orphanShowcase]]] = await Promise.all([
      db.query(`
        SELECT COUNT(*) AS total,
               SUM(name         IS NULL OR name         = '') AS m_name,
               SUM(position     IS NULL OR position     = '') AS m_position,
               SUM(club         IS NULL OR club         = '') AS m_club,
               SUM(league       IS NULL OR league       = '') AS m_league,
               SUM(nationality  IS NULL OR nationality  = '') AS m_nationality,
               SUM(card_type    IS NULL OR card_type    = '') AS m_card_type,
               SUM(region       IS NULL OR region       = '') AS m_region,
               SUM(foot         IS NULL OR foot         = '') AS m_foot,
               SUM(playing_style IS NULL OR playing_style = '') AS m_playing_style,
               SUM(overall     IS NULL) AS m_overall,
               SUM(overall_max IS NULL) AS m_overall_max,
               SUM(height      IS NULL) AS m_height,
               SUM(weight      IS NULL) AS m_weight,
               SUM(age         IS NULL) AS m_age,
               SUM(overall IS NOT NULL AND overall_max IS NOT NULL
                   AND overall_max < overall)                    AS i_maxBelowBase,
               SUM(overall IS NOT NULL AND (overall < 30  OR overall > 125))  AS i_overall,
               SUM(age     IS NOT NULL AND (age     < 10  OR age     > 70))   AS i_age,
               SUM(height  IS NOT NULL AND (height  < 120 OR height  > 230))  AS i_height,
               SUM(weight  IS NOT NULL AND (weight  < 30  OR weight  > 170))  AS i_weight,
               SUM(name <> TRIM(name))                                        AS i_untrimmedName
        FROM players_catalog`),

      /* A saved squad pointing at a card the catalog no longer has. `pesdb_id`
         is nullable there for hand-added players, so only linked rows count. */
      db.query(`
        SELECT COUNT(*) AS n
        FROM players p LEFT JOIN players_catalog c ON c.pesdb_id = p.pesdb_id
        WHERE p.pesdb_id IS NOT NULL AND c.pesdb_id IS NULL`),

      /* The same for the showcase pool, which renders on the sign-in page. */
      db.query(`
        SELECT COUNT(*) AS n
        FROM top_players_snapshot s LEFT JOIN players_catalog c ON c.pesdb_id = s.pesdb_id
        WHERE c.pesdb_id IS NULL`),

    ]);

    const row = stats[0] || {};
    const n = (v) => Number(v || 0);
    const group = (prefix, keys) =>
      Object.fromEntries(keys.map((k) => [k, n(row[`${prefix}_${k}`])]));

    res.json({
      total: n(row.total),
      missing: group("m", [
        "name", "position", "overall", "overall_max", "club", "league", "nationality",
        "height", "weight", "age", "card_type", "region", "foot", "playing_style",
      ]),
      integrity: group("i", [
        "maxBelowBase", "overall", "age", "height", "weight", "untrimmedName",
      ]),
      references: {
        orphanSquadPlayers: n(orphanSquad?.n),
        orphanShowcase: n(orphanShowcase?.n),
      },
    });
  } catch (err) {
    sendAdminError(res, err);
  }
}));

export default router;
