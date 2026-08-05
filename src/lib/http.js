/**
 * Shared HTTP helpers.
 *
 * Express 4 does not catch rejections from async handlers: an unhandled
 * rejection leaves the request hanging with no response. Every async route is
 * wrapped in `asyncHandler` so failures reach the error middleware instead.
 */

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** Admin gate for /api/admin/*. Falls back to a dev key when ADMIN_KEY is unset. */
export function requireAdminKey(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.adminKey;
  const expected = process.env.ADMIN_KEY || "admin-dev";
  if (!key || key !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/** Reads `userId` from the query string, or responds 400 and returns null. */
export function requireUserIdQuery(req, res, extra = {}) {
  const userId = Number(req.query.userId);
  if (!userId) {
    res.status(400).json({ error: "userId required", ...extra });
    return null;
  }
  return userId;
}

/** Maps a MySQL duplicate-key error on the users table to the offending field. */
export function duplicateUserField(err) {
  return err.message.includes("uq_users_email") ? "email" : "username";
}

export function errorHandler(err, _req, res, _next) {
  console.error("unhandled route error:", err?.message || err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong." });
}

export function notFoundHandler(_req, res) {
  res.status(404).send("404 Not Found");
}
