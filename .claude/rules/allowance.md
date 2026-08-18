---
paths:
  - "public/js/features/draft/allowance.js"
  - "public/js/features/draft/lobby/allowanceView.js"
  - "src/features/rooms/config.js"
  - "src/features/rooms/routes.js"
---

# Allowance system

A category answers two questions: **which players** it describes, and **how many
of them** a squad may hold.

| Config field | Holds |
| --- | --- |
| `allowanceEnabled` | the active category keys |
| `allowance` | the filter value per category (`age: "30,40"`, `foot: "Left"`, …) |
| `allowanceCaps` | the ceiling — a count, or a `{value: cap}` JSON map |
| `allowanceMins` | the floor — always a plain count, never a map |

**A minimum may never exceed its maximum.** "At least 23, at most 22" refuses
every possible squad, so an inverted pair is stored in order — swapped, the same
way the value range beside it is. Enforced in **both** places: `commitAllowanceCountPair`
in the lobby (on `change`, never per keystroke) and again in `POST /:code/config`,
so no client can store an unsatisfiable rule. The server pass skips per-value
caps, which are JSON maps and read as `NaN`.

`0` and `""` mean the same thing in both count fields: no rule. A minimum of zero
asks for nothing, which is why `normalizeAllowanceMinValue` is
`normalizeAllowanceCapValue` and both collapse to `""`.

## Two shapes of category

- **Single-count** (`ALLOWANCE_SIMPLE_COUNT_KEYS`: overall, overallMax, height,
  weight, age, foot) — one min/max pair for the whole category.
- **Per-value** (position, club, league, nationality, card type, region, playing
  style) — a cap per selected value, and **no minimum**. "At least 2 CF" would
  need a per-value floor and a second panel in five places; it does not exist.

## Where each end is enforced

- **Maximum — at pick time**, `getAllowanceCapViolation`, called from
  `draftActions.js` before a card lands in a slot.
- **Minimum — at CONFIRM**, `getAllowanceMinViolations`. It cannot be checked any
  earlier: an empty board breaks every minimum and a half-full board breaks most.
  Taking a confirmation *back* is never blocked.
- **`allowAllPlayers` turns both off.** The checkbox says "ignore category
  filters" and now does; it used to only grey out the editor, leaving every
  previously-set cap in force during the draft.

Enforcement is client-side, as it has always been. The server normalises what it
stores and owns the phase transitions, not the squad rules.

## The bug this replaced

The five range categories and Foot had **no count control at all** — the lobby
skipped them (`showSimpleCap` excluded ranges and foot) and so did the pick-time
check (`if (ALLOWANCE_RANGE_KEYS.has(key) || key === "foot") continue;`). Six of
the thirteen categories could be added, configured, and did nothing whatsoever.
Because no category qualified for a "simple cap", `simpleCapHtml` was dead code
and the generic branch of the violation check was unreachable.

The pick board's counters were dead for the same family of reason: they ran
`Number()` over a `{value: cap}` map, got `NaN`, and skipped every category.
They are scoped to the single-count categories now, and a pill short of its
minimum turns red and says `need N`.

## Two copies, one rule

**The normalisers are duplicated between `src/features/rooms/config.js` and
`public/js/features/draft/allowance.js`** — the client/server boundary has no
shared module. A change to one must be mirrored in the other.
