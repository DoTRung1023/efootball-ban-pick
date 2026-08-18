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
  return String(err?.message || "").includes("uq_users_email") ? "email" : "username";
}

/**
 * Human-readable one-liner for a caught error.
 *
 * mysql2 connection failures carry an empty `message` — the useful part is in
 * `code` (ECONNREFUSED, ER_ACCESS_DENIED_ERROR, ER_NO_SUCH_TABLE, …). Logging
 * `err.message` alone prints nothing and hides the cause, so prefer the code
 * when there is no message.
 */
export function describeError(err) {
  if (!err) return "unknown error";
  const message = String(err.message || "").trim();
  const code = err.code ? String(err.code) : "";
  if (message && code) return `${code}: ${message}`;
  return message || code || String(err);
}

export function errorHandler(err, _req, res, _next) {
  console.error("unhandled route error:", describeError(err));
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong." });
}

export function notFoundHandler(_req, res) {
  res.status(404).send("404 Not Found");
}
