/* ============================================================
   The signed-in user, as persisted by the sign-in page

   `signin.js` writes `efb_user` to localStorage; every page reads it back
   through here. The home and room bundles each carried a byte-identical copy
   of `getUser` before this module existed.

   **This is display state, not credentials.** It used to be the whole session:
   the id in it was posted with every request and the server took it at its
   word, so editing one number in localStorage made you somebody else. The
   session is now an httpOnly cookie the server signs and this page cannot
   read — what is left here is a username to draw in the account menu and an
   `isAdmin` hint that decides whether the console link appears.

   Two consequences worth knowing. Nothing here has to be sent anywhere: the
   cookie rides along on same-origin requests by itself. And the two can
   disagree — a cookie expires while localStorage still says "signed in" — which
   is what `bounceIfSignedOut` is for.
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

/** Ends the session on the server, then locally. */
export async function signOut() {
  /* The local copy goes whatever the network did. A failed request must not
     leave somebody looking at an account menu they have already left. */
  try { await fetch("/api/signout", { method: "POST" }); } catch { /* ignore */ }
  localStorage.removeItem("efb_user");
}

/**
 * Handles the one answer no caller can do anything useful with: the session
 * ended. Returns true when it has taken over — clearing the stale local user
 * and sending the browser to sign in — so the caller can stop.
 */
export function bounceIfSignedOut(res) {
  if (res?.status !== 401) return false;
  localStorage.removeItem("efb_user");
  window.location.href = "/signin";
  return true;
}
