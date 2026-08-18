import path from "node:path";
import { Router } from "express";
import { PUBLIC_DIR } from "#lib/paths.js";

const router = Router();

/** URL path -> static HTML entry point. Room codes are resolved client-side.
    The three home tabs each get their own URL so a reload lands back on the
    tab the user was looking at; `initTabs` in `public/js/pages/home.js` reads
    the path and keeps it in sync from then on. */
const PAGES = {
  "/": "home.html",
  "/players": "home.html",
  "/game-plans": "home.html",
  "/rooms": "home.html",
  "/signin": "signin.html",
  "/console": "console.html",
  "/room": "room.html",
  "/room/:code": "room.html",
};

for (const [route, file] of Object.entries(PAGES)) {
  router.get(route, (_req, res) => res.sendFile(path.join(PUBLIC_DIR, file)));
}

export default router;
