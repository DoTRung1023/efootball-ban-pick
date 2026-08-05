# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start dev server with auto-reload (node --watch)
npm start            # start production server
npm run scrape       # full or incremental player catalog update
npm run scrape:missing  # repair gaps: diff site vs DB, fill missing entries
```

No build step — frontend is vanilla HTML/CSS/JS served directly from `public/`.

Database setup (first time):
```bash
mysql -u root -e "CREATE USER IF NOT EXISTS 'banpick'@'localhost' IDENTIFIED BY ''; GRANT ALL PRIVILEGES ON ban_pick_efb.* TO 'banpick'@'localhost'; FLUSH PRIVILEGES;"
mysql -u root < database/schema.sql
```

## Runtime

Node.js ≥ 18 with ESM (`"type": "module"`). Express serves both the API and static files
from `public/`. MySQL 8+ via mysql2. Real-time sync is **polling-only** (500 ms presence
heartbeat); there is no WebSocket layer.

## Layout

- `src/` — backend: `server.js` composition root, `routes/`, `rooms/`, `players/`, `lib/`.
- `public/` — three pages: `home.html` (squad / game plans / rooms), `room.html` (the
  ban-pick draft), `admin.html`. Each has an ESM entry file in `public/js/` plus a
  sub-module directory.
- `database/schema.sql` — MySQL schema.

## Cross-cutting conventions

**Position order**: Throughout the codebase, positions follow the canonical order
CF → SS → RWF → LWF → AMF → RMF → LMF → CMF → DMF → RB → LB → CB → GK (forward-first).
This order is mirrored in `SORT_MAP` in `src/players/catalogQuery.js` and in
`public/js/room/constants.js`.

**Room state is in-memory only** and does not survive a server restart. See
`.claude/rules/room/presence-and-reconnect.md`.

**Duplicated logic to keep in sync**: allowance-cap normalisation exists independently in
`src/rooms/config.js` and `public/js/room/allowance.js`.

## Detailed rules

Topic rules live in `.claude/rules/`. Each carries `paths:` frontmatter and loads
automatically when a matching file is read:

| Rule | Scope |
| --- | --- |
| `backend.md` | `src/**` |
| `database.md` | schema, `db.js`, catalog queries, scrapers |
| `allowance.md` | allowance caps (client + server) |
| `admin-dashboard.md` | `/admin` page and its API |
| `home/modules.md`, `home/css.md` | home page JS modules and CSS |
| `room/modules.md` | room page module map |
| `room/presence-and-reconnect.md` | presence TTLs, 409 room security, reload cache |
| `room/draft-shell.md` | `#viewDraft` shell, timer ring, turn schedule |
| `room/lobby.md` | lobby settings UI + hidden-input pattern |
| `room/ban-phase.md` | staged bans, state-key diff guard, filter/sort |
| `room/pick-phase.md` | pick board, formation pitch, allowance enforcement |
| `room/ready-phase.md` | Start Match screen |
| `room/css.md` | `room.css` conventions and component map |