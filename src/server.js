import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Returns the top 20 players from the local DB (populated by `npm run scrape`)
app.get("/api/top-players", async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT pesdb_id AS id, name, position, overall, club, nationality
       FROM   players_catalog
       ORDER  BY overall DESC
       LIMIT  20`,
    );

    res.json({ players: rows });
  } catch (err) {
    console.error("top-players db error:", err.message);
    // Fall back gracefully so the UI can still use its hardcoded list
    res.status(503).json({ error: "Database unavailable", players: [] });
  }
});

// Returns players for search / game-plan picker
app.get("/api/players", async (req, res) => {
  try {
    const { q = "", position, limit = 50, offset = 0 } = req.query;

    const params = [];
    const conditions = [];

    if (q) {
      conditions.push("name LIKE ?");
      params.push(`%${q}%`);
    }
    if (position) {
      conditions.push("position = ?");
      params.push(position);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await db.query(
      `SELECT pesdb_id AS id, name, position, overall, club, nationality
       FROM   players_catalog
       ${where}
       ORDER  BY overall DESC
       LIMIT  ? OFFSET ?`,
      [...params, Number(limit), Number(offset)],
    );

    res.json({ players: rows });
  } catch (err) {
    console.error("players db error:", err.message);
    res.status(503).json({ error: "Database unavailable", players: [] });
  }
});

app.get("/signin", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "signin.html"));
});

app.use(express.static(path.join(__dirname, "..", "public")));

app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, "..", "public", "404.html"));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
