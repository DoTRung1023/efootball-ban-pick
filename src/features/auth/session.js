/**
 * Who is calling.
 *
 * Every route used to take the caller's word for it: `userId` arrived in a
 * query string or a request body and nothing checked that it was yours, so
 * changing a number in a URL read and wrote somebody else's squad, game plans
 * and profile. That was DECISIONS.md §1, and this module is what closed it.
 *
 * **The id now comes from a cookie the server signed, and from nowhere else.**
 * A request may still carry a `userId` — the older clients did, and a hostile
 * one always will — and every route ignores it.
 *
 * Two cookies, because a draft room has two kinds of player:
 *
 *   - `efb_session` — an account. Minted at sign-in, HMAC-signed the same way
 *     `admin/adminSession.js` signs a console token: base64url claims, a
 *     detached signature, a timing-safe compare, an expiry inside the payload.
 *     Stateless, so it survives a restart and needs no table; the cost is that
 *     it cannot be revoked before it expires, which SESSION_TTL_MS bounds.
 *   - `efb_visitor` — no account. An opaque random id minted on the first
 *     request that has neither cookie, so a signed-out player can hold a seat
 *     in a room without being able to claim anybody else's. It carries no
 *     rights and nothing in the database hangs off it.
 *
 * Both are `httpOnly`: a token readable by `document.cookie` is a token an XSS
 * can post elsewhere, and the client has no reason to read either one. What the
 * client needs is not the token but the *id*, and the room snapshot publishes
 * that back to it as `you`.
 *
 * `SameSite=Lax` is what stands in for a CSRF token, and it is doing the whole
 * job on its own: a cross-site POST — including a plain HTML form, which
 * `express.urlencoded` would otherwise happily parse — carries no cookie at
 * all, so it arrives unauthenticated. The cookie still rides a top-level
 * navigation, which is why the confirmation link in an email lands signed in.
 * Nothing here relies on the request being JSON.
 *
 * The one state-changing GET is `/verify-email`, and it is authorised by the
 * single-use token in its own URL rather than by this cookie.
 */

import crypto from "node:crypto";

const SESSION_COOKIE = "efb_session";
const VISITOR_COOKIE = "efb_visitor";

/** Long, because signing out is explicit and a draft is not a banking session. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VISITOR_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/* `SESSION_SECRET` in production, `ADMIN_SECRET` where only that one is set,
   and a random one otherwise. The random case is not a default to guess: it
   means every session ends when the server restarts, which is right on a dev
   machine and wrong on a deployment — `server.js` says so at boot. */
const SECRET =
  process.env.SESSION_SECRET || process.env.ADMIN_SECRET || crypto.randomBytes(32).toString("hex");

const sign = (payload) =>
  crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");

/** Parsed `Cookie:` header, `{}` when there is none. */
function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    if (!out[name]) out[name] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/**
 * Cookie attributes.
 *
 * `secure` follows `req.secure`, which is only truthful once Express has been
 * told what is in front of it — the same `TRUST_PROXY` the rate limiter needs.
 * Deriving it rather than hard-coding it is what lets the identical code sign
 * you in over http://localhost and refuse to leak the cookie over plain HTTP
 * on a deployment.
 */
const cookieOptions = (req, maxAge) => ({
  httpOnly: true,
  sameSite: "lax",
  secure: Boolean(req.secure),
  path: "/",
  maxAge,
});

export function mintSessionToken({ id }) {
  const payload = Buffer.from(
    JSON.stringify({ uid: Number(id), exp: Date.now() + SESSION_TTL_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The claims of a token this server signed and that has not expired, else null. */
export function readSessionToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  /* timingSafeEqual throws unless both buffers are the same length, so the
     length is compared first — a wrong length is not a timing leak. */
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!(claims.exp > Date.now())) return null;
    return Number.isFinite(claims.uid) && claims.uid > 0 ? claims : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(req, res, user) {
  res.cookie(SESSION_COOKIE, mintSessionToken(user), cookieOptions(req, SESSION_TTL_MS));
}

export function clearSessionCookie(req, res) {
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(req, 0), maxAge: undefined });
}

/**
 * Reads both cookies onto the request, minting a visitor id where there is
 * neither.
 *
 * Installed app-wide in `server.js`, ahead of every router, and that placement
 * is deliberate: the first request a browser makes is the page itself, so the
 * cookie is already set by the time its scripts start calling the API. Minting
 * lazily inside `/api/rooms` instead would let the room page's first two
 * parallel requests each mint a different id and fight over one seat.
 *
 *   req.userId     — the signed-in account, or null
 *   req.identityId — what a room seat is keyed by: the account id as a string,
 *                    or the visitor id. Never null, never from the request body.
 */
export function attachIdentity(req, res, next) {
  const cookies = parseCookies(req);
  const claims = readSessionToken(cookies[SESSION_COOKIE]);
  req.userId = claims ? Number(claims.uid) : null;

  if (req.userId) {
    req.identityId = String(req.userId);
    return next();
  }

  let visitor = cookies[VISITOR_COOKIE];
  if (!/^anon-[A-Za-z0-9_-]{6,64}$/.test(String(visitor || ""))) {
    visitor = `anon-${crypto.randomUUID()}`;
    res.cookie(VISITOR_COOKIE, visitor, cookieOptions(req, VISITOR_TTL_MS));
  }
  req.identityId = visitor;
  next();
}

/**
 * Gate for everything that touches one account's own data.
 *
 * 401 rather than 403: the caller is not forbidden, they are unidentified, and
 * the client turns exactly this status into "your session ended, sign in
 * again" rather than into an error toast nobody can act on.
 */
export function requireSession(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ error: "Sign in to continue.", signedOut: true });
  }
  next();
}
