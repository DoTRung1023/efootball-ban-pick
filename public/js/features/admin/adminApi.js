/* ============================================================
   Admin key + the fetch wrapper that carries it

   The key lives in sessionStorage, so it survives a reload but not a new tab.
   Every admin endpoint takes it as `?adminKey=` — see `requireAdminKey` in
   `src/lib/http.js`.
   ============================================================ */

const KEY_STORE = "efb_admin_key";

let adminKey = sessionStorage.getItem(KEY_STORE) || "";

export function getAdminKey() {
  return adminKey;
}

export function storeAdminKey(key) {
  adminKey = key;
  sessionStorage.setItem(KEY_STORE, key);
}

export function clearAdminKey() {
  adminKey = "";
  sessionStorage.removeItem(KEY_STORE);
}

/** A key is valid iff the stats endpoint accepts it. */
export async function verifyKey(key) {
  const r = await fetch("/api/admin/stats?adminKey=" + encodeURIComponent(key));
  return r.ok;
}

export async function apiFetch(path) {
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(path + sep + "adminKey=" + encodeURIComponent(adminKey));
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
