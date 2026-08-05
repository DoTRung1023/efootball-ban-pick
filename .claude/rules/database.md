---
paths:
  - "database/**/*.sql"
  - "src/db.js"
  - "src/players/**/*.js"
  - "src/scrape*.js"
---

# Database schema (MySQL 8+)

- `players_catalog` — ~41k scraped players; `pesdb_id` is the stable external key
  (BIGINT, up to 15 digits for newer cards).
- `players` — user roster; links to `players_catalog.pesdb_id` via nullable FK.
- `game_plans` / `game_plan_players` — up to 20 plans per user; slots 1–11 = LINEUP,
  12–23 = SUB.
- `scrape_logs` — one row per scrape run; `max_pesdb_id` drives incremental cutoff.