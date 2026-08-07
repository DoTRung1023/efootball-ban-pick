/* ============================================================
   The signed-in user, as persisted by the sign-in page

   `signin.js` writes `efb_user` to localStorage; every page reads it back
   through here. The home and room bundles each carried a byte-identical copy
   of `getUser` before this module existed.
   ============================================================ */

export function getUser() {
  try { return JSON.parse(localStorage.getItem("efb_user") || "null"); }
  catch { return null; }
}

/** Home/admin pages: bounce to sign-in when there is no session. */
export function requireAuth() {
  const user = getUser();
  if (!user) { window.location.href = "/signin"; return null; }
  return user;
}
