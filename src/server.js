import "dotenv/config";
import express from "express";
import { handleCardImage } from "#features/media/index.js";
import { PUBLIC_DIR } from "#lib/paths.js";
import { errorHandler, notFoundHandler } from "#lib/http.js";
import { adminRoutes, ensureConsoleAdmin } from "#features/admin/index.js";
import { authRoutes, ensureAuthSchema, verifyEmailPage } from "#features/auth/index.js";
import { gamePlanRoutes } from "#features/gamePlans/index.js";
import pageRoutes from "./pages.js";
import { playerRoutes } from "#features/players/index.js";
import { roomRoutes } from "#features/rooms/index.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Card image proxy + R2 cache (frontend uses /img/card/:id.png)
app.get("/img/card/:id.png", handleCardImage);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* The confirmation link from a sign-up email. Not under /api because a person
   reads it in a mail client; it redirects to /signin either way. */
app.get("/verify-email", verifyEmailPage);

app.use("/api", playerRoutes);
app.use("/api", authRoutes);
app.use("/api/game-plans", gamePlanRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/admin", adminRoutes);

app.use(pageRoutes);
app.use(express.static(PUBLIC_DIR));

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, async () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  /* Not awaited by the listener's caller: a database that is slow or down
     delays these two, not the server. Both handle their own failures.

     The order between them is load-bearing, though — the seeder writes
     `email_verified` on the account it restores, and that column may not exist
     yet on a database created before confirmation did. */
  await ensureAuthSchema();
  ensureConsoleAdmin();
});
