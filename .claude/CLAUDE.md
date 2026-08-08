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

Code is grouped **by feature, not by file type**.

- `src/` — backend. `server.js` is the composition root; `features/<name>/` each expose
  their public surface through an `index.js` barrel (`admin`, `auth`, `gamePlans`,
  `ingestion`, `media`, `players`, `rooms`); `lib/` holds `db.js`, `http.js`, `paths.js`.
- `public/` — three pages: `home.html` (squad / game plans / rooms), `room.html` (the
  ban-pick draft), `admin.html`. Each has an ESM entry file in `public/js/` plus a
  sub-module directory.
- `public/js/shared/` — helpers **two or more features import today**; nothing goes here
  speculatively. `players/` (`playerMeta.js`, `positions.js`, `sort.js`, `ovr.js`,
  `constants.js`, `filterPanel.js`), `ui/` (`toast.js`, `confirm.js`, `dropdown.js`),
  `lib/` (`session.js`). Import these **directly** — `shared/` deliberately has no barrel
  files, because with no bundler a barrel makes the browser fetch every module it
  re-exports.
- `public/css/` — mirrors `public/js/`: `pages/home/{base,responsive}.css`,
  `features/<name>/<name>.css`, `shared/{playerCard,modals,numberInput}.css`. There is no bundler, so
  a page's `<link>` tags **are** its cascade — the order in the `<head>` is load-bearing,
  and `responsive.css` must stay last on the home page.
- `database/schema.sql` — MySQL schema.

**Path aliases** — there is no bundler, so each alias is resolved by the platform itself:

| Alias | Resolves to | Configured in |
| --- | --- | --- |
| `@/…` | `public/js/…` | the `<script type="importmap">` in each page's `<head>` |
| `#features/…`, `#lib/…` | `src/features/…`, `src/lib/…` | the `imports` field in `package.json` |

Node does **not** support `@/`, which is why the backend uses the `#` prefix. `jsconfig.json`
mirrors both for the editor only. Use an alias whenever an import leaves its own folder;
keep `./sibling.js` relative.

## Visual design

**`DESIGN.md` in the repo root is the source of truth for how the app looks** — colour
tokens and their meanings, the green/cyan accent ladders, type scale, radius/spacing
scales, elevation, motion, and copy-paste component recipes. Read it before writing any
CSS or markup with a visual result, and before acting on any "make it look better /
more modern" request. Do not introduce a colour, radius, or spacing value that is not on
one of its ladders.

## Cross-cutting conventions

**Position order**: Throughout the codebase, positions follow the canonical order
CF → SS → RWF → LWF → AMF → RMF → LMF → CMF → DMF → RB → LB → CB → GK (forward-first).
This order is mirrored in `SORT_MAP` in `src/features/players/catalogQuery.js` and in
`public/js/features/draft/constants.js`.

**Room state is in-memory only** and does not survive a server restart. See
`.claude/rules/room/presence-and-reconnect.md`.

**Both pages are responsive down to 320 px** and each keeps its own breakpoint ladder —
home: `768 → 480`; room: `1200 → 1100 → 900 → 860 → 620 → 480` plus a `max-height: 760px`
rung. The two ladders are documented in `home/css.md` and `room/css.md`; do not invent a
new rung without checking them. Verify with a measured harness, not by eye — see
`responsive-testing.md`.

**Duplicated logic to keep in sync**: allowance-cap normalisation exists independently in
`src/features/rooms/config.js` and `public/js/features/draft/allowance.js`.

## Detailed rules

Topic rules live in `.claude/rules/`. Each carries `paths:` frontmatter and loads
automatically when a matching file is read:

| Rule | Scope |
| --- | --- |
| `backend.md` | `src/**` |
| `auth.md` | sign-in / sign-up / profile, and the `efb_user` session |
| `responsive-testing.md` | any CSS or page HTML — how to measure a layout change |
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
| `room/css.md` | `draft.css` conventions and component map |