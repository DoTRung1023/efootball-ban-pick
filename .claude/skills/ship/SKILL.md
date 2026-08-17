---
name: ship
description: The finishing routine before a change is called done or committed — run the static gate, prove the thing you changed actually runs, update the rule file that describes it, and write the commit the way this log writes them. Use when work is finished, when asked to commit, or when you are about to say "done".
---

# Finishing a change

There is no CI, no test suite and no build. Nothing downstream will catch what
you skip here.

## 1. The gate

```bash
npm run check          # seven checks, well under a second — required
npm run check -- imports
```

Non-negotiable, because **casing is the one that matters most**: macOS is
case-insensitive and deployment is not, so `@/shared/ui/Toast.js` works on this
machine and 404s in production. Also confirm no instrumentation survived —
`debug-leftovers` fails on `console.log` in `public/js`, and a `console.error`
you added for a hunt is still noise.

## 2. Prove it runs

`npm run check` is static. It cannot tell you the draft still works, and a
`ReferenceError` in a renderer is invisible to all seven checks — **deleting a
variable is exactly the edit this gate cannot see.**

| You changed | Do this |
| --- | --- |
| a renderer or any draft module | `draft-testing` — drive a room to the phase and look at it |
| CSS or page markup | `verify-layout` — measure it; `DESIGN.md` §11 |
| a backend route | call it; check the server terminal for `describeError` output |
| the catalog / ingestion | `scraping` §6 — row-count delta and enrichment spot-check |
| anything that removed a binding | re-read the whole function, not the diff |

## 3. Update the map

`.claude/rules/**` names modules, exports and ids explicitly, and `CLAUDE.md`
carries the layout and the cross-cutting conventions. If you moved, renamed,
added or deleted something either one describes, **that edit is part of the
change** — the rules are the reason a session does not have to re-derive this
codebase, and a stale rule is worse than a missing one.

Add a rule when you learn something the code cannot show: why a shape is
deliberate, what a reversal cost, which two copies must stay in sync. Most of
`.claude/rules/` is exactly that, written down once.

## 4. Commit

Only when asked. Never onto `main` without branching first.

The log is conventional-commit style, imperative, with the *why* when it is not
obvious — match it:

```
refactor: unify toolbar layout and sizing to prevent UI layout shifts during state toggles
feat(room): come back to the room you are still seated in
fix(room): stop a terminal presence response being painted over
```

Prefixes in use: `feat` · `fix` · `refactor` · `style`, with an optional
`(room)` scope. End the message with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Check `git status` for strays before staging — `public/__smoke.html`,
`public/__probe.html`, `scrape-*.log` and anything under `database/backups/`
must never be committed (the last contains user accounts and password hashes).

## 5. Report it straight

Say what you verified and how. If a step was skipped, say so; if tests or a
measurement failed, show the output rather than describing it. "Done" means
checked and run, not written.
