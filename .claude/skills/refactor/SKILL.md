---
name: refactor
description: Restructuring this repo when nothing but `npm run check` stands between an edit and the browser — moving or splitting a module, promoting or demoting `shared/`, renaming an export, extracting a helper, consolidating duplicated logic, reshaping CSS. Use for "move X", "split Y", "extract", "consolidate", "rename", "clean this up", or any change that shifts code between files rather than changing what it does.
---

# Refactoring this codebase

A refactor changes where code lives, not what it does. **There is no bundler, no
type checker and no test runner** — the browser is the first thing that will tell
you an import is wrong, and only if that line runs. `npm run check` is the whole
safety net, and §4 is the list of things it cannot see.

## 1. Read the rule that owns the area first

Every rule in `.claude/rules/` names modules and exports explicitly, so a move
that ignores one leaves the map lying:

| Touching | Read |
| --- | --- |
| `src/**` | `backend.md` (+ `database.md`, `auth.md`, `admin-dashboard.md`) |
| `public/js/features/draft/**` | `room/modules.md`, then the phase rule (`ban-` / `pick-` / `ready-phase.md`, `lobby.md`, `draft-shell.md`) |
| `public/js/features/{squad,gamePlans,rooms,catalog,auth}/**` | `home/modules.md` |
| any CSS | `DESIGN.md`, then `room/css.md` or `home/css.md` |
| `scripts/**` | `checks.md` |

The rule usually contains the reason the current shape exists. Several are
records of a reversal — `presence-and-reconnect.md` on the TTL that killed live
drafts, `pick-phase.md` on optimistic picks. **A refactor that reinstates one of
those is not a cleanup.** If the rule explains why something is deliberately
duplicated, ugly, or split, that is a constraint, not a target.

## 2. Where code is allowed to live

- **By feature, not by file type.** `features/<name>/` on both sides.
- **A backend feature is reached only through its `index.js` barrel.**
  `ingestion` has no barrel on purpose: nothing imports it.
- **`public/js/shared/` means two or more features import it *today*.** Nothing
  lands there speculatively, and a module that drops back to one consumer moves
  back down (`ovr.js` → `features/catalog/`, `constants.js` inlined). Check the
  consumer count before *and* after: `grep -rn "shared/ui/toast.js" public/js`.
- **`shared/` has no barrels.** With no bundler, a barrel makes the browser fetch
  every module it re-exports. Import the file directly.
- **Aliases when an import leaves its folder, `./sibling.js` when it does not.**
  `@/…` on the client (import map in each page `<head>`), `#features/…` /
  `#lib/…` on the server (`imports` in `package.json`). Node cannot resolve `@/`.
- **Upward calls go through a callback registry, not an import.** In the draft
  bundle that is `cb` in `features/draft/callbacks.js`, wired in
  `pages/room.js`. Reaching for a direct import instead is how you get a cycle.

## 3. The move procedure

1. Move the file, then update every importer — `grep -rn "oldName.js" public/js src`.
2. Update the barrel if the module is exported through one.
3. If the module is client-side and the page's `<script>`/`<link>` list names it,
   update the HTML too.
4. **`npm run check`.** It is under a second; run it after each step, not once at
   the end, so a failure has one cause.
5. Re-read §4 and do whatever it asks for the kind of edit you just made.
6. Update the rule file that names the module, and the Layout section of
   `.claude/CLAUDE.md` if a folder appeared or disappeared.

## 4. What `npm run check` cannot see

`checks.md` has the full list of limits. The three that bite during a refactor:

- **A deleted variable.** `bindings` is about imports, not scope — a plain
  undeclared local sails straight through. Deleting a `const` and leaving its
  uses behind passed all seven checks and threw `ReferenceError: picked is not
  defined` on the first render, which left the ban board on "Loading opponent
  squad cards..." forever. **After removing any binding, re-read the whole
  function**, not the diff.
- **Behaviour.** Nothing here executes a render path. When a refactor touches a
  renderer, run it — the smoke-harness recipe is in `checks.md` §"run the render
  paths", and the `/debugging` skill covers driving the real thing.
- **A false pass.** If you add a check, add its defect to `DEFECTS` in
  `scripts/check.js` and run `npm run check:self`; an uncovered check is one the
  self-test will not tell you about.

## 5. CSS refactors

- **Read `DESIGN.md` before writing a rule.** Do not introduce a colour, radius
  or spacing value that is not on one of its ladders.
- **All colour lives in `public/css/shared/tokens.css`.** No hex or `rgba()`
  literal anywhere else, CSS or JS.
- **The `<link>` order in each page's `<head>` is the cascade.** `tokens.css`
  first, `controls.css` last (its focus ring must beat feature sheets that set
  `outline: none`); on home, `responsive.css` after that. Reordering links is a
  behavioural change.
- **`dead-css` reports deletion candidates, not proof.** It counts a class as
  used if its token appears in any HTML or JS file, and ignores `:not()`. Confirm
  by grep before deleting a selector.
- **Measure, do not eyeball** — `responsive-testing.md`, and note its warning
  that headless Chrome clamps to 500 px and that transitions make rects lie.

## 6. Copies that must stay in sync — and one that must not exist

Each pair straddles the client/server boundary, where there is no shared module
to extract into. Changing one and not the other is the classic silent break:

| Concern | Client | Server |
| --- | --- | --- |
| ban/pick duration + reveal mode | `features/draft/state.js` | `src/features/rooms/config.js` |
| formation whitelist + `DEFAULT_FORMATION` | `shared/players/formations.js` | `src/features/gamePlans/routes.js` |

**There is deliberately no third formation copy in `src/features/rooms/`** — a
room's `formations` field is display data the client normalises on the way in.
Length-cap it there; do not "helpfully" add the whitelist.

Inside the client there should be **no** such pairs. The formation table and the
draft sort categories (`shared/players/sort.js`) each live in exactly one module —
the sort categories because two copies drifted into two different orders.

Also canonical in one order everywhere: **positions**, CF → SS → RWF → LWF → AMF
→ RMF → LMF → CMF → DMF → RB → LB → CB → GK.

## 7. Finishing

- `npm run check` clean.
- The rule file that describes the moved code says what is true now.
- Commit as `refactor: <what changed> [to <why>]`, matching the log's existing
  voice (`refactor: unify toolbar layout and sizing to prevent UI layout shifts`).
- Only commit when asked, and never onto `main` without branching first.
