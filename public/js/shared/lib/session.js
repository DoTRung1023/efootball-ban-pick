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

/* One bounce per page load. A page fires several requests at once, and a
   deleted account 401s all of them — without this the first answer starts the
   navigation and the rest pile more assignments onto it. */
let bounced = false;

/**
 * Handles the one answer no caller can do anything useful with: the session
 * ended. Clears the stale local user and sends the browser to sign in.
 */
function signOutLocally() {
  if (bounced) return;
  bounced = true;
  try { localStorage.removeItem("efb_user"); } catch { /* storage may be blocked */ }
  window.location.href = "/signin";
}

/**
 * Sends the browser to sign-in as soon as the server says the session is over.
 *
 * **This existed as `bounceIfSignedOut(res)` and nothing ever called it**, which
 * is why deleting an account did nothing to the browser holding its cookie: the
 * server refused every request and the page carried on showing a signed-in UI
 * around the failures. A helper each caller has to remember is a helper that
 * gets forgotten at one of twenty fetch sites, so this is installed once per
 * page instead and covers the calls nobody has written yet.
 *
 * **It fires on `signedOut: true` in the body, not on the 401 alone.** A wrong
 * password is also a 401, and bouncing the sign-in page to itself mid-login
 * would be its own bug. Only `requireSession` sets that flag — a session that
 * was valid and no longer is. The console's own 401s do not carry it and keep
 * their own handling in `adminApi.js`.
 */
export function installSignedOutGuard() {
  const original = window.fetch;
  window.fetch = async (...args) => {
    const res = await original(...args);
    if (res.status === 401) {
      /* Clone: reading the body here must not consume it for the real caller. */
      try {
        const body = await res.clone().json();
        if (body?.signedOut) signOutLocally();
      } catch { /* not JSON, so not ours */ }
    }
    return res;
  };
}
