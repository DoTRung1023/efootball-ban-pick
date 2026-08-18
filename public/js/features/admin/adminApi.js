/* ============================================================
   The console session token and the fetch wrapper that carries it

   A token is minted by `POST /api/admin/session` against the signed-in account
   (`users.is_admin` + the account password) and lives in sessionStorage, so it
   survives a reload but not a new tab. It travels in the `x-admin-token` header
   rather than the query string, which keeps it out of URLs, logs and history.
   ============================================================ */

const TOKEN_STORE = "efb_admin_token";

let token = sessionStorage.getItem(TOKEN_STORE) || "";
let sessionUserId = null;

/** Whose console session this is — the USERS tab refuses to demote that row. */
export function getSessionUserId() {
  return sessionUserId;
}

export function clearToken() {
  token = "";
  sessionUserId = null;
  sessionStorage.removeItem(TOKEN_STORE);
}

/**
 * Exchanges the account password for a console token.
 * Resolves `{ ok: true, username }`, or `{ ok: false, error }` with the
 * server's own message — 403 not an admin, 401 wrong password, 429 locked out.
 */
export async function openSession(userId, password) {
  try {
    const r = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, password }),
    });
    const data = await r.json();
    if (!r.ok) return { ok: false, error: data.error || "Could not open the console." };
    token = data.token;
    sessionUserId = userId;
    sessionStorage.setItem(TOKEN_STORE, token);
    return { ok: true, username: data.username };
  } catch {
    return { ok: false, error: "Network error. Please try again." };
  }
}

/** The session behind the stored token, or null — the silent re-auth on load. */
export async function resumeSession() {
  if (!token) return null;
  try {
    const r = await fetch("/api/admin/me", { headers: { "x-admin-token": token } });
    if (!r.ok) { clearToken(); return null; }
    const session = await r.json();
    sessionUserId = session.userId;
    return session;
  } catch {
    return null;
  }
}

/**
 * Every dashboard call goes through here.
 *
 * A 401 means the token expired mid-session; the page reloads back to the gate
 * rather than leaving every panel to print "Failed to load" at the same time.
 */
async function request(path, init) {
  const r = await fetch(path, { ...init, headers: { ...init?.headers, "x-admin-token": token } });
  if (r.status === 401) {
    clearToken();
    location.reload();
    throw new Error("session expired");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

export function apiFetch(path) {
  return request(path);
}

/** Writes carry the server's own error message, which the caller shows as-is. */
export function apiSend(path, method, body) {
  return request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
