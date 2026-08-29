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

/**
 * Absolute origin to build a link that will be read outside the browser.
 *
 * `APP_BASE_URL` wins where it is set, and on a deployment behind a proxy it
 * has to be: `req.protocol` reports the hop into the proxy, so a site served
 * over HTTPS mints `http://` links unless Express is told to trust the
 * forwarding headers. Falling back to the request's own host is what lets a dev
 * machine send a working link with nothing configured at all.
 */
export function requestBaseUrl(req) {
  const configured = String(process.env.APP_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
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
  /* A body that is not valid JSON throws from `express.json()`, and its message
     quotes the fragment it choked on — which is the request body, which on
     `/api/signin` is somebody's password. Log that it happened, never what it
     said. */
  if (err?.type === "entity.parse.failed") {
    console.error("unhandled route error: malformed request body");
    return res.status(400).json({ error: "Malformed request body." });
  }
  console.error("unhandled route error:", describeError(err));
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong." });
}

export function notFoundHandler(_req, res) {
  res.status(404).send("404 Not Found");
}
