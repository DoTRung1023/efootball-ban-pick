---
paths:
  - "public/js/features/draft/allowance.js"
  - "public/js/features/draft/lobby/allowanceView.js"
  - "public/js/features/draft/lobby/valuePicker.js"
  - "src/features/rooms/config.js"
  - "src/features/rooms/routes.js"
---

# Allowance system

A category answers two questions: **which players** it describes, and **how many
of them** a squad may hold.

| Config field | Holds |
| --- | --- |
| `allowanceEnabled` | the active category keys |
| `allowance` | the value per category — a span (`age: "30,40"`) or a CSV of chosen values (`club: "FC Barcelona,Real Madrid"`) |
| `allowanceCaps` | the ceiling — a bare count, or a `{value: cap}` JSON map |
| `allowanceMins` | the floor — **the same two shapes**, keyed the same way |

`allowanceMins` used to be a plain count in every category, and the per-value
categories had no floor at all. They do now: the two maps are mirror images, and
anything that reads one reads the other the same way.

**A minimum may never exceed its maximum.** "At least 23, at most 22" refuses
every possible squad, so an inverted pair is stored in order — swapped, the same
way the value range beside it is. Enforced in **both** places:
`commitAllowanceValueCounts` / `commitAllowanceCountPair` in the lobby (on
`change`, never per keystroke) and again in `POST /:code/config`, so no client
can store an unsatisfiable rule. The server pass (`orderAllowanceCounts`) handles
the map shape by comparing the pair **per key**; it used to skip maps entirely,
because `Number()` reads one as `NaN`.

`0` and `""` mean the same thing in every count field: no rule. A minimum of zero
asks for nothing, which is why both ends run through `normalizeAllowanceCapValue`.

## Four shapes of category

`shape` on each entry of `ALLOWANCE_CATEGORY_DEFS` says which, and it settles the
lobby row, the count shape and the pick-time check together.

| Shape | Categories | Value control | Counts |
| --- | --- | --- | --- |
| `range` | overall, overallMax, height, weight, age | two number boxes (`"min,max"`) | **one** Min/Max pair for the category |
| `fixed` | foot | none — both options are always on the row | Min/Max **per option** |
| `list` | position, league, cardType, region, playingStyle | picker showing every option; its box **filters** | Min/Max **per added value** |
| `search` | club, nationality | picker showing nothing until typed, then `/api/players/distinct` | Min/Max **per added value** |

`list` and `search` differ only in where the options come from — 5 regions and 36
leagues are a list you read; 693 clubs and 183 nationalities are a scroll. Below
the picker the two are the same row, and `fixed` is that row with the picker
taken off.

**A value nobody added carries no rule.** An enabled category with an empty value
list constrains nothing, which is what makes "add the category, then add the
values you care about" safe: the default is the absence of a rule, not a zero.

## Where each end is enforced

- **Maximum — at pick time**, `getAllowanceCapViolation`, called from
  `draftActions.js` before a card lands in a slot. For a per-value category it
  looks only at the values the host added, and only at the ones the incoming
  player matches.
- **Minimum — at CONFIRM**, `getAllowanceMinViolations`. It cannot be checked any
  earlier: an empty board breaks every minimum and a half-full board breaks most.
  Taking a confirmation *back* is never blocked.
- **`allowAllPlayers` turns both off.** The checkbox says "ignore category
  filters" and now does; it used to only grey out the editor, leaving every
  previously-set cap in force during the draft.

Both walk the same generator, `activeAllowanceRules(cfg)`, so the two ends cannot
disagree about which rules are live.

Matching is per value (`playerMatchesAllowanceValue`). Club, nationality and
region match on a **substring**, because those values can legitimately be typed
as a fragment — "Barcelona" is a deliberate half of "FC Barcelona". The rest are
a closed set of exact names.

Enforcement is client-side, as it has always been. The server normalises what it
stores and owns the phase transitions, not the squad rules.

## The pick board prints one pill per rule, not per category

`buildAllowancePills` gives a `range` category one pill and every other shape one
pill **per constrained value** — a value with neither number set is not a rule and
prints nothing, so the bar is bounded by what the host configured rather than by
how many clubs happen to be listed. A pill short of its minimum turns red and
says `need N`.

## What this replaced

Six categories shared a single Min/Max, seven capped each value with no floor at
all, and each of the three pickers had its own markup, its own normaliser, its
own summary function and its own `open…Key` on `state` — `positionSelectHtml`,
`multiSelectHtml`, `positionCapHtml`, `capPanelHtml` and `textListBuilderHtml`,
over four near-identical `parse*CapMap` families. One picker and one count map
replaced all of it: adding a category is a line in `ALLOWANCE_CATEGORY_DEFS` and,
for a `list` shape, an entry in `LOCAL_OPTIONS`.

`normalizeCardTypeValue` and its siblings also **validated against option arrays
filled at runtime**, so any render that beat `/api/players/filter-options` erased
the host's selections. List values are trimmed and deduped now, never
membership-checked; position is the one exception, because its list is static and
its matcher is exact.

## Two copies, one rule

**The normalisers are duplicated between `src/features/rooms/config.js` and
`public/js/features/draft/allowance.js`** — the client/server boundary has no
shared module. A change to one is a change to both. On the server
`RANGE_COUNT_FIELDS` is the copy of which categories take a bare count, and
`normalizeCountForField` handles both ends of both shapes.
