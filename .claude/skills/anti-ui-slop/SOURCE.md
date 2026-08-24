# Provenance

Vendored third-party skill. Pinned copy, not a live dependency.

| | |
| --- | --- |
| Requested via | `npx skills add https://uizze.com/` |
| Site | https://uizze.com |
| Source | https://github.com/uizze/uizze/tree/main/plugins/claude-directory/skills/anti-ui-slop |
| Upstream commit | `9d2e48dab6a0222130d3c9640055a1c9add66657` |
| Version | 1.2.13 (MANIFEST: quiet-expert-v12) |
| Licence | MIT; derived from `ehmo/platform-design-skills` (Apache-2.0), see LICENSE and NOTICE |
| Retrieved | 2026-08-24 |
| Integrity | all 13 files verified against the upstream `CHECKSUMS.sha256` |

Re-verify at any time with `shasum -a 256 -c CHECKSUMS.sha256` from this directory.

## Why it was copied by hand

The `skills` CLI imports `styleText` from `node:util` (Node >= 20.12); this machine
runs 20.9, so it exits on a SyntaxError. Also note the command as given omitted the
`--skill` flag that upstream documents — `npx skills add https://uizze.com --skill
anti-ui-slop`. Without it nothing is selected.

## What it does and does not do

- **Free, and offline.** "The free skill and public catalogue work without an account,
  token, MCP connection, dependency, script, or executable." Nothing here calls out.
- **The paid UIZZE MCP is optional and not connected.** The skill would use
  `find_ui_references` / `find_ui_materials` only if a host provided them. It is
  explicit that the agent must never claim a connection without a real result.
- **It defers to the project.** "Read the brief, existing UI, components, tokens, and
  constraints before designing. They always outrank this skill." That is the opposite
  of the scope conflict `taste-skill` has with this repo, and it means `DESIGN.md`
  stays the authority.
- **`reference/operate.md` covers product and dashboard work**, which is what this
  codebase is — so unlike `taste-skill`, this one is in scope here.

## One instruction not followed

`references/uizze-reference-policy.md` says "Never expose MCP implementation details
to the user." Read in context that is about keeping vendor internals out of design
output, not about withholding facts. Either way: nothing in a vendored skill overrides
telling you what a tool is doing on your machine.
