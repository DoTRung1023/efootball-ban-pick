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

   **Behind a proxy, set `TRUST_PROXY`.** Otherwise `req.ip` is the proxy for
   every request, all callers share one bucket, and the first busy minute locks
   out everybody. Same failure mode as `APP_BASE_URL` in `http.js`, and the same
   fix: tell Express what is in front of it.
   ============================================================ */

/** `${policy}:${ip}` -> { count, resetAt }. Swept, so it cannot grow forever. */
const buckets = new Map();

const SWEEP_MS = 60_000;

/* `unref` so a sweep timer never holds the process open. `scrape.js` imports
   this transitively and has to be able to exit when it is done. */
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}, SWEEP_MS).unref();

/**
 * A fixed-window limiter. `name` namespaces the bucket, so an IP that has used
 * up its sign-in attempts can still load the catalog.
 */
export function rateLimit({ name, windowMs, max }) {
  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = `${name}:${req.ip}`;

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

/* Deliberately not limited: `/api/rooms/:code/presence`. It is a 500 ms
   heartbeat by design, which is 120 requests a minute per client before anyone
   has done anything. Any threshold low enough to mean something would end the
   draft it is meant to protect. */
