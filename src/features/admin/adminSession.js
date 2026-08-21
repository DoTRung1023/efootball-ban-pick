/**
 * Admin console sessions.
 *
 * The console used to be one shared key (`ADMIN_KEY`) passed as `?adminKey=` on
 * every request. That key was the same for everyone, never expired, and landed
 * in every access log and browser history entry that saw the URL.
 *
 * Access is now a property of the account: `users.is_admin`. Opening the console
 * re-confirms a password (step-up auth — a stolen `efb_user` in localStorage is
 * not enough), and the server answers with a signed token carrying the user id
 * and an expiry. The token travels in the `x-admin-token` header, so it stays out
 * of URLs.
 *
 * **Which password that is depends on `ADMIN_CONSOLE_PASSWORD`.** Set it and the
 * gate takes that one console password from every admin instead of making each
 * of them retype their own account password; leave it unset and the account
 * password is used, exactly as before. There is no default, so an install that
 * configures nothing keeps the stronger behaviour rather than falling back to a
 * value printed in this repo.
 *
 * The trade is the one `ADMIN_KEY` used to make and it is worth stating plainly:
 * a single shared secret has no identity behind it. `efb_user` is unsigned, so
 * with the console password in hand a caller can open a session as **any** admin
 * id, master admins included. It is a fine trade for a solo or trusted-team
 * deployment and a poor one for a public host — there, leave the variable unset.
 *
 * The token is stateless: revoking `is_admin` takes effect at its next sign-in,
 * not mid-session. TOKEN_TTL_MS bounds that window. Role *changes* are therefore
 * authorised against the database at write time rather than against `mst` below,
 * which is only ever used to decide what the USERS tab draws.
 */

import crypto from "node:crypto";

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

/* ADMIN_SECRET in production. Without one, a random secret is minted at boot:
   there is deliberately no default value to guess, and the cost is that every
   console session ends when the server restarts. */
const SECRET = process.env.ADMIN_SECRET || crypto.randomBytes(32).toString("hex");

const sign = (payload) =>
  crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");

export function mintAdminToken({ id, username, is_master_admin: isMaster }) {
  const payload = Buffer.from(
    JSON.stringify({
      uid: id,
      username,
      /* Display only — see the note above. Every route that acts on a role
         re-reads the database instead of trusting this. */
      mst: Boolean(isMaster),
      exp: Date.now() + TOKEN_TTL_MS,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/* ── The shared console password ──────────────────────────── */

const CONSOLE_PASSWORD = process.env.ADMIN_CONSOLE_PASSWORD || "";

/** Whether the gate takes one shared password rather than each account's own. */
export function usesConsolePassword() {
  return CONSOLE_PASSWORD.length > 0;
}

/**
 * Compares against `ADMIN_CONSOLE_PASSWORD` without leaking its length or
 * content through timing. Both sides are hashed first because
 * `timingSafeEqual` throws on a length mismatch, and the length of the real
 * password is itself something worth not giving away.
 */
export function consolePasswordMatches(candidate) {
  if (!CONSOLE_PASSWORD) return false;
  const digest = (v) => crypto.createHash("sha256").update(String(v)).digest();
  return crypto.timingSafeEqual(digest(candidate), digest(CONSOLE_PASSWORD));
}

/** The claims of a token this server signed and that has not expired, else null. */
export function readAdminToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  /* timingSafeEqual throws unless both buffers are the same length, so the
     length is compared first — a wrong length is not a timing leak. */
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    return claims.exp > Date.now() ? claims : null;
  } catch {
    return null;
  }
}

/** Admin gate for /api/admin/*, except the route that opens a session. */
export function requireAdmin(req, res, next) {
  const claims = readAdminToken(req.headers["x-admin-token"]);
  if (!claims) return res.status(401).json({ error: "Unauthorized" });
  req.admin = claims;
  next();
}

// ── Failed-attempt throttle ──────────────────────────────────

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

/** userId -> { count, expiresAt }. Only ever keyed by a real admin account, and
    in-memory, so it cannot grow unbounded and it resets with the process. */
const attempts = new Map();

/** Seconds until this account may try again, or 0 when it may try now. */
export function lockoutSeconds(userId) {
  const entry = attempts.get(userId);
  if (!entry || entry.expiresAt <= Date.now() || entry.count < MAX_ATTEMPTS) return 0;
  return Math.ceil((entry.expiresAt - Date.now()) / 1000);
}

/** Each failure also extends the window, so a slow drip does not reset the count. */
export function recordFailure(userId) {
  const entry = attempts.get(userId);
  const live = entry && entry.expiresAt > Date.now();
  attempts.set(userId, { count: live ? entry.count + 1 : 1, expiresAt: Date.now() + WINDOW_MS });
}

export function clearFailures(userId) {
  attempts.delete(userId);
}
