import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import db from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Fixed carousel players (curated list of featured legends & top stars)
const TOP_CAROUSEL_PLAYERS = [
  { id: "89136409091415", name: "Lionel Messi",        position: "RWF", overall: 105, club: "FC Barcelona",      nationality: "Argentina"       },
  { id: "89137214427270", name: "Eden Hazard",          position: "AMF", overall: 104, club: "Belgium",           nationality: "Belgium"         },
  { id: "89136677522134", name: "George Best",          position: "RWF", overall: 104, club: "Manchester United", nationality: "Northern Ireland" },
  { id: "89136140651034", name: "Zlatan Ibrahimović",   position: "CF",  overall: 104, club: "AC Milan",          nationality: "Sweden"          },
  { id: "88040387119495", name: "Pelé",                 position: "SS",  overall: 103, club: "Santos FC",         nationality: "Brazil"          },
  { id: "88039581945329", name: "Franco Baresi",        position: "CB",  overall: 103, club: "AC Milan",          nationality: "Italy"           },
  { id: "88039581945324", name: "Franz Beckenbauer",    position: "CB",  overall: 103, club: "München RW",        nationality: "Germany"         },
  { id: "88039581945323", name: "Johan Cruyff",         position: "CF",  overall: 103, club: "FC Barcelona",      nationality: "Netherlands"     },
  { id: "106771008057263", name: "Victor Osimhen",      position: "CF",  overall: 102, club: "Galatasaray SK",    nationality: "Nigeria"         },
  { id: "89134261635137", name: "Luis Suárez",          position: "CF",  overall: 102, club: "FC Barcelona",      nationality: "Uruguay"         },
  { id: "89133724764840", name: "Gareth Bale",          position: "RWF", overall: 102, club: "Madrid Chamartin B", nationality: "Wales"          },
  { id: "88040655690467", name: "Jaap Stam",            position: "CB",  overall: 102, club: "Manchester United", nationality: "Netherlands"     },
  { id: "88040655554922", name: "Gerd Müller",          position: "CF",  overall: 102, club: "München RW",        nationality: "Germany"         },
  { id: "88040655554414", name: "Gianfranco Zola",      position: "SS",  overall: 102, club: "Chelsea B",         nationality: "Italy"           },
  { id: "88040387251641", name: "Carles Puyol",         position: "CB",  overall: 102, club: "FC Barcelona",      nationality: "Spain"           },
  { id: "88040387126189", name: "Pepe",                 position: "CB",  overall: 102, club: "Portugal",          nationality: "Portugal"        },
  { id: "88040387120247", name: "Petr Čech",            position: "GK",  overall: 102, club: "Chelsea B",         nationality: "Czechia"         },
  { id: "88040387119839", name: "Michel Platini",       position: "AMF", overall: 102, club: "Piemonte BN",       nationality: "France"          },
  { id: "88040387118039", name: "Gianluigi Buffon",     position: "GK",  overall: 102, club: "Piemonte BN",       nationality: "Italy"           },
  { id: "88039850289220", name: "Raphaël Varane",       position: "CB",  overall: 102, club: "Madrid Chamartin B", nationality: "France"         },
  { id: "88039850384095", name: "Marcel Desailly",      position: "CB",  overall: 102, club: "Chelsea B",         nationality: "France"          },
];

app.get("/api/top-players", (_req, res) => {
  res.json({ players: TOP_CAROUSEL_PLAYERS });
});

const POS_GROUPS = {
  GK:  ["GK"],
  DEF: ["CB", "LB", "RB", "LWB", "RWB"],
  MID: ["CMF", "DMF", "AMF"],
  FWD: ["RWF", "LWF", "CF", "SS"],
};

const SORT_MAP = {
  overall_desc:    "overall DESC, name ASC",
  overall_asc:     "overall ASC,  name ASC",
  name_asc:        "name ASC",
  name_desc:       "name DESC",
  position_asc:    "position ASC, overall DESC",
  height_desc:     "height DESC",
  height_asc:      "ISNULL(height), height ASC",
  weight_desc:     "weight DESC",
  weight_asc:      "ISNULL(weight), weight ASC",
  age_asc:         "ISNULL(age), age ASC",
  age_desc:        "age DESC",
  club_asc:        "ISNULL(club), club ASC, overall DESC",
  nationality_asc: "ISNULL(nationality), nationality ASC, overall DESC",
};

// Returns distinct club / nationality values for autocomplete
app.get("/api/players/distinct", async (req, res) => {
  const { field, q = "" } = req.query;
  if (!["club", "nationality"].includes(field))
    return res.status(400).json({ error: "Invalid field" });
  const [rows] = await db.query(
    `SELECT DISTINCT ${field} FROM players_catalog
     WHERE ${field} IS NOT NULL AND ${field} != '' AND ${field} LIKE ?
     ORDER BY ${field} ASC LIMIT 10`,
    [`%${q}%`]
  );
  res.json(rows.map((r) => r[field]));
});

// Returns players for search / add-player catalog
app.get("/api/players", async (req, res) => {
  try {
    const {
      q = "", position, positions, posGroup,
      sortBy = "overall_desc",
      club, nationality,
      heightMin, heightMax,
      weightMin, weightMax,
      ageMin,    ageMax,
      limit = 50, offset = 0,
    } = req.query;

    const params = [];
    const conditions = [];

    if (q)           { conditions.push("name LIKE ?");          params.push(`%${q}%`); }
    const posList = positions
      ? positions.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean)
      : posGroup && POS_GROUPS[posGroup]
        ? POS_GROUPS[posGroup]
        : position ? [position.toUpperCase()] : [];
    if (posList.length) {
      const ph = posList.map(() => "?").join(",");
      conditions.push(`position IN (${ph})`);
      params.push(...posList);
    }
    if (club)        { conditions.push("club LIKE ?");          params.push(`%${club}%`); }
    if (nationality) { conditions.push("nationality LIKE ?");   params.push(`%${nationality}%`); }
    if (heightMin)   { conditions.push("height >= ?");          params.push(Number(heightMin)); }
    if (heightMax)   { conditions.push("height <= ?");          params.push(Number(heightMax)); }
    if (weightMin)   { conditions.push("weight >= ?");          params.push(Number(weightMin)); }
    if (weightMax)   { conditions.push("weight <= ?");          params.push(Number(weightMax)); }
    if (ageMin)      { conditions.push("age >= ?");             params.push(Number(ageMin)); }
    if (ageMax)      { conditions.push("age <= ?");             params.push(Number(ageMax)); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const order = SORT_MAP[sortBy] ?? SORT_MAP.overall_desc;

    const [rows] = await db.query(
      `SELECT pesdb_id AS id, name, position, overall, club, nationality, height, weight, age
       FROM   players_catalog
       ${where}
       ORDER  BY ${order}
       LIMIT  ? OFFSET ?`,
      [...params, Number(limit), Number(offset)],
    );

    res.json({ players: rows });
  } catch (err) {
    console.error("players db error:", err.message);
    res.status(503).json({ error: "Database unavailable", players: [] });
  }
});

// ── My Squad ────────────────────────────────────────────────
app.get("/api/my-players", async (req, res) => {
  const userId = Number(req.query.userId);
  if (!userId) return res.status(400).json({ error: "userId required", players: [] });

  try {
    const [rows] = await db.query(
      `SELECT p.id, p.name, p.position, p.overall, p.club, p.pesdb_id,
              c.nationality, c.height, c.weight, c.age
       FROM   players p
       LEFT JOIN players_catalog c ON c.pesdb_id = p.pesdb_id
       WHERE  p.user_id = ?
       ORDER  BY p.overall DESC, p.name ASC`,
      [userId],
    );
    res.json({ players: rows });
  } catch (err) {
    console.error("my-players error:", err.message);
    res.status(503).json({ error: "Database unavailable", players: [] });
  }
});

app.post("/api/my-players", async (req, res) => {
  const { userId, name, position, club, overall, pesdbId } = req.body;

  if (!userId || !name || !position) {
    return res.status(400).json({ error: "userId, name, and position are required." });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO players (user_id, name, position, club, overall, pesdb_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [Number(userId), name.trim(), position, club || null, overall || null, pesdbId || null],
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Player is already in your squad." });
    }
    console.error("add player error:", err.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.delete("/api/my-players", async (req, res) => {
  const { userId, playerIds } = req.body;

  if (!userId || !Array.isArray(playerIds) || !playerIds.length) {
    return res.status(400).json({ error: "userId and playerIds[] required." });
  }

  try {
    const ph = playerIds.map(() => "?").join(",");
    await db.query(
      `DELETE FROM players WHERE user_id = ? AND id IN (${ph})`,
      [Number(userId), ...playerIds],
    );
    res.json({ message: "Removed." });
  } catch (err) {
    console.error("delete player error:", err.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

// ── Auth ────────────────────────────────────────────────────
app.post("/api/signin", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
    const [rows] = await db.query(
      "SELECT id, username, email, password FROM users WHERE username = ? OR email = ?",
      [username.trim(), username.trim().toLowerCase()],
    );

    if (!rows.length) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password ?? "");
    if (!match) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    res.json({ id: user.id, username: user.username, email: user.email });
  } catch (err) {
    console.error("signin error:", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

app.post("/api/signup", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "All fields are required." });
  }
  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({ error: "Username must be 3–50 characters." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email address." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  try {
    const hashed = await bcrypt.hash(password, 12);
    await db.query(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
      [username.trim(), email.trim().toLowerCase(), hashed],
    );
    res.status(201).json({ message: "Account created successfully." });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      const field = err.message.includes("uq_users_email") ? "email" : "username";
      return res.status(409).json({ error: `That ${field} is already taken.` });
    }
    console.error("signup error:", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ── Game Plans ───────────────────────────────────────────────
app.get("/api/game-plans", async (req, res) => {
  const userId = Number(req.query.userId);
  if (!userId) return res.status(400).json({ error: "userId required", plans: [] });

  try {
    const [plans] = await db.query(
      `SELECT id, name, formation, created_at
       FROM   game_plans
       WHERE  user_id = ?
       ORDER  BY created_at DESC`,
      [userId],
    );
    res.json({ plans });
  } catch (err) {
    console.error("game-plans error:", err.message);
    res.status(503).json({ error: "Database unavailable", plans: [] });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "home.html"));
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
