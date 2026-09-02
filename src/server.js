import "dotenv/config";
import express from "express";
import { handleCardImage } from "#features/media/index.js";
import { PUBLIC_DIR } from "#lib/paths.js";
import { errorHandler, notFoundHandler } from "#lib/http.js";
import { cardImageLimiter } from "#lib/rateLimit.js";
import { adminRoutes, ensureConsoleAdmin } from "#features/admin/index.js";
import { attachIdentity, authRoutes, ensureAuthSchema, verifyEmailPage } from "#features/auth/index.js";
import { gamePlanRoutes } from "#features/gamePlans/index.js";
import pageRoutes from "./pages.js";
import { ensureTestPlayerColumn, ensureTopPlayersSchema, playerRoutes } from "#features/players/index.js";
import { roomRoutes } from "#features/rooms/index.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

/* Behind a proxy every request appears to come from the proxy, so the rate
   limiter would put all of them in one bucket and lock out the world on the
   first busy minute. Same class of problem as APP_BASE_URL in http.js. */
const TRUST_PROXY = process.env.TRUST_PROXY;
if (TRUST_PROXY) app.set("trust proxy", /^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : TRUST_PROXY);

/* Settings that are silent when they are missing and expensive on a deployment:
   mail that goes to this log instead of an inbox, sign-ins and console sessions
   signed with a key that changes every restart — so every deploy signs everyone
   out — emailed links built from the request's own host, and a rate limiter that
   sees the proxy as the whole internet. Every one of
   them is the right answer on a laptop, which is why this is a single line at
   boot and not a refusal to start. */
const DEPLOY_CONFIG = ["SMTP_HOST", "SESSION_SECRET", "ADMIN_SECRET", "APP_BASE_URL", "TRUST_PROXY"];

function reportUnsetConfig() {
  const missing = DEPLOY_CONFIG.filter((key) => !process.env[key]);
  if (!missing.length) return;
  console.log(
    `config: unset — ${missing.join(", ")}. Right on a dev machine; each is its own kind of broken on a deployment (README § Getting started).`,
  );
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* Ahead of every router, so a page load is what mints an anonymous
   visitor's cookie and the API calls behind it all agree about who they
   are. Sets req.userId and req.identityId; nothing downstream reads an id
   out of a query string or a body any more. */
app.use(attachIdentity);

// Card image proxy + R2 cache (frontend uses /img/card/:id.png)
app.get("/img/card/:id.png", cardImageLimiter, handleCardImage);

/* The wake page (`wake/`, served by Vercel) polls this across origins while
   this server is still cold-booting, and has to be able to READ the answer to
   tell "the app is up" from "Render's proxy replied 502 mid-boot". Hence the
   one CORS header in this codebase.

   `*` is safe on this route and nowhere else: the body is the literal
   {ok:true}, the request carries no credentials, and there is nothing here an
   attacker could not learn by loading the site. Do NOT lift this line onto a
   route that reads the session cookie — with credentials in play `*` is
   rejected by browsers anyway, and an origin echo would be the real hole. */
app.get("/api/health", (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.json({ ok: true });
});

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
  reportUnsetConfig();
  /* Not awaited by the listener's caller: a database that is slow or down
     delays these four, not the server. Each handles its own failure — two of
     them did not, and an unreachable database at boot took the whole process
     down with an unhandled rejection rather than logging a line.

     The order between them is load-bearing, though — the seeder writes
     `email_verified` on the account it restores, and that column may not exist
     yet on a database created before confirmation did. */
  await ensureAuthSchema();
  await ensureTopPlayersSchema();
  await ensureTestPlayerColumn();
  ensureConsoleAdmin();
});
