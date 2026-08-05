import path from "node:path";
import { Router } from "express";
import { PUBLIC_DIR } from "../lib/paths.js";

const router = Router();

/** URL path -> static HTML entry point. Room codes are resolved client-side. */
const PAGES = {
  "/": "home.html",
  "/signin": "signin.html",
  "/admin": "admin.html",
  "/room": "room.html",
  "/room/:code": "room.html",
};

for (const [route, file] of Object.entries(PAGES)) {
  router.get(route, (_req, res) => res.sendFile(path.join(PUBLIC_DIR, file)));
}

export default router;
