import path from "node:path";
import { Router } from "express";
import { PUBLIC_DIR } from "#lib/paths.js";

const router = Router();

/** URL path -> static HTML entry point. Room codes are resolved client-side.
    The three home tabs each get their own URL so a reload lands back on the
    tab the user was looking at; `initTabs` in `public/js/pages/home.js` reads
    the path and keeps it in sync from then on. */
const PAGES = {
  "/": "signin.html",
  "/players": "home.html",
  "/game-plans": "home.html",
  "/rooms": "home.html",
  "/signin": "signin.html",
  "/console": "console.html",
  "/room": "room.html",
  "/room/:code": "room.html",
};

/**
 * Where a signed-in visitor is sent instead of the sign-in page.
 *
 * `/` used to serve `home.html`, which meant a signed-out visitor downloaded
 * the whole home page — its markup, its seven stylesheets, its entry module —
 * before `requireAuth` read localStorage and sent them to `/signin` anyway.
 * The first thing they saw was a page they were not allowed to be on.
 *
 * **The decision is made here, on the server.** The client cannot make it
 * correctly: identity is a signed httpOnly cookie (DECISIONS.md §1) and
 * `efb_user` in localStorage is display state that can disagree with it. It is
 * also what makes the redirect flash-free — a signed-in visitor never fetches
 * the sign-in page at all, rather than rendering it and being moved off.
 *
 * `/` is the link every "back to home" button already uses, and
 * `signInForm.js` navigates to it after a successful sign-in. Both now mean
 * "take me wherever I belong", which is what they were always trying to say.
 */
const SIGNED_IN_HOME = "/players";

/**
 * **Only `/` decides. `/signin` always serves the sign-in page, and that is
 * not an oversight — it is the fix for an infinite redirect.**
 *
 * The server and the client can disagree about who you are: the cookie is the
 * truth, and `efb_user` in localStorage is a copy of it that can go missing on
 * its own (site data cleared, a browser that refuses storage). When it does,
 * `requireAuth` on `/players` bounces to `/signin` — and while `/signin` also
 * redirected a cookie-bearing visitor to `/players`, those two rules chased
 * each other: measured, 134 document navigations in six seconds, ping-ponging
 * `/players -> /signin -> /players` until the tab was closed.
 *
 * A sign-in page has to be a place a person can always reach and stay on. That
 * is what ends the loop, and it is also the right answer for the visitor: the
 * client genuinely does not know who they are, so asking them is correct.
 */
const ENTRY_ROUTE = "/";

for (const [route, file] of Object.entries(PAGES)) {
  router.get(route, (req, res) => {
    if (route === ENTRY_ROUTE) {
      /* The answer depends on a cookie, so it must not be cached — by the
         browser, or by anything Render puts in front of this. Without it a
         stored copy of the sign-in page can be served to somebody who is
         signed in, and the redirect below never runs. */
      res.set("Cache-Control", "no-store");
      if (req.userId) return res.redirect(SIGNED_IN_HOME);
    }
    res.sendFile(path.join(PUBLIC_DIR, file));
  });
}

export default router;
