/* ============================================================
   Per-IP rate limiting

   Every endpoint that costs money or guards a password used to be open. The
   metered ones are the card-image proxy (Cloudflare R2 egress) and the two
   places that send mail (SMTP), and `/signin` was a free brute-force target.

   In-memory and dependency-free, on purpose. A limiter that shares the room
   store's fate is honest about what this app is: one process, state in memory,
   restart clears it. Adding `express-rate-limit` would buy a nicer API and the
   same durability. If the app is ever deployed to more than one process, this
   becomes per-process and the counts want moving into MySQL or Redis; that is
   noted in DECISIONS.md rather than pre-built.

   Imported by `server.js` and the auth, players, gamePlans and rooms routers.
   Nothing else, and nothing outside `src/` — importing it must stay free of
   side effects.

   **Behind a proxy, set `TRUST_PROXY`.** Otherwise `req.ip` is the proxy for
   every request, all callers share one bucket, and the first busy minute locks
   out everybody. Same failure mode as `APP_BASE_URL` in `http.js`, and the same
   fix: tell Express what is in front of it.
   ============================================================ */

/** `${policy}:${ip}` -> { count, resetAt }. Swept, so it cannot grow forever. */
const buckets = new Map();

/* Sweeping happens on the way through a request, not on a timer.

   The first version ran `setInterval(...).unref()` at module scope, which made
   importing this file start a timer as a side effect — the same thing
   `lib/cli.js` and the `isMainModule` guard exist to prevent elsewhere in this
   repo. It is not needed: the map is only ever touched while serving a
   request, so the request is the only moment it can have grown.

   Every entry is already re-armed on access when its window has closed. The
   sweep exists solely for addresses that never come back, so it can run on one
   call in `SWEEP_EVERY` and be exactly as correct. No timer, no `unref`, no
   import-time side effect. */
const SWEEP_EVERY = 500;
let sinceSweep = 0;

function sweepExpired(now) {
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}

/**
 * A fixed-window limiter. `name` namespaces the bucket, so an IP that has used
 * up its sign-in attempts can still load the catalog.
 */
export function rateLimit({ name, windowMs, max }) {
  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = `${name}:${req.ip}`;

    if (++sinceSweep >= SWEEP_EVERY) { sinceSweep = 0; sweepExpired(now); }

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const resetSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    res.setHeader("RateLimit-Reset", String(resetSec));

    if (bucket.count > max) {
      res.setHeader("Retry-After", String(resetSec));
      /* What happened, then what to do about it, in that order. */
      return res.status(429).json({
        error: `Too many requests. Try again in ${resetSec} seconds.`,
      });
    }
    return next();
  };
}

/* ---------- the policy, in one place so the numbers can be compared ---------- */

/** Sign-in and sign-up. Tight enough to make guessing pointless. */
export const authLimiter = rateLimit({ name: "auth", windowMs: 15 * 60_000, max: 15 });

/** Anything that sends mail. The cost here is per message and it is ours. */
export const emailLimiter = rateLimit({ name: "email", windowMs: 60 * 60_000, max: 5 });

/** Catalog reads. Generous: filtering the grid is the main thing users do. */
export const catalogLimiter = rateLimit({ name: "catalog", windowMs: 60_000, max: 300 });

/**
 * The card-image proxy, and the reason this file exists: every miss is R2
 * egress we pay for. Deliberately high because a catalog page requests a whole
 * grid at once and the browser caches them afterwards, so a real session
 * never approaches it while a scraper does immediately.
 */
export const cardImageLimiter = rateLimit({ name: "cardImage", windowMs: 60_000, max: 1200 });

/**
 * The signed-in app surface: the squad, game plans, the profile.
 *
 * Being authenticated used to mean being unlimited, which made an account the
 * cheapest way to hammer the database. 300/min is the same rung as the catalog
 * because the traffic is the same shape — a person clicking a UI — and a real
 * session never comes close.
 */
export const appLimiter = rateLimit({ name: "app", windowMs: 60_000, max: 300 });

/**
 * Room routes **other than presence**, which `routes.js` exempts explicitly.
 *
 * Deliberately loose, because two of these are bursty by design and a limit
 * that interrupts a draft is worse than no limit at all. Confirming a ban
 * phase posts one request *per staged ban* (`submitBansToApi` sends them
 * singly so one rejection cannot discard the rest), so a full side is ~23 in a
 * few seconds; and the lobby's config push is debounced at 300 ms, so dragging
 * a stepper can sustain ~200/min on its own. Both players can share one IP.
 * 600 leaves all of that room and still caps a runaway loop.
 */
export const roomLimiter = rateLimit({ name: "room", windowMs: 60_000, max: 600 });

/**
 * `POST /api/client-error`. Tight, because this one writes to the log.
 *
 * The threat is not cost, it is volume: an unauthenticated endpoint that
 * appends a line per call is a way to bury a real error under thousands of
 * fake ones, and a page stuck in an error loop would do the same by accident.
 * 30 a minute is far more than a genuine burst — the client also caps itself
 * per page load — and turns a loop into a trickle.
 *
 * Note the body is still parsed by the app-wide `express.json()` and its
 * default 100 kB limit before it reaches here. That is deliberate rather than
 * overlooked: the caps that matter are on what gets *written*, and those live
 * in `clientErrors.js`. A big body is parsed and thrown away.
 */
export const clientErrorLimiter = rateLimit({ name: "clientError", windowMs: 60_000, max: 30 });

/* Deliberately not limited: `/api/rooms/:code/presence`. It is a 500 ms
   heartbeat by design, which is 120 requests a minute per client before anyone
   has done anything. Any threshold low enough to mean something would end the
   draft it is meant to protect. `roomLimiter` skips it by path for that reason,
   and that exemption is the single place the rule lives. */
