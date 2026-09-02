# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`DESIGN.md` owns how it looks. `DECISIONS.md` owns why it is shaped this way, and what
is still open — read it before proposing anything architectural, and note §1: **identity
is a signed httpOnly cookie the server mints; a `userId` in a request is ignored.**

## Commands

```bash
npm run dev          # start dev server with auto-reload (node --watch)
npm start            # start production server
npm run check        # static gate: imports, path casing, bindings, cycles, dom ids, dead CSS
npm run icons        # regenerate public/icons/svg/ from sprite.svg (check fails if stale)
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
  entry file in `public/js/pages/`; behaviour lives in `public/js/features/<name>/`.
- `public/js/shared/` — helpers **two or more features import today**; nothing goes
  here speculatively, and when a module drops back to one consumer it moves out again
  (`ovr.js` went to `features/catalog/`, `constants.js` was inlined). Grouped
  `players/`, `ui/`, `lib/`, `icons/`. Two things not to undo: `filterPanel.js` owns
  the panel *and* `playerFilterParams`, so the filter to query-string mapping has one
  copy; and `positions.js` looks like it has a single feature consumer, but
  `shared/players/sort.js` is a second, so it cannot move down. Import these **directly** — `shared/` deliberately has no barrels, because
  with no bundler a barrel makes the browser fetch every module it re-exports.
- `public/css/` — mirrors `public/js/`: `pages/home/`, `features/<name>/`, `shared/`.
  `shared/filterPanel.css` is the chrome for the sort and filter dropdowns, the other
  half of `shared/players/filterPanel.js`; it moved out of `features/catalog/` when the
  console's CATALOG tab became a second consumer. There is no bundler, so a page's
  `<link>` tags **are** its cascade and the order in the `<head>` is load-bearing:
  `shared/tokens.css` **first** (every other sheet reads its variables) and
  `shared/controls.css` **last**, because its focus ring has to beat the feature sheets
  that set `outline: none`. On the home page `responsive.css` still comes after it.
  The console is the sheet-count case: `features/admin/` is **eight** sheets
  (`shell` · `panels` · `tables` · `playerBrowser` · `catalog` · `passwordModal` ·
  `roomDetail` · `responsive`), cut from one 2080-line file on its section
  boundaries with the order kept exactly, so the `<link>` list *is* what the
  single file's line order used to be. One sheet per component, named after the
  module it dresses. Add one by deciding where its lines would have gone.
- `public/icons/` — `sprite.svg`, **the** icon set: one `<symbol>` per icon and the
  only place icon geometry or `stroke-width` is written. Sites reference it by name
  (`<use href="/icons/sprite.svg#plus" />`); `public/js/shared/icons/icon.js` is the
  same thing for the 13 icons built inside template strings, across 42 call sites.
  The name must be a **literal** — a conditional inside `icon(…)` is invisible to
  the check. `svg/` beside it is **generated** (`npm run icons`): one standalone
  file per symbol, for the one case a sprite cannot serve — a CSS pseudo-element,
  which renders `<use>` into an unreachable shadow tree. `npm run check` fails on a
  name the sprite does not define and on a generated file that has drifted from it.
  See `DESIGN.md` §5a.
- `scripts/` — `check.js` (the `npm run check` runner and its self-test) and
  `checks/`, one file per check plus a shared `lib.js`. `buildIcons.js` writes
  `public/icons/svg/`, and `iconSprite.js` is the sprite parser it shares with the
  `iconFiles` check, so the generator and its verifier can never disagree about
  what a file should contain. Node-only tooling; it is not served, and the checks
  scan `public/js` and `src` but not themselves.
- `database/schema.sql` — MySQL schema.
- `wake/` — **not part of the app, and not served by Render.** One static page
  deployed to Vercel (root directory `wake/`), which is what a visitor hits
  first: Render spins a free service down after 15 minutes idle and takes ~23s
  to boot, and during those 23s the app cannot draw its own loading screen
  because it is not running. So this one is hosted somewhere always warm. It
  polls `/api/health` across origins — the one route in `src/` carrying a CORS
  header, and the reason it has one — and hands off with `location.replace`
  once the app answers. **Everything it needs is inline**: a `<link>` to
  `/css/shared/tokens.css` or an `<img>` from `/logo/` would be a request to
  the very server it is waiting for. That is why its nine design tokens are
  copied from `tokens.css` rather than imported, and the copy is kept small so
  the drift stays cheap. `APP_ORIGIN` at the top of its script is the only
  place the app's host is named.

**Do not create a new top-level folder, or a new `public/js/shared/` module, without
asking.** Left alone this grows a `helpers/`, a `types/`, a `constants/` and a
`services/` inside a month, and `shared/` fills with modules one feature uses. The
`boundaries` check enforces the direction imports may point; it cannot tell you a
folder should not exist.

**Path aliases** — no bundler, so each is resolved by the platform itself. `@/…` maps to
`public/js/…` through the `<script type="importmap">` in each page's `<head>`;
`#features/…` and `#lib/…` map to `src/…` through the `imports` field in `package.json`.
Node does **not** support `@/`, which is why the backend uses `#`. `jsconfig.json` mirrors
both for the editor only. Use an alias whenever an import leaves its own folder; keep
`./sibling.js` relative.

## Visual design

**`DESIGN.md` in the repo root is the source of truth for how the app looks** — the
palette and what each colour means, the neutral ladder, type scale, radius/spacing
scales, elevation, motion, and copy-paste component recipes. Read it before writing any
CSS or markup with a visual result, and before acting on any "make it look better /
more modern" request. Do not introduce a colour, radius, or spacing value that is not on
one of its ladders.

**All icons live in `public/icons/sprite.svg`** and are referenced by name — there
is no `<svg>` with path data in a page, a stylesheet or a template string, no emoji
anywhere in the UI, and **no non-ASCII mark standing in for an icon**: `✓` `↑` `↓`
`∞` `▶` `●` `✕` `←` are all symbols now. Punctuation is not a mark — `·` `—` `…`
stay text, and `→` inside a `title` or an `<option>` has to, since neither can hold
an element. Emoji were last found written as HTML **entities** (`&#128065;`), which
is how they survived earlier greps; check that range too. `DESIGN.md` §5a says what
the sprite owns (geometry, `stroke-width`) versus the call site (size, class,
inherited colour), and names the one icon allowed to stay inline and why.

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

Topic rules live in `.claude/rules/`, one file per topic. Each carries `paths:`
frontmatter and **loads itself** when a matching file is opened, so there is no list
of them here to fall out of date. `ls .claude/rules/**` for the set; `checks.md` and
`backend.md` are the two worth reading unprompted.
