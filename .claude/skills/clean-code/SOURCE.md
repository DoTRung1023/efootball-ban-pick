# Provenance

Vendored third-party skill. Pinned copy, not a live dependency.

| | |
| --- | --- |
| Requested via | `npx skills add https://github.com/sickn33/agentic-awesome-skills --skill clean-code` |
| Source | https://github.com/sickn33/agentic-awesome-skills/tree/main/skills/clean-code |
| Raw | https://raw.githubusercontent.com/sickn33/agentic-awesome-skills/main/skills/clean-code/SKILL.md |
| Upstream commit | `2138ff8fd03e70a03e116098923de0bdab3d2748` |
| Upstream attribution | ClawForge (https://github.com/jackjin1997/ClawForge) |
| Retrieved | 2026-08-24 |
| sha256 | `d90261fd5e38625bb0c7aadacca1a954a16f6d0101c451511a6f049dd1769416` |

`SKILL.md` is byte-for-byte upstream.

## Why it was copied by hand

The `skills` CLI (vercel-labs) imports `styleText` from `node:util`, added in
Node 20.12. This machine runs Node 20.9.0 with no version manager, so the CLI exits
on a SyntaxError before doing anything. Copying the file is what it would have done.
Re-run the CLI instead once Node is >= 20.12.

## Scope note for this repo

The skill is language-agnostic Uncle Bob. Two of its sections do not describe this
codebase and should not be applied literally:

- **§6 Error Handling** assumes exceptions and null-returning APIs. This is vanilla
  ESM with no exceptions-as-control-flow; the backend convention is `asyncHandler`
  plus `describeError`, documented in `.claude/rules/backend.md`.
- **§7 Unit Tests** prescribes TDD. There is no test runner here by design; the
  equivalent gate is `npm run check` plus `npm run check:self`. See
  `.claude/rules/checks.md` and the "No runtime tests" entry in README.
