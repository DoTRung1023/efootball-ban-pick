import "dotenv/config";
import express from "express";
import { handleCardImage } from "./cardImageCacheR2.js";
import { PUBLIC_DIR } from "./lib/paths.js";
import { errorHandler, notFoundHandler } from "./lib/http.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import gamePlanRoutes from "./routes/gamePlans.js";
import pageRoutes from "./routes/pages.js";
import playerRoutes from "./routes/players.js";
import roomRoutes from "./routes/rooms.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Card image proxy + R2 cache (frontend uses /img/card/:id.png)
app.get("/img/card/:id.png", handleCardImage);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api", playerRoutes);
app.use("/api", authRoutes);
app.use("/api/game-plans", gamePlanRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/admin", adminRoutes);

app.use(pageRoutes);
app.use(express.static(PUBLIC_DIR));

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
