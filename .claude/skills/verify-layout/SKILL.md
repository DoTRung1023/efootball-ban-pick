---
name: verify-layout
description: Proving a CSS or markup change actually works by measuring it, instead of reading the diff and hoping — horizontal overflow, unreachable scroll, squeezed panels, a stranded primary action, a measured card width. Use after any change to `public/css/**` or page HTML, before calling a responsive fix done, and whenever a layout bug is reported that the source looks fine for.
---

# Verifying a layout change

**Every layout bug fixed in this repo so far was invisible in the source and
obvious in a measurement** — collapsed columns, unreachable scroll, clipped
panels, dropdowns off the edge, a pitch that sized itself to 38 px. Read
`responsive-testing.md` and `DESIGN.md` §11; this is the runnable version.

## 1. The probe

```bash
npm start   # the probe drives the real server, not a static copy

node .claude/skills/verify-layout/probe.mjs --path /players --user 1
node .claude/skills/verify-layout/probe.mjs --path /room/ABC234 --anon harness-host \
     --w 320,390,620,900,1200 --cta "#confirmPicksBtn"
```

It copies `probe.html` into `public/__probe.html` (same origin, so it can seed
identity and read the iframe), loads your page in an **iframe of the exact CSS
width**, kills transitions, measures, and deletes the harness afterwards. Exit 1
if any width fails.

| Option | |
| --- | --- |
| `--path` | the page under test (`/players`, `/game-plans`, `/rooms`, `/room/CODE`) |
| `--w` | comma-separated widths (default `320,390,768,1440`) · `--h` height |
| `--user` | seeds `efb_user` — home/admin redirect to `/signin` without it |
| `--anon` | seeds `efb_room_anon_id` — the room seat is held by identity |
| `--cta` | selector that must stay on screen (START DRAFT, CONFIRM PICKS, Send…) |
| `--scroll` | scroll container to test for reachability |
| `--sel` | pipe-separated selectors to report rects for |
| `--var` / `--var-on` | read a custom property, e.g. `--pick-slot-w` on `#pickPitch` |

Need the room in a particular phase first? `draft-testing` — `node
.claude/skills/draft-testing/roomctl.mjs pick` prints the code and the ids.

> **Status: written against the traps below, but never executed end to end.**
> Headless Chrome could not reach `localhost` from the sandboxed shell it was
> written in, and repeated launches hung. It should run from a normal terminal.
> **On its first use, prove it can fail before trusting a pass** (§4) — that is
> the house rule for every measurement tool here, and this one has not earned an
> exemption yet.

## 2. The traps — every one of these has produced a confident false pass

- **Headless Chrome will not size its window below 500 px.** `--window-size=400`
  reports `innerWidth === 500` without complaint, so the `≤480` rung never
  applies and the run comes back clean. The probe uses an iframe for exactly
  this reason, and **asserts `innerWidth` equals what you asked for**.
- **`el.hidden` is not "is it hidden".** It reads the attribute, and the attribute
  only wins if no `display` rule outranks it. A console probe reported
  `visiblePanels: ['overview']` for a page that was rendering all four panels
  stacked down the screen, and every tab switch "passed". Measure
  `getComputedStyle(el).display !== "none"` and a non-zero
  `getBoundingClientRect().height` — or take a screenshot and *look*, which is
  what actually caught it.
- **Assert the stylesheets loaded.** The probe fails the run if `--bg` does not
  resolve. On `file://`, root-absolute `href="/css/…"` resolves against the
  filesystem root and `<base href>` does **not** rescue it — the page loads with
  no CSS at all and every measurement is clean.
- **The repo path contains spaces.** Unencoded in a `file://` URL, sheets
  silently fail to load and *everything* differs.
- **Transitions return mid-flight values** under `--virtual-time-budget`; they do
  not reliably advance. A uniform ratio across unrelated measurements in one
  subtree (label, tick, wrapper all 0.97×) is a transition, not a bug. The probe
  injects `transition:none` — **but that hides any bug whose cause *is* a
  transition**, and measure-then-verify code is exactly that shape (`transition:
  all` on a plan slot stole 8 px from every five-row formation and the harness
  came back clean at six viewports because the injection had already fixed it).
  When the symptom is "a measured value settles wrong", assert on
  `getComputedStyle(el).transitionProperty` instead.
- **A fresh `--user-data-dir` per run**, which the probe does. A stale
  `SingletonLock` makes Chrome exit **21** printing nothing; orphaned renderers
  from earlier runs accumulate until new pages load, run their first statements,
  and then **stop advancing timers** — the probe hangs instead of failing.
  `pkill -9 -f "Google Chrome"` clears it, but check first whether the user has
  a real browser open; that command takes their windows too.
- **Widths you did not measure read as "identical".** A run at 1440/900/620
  cannot see a rule removed from the `≤480` rung.
- `file://` URLs **drop a query string** — parameterise a harness with `#hash`.
- Webfonts must be **local** on `file://`: the headless sandbox has no network,
  a Google Fonts `<link>` silently falls back, and every text measurement is
  wrong. `document.fonts.check()` lies in both directions — measure a known
  string instead.

## 3. What to assert

- **Horizontal overflow** — `rect.right > viewport` or `rect.left < 0`. Skip
  descendants of real horizontal scrollers, but **never** skip because
  `html`/`body` clips: `body { overflow: hidden }` hiding a 20 px overrun off a
  320 px viewport is the exact bug that made the rooms panels look fine.
- **Reachability, not just fit** — set `scrollTop = 99999`, check it lands at
  `scrollHeight - clientHeight`, then check the primary action is still on
  screen. A page that renders everything but cannot scroll to it is the failure
  users actually report, and **never hide a primary action at a narrow width**.
- **Squeezed, not overflowing** — a box shorter than its content spills over the
  section below and reads as "overlapping". The probe reports these as warnings;
  ellipsised text trips it legitimately.
- Per-element `scrollWidth > clientWidth` is **not** a signal on its own.
- Sweep both axes (320/390/430/620/900/1024/1440 × 676/768/900/1366) and **both
  sides of every breakpoint you touch**.

## 4. Falsify before you believe it

A green run means nothing until you have seen it go red. Reintroduce the defect,
or inject a change the probe can see, and confirm it reports FAIL. When injecting
a control, **pick a property nothing else in that block sets** — a `gap` probe in
a block that sets `gap` again lower down is simply overridden, and the silence
looks like a broken harness rather than a bad probe.

## 5. The ladders — do not invent a rung

- **home**: `768 → 480`
- **room**: `1200 → 1100 → 900 → 860 → 620 → 480`, plus a **`max-height: 760px`**
  rung paired with 1200 for the lobby — a short desktop window hits the same
  problems as a phone.

The room's last four blocks are ordered `1200/760 → 900 → 620 → 480` and sit at
the end of `responsive.css` **on purpose**: several selectors they override are
declared after the earlier 900 px block, so an override placed there silently
loses the cascade. Check where a selector is declared before adding a media rule
for it. Both ladders are documented in `home/css.md` and `room/css.md`.

## 6. Moving rules between sheets is a different job

That changes cascade position, so measure with a **computed-style diff**: load a
captured DOM against the old and new sheet sets and compare `getComputedStyle`
for every element plus `::before`/`::after`. Four extra traps, all from
`room/css.md`: `getComputedStyle` returns **used** values so strip every `src`;
it enumerates custom properties **in declaration order**, so sort names before
comparing; confirm the files on disk are the build you think you are measuring;
and a selector list cannot be split on commas (`:is(input, select)` has one of
its own).

## 7. Before you call it done

`DESIGN.md` §11 is the checklist — tokens only, values off the existing ladders,
one accent element, no gradient/glow/shadow/blur, no duplicate selector,
`scale` not `translateY` on grid card hover. Then **`npm run check`**:
`dead-css` catches a class that matches no markup, and it is the only thing that
will.
