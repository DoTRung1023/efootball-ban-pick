/* ============================================================
   The console session token and the fetch wrapper that carries it

   A token is minted by `POST /api/admin/session` against the signed-in account
   (`users.is_admin` + the account password) and lives in sessionStorage, so it
   survives a reload but not a new tab. It travels in the `x-admin-token` header
   rather than the query string, which keeps it out of URLs, logs and history.
   ============================================================ */

const TOKEN_STORE = "efb_admin_token";

let token = sessionStorage.getItem(TOKEN_STORE) || "";

export function hasToken() {
  return Boolean(token);
}

export function clearToken() {
  token = "";
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
    sessionStorage.setItem(TOKEN_STORE, token);
    return { ok: true, username: data.username };
  } catch {
    return { ok: false, error: "Network error. Please try again." };
  }
}

/** True when the stored token is still valid — the silent re-auth on load. */
export async function resumeSession() {
  if (!token) return null;
  try {
    const r = await fetch("/api/admin/me", { headers: { "x-admin-token": token } });
    if (!r.ok) { clearToken(); return null; }
    return r.json();
  } catch {
    return null;
  }
}

/**
 * Every dashboard fetch goes through here.
 *
 * A 401 means the token expired mid-session; the page reloads back to the gate
 * rather than leaving every panel to print "Failed to load" at the same time.
 */
export async function apiFetch(path) {
  const r = await fetch(path, { headers: { "x-admin-token": token } });
  if (r.status === 401) {
    clearToken();
    location.reload();
    throw new Error("session expired");
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
