# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start dev server with auto-reload (node --watch)
npm start            # start production server
npm run check        # static gate: imports, path casing, bindings, cycles, dom ids, dead CSS
npm run check:self   # prove those checks can still fail
npm run scrape       # full or incremental player catalog update
npm run scrape:missing  # repair gaps: diff site vs DB, fill missing entries
```

No build step — frontend is vanilla HTML/CSS/JS served directly from `public/`.
**Run `npm run check` before committing.** With no bundler and no types it is the
only thing that will catch a bad import path — and casing errors in particular
work on macOS and 404 in production. See `.claude/rules/checks.md`.

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
  `mail`, `media`, `players`, `rooms`); `lib/` holds `db.js`, `http.js`, `paths.js`,
  `cli.js`.
  `ingestion` has **no** barrel — both its files are npm-script entry points that nothing
  imports, so a barrel there would have no consumer. `src/pages.js` is the one router
  outside `features/` — it maps every page URL to one of four static HTML files and
  belongs to the composition root.
- `public/` — four pages: `home.html` (squad / game plans / rooms), `room.html` (the
  ban-pick draft), `console.html` (the admin console), `signin.html`. Each has an ESM
  entry file in
  `public/js/pages/`; the behaviour lives in `public/js/features/<name>/`.
- `public/js/shared/` — helpers **two or more features import today**; nothing goes here
  speculatively — and when a module drops back to one consumer it moves out again
  (`ovr.js` went to `features/catalog/`, `constants.js` was inlined). `players/`
  (`playerMeta.js`, `positions.js`, `sort.js`, `formations.js`, `filterPanel.js` —
  which owns the panel, `playerFilterParams` and `hasActivePlayerFilters`, so the
  filter→query-string mapping has exactly one copy),
  `ui/` (`toast.js`, `readingTime.js`, `pendingToast.js`, `confirm.js`, `dropdown.js`,
  `playerHoverCard.js`), `lib/`
  (`session.js`, `roomCode.js` — both bundles mint room codes: the Rooms tab for the
  host, the post-match screen for "new match"). `positions.js`
  is the one module with a single *feature* consumer: `shared/players/sort.js` is the
  other, so it cannot move down. Import these **directly** — `shared/` deliberately has
  no barrel files, because with no bundler a barrel makes the browser fetch every module
  it re-exports.
- `public/css/` — mirrors `public/js/`: `pages/home/{base,responsive}.css`,
  `features/<name>/<name>.css`,
  `shared/{tokens,controls,playerCard,modals,numberInput,playerHoverCard,pitchField,filterPanel}.css`.
  `shared/filterPanel.css` is the chrome for the sort and filter dropdowns — the
  other half of `shared/players/filterPanel.js` and `sort.js`. It lived in
  `features/catalog/catalog.css` while every consumer was on the home page; the
  console's CATALOG tab made it a second page, so it moved to `shared/`.
  There is no bundler, so a page's `<link>` tags **are** its cascade — the order in the
  `<head>` is load-bearing. `shared/tokens.css` must be **first** (every other sheet
  reads its variables) and `shared/controls.css` **last**, because its focus ring has to
  beat the feature sheets that set `outline: none`; on the home page `responsive.css`
  still comes after it.
- `public/icons/` — `sprite.svg`, **the** icon set: one `<symbol>` per icon and the
  only place icon geometry or `stroke-width` is written. Sites reference it by name
  (`<use href="/icons/sprite.svg#plus" />`); `public/js/shared/icons/icon.js` is the
  same thing for the eighteen icons built inside template strings. `npm run check`
  fails on a name the sprite does not define. See `DESIGN.md` §5a.
- `scripts/` — `check.js` (the `npm run check` runner and its self-test) and
  `checks/`, one file per check plus a shared `lib.js`. Node-only tooling; it is
  not served, and the checks scan `public/js` and `src` but not themselves.
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

**`DESIGN.md` in the repo root is the source of truth for how the app looks** — the
palette and what each colour means, the neutral ladder, type scale, radius/spacing
scales, elevation, motion, and copy-paste component recipes. Read it before writing any
CSS or markup with a visual result, and before acting on any "make it look better /
more modern" request. Do not introduce a colour, radius, or spacing value that is not on
one of its ladders.

**All icons live in `public/icons/sprite.svg`** and are referenced by name — there
is no `<svg>` with path data in a page, a stylesheet or a template string, and no
emoji anywhere in the UI. `DESIGN.md` §5a says what the sprite owns (geometry,
`stroke-width`) versus the call site (size, class, inherited colour), and names the
one icon allowed to stay inline and why.

**All colour lives in `public/css/shared/tokens.css`**, linked first on every page; there
is no hex or `rgba()` literal anywhere else in the codebase, CSS or JS.
`public/css/shared/controls.css` is linked last and owns the focus ring and text-input
treatment, which have to win over feature CSS. The look is flat near-black with a single
volt-green accent used **once per screen** — no gradients, glows, shadows or backdrop
blur. `DESIGN.md` §12 lists what the re-skin removed, so a leftover reads as a leftover.

## Cross-cutting conventions

**Position order**: Throughout the codebase, positions follow the canonical order
CF → SS → RWF → LWF → AMF → RMF → LMF → CMF → DMF → RB → LB → CB → GK (forward-first).
This order is mirrored in the `SORT_MAP` table in `src/features/players/catalogQuery.js`
and in `public/js/features/draft/constants.js`.

**Room state is in-memory only** and does not survive a server restart. See
`.claude/rules/room/presence-and-reconnect.md`.

**Both pages are responsive down to 320 px** and each keeps its own breakpoint ladder —
home: `768 → 480`; room: `1200 → 1100 → 900 → 860 → 620 → 480` plus a `max-height: 820px`
rung. The two ladders are documented in `home/css.md` and `room/css.md`; do not invent a
new rung without checking them. Verify with a measured harness, not by eye — see
`responsive-testing.md`.

**Duplicated logic to keep in sync** — each pair straddles the client/server boundary,
where there is no shared module to extract into:

- room status strings — `ROOM_STATUS` in `src/features/rooms/store.js` and the
  `ROOM_STATUS_*` constants in `public/js/features/draft/constants.js`. The server owns
  every transition between them; the client only ever compares, which is why there is no
  second copy of the transition table
- ban/pick duration + reveal-mode normalisation — `src/features/rooms/config.js` and
  `public/js/features/draft/state.js`. There are **two** reveal modes, `revealMode`
  (picks, Start Match) and `banRevealMode` (the opponent's ban strip); both run
  through the one `normalizeRevealMode` on each side. **`0` means unlimited** and is the one value that
  must escape the clamp — both copies test for it before the `|| DEFAULT`, which would
  otherwise read it as "absent". The sentinel itself is `UNLIMITED_DURATION_SEC`, declared
  in both files
- ban order — `BAN_ORDER_*` in `src/features/rooms/schedule.js` and in
  `public/js/features/draft/constants.js`. Like room status, the server owns what
  it *means*: it builds the turn schedule and publishes it on the snapshot, and
  the client derives whose turn it is from that rather than from the order. The
  two constants exist on both sides only so the setting round-trips
- the full-squad size — `PICK_COUNT_PER_SIDE` in `src/features/rooms/config.js`
  and `FIXED_PICKS_PER_SIDE` in `public/js/features/draft/constants.js`. Both are
  `23`, and it is now also the minimum squad a room will start with. The **rule**
  built on it is not duplicated: the server publishes `maxBanCountPerSide` on the
  room snapshot so the lobby caps its stepper without re-deriving anything
- `DEFAULT_FORMATION` (`"4-3-3"`) **and the formation whitelist** — `ALLOWED_FORMATIONS`
  in `src/features/gamePlans/routes.js` against `FORMATION_ROWS` in
  `public/js/shared/players/formations.js`. There is deliberately **no third copy** in
  `src/features/rooms/`: a room's `formations` field is display data that the client
  runs through `normalizeFormation` on the way in, so an unknown string can never reach
  a pitch. Length-cap it there and leave the whitelist where it guards a DB column.

Within the client there should be **no** such pairs: the formation table and the draft
sort categories each live in exactly one module.

**Formations are eFootball's own fifteen presets**, and each digit in the name is a row
on the pitch — so a formation is **four or five rows**, not always four, and each slot
carries the game's own position name (GK · CB · LB · RB · DMF · CMF · LMF · RMF · AMF ·
LWF · RWF · CF) rather than a generic ATT/MID/DEF label. `shared/players/formations.js`
declares the table and derives the slot numbers from it; `BENCH_ROW_LABEL` (`"SUB"`)
lives beside it because both pitches print it into empty bench slots.

**Every pitch is drawn as a football field** — turf, mow stripes, touchlines, penalty
and goal areas, halfway line and centre circle — by `public/css/shared/pitchField.css`.
Three consumers: the game-plan pitch (home), the pick pitch and both Start Match squads
(room). For the first two the markings are static markup in `home.html` / `room.html`
and the renderers only ever write the rows container beside them. **Start Match is the
exception**: it draws two pitches and rebuilds the whole container when a reveal mode
swaps a column, so it emits its own markings — see `PITCH_MARKS_HTML` in
`ready/readyView.js`. Geometry lives in the shared sheet either way.

## Detailed rules

Topic rules live in `.claude/rules/`. Each carries `paths:` frontmatter and loads
automatically when a matching file is read:

| Rule | Scope |
| --- | --- |
| `checks.md` | `npm run check` — what each static check covers and its limits |
| `backend.md` | `src/**` |
| `auth.md` | sign-in / sign-up / profile, the `efb_user` session, email confirmation and the `mail` feature |
| `responsive-testing.md` | any CSS or page HTML — how to measure a layout change |
| `database.md` | schema, `db.js`, catalog queries, scrapers |
| `admin-dashboard.md` | `/console` page, its access model and its API |
| `home/modules.md`, `home/css.md` | home page JS modules and CSS |
| `room/modules.md` | room page module map |
| `room/presence-and-reconnect.md` | presence TTLs, 409 room security, reload cache |
| `room/draft-shell.md` | `#viewDraft` shell, timer ring, turn schedule |
| `room/lobby.md` | lobby settings UI + hidden-input pattern |
| `room/ban-phase.md` | staged bans, state-key diff guard, filter/sort |
| `room/pick-phase.md` | pick board, formation pitch, the pick pool |
| `room/ready-phase.md` | Start Match screen |
| `room/css.md` | the seven room sheets: conventions and component map |