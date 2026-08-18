---
paths:
  - "scripts/**"
  - "package.json"
---

# `npm run check` — the static gate

No bundler, no type checker, no test runner. Nothing between writing a module and
loading it in a browser will tell you that an import is misspelled, a symbol is
unbound, or an element id no longer exists. `scripts/check.js` runs seven checks
that each close one of those gaps, in well under a second.

```bash
npm run check                 # everything
npm run check -- dead-css     # one check by name
npm run check:self            # prove the checks can still fail
```

Exit codes: `0` clean, `1` a check failed, `2` the name you passed matches nothing.

| Check | Catches |
| --- | --- |
| `imports` | a specifier that does not resolve, **path casing that differs from disk**, a named import the target does not export, a missing HTML asset, a link to a page URL `src/pages.js` does not serve, an import map that no longer maps `@/` to `/js/` |
| `bindings` | a symbol that is used but never bound — what a move or split leaves behind when it rewrites an import away |
| `unused-imports` | an imported name nothing references |
| `cycles` | import cycles in the module graph |
| `dom-ids` | `getElementById` / `querySelector("#…")` for an id no page that loads the module provides |
| `debug-leftovers` | `debugger` and `console.log` in **client** code (`src/` prints legitimately) |
| `dead-css` | class selectors no markup can match |
| `info-toggle` | a SHOW INFO / HIDE INFO selector that resizes the card instead of just showing and hiding its footer |

**Casing is the one that matters most.** macOS is case-insensitive and deployment
is not, so `@/shared/ui/Toast.js` works on the dev machine and 404s in production.
`existsExact` walks each path segment against `readdirSync`, because `existsSync`
alone cannot see the difference.

## The self-test is the point

Every check here has, at some point, returned a confident false pass. A
regex-based comment stripper blanked 26 lines of live code and made three used
imports look unused. A measurement harness reported "identical" for a viewport it
was never actually measuring. **A green run only means something if the checks are
still capable of going red.**

`npm run check:self` builds a tiny fixture project in a temp dir, asserts all
seven checks pass on it, then plants one defect at a time and asserts the matching
check catches it. If you add a check, add its defect to `DEFECTS` in
`scripts/check.js` — a check with no defect entry is not covered, and the
self-test will not tell you so.

## Known limits — do not read a pass as proof

- `bindings` only considers names that some module in the project exports, and
  its `(?<![\w$.])` lookbehind also excludes `...NAME`, so a spread-prefixed use
  is missed.
- **`bindings` is about *imports*, not scope.** A plain undeclared local sails
  straight through. Deleting a `const` and leaving its uses behind passed all
  seven checks and threw `ReferenceError: picked is not defined` on the first
  render, which left the ban board stuck on "Loading opponent squad cards..."
  forever — the throw aborts `renderDraftUi` before the grid is written, and it
  happens again on every 500 ms poll. **Deleting a variable is exactly the edit
  this gate cannot see; re-read the whole function afterwards.**
- `imports` splits `href="/…"` into two kinds: a path the router declares in
  `src/pages.js` is a **route** (`/console` is valid with no `public/console` on
  disk), anything else must exist as a file. A project with no `src/pages.js` —
  the self-test fixture used to be one — falls back to treating every href as a
  file, so the router is read defensively.
- `dead-css` treats a class as used if its token appears in **any** HTML or JS
  file, and treats any class starting with a literal prefix that precedes a `${`
  as possibly interpolated. Both are the safe direction: what it reports is a
  deletion candidate, not a guess. A class that appears only inside `:not()` is
  not counted at all — an exclusion is never required for a rule to match.
- `dom-ids` credits ids created at runtime (`panel.id =`, a `panelId:` option, or
  `id="…"` inside a template string). Without that, seven live dropdown panels
  read as dangling.
- `info-toggle` is the one check here that guards a *design* rule rather than a
  broken reference, and it exists because that rule was broken twice by edits
  that each looked local and correct. It reads declarations only: a width
  smuggled in through a custom property, or applied from JS, would pass. Neither
  exists, and both would be deliberate rather than the drift this catches.
  `display` is deliberately allowed — `display: none` on the footer *is* the
  mechanism.
- None of this checks behaviour. It cannot tell you the draft still works — for
  that, run one.

## Catching what the static gate cannot: run the render paths

A `ReferenceError` in a render function is invisible to every check above and
obvious the moment the function actually executes. The cheap way to execute them
is to serve the real page and call the real renderers against a stub room:

1. Copy `public/room.html`, strip its `<script type="module" src=…>` entry, and
   append a module script that imports `state.js` + the three board renderers.
2. Write the copy to `public/__smoke.html` and load it over
   **`http://localhost:3000`**, not `file://` — Chrome blocks ES module imports
   from `file://`, and the page comes back blank with no error, which reads as a
   pass.
3. Build a stub `room` (both sides, some bans, a `picks` array **with a `null`
   hole in it**), assign `state.room` / `mySide` / `phase` / `schedule` /
   `opponentBanPlayers` / `players`, then call each renderer inside a try/catch
   and print the results into a `<pre>`.
4. Delete `public/__smoke.html` afterwards — it is inside the served directory.

Assert node counts, not just absence of errors: a renderer that throws leaves the
grid at **0** cards, so `banGrid cards: 3` is the signal that it really ran. And
prove the harness fails: reintroduce the defect and confirm it reports `FAIL`
before trusting a pass.

## What is deliberately not here

The computed-style measurement harness (before/after `getComputedStyle` diffing
over every element and pseudo-element, driven through headless Chrome). It is
slow, needs a browser, and is the wrong shape for a pre-commit gate. Reach for it
when a CSS change needs proving, and read `room/css.md` and
`responsive-testing.md` first — both record the ways it has lied.
