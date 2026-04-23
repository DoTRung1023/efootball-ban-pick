import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import db from "./db.js";
import { handleCardImage } from "./cardImageCacheR2.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Card image proxy + R2 cache (frontend uses /img/card/:id.png)
app.get("/img/card/:id.png", handleCardImage);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Fixed carousel players (curated list of featured legends & top stars)
const TOP_CAROUSEL_PLAYERS = [
  { id: "89136409091415", name: "Lionel Messi",         position: "RWF", overall: 105, club: "FC Barcelona",      nationality: "Argentina"       },
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
  DEF: ["CB", "LB", "RB"],
  MID: ["CMF", "DMF", "AMF", "LMF", "RMF"],
  FWD: ["RWF", "LWF", "CF", "SS"],
};

/** Match client POSITION_LINE_ORDER: CF…GK forward, reverse for DESC. */
const POSITION_ORDER_FIELD =
  "FIELD(UPPER(TRIM(IFNULL(position,''))), 'CF','SS','RWF','LWF','AMF','RMF','LMF','CMF','DMF','RB','LB','CB','GK')";

const SORT_MAP = {
  overall_max_desc: `ISNULL(overall_max), overall_max DESC, overall DESC, CASE WHEN ${POSITION_ORDER_FIELD} = 0 THEN 999 ELSE ${POSITION_ORDER_FIELD} END ASC, name ASC`,
  overall_max_asc:  `ISNULL(overall_max), overall_max ASC, overall ASC, CASE WHEN ${POSITION_ORDER_FIELD} = 0 THEN 999 ELSE ${POSITION_ORDER_FIELD} END ASC, name ASC`,
  overall_desc:    `overall DESC, CASE WHEN ${POSITION_ORDER_FIELD} = 0 THEN 999 ELSE ${POSITION_ORDER_FIELD} END ASC, name ASC`,
  overall_asc:     `overall ASC, CASE WHEN ${POSITION_ORDER_FIELD} = 0 THEN 999 ELSE ${POSITION_ORDER_FIELD} END ASC, name ASC`,
  name_asc:        "name DESC, overall DESC",
  name_desc:       "name ASC, overall DESC",
  position_asc:    `CASE WHEN ${POSITION_ORDER_FIELD} = 0 THEN 999 ELSE ${POSITION_ORDER_FIELD} END ASC, overall DESC, name ASC`,
  position_desc:   `${POSITION_ORDER_FIELD} DESC, overall DESC, name ASC`,
  height_desc:     "height DESC, overall DESC, name ASC",
  height_asc:      "ISNULL(height), height ASC, overall DESC, name ASC",
  weight_desc:     "weight DESC, overall DESC, name ASC",
  weight_asc:      "ISNULL(weight), weight ASC, overall DESC, name ASC",
  age_asc:         "ISNULL(age), age ASC, overall DESC, name ASC",
  age_desc:        "age DESC, overall DESC, name ASC",
  club_asc:        "ISNULL(club), club ASC, overall DESC, name ASC",
  club_desc:       "ISNULL(club), club DESC, overall DESC, name ASC",
  nationality_asc: "ISNULL(nationality), nationality ASC, overall DESC, name ASC",
  nationality_desc: "ISNULL(nationality), nationality DESC, overall DESC, name ASC",
};

// Returns distinct values for autocomplete
app.get("/api/players/distinct", async (req, res) => {
  const { field, q = "" } = req.query;
  if (!["club", "nationality", "league"].includes(field))
    return res.status(400).json({ error: "Invalid field" });
  const [rows] = await db.query(
    `SELECT DISTINCT ${field} FROM players_catalog
     WHERE ${field} IS NOT NULL AND ${field} != '' AND ${field} LIKE ?
     ORDER BY ${field} ASC LIMIT 10`,
    [`%${q}%`]
  );
  res.json(rows.map((r) => r[field]));
});

/** Distinct values for multiselect filters (Add Player catalog). */
app.get("/api/players/filter-options", async (_req, res) => {
  try {
    const out = {};
    for (const col of ["foot", "playing_style", "card_type", "league", "region"]) {
      const [rows] = await db.query(
        `SELECT DISTINCT ${col} AS v FROM players_catalog
         WHERE ${col} IS NOT NULL AND TRIM(${col}) != ''
         ORDER BY ${col} ASC LIMIT 500`,
      );
      out[col] = rows.map((r) => r.v).filter(Boolean);
    }
    res.json(out);
  } catch (err) {
    console.error("filter-options error:", err.message);
    res.status(503).json({
      foot: [], playing_style: [], card_type: [], league: [], region: [],
    });
  }
});

// Returns players for search / add-player catalog
app.get("/api/players", async (req, res) => {
  try {
    const {
      q = "", position, positions, posGroup,
      sortBy = "overall_max_desc",
      club, nationality,
      foot, playingStyle, cardType, league,
      overallMin, overallMax, maxOverallMin, maxOverallMax,
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

    const footVals = String(foot || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (footVals.length) {
      conditions.push(`(${footVals.map(() => "foot = ?").join(" OR ")})`);
      params.push(...footVals);
    }
    const styleVals = String(playingStyle || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (styleVals.length) {
      conditions.push(`(${styleVals.map(() => "playing_style = ?").join(" OR ")})`);
      params.push(...styleVals);
    }
    const cardVals = String(cardType || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (cardVals.length) {
      conditions.push(`(${cardVals.map(() => "card_type = ?").join(" OR ")})`);
      params.push(...cardVals);
    }
    const leagueVals = String(league || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (leagueVals.length) {
      conditions.push(`(${leagueVals.map(() => "league = ?").join(" OR ")})`);
      params.push(...leagueVals);
    }

    if (overallMin)  { conditions.push("overall >= ?"); params.push(Number(overallMin)); }
    if (overallMax)  { conditions.push("overall <= ?"); params.push(Number(overallMax)); }
    if (maxOverallMin) {
      conditions.push("(overall_max IS NOT NULL AND overall_max >= ?)");
      params.push(Number(maxOverallMin));
    }
    if (maxOverallMax) {
      conditions.push("(overall_max IS NOT NULL AND overall_max <= ?)");
      params.push(Number(maxOverallMax));
    }

    if (heightMin)   { conditions.push("height >= ?");          params.push(Number(heightMin)); }
    if (heightMax)   { conditions.push("height <= ?");          params.push(Number(heightMax)); }
    if (weightMin)   { conditions.push("weight >= ?");          params.push(Number(weightMin)); }
    if (weightMax)   { conditions.push("weight <= ?");          params.push(Number(weightMax)); }
    if (ageMin)      { conditions.push("age >= ?");             params.push(Number(ageMin)); }
    if (ageMax)      { conditions.push("age <= ?");             params.push(Number(ageMax)); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const order = SORT_MAP[sortBy] ?? SORT_MAP.overall_max_desc;

    const [rows] = await db.query(
      `SELECT pesdb_id AS id, name, position,
              overall, overall_max,
              club, league, nationality, height, weight, age,
              card_type, region, foot, playing_style
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
              c.league, c.nationality, c.height, c.weight, c.age,
              c.overall_max, c.card_type, c.region, c.foot, c.playing_style
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

// ── Edit Profile ─────────────────────────────────────────────
app.put("/api/profile", async (req, res) => {
  const { userId, username, email, password } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required." });

  const updates = [];
  const params  = [];

  if (username !== undefined) {
    if (username.length < 3 || username.length > 50)
      return res.status(400).json({ error: "Username must be 3–50 characters.", field: "username" });
    updates.push("username = ?");
    params.push(username.trim());
  }

  if (email !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: "Invalid email address.", field: "email" });
    updates.push("email = ?");
    params.push(email.trim().toLowerCase());
  }

  if (password !== undefined && password !== "") {
    if (password.length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters.", field: "password" });
    const hashed = await bcrypt.hash(password, 12);
    updates.push("password = ?");
    params.push(hashed);
  }

  if (updates.length === 0)
    return res.status(400).json({ error: "No changes provided." });

  try {
    params.push(userId);
    await db.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);

    const [[user]] = await db.query("SELECT id, username, email FROM users WHERE id = ?", [userId]);
    res.json({ message: "Profile updated.", user });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      const field = err.message.includes("uq_users_email") ? "email" : "username";
      return res.status(409).json({ error: `That ${field} is already taken.`, field });
    }
    console.error("profile update error:", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ── Game Plans ───────────────────────────────────────────────
app.get("/api/game-plans", async (req, res) => {
  const userId = Number(req.query.userId);
  if (!userId) return res.status(400).json({ error: "userId required", plans: [] });

  try {
    const [plans] = await db.query(
      `SELECT gp.id, gp.name, gp.formation, gp.created_at,
              COALESCE(SUM(gpp.role = 'LINEUP'), 0) AS lineup_count,
              COALESCE(SUM(gpp.role = 'SUB'), 0)    AS sub_count
       FROM   game_plans gp
       LEFT JOIN game_plan_players gpp ON gpp.game_plan_id = gp.id
       WHERE  gp.user_id = ?
       GROUP  BY gp.id
       ORDER  BY gp.created_at ASC`,
      [userId],
    );
    res.json({ plans });
  } catch (err) {
    console.error("game-plans error:", err.message);
    res.status(503).json({ error: "Database unavailable", plans: [] });
  }
});

app.post("/api/game-plans", async (req, res) => {
  const { userId, name } = req.body;
  if (!userId || !name?.trim())
    return res.status(400).json({ error: "userId and name required." });

  try {
    const [[{ count }]] = await db.query(
      "SELECT COUNT(*) AS count FROM game_plans WHERE user_id = ?",
      [Number(userId)],
    );
    if (count >= 20)
      return res.status(400).json({ error: "Maximum 20 game plans allowed." });

    const [result] = await db.query(
      "INSERT INTO game_plans (user_id, name, formation) VALUES (?, ?, '4-3-3')",
      [Number(userId), name.trim()],
    );
    const [[plan]] = await db.query(
      `SELECT id, name, formation, created_at, 0 AS lineup_count, 0 AS sub_count
       FROM game_plans WHERE id = ?`,
      [result.insertId],
    );
    res.status(201).json({ plan });
  } catch (err) {
    console.error("create game-plan error:", err.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

const ALLOWED_FORMATIONS = new Set([
  "4-3-3", "4-4-2", "4-5-1", "3-6-1", "3-4-3", "3-5-2", "5-2-3", "5-3-2", "5-4-1",
]);

app.put("/api/game-plans/:id", async (req, res) => {
  const planId = Number(req.params.id);
  const { userId, name, formation } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required." });

  const sets = [];
  const vals = [];
  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: "Name cannot be empty." });
    sets.push("name = ?");
    vals.push(String(name).trim());
  }
  if (formation !== undefined) {
    const f = formation === null || formation === "" ? "4-3-3" : String(formation);
    if (!ALLOWED_FORMATIONS.has(f)) return res.status(400).json({ error: "Invalid formation." });
    sets.push("formation = ?");
    vals.push(f);
  }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update." });

  vals.push(planId, Number(userId));

  try {
    const [result] = await db.query(
      `UPDATE game_plans SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
      vals,
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Plan not found." });
    res.json({ message: "Plan updated." });
  } catch (err) {
    console.error("update game-plan error:", err.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.delete("/api/game-plans/:id", async (req, res) => {
  const planId = Number(req.params.id);
  const userId = Number(req.query.userId);
  if (!userId) return res.status(400).json({ error: "userId required." });

  try {
    const [result] = await db.query(
      "DELETE FROM game_plans WHERE id = ? AND user_id = ?",
      [planId, userId],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Plan not found." });
    res.json({ message: "Plan deleted." });
  } catch (err) {
    console.error("delete game-plan error:", err.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.get("/api/game-plans/:id/players", async (req, res) => {
  const planId = Number(req.params.id);
  const userId = Number(req.query.userId);
  if (!userId) return res.status(400).json({ error: "userId required." });

  try {
    const [rows] = await db.query(
      `SELECT gpp.slot, gpp.role,
              p.id AS player_id, p.name, p.position, p.overall, p.club, p.pesdb_id,
              c.overall_max
       FROM   game_plan_players gpp
       JOIN   players p    ON p.id    = gpp.player_id
       JOIN   game_plans gp ON gp.id  = gpp.game_plan_id
       LEFT JOIN players_catalog c ON c.pesdb_id = p.pesdb_id
       WHERE  gpp.game_plan_id = ? AND gp.user_id = ?
       ORDER  BY gpp.slot ASC`,
      [planId, userId],
    );
    res.json({ players: rows });
  } catch (err) {
    console.error("game-plan players error:", err.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.put("/api/game-plans/:id/swap", async (req, res) => {
  const planId = Number(req.params.id);
  const { userId, slotA, slotB } = req.body;

  if (!userId) return res.status(400).json({ error: "userId required." });
  if (slotA < 1 || slotA > 23 || slotB < 1 || slotB > 23)
    return res.status(400).json({ error: "Invalid slot (1–23)." });

  try {
    const [[plan]] = await db.query(
      "SELECT id FROM game_plans WHERE id = ? AND user_id = ?",
      [planId, Number(userId)],
    );
    if (!plan) return res.status(404).json({ error: "Plan not found." });

    const [[rowA]] = await db.query(
      "SELECT player_id FROM game_plan_players WHERE game_plan_id = ? AND slot = ?",
      [planId, slotA],
    );
    const [[rowB]] = await db.query(
      "SELECT player_id FROM game_plan_players WHERE game_plan_id = ? AND slot = ?",
      [planId, slotB],
    );

    const playerA = rowA?.player_id ?? null;
    const playerB = rowB?.player_id ?? null;

    // Delete both slots first to avoid unique-key conflicts during swap
    await db.query(
      "DELETE FROM game_plan_players WHERE game_plan_id = ? AND slot IN (?, ?)",
      [planId, slotA, slotB],
    );

    const roleA = slotA <= 11 ? "LINEUP" : "SUB";
    const roleB = slotB <= 11 ? "LINEUP" : "SUB";

    if (playerB !== null) {
      await db.query(
        "INSERT INTO game_plan_players (game_plan_id, player_id, role, slot) VALUES (?, ?, ?, ?)",
        [planId, playerB, roleA, slotA],
      );
    }
    if (playerA !== null) {
      await db.query(
        "INSERT INTO game_plan_players (game_plan_id, player_id, role, slot) VALUES (?, ?, ?, ?)",
        [planId, playerA, roleB, slotB],
      );
    }

    res.json({ message: "Slots swapped." });
  } catch (err) {
    console.error("swap slots error:", err.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

// ── Room presence + preparation session (in-memory) ──────────────────────────────
const roomPresence = new Map();
const PRESENCE_TTL_MS = 12000;
const DEFAULT_BAN_DURATION_SECONDS = 120;
const MIN_BAN_DURATION_SECONDS = 5;
const MAX_BAN_DURATION_SECONDS = 900;
const DEFAULT_PICK_DURATION_SECONDS = 300;
const MIN_PICK_DURATION_SECONDS = 5;
const MAX_PICK_DURATION_SECONDS = 1200;
const REVEAL_MODE_INSTANT = "instant";
const REVEAL_MODE_HIDDEN = "hidden";
const ALLOWANCE_FIELDS = new Set([
  "position",
  "overall", "overallMax",
  "height", "weight", "age",
  // Legacy keys kept for backward compatibility.
  "overallMin", "overallMax",
  "overallMaxMin", "overallMaxMax",
  "club", "league", "nationality",
  "heightMin", "heightMax",
  "weightMin", "weightMax",
  "ageMin", "ageMax",
  "cardType", "region", "foot", "playingStyle",
]);
const POSITION_OPTIONS = new Set(["GK", "CB", "LB", "RB", "DMF", "CMF", "LMF", "RMF", "AMF", "LWF", "RWF", "SS", "CF"]);

function normalizeAllowanceCapValue(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? String(Math.min(23, Math.floor(n))) : "";
}

function normalizeBanDurationSec(raw) {
  const n = Math.floor(Number(raw) || DEFAULT_BAN_DURATION_SECONDS);
  return Math.max(MIN_BAN_DURATION_SECONDS, Math.min(MAX_BAN_DURATION_SECONDS, n));
}

function normalizePickDurationSec(raw) {
  const n = Math.floor(Number(raw) || DEFAULT_PICK_DURATION_SECONDS);
  return Math.max(MIN_PICK_DURATION_SECONDS, Math.min(MAX_PICK_DURATION_SECONDS, n));
}

function normalizeRevealMode(raw) {
  return String(raw || "").trim().toLowerCase() === REVEAL_MODE_HIDDEN
    ? REVEAL_MODE_HIDDEN
    : REVEAL_MODE_INSTANT;
}

function normalizePositionCaps(raw) {
  let obj = {};
  if (raw && typeof raw === "object") {
    obj = raw;
  } else {
    const text = String(raw || "").trim();
    if (!text) return "";
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") obj = parsed;
      else return "";
    } catch {
      return "";
    }
  }

  const normalized = {};
  for (const [k, v] of Object.entries(obj)) {
    const pos = String(k || "").trim().toUpperCase();
    if (!POSITION_OPTIONS.has(pos)) continue;
    const cap = normalizeAllowanceCapValue(v);
    if (cap) normalized[pos] = cap;
  }
  return Object.keys(normalized).length ? JSON.stringify(normalized) : "";
}

function normalizeNamedCaps(raw) {
  if (raw && typeof raw === "object") {
    const normalized = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = String(k || "").replace(/\s+/g, " ").trim().slice(0, 60);
      if (!key) continue;
      const cap = normalizeAllowanceCapValue(v);
      if (cap) normalized[key] = cap;
    }
    return Object.keys(normalized).length ? JSON.stringify(normalized) : "";
  }

  const text = String(raw || "").trim();
  if (!text) return "";

  const legacyCap = normalizeAllowanceCapValue(text);
  if (legacyCap) return legacyCap;

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return "";
    return normalizeNamedCaps(parsed);
  } catch {
    return "";
  }
}

function createDefaultRoomConfig() {
  return {
    allowAllPlayers: true,
    banCountPerSide: 3,
    banDurationSec: DEFAULT_BAN_DURATION_SECONDS,
    pickDurationSec: DEFAULT_PICK_DURATION_SECONDS,
    revealMode: REVEAL_MODE_INSTANT,
    pickCountPerSide: 23,
    allowanceEnabled: [],
    allowanceCaps: {
      position: "",
      overall: "",
      overallMin: "",
      overallMax: "",
      overallMaxMin: "",
      overallMaxMax: "",
      club: "",
      league: "",
      nationality: "",
      height: "",
      heightMin: "",
      heightMax: "",
      weight: "",
      weightMin: "",
      weightMax: "",
      age: "",
      ageMin: "",
      ageMax: "",
      cardType: "",
      region: "",
      foot: "",
      playingStyle: "",
    },
    allowance: {
      position: "",
      overall: "",
      overallMin: "",
      overallMax: "",
      overallMaxMin: "",
      overallMaxMax: "",
      club: "",
      league: "",
      nationality: "",
      height: "",
      heightMin: "",
      heightMax: "",
      weight: "",
      weightMin: "",
      weightMax: "",
      age: "",
      ageMin: "",
      ageMax: "",
      cardType: "",
      region: "",
      foot: "",
      playingStyle: "",
    },
  };
}

function ensureRoomEntry(code) {
  let entry = roomPresence.get(code);
  if (!entry) {
    entry = {
      host: null,
      guest: null,
      status: "lobby",
      turnIndex: 0,
      turnEndsAt: null,
      config: createDefaultRoomConfig(),
      lastConfigSeq: 0,
      ready: { guest: false },
      matchReady: { host: false, guest: false },
      chat: [],
      closed: false,
      closeReason: "",
      kickedGuestId: "",
      updatedAt: Date.now(),
    };
    roomPresence.set(code, entry);
  }
  if (!entry.config) entry.config = createDefaultRoomConfig();
  const defaultCfg = createDefaultRoomConfig();
  entry.config = {
    ...defaultCfg,
    ...entry.config,
    allowanceCaps: {
      ...defaultCfg.allowanceCaps,
      ...((entry.config && entry.config.allowanceCaps) || {}),
    },
    allowance: {
      ...defaultCfg.allowance,
      ...((entry.config && entry.config.allowance) || {}),
    },
  };
  entry.config.banDurationSec = normalizeBanDurationSec(entry.config.banDurationSec);
  entry.config.pickDurationSec = normalizePickDurationSec(entry.config.pickDurationSec);
  entry.config.revealMode = normalizeRevealMode(entry.config.revealMode);
  if (!Number.isFinite(Number(entry.lastConfigSeq))) entry.lastConfigSeq = 0;
  if (!entry.status) entry.status = "lobby";
  if (!Number.isFinite(Number(entry.turnIndex))) entry.turnIndex = 0;
  if (entry.turnEndsAt != null && !Number.isFinite(Number(entry.turnEndsAt))) entry.turnEndsAt = null;
  if (!entry.ready) entry.ready = { guest: false };
  if (!entry.matchReady) entry.matchReady = { host: false, guest: false };
  if (entry.closed === undefined) entry.closed = false;
  if (entry.closeReason === undefined) entry.closeReason = "";
  if (entry.kickedGuestId === undefined) entry.kickedGuestId = "";
  if (!Array.isArray(entry.chat)) entry.chat = [];
  return entry;
}

function pushSystemChat(entry, message) {
  entry.chat.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    senderId: "system",
    senderName: "System",
    message: String(message || "").slice(0, 500),
    createdAt: Date.now(),
  });
  if (entry.chat.length > 150) entry.chat.splice(0, entry.chat.length - 150);
}

function serializeRoomEntry(entry) {
  return {
    host: entry.host,
    guest: entry.guest,
    status: String(entry.status || "lobby"),
    turnIndex: Number.isFinite(Number(entry.turnIndex)) ? Number(entry.turnIndex) : 0,
    turnEndsAt: entry.turnEndsAt == null ? null : Number(entry.turnEndsAt),
    config: entry.config,
    ready: entry.ready,
    matchReady: entry.matchReady,
    chat: entry.chat,
    closed: Boolean(entry.closed),
    closeReason: entry.closeReason || "",
    updatedAt: entry.updatedAt,
  };
}

function pruneStalePresence(entry, now = Date.now()) {
  if (entry.host?.lastSeenAt && now - Number(entry.host.lastSeenAt) > PRESENCE_TTL_MS) {
    pushSystemChat(entry, `${entry.host.username || "Host"} left the room.`);
    entry.host = null;
    entry.closed = true;
    entry.closeReason = "Host closed the room.";
  }
  if (entry.guest?.lastSeenAt && now - Number(entry.guest.lastSeenAt) > PRESENCE_TTL_MS) {
    pushSystemChat(entry, `${entry.guest.username || "Guest"} left the room.`);
    entry.guest = null;
    entry.ready.guest = false;
  }
}

function normalizeRoomCodeParam(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
}

/** POST body: { role: "host"|"guest", userId?: string|number, username?: string } */
app.post("/api/rooms/:code/presence", (req, res) => {
  const code = normalizeRoomCodeParam(req.params.code);
  const { role, userId, username } = req.body || {};
  if (!code || code.length < 4)
    return res.status(400).json({ error: "Invalid room code." });
  if (!["host", "guest"].includes(role))
    return res.status(400).json({ error: "role must be host or guest." });

  const entry = ensureRoomEntry(code);
  pruneStalePresence(entry, Date.now());
  if (entry.closed && role !== "host") {
    return res.status(410).json({ error: "Room is closed.", room: serializeRoomEntry(entry) });
  }
  if (entry.closed && role === "host") {
    // Host can reopen same room code by entering again.
    entry.closed = false;
    entry.closeReason = "";
    entry.kickedGuestId = "";
    entry.status = "lobby";
    entry.turnIndex = 0;
    entry.turnEndsAt = null;
    entry.matchReady = { host: false, guest: false };
  }

  const participant = {
    id: userId != null && userId !== "" ? String(userId) : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username: String(username || (role === "host" ? "Host" : "Guest")).trim().slice(0, 50) || (role === "host" ? "Host" : "Guest"),
    lastSeenAt: Date.now(),
  };
  let hasMeaningfulChange = false;
  if (role === "host") {
    const activeHostId = entry.host?.id ? String(entry.host.id) : "";
    if (activeHostId && activeHostId !== participant.id) {
      return res.status(409).json({ error: "Room already has an active host." });
    }
    const wasHostId = entry.host?.id ? String(entry.host.id) : "";
    if (!wasHostId || wasHostId !== participant.id) {
      pushSystemChat(entry, `${participant.username} joined as host.`);
      hasMeaningfulChange = true;
    }
    entry.host = participant;
  } else {
    const activeGuestId = entry.guest?.id ? String(entry.guest.id) : "";
    if (activeGuestId && activeGuestId !== participant.id) {
      return res.status(409).json({ error: "Room already has an active guest." });
    }
    if (entry.kickedGuestId && entry.kickedGuestId === participant.id) {
      return res.status(403).json({ error: "You were removed from this room by host." });
    }
    const wasGuestId = entry.guest?.id ? String(entry.guest.id) : "";
    if (!wasGuestId || wasGuestId !== participant.id) {
      if (entry.guest?.username) {
        pushSystemChat(entry, `${entry.guest.username} left the room.`);
      }
      pushSystemChat(entry, `${participant.username} joined the room.`);
      entry.ready.guest = false;
      entry.matchReady.guest = false;
      hasMeaningfulChange = true;
    }
    if (entry.kickedGuestId && entry.kickedGuestId !== participant.id) {
      entry.kickedGuestId = "";
    }
    entry.guest = participant;
  }
  const beforeHostId = entry.host?.id ? String(entry.host.id) : "";
  const beforeGuestId = entry.guest?.id ? String(entry.guest.id) : "";
  const beforeHostSeen = Number(entry.host?.lastSeenAt || 0);
  const beforeGuestSeen = Number(entry.guest?.lastSeenAt || 0);
  pruneStalePresence(entry, Date.now());
  const afterHostId = entry.host?.id ? String(entry.host.id) : "";
  const afterGuestId = entry.guest?.id ? String(entry.guest.id) : "";
  const afterHostSeen = Number(entry.host?.lastSeenAt || 0);
  const afterGuestSeen = Number(entry.guest?.lastSeenAt || 0);
  const presenceStateChanged =
    beforeHostId !== afterHostId ||
    beforeGuestId !== afterGuestId ||
    (beforeHostSeen > 0 && afterHostSeen === 0) ||
    (beforeGuestSeen > 0 && afterGuestSeen === 0);
  if (hasMeaningfulChange || presenceStateChanged) {
    entry.updatedAt = Date.now();
  }
  roomPresence.set(code, entry);
  res.json({ room: serializeRoomEntry(entry) });
});

app.get("/api/rooms/:code", (req, res) => {
  const code = normalizeRoomCodeParam(req.params.code);
  const entry = roomPresence.get(code);
  if (!entry)
    return res.json({ room: { host: null, guest: null, status: "lobby", turnIndex: 0, turnEndsAt: null, config: createDefaultRoomConfig(), ready: { guest: false }, matchReady: { host: false, guest: false }, chat: [], closed: false, closeReason: "" } });
  const beforeHostId = entry.host?.id ? String(entry.host.id) : "";
  const beforeGuestId = entry.guest?.id ? String(entry.guest.id) : "";
  pruneStalePresence(entry);
  const afterHostId = entry.host?.id ? String(entry.host.id) : "";
  const afterGuestId = entry.guest?.id ? String(entry.guest.id) : "";
  if (beforeHostId !== afterHostId || beforeGuestId !== afterGuestId) {
    entry.updatedAt = Date.now();
  }
  res.json({ room: serializeRoomEntry(entry) });
});

/** POST body: { requesterId } */
app.post("/api/rooms/:code/leave", (req, res) => {
  const code = normalizeRoomCodeParam(req.params.code);
  const requesterId = String(req.body?.requesterId || "");
  if (!code || code.length < 4)
    return res.status(400).json({ error: "Invalid room code." });
  if (!requesterId)
    return res.status(400).json({ error: "requesterId is required." });

  const entry = roomPresence.get(code);
  if (!entry) {
    return res.json({ room: { host: null, guest: null, status: "lobby", turnIndex: 0, turnEndsAt: null, config: createDefaultRoomConfig(), ready: { guest: false }, matchReady: { host: false, guest: false }, chat: [], closed: false, closeReason: "" } });
  }

  if (entry.host?.id && String(entry.host.id) === requesterId) {
    pushSystemChat(entry, `${entry.host.username || "Host"} left the room.`);
    entry.host = null;
    entry.closed = true;
    entry.closeReason = "Host closed the room.";
    entry.status = "lobby";
    entry.turnIndex = 0;
    entry.turnEndsAt = null;
    entry.guest = null;
    entry.ready.guest = false;
    entry.matchReady = { host: false, guest: false };
    entry.kickedGuestId = "";
  }
  if (entry.guest?.id && String(entry.guest.id) === requesterId) {
    pushSystemChat(entry, `${entry.guest.username || "Guest"} left the room.`);
    entry.guest = null;
    entry.ready.guest = false;
    entry.matchReady.guest = false;
  }
  entry.updatedAt = Date.now();
  res.json({ room: serializeRoomEntry(entry) });
});

/** POST body: { requesterId } */
app.post("/api/rooms/:code/start", (req, res) => {
  const code = normalizeRoomCodeParam(req.params.code);
  const requesterId = String(req.body?.requesterId || "");
  if (!code || code.length < 4)
    return res.status(400).json({ error: "Invalid room code." });
  if (!requesterId)
    return res.status(400).json({ error: "requesterId is required." });

  const entry = ensureRoomEntry(code);
  const hostId = entry.host?.id ? String(entry.host.id) : "";
  if (!hostId || hostId !== requesterId) {
    return res.status(403).json({ error: "Only host can start draft." });
  }
  if (!entry.guest?.id) {
    return res.status(409).json({ error: "Guest is not connected." });
  }
  if (!entry.ready?.guest) {
    return res.status(409).json({ error: "Guest must be ready before starting." });
  }

  const bans = Math.max(0, Math.floor(Number(entry.config?.banCountPerSide) || 0));
  const totalTurns = bans * 2 + 23 * 2;
  const firstAction = bans > 0 ? "ban" : "pick";
  const durationSec = firstAction === "ban"
    ? normalizeBanDurationSec(entry.config?.banDurationSec)
    : normalizePickDurationSec(entry.config?.pickDurationSec);

  entry.status = "drafting";
  entry.turnIndex = totalTurns > 0 ? 0 : -1;
  entry.turnEndsAt = Date.now() + durationSec * 1000;
  entry.matchReady = { host: false, guest: false };
  entry.updatedAt = Date.now();
  res.json({ room: serializeRoomEntry(entry) });
});

/** POST body: { requesterId } */
app.post("/api/rooms/:code/kick-guest", (req, res) => {
  const code = normalizeRoomCodeParam(req.params.code);
  const requesterId = String(req.body?.requesterId || "");
  if (!code || code.length < 4)
    return res.status(400).json({ error: "Invalid room code." });
  if (!requesterId)
    return res.status(400).json({ error: "requesterId is required." });

  const entry = ensureRoomEntry(code);
  const hostId = entry.host?.id ? String(entry.host.id) : "";
  if (!hostId || hostId !== requesterId) {
    return res.status(403).json({ error: "Only host can kick guest." });
  }
  if (!entry.guest?.id) {
    return res.status(409).json({ error: "No guest to kick." });
  }

  entry.kickedGuestId = String(entry.guest.id);
  pushSystemChat(entry, `${entry.guest.username || "Guest"} was removed by host.`);
  entry.guest = null;
  entry.ready.guest = false;
  entry.matchReady.guest = false;
  entry.updatedAt = Date.now();
  res.json({ room: serializeRoomEntry(entry) });
});

/** POST body: { requesterId, ready } */
app.post("/api/rooms/:code/match-ready", (req, res) => {
  const code = normalizeRoomCodeParam(req.params.code);
  const requesterId = String(req.body?.requesterId || "");
  const ready = Boolean(req.body?.ready);
  if (!code || code.length < 4)
    return res.status(400).json({ error: "Invalid room code." });
  if (!requesterId)
    return res.status(400).json({ error: "requesterId is required." });

  const entry = ensureRoomEntry(code);
  const isHost = entry.host?.id && String(entry.host.id) === requesterId;
  const isGuest = entry.guest?.id && String(entry.guest.id) === requesterId;
  if (!isHost && !isGuest)
    return res.status(403).json({ error: "Join room before updating match ready." });
  if (entry.status === "lobby") {
    return res.status(409).json({ error: "Match ready is only available after drafting." });
  }
  if (entry.status === "drafting") {
    entry.status = "await-ready";
    entry.turnEndsAt = null;
    entry.matchReady = { host: false, guest: false };
  }

  if (isHost) entry.matchReady.host = ready;
  if (isGuest) entry.matchReady.guest = ready;

  if (entry.matchReady.host && entry.matchReady.guest) {
    entry.status = "done";
    entry.turnEndsAt = null;
  } else if (entry.status === "done") {
    entry.status = "await-ready";
  }

  entry.updatedAt = Date.now();
  res.json({ room: serializeRoomEntry(entry) });
});

/** POST body: { requesterId, ready } */
app.post("/api/rooms/:code/ready", (req, res) => {
  const code = normalizeRoomCodeParam(req.params.code);
  const requesterId = String(req.body?.requesterId || "");
  const ready = Boolean(req.body?.ready);
  if (!code || code.length < 4)
    return res.status(400).json({ error: "Invalid room code." });
  if (!requesterId)
    return res.status(400).json({ error: "requesterId is required." });

  const entry = ensureRoomEntry(code);
  const isGuest = entry.guest?.id && String(entry.guest.id) === requesterId;
  if (!isGuest)
    return res.status(403).json({ error: "Only guest can update ready state." });

  entry.ready.guest = ready;
  entry.updatedAt = Date.now();
  res.json({ room: serializeRoomEntry(entry) });
});

/** POST body: { requesterId, allowAllPlayers?, banCountPerSide?, allowanceEnabled?, allowance?, allowanceCaps? } */
app.post("/api/rooms/:code/config", (req, res) => {
  const code = normalizeRoomCodeParam(req.params.code);
  const {
    requesterId,
    clientSeq,
    allowAllPlayers,
    banCountPerSide,
    banDurationSec,
    pickDurationSec,
    revealMode,
    allowanceEnabled,
    allowance,
    allowanceCaps,
  } = req.body || {};
  if (!code || code.length < 4)
    return res.status(400).json({ error: "Invalid room code." });

  const entry = ensureRoomEntry(code);
  const hostId = entry.host?.id ? String(entry.host.id) : null;
  if (!hostId || String(requesterId || "") !== hostId) {
    return res.status(403).json({ error: "Only host can update room settings." });
  }

  const seq = Number(clientSeq);
  if (Number.isFinite(seq) && seq > 0) {
    // Reject stale/out-of-order config writes from rapid client updates.
    if (seq < Number(entry.lastConfigSeq || 0)) {
      return res.json({ room: serializeRoomEntry(entry) });
    }
    entry.lastConfigSeq = seq;
  }

  if (allowAllPlayers !== undefined)
    entry.config.allowAllPlayers = Boolean(allowAllPlayers);

  if (banCountPerSide !== undefined) {
    entry.config.banCountPerSide = Math.max(0, Math.floor(Number(banCountPerSide) || 0));
  }
  if (banDurationSec !== undefined) {
    entry.config.banDurationSec = normalizeBanDurationSec(banDurationSec);
  }
  if (pickDurationSec !== undefined) {
    entry.config.pickDurationSec = normalizePickDurationSec(pickDurationSec);
  }
  if (revealMode !== undefined) {
    entry.config.revealMode = normalizeRevealMode(revealMode);
  }
  // Picks are fixed for full squad completion.
  entry.config.pickCountPerSide = 23;

  if (allowance && typeof allowance === "object") {
    for (const [k, v] of Object.entries(allowance)) {
      if (!ALLOWANCE_FIELDS.has(k)) continue;
      entry.config.allowance[k] = String(v ?? "").trim().slice(0, 120);
    }
  }

  if (allowanceCaps && typeof allowanceCaps === "object") {
    for (const [k, v] of Object.entries(allowanceCaps)) {
      if (!ALLOWANCE_FIELDS.has(k)) continue;
      if (k === "position") {
        entry.config.allowanceCaps[k] = normalizePositionCaps(v);
      } else if (k === "club" || k === "cardType" || k === "region" || k === "playingStyle") {
        entry.config.allowanceCaps[k] = normalizeNamedCaps(v);
      } else {
        entry.config.allowanceCaps[k] = normalizeAllowanceCapValue(v);
      }
    }
  }

  if (Array.isArray(allowanceEnabled)) {
    entry.config.allowanceEnabled = allowanceEnabled
      .map((k) => String(k))
      .filter((k) => ALLOWANCE_FIELDS.has(k));
  }

  entry.updatedAt = Date.now();
  res.json({ room: serializeRoomEntry(entry) });
});

/** POST body: { requesterId, username, message } */
app.post("/api/rooms/:code/chat", (req, res) => {
  const code = normalizeRoomCodeParam(req.params.code);
  const { requesterId, username, message } = req.body || {};
  if (!code || code.length < 4)
    return res.status(400).json({ error: "Invalid room code." });
  const text = String(message || "").trim();
  if (!text) return res.status(400).json({ error: "Message is required." });

  const entry = ensureRoomEntry(code);
  const senderId = String(requesterId || "");
  const canChat =
    (entry.host?.id && String(entry.host.id) === senderId) ||
    (entry.guest?.id && String(entry.guest.id) === senderId);
  if (!canChat) return res.status(403).json({ error: "Join room before chatting." });

  entry.chat.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    senderId,
    senderName: String(username || "User").trim().slice(0, 50) || "User",
    message: text.slice(0, 500),
    createdAt: Date.now(),
  });
  if (entry.chat.length > 150) entry.chat.splice(0, entry.chat.length - 150);
  entry.updatedAt = Date.now();
  res.json({ room: serializeRoomEntry(entry) });
});

app.put("/api/game-plans/:id/players/:slot", async (req, res) => {
  const planId = Number(req.params.id);
  const slot   = Number(req.params.slot);
  const { userId, playerId } = req.body;

  if (!userId) return res.status(400).json({ error: "userId required." });
  if (slot < 1 || slot > 23) return res.status(400).json({ error: "Invalid slot (1–23)." });

  const role = slot <= 11 ? "LINEUP" : "SUB";

  try {
    const [[plan]] = await db.query(
      "SELECT id FROM game_plans WHERE id = ? AND user_id = ?",
      [planId, Number(userId)],
    );
    if (!plan) return res.status(404).json({ error: "Plan not found." });

    if (playerId == null) {
      await db.query(
        "DELETE FROM game_plan_players WHERE game_plan_id = ? AND slot = ?",
        [planId, slot],
      );
    } else {
      await db.query(
        `INSERT INTO game_plan_players (game_plan_id, player_id, role, slot)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE player_id = VALUES(player_id), role = VALUES(role)`,
        [planId, Number(playerId), role, slot],
      );
    }
    res.json({ message: "Slot updated." });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ error: "Player is already in this game plan." });
    console.error("update slot error:", err.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "home.html"));
});

app.get("/signin", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "signin.html"));
});

// Lightweight room lobby (client-only for now)
app.get("/room", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "room.html"));
});
app.get("/room/:code", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "room.html"));
});

app.use(express.static(path.join(__dirname, "..", "public")));

app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, "..", "public", "404.html"));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
