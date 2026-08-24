# DESIGN.md — visual language

The single source of truth for how this app looks. Read this **before** writing any CSS
or markup that has a visual result, and before answering "make it look better" requests.

Everything below is descriptive, not aspirational: these are the values already shipping
in `public/css/`. When you add UI, pick from these tokens. When you think you need a
value that is not here, you are almost always looking for the nearest rung that already
exists.

**Provenance:** the palette and the rules in §3 are modelled on
[efhub.com](https://efhub.com) — near-black cool surfaces, one volt-green accent used
sparingly, everything else greyscale, depth from a raised surface plus a hairline rather
than from shadow.

> **This replaced a deep-navy-and-emerald theme.** If you find navy (`#0b1b29`), emerald
> (`#2ccf75`), cyan (`#35d6ff`), Orbitron, glass blur, or a green/cyan alpha ladder
> anywhere, it is a leftover — not a second style to match. Every one of those was
> removed; see §12.

---

## 1. Identity

**Near-black surfaces, one volt-green accent.** A flat, quiet, high-contrast dark UI:
cool near-black panels separated by hairlines, white type, a single lime-green mark per
screen pointing at the one thing that needs attention.

Style rules that define the look:

- **Dark only.** There is no light theme and no `prefers-color-scheme` branch. Do not add
  one.
- **The accent is a pointer, not decoration.** At most one element per screen wears
  `--accent`, and it marks the single most important thing — usually what the user has to
  act on right now. Everything else is greyscale.
- **Never white text on the accent.** `--on-accent` (near-black) only. White on
  `#C9F73C` measures **1.25:1**, which is unreadable; `--on-accent` measures 15.80:1.
- **Flat surfaces.** No gradients, no glows, no drop shadows, no backdrop blur. Depth is
  `--bg-elevated` sitting on `--bg` plus a 1px `--border`. That is the whole elevation
  system.
- **Two text colours.** `--text` and `--text-muted`. There is no third rung.
- **Motion is for hover only**, 150ms ease. The turn timer is the one element allowed an
  animation of its own.

---

## 2. Where the tokens live

**One file: `public/css/shared/tokens.css`.** It is linked *first* on all four pages,
ahead of every other sheet. There is no bundler, so the `<link>` order in each `<head>`
**is** the cascade — a sheet loaded before `tokens.css` would read undefined variables.

Nothing else in the codebase declares a colour. Not the feature sheets, not the page
sheets, not the JS. There is no hex literal outside this file.

`public/css/shared/controls.css` is the companion, linked **last** (on the home page,
just ahead of `responsive.css`, which still has the final word). It holds the two
cross-cutting rules that have to win over feature CSS: the focus ring and the text-input
treatment. Several feature sheets set `outline: none` on `:focus`, so the ring is written
as `:focus-visible` — one class-weight heavier — and lands anyway.

The room page's CSS is seven sheets, not one — `base / shell / lobby / ban / pick /
ready / responsive` under `public/css/features/draft/`, linked in that order. Where the
rest of this document says **`draft.css`** it means that set. The component map is in
`.claude/rules/room/css.md`.

---

## 3. Colour

### 3.1 The palette

Taken from efhub.com's own stylesheets, not approximated by eye.

```css
:root {
  /* surfaces — navy-black, cool. NOT neutral grey. */
  --bg:          #0F1118;
  --bg-elevated: #171922;
  --bg-input:    #262A3A;
  --border:      #31364B;

  /* accent — volt lime, one element per screen */
  --accent:       #C6F135;
  --accent-hover: #D0FE05;
  --on-accent:    #0F1118;

  /* status */
  --danger:     #FF6467;
  --text:       #FFFFFF;
  --text-muted: #8B91A8;
}
```

**The blue cast is the whole point.** Every surface rung carries the same navy
tint, which is what makes a panel read as one material at two depths instead of
grey sitting on black. An earlier pass used neutral near-black (`#0A0B0D`) with
the right accent on top and still did not look like the reference — the accent
was never what was off. If you find yourself reaching for a grey, you want the
navy rung at that lightness.

`--danger` is deliberately **one rung lighter than efhub's `#FB2C36`**. That value
is what `--danger-line` / `--danger-fill` are mixed from, so borders and washes
carry the brand red — but as text it only reaches 3.74:1 on `--bg-input`, and an
invalid form field puts danger-coloured text on exactly that surface.

### 3.2 Hue meaning — hard rule

Three colours carry meaning; nothing else carries any.

| Colour | Means |
| --- | --- |
| `--accent` | the one thing to act on now (whose turn, the primary CTA, a focused field) |
| `--danger` | banned, or destructive (close room, kick, leave, delete) |
| greyscale | everything else, including *you* vs *the opponent* |

Never use `--danger` for emphasis, and never let a second element on the same screen take
the accent. **"You" and "the opponent" are not colour-coded** — the old theme used green
for you and cyan for them; both are greyscale now and the label does the work.

### 3.3 The neutral ladder

Everything that is not the accent element is greyscale, so lines and fills come from
here. **Never write a raw `rgba()`** — pick the closest rung.

```css
:root {
  --line-faint:  rgba(255, 255, 255, 0.06);  /* dividers, panel edges     */
  --border:      #31364B;                    /* control borders           */
  --line-hover:  #454B66;                    /* hover borders             */
  --line-active: #596080;                    /* selected / focused        */

  --fill-faint:  rgba(255, 255, 255, 0.02);  /* tint washes               */
  --fill:        rgba(255, 255, 255, 0.04);  /* hover fills               */
  --fill-strong: rgba(255, 255, 255, 0.08);  /* selected fills            */

  --danger-line: rgba(251, 44, 54, 0.45);
  --danger-fill: rgba(251, 44, 54, 0.12);
  --scrim:       rgba(0, 0, 0, 0.72);        /* modal / overlay backdrops */
}
```

The two solid rungs are navy, not grey — same reason the surfaces are. The two faint
rungs stay white-alpha so they pick up whatever they are laid over. The danger washes are
mixed from efhub's own `#FB2C36`, not from `--danger`: see §3.1.

State convention on an interactive surface: rest `--border` + no fill → hover
`--line-hover` + `--fill` → selected `--line-active` + `--fill-strong`. No glow at any
step. Where a selected state needs more weight than a border can carry, add the sanctioned
hairline ring — `box-shadow: 0 0 0 1px var(--line-active)` (§7) — which reads as a 2px
edge without becoming a glow.

**"No fill" at rest is load-bearing: the fill rungs are white-alpha, so they have to
*layer*.** Give a stateful control a solid rest surface and the state fills replace it
rather than lighten it — `--fill-strong` over `--bg-elevated` composites to `rgb(42,43,52)`,
which is *darker* than a `--surface-control` chip at `rgb(38,42,58)` in the two channels
the eye weighs most. The lobby's MODE cards were exactly that: a `--surface-control` chip
whose selected state painted `--fill` over it, so the chosen mode was the dimmest of the
three and hover moved nothing but a `--line-faint` edge. A control that has to show hover
and selected is **transparent at rest**, and its border does the work of separating it
from the panel. Measured after the fix — relative luminance rest `0.0099` → hover `0.0163`
→ selected `0.0247`, each step ~1.6× the last.

**A small control's outline is the exception, and it is a legibility floor, not a new
rung.** A 14px checkbox at `--border` measures **1.47:1** on `--bg-elevated`, so an
unticked box is not faint, it is *absent* — and because `--fill` lightens the row without
touching the border, hovering made it worse (1.33:1), which is backwards. Those boxes
start at `--line-hover` and go to `--line-active` + `--fill-strong` when hovered
(2.57:1). Same ladder, shifted up one rung, because 1.5px of a 14px square has to carry
what a whole panel edge carries elsewhere.

**A hover state must not outrank a selected one.** `.item:hover .box` and
`.item.checked .box` weigh the same, so the later one wins — and written in that order,
hovering a ticked box emptied it, which is the box saying the opposite of what it means.
Scope hover with `:not(.checked)`: a selected control is already at the top of the ladder
and has nowhere to go.

### 3.4 Role aliases

Names the feature sheets already speak, pointed at the palette. They survive because the
*role* survives — a card is still a card. Prefer the canonical token in new code.

```css
--bg-card / --bg-card-solid / --surface-card / --surface-popover  →  --bg-elevated
--bg-card-hover                                                  →  #1A1D27
--bg-input / --bg-field / --surface-control                      →  --bg-input
--surface-sunken                                                 →  --bg
--text-dim                                                       →  --text-muted
```

`--surface-popover` and `--bg-card-solid` both resolve to `--bg-elevated`, which is
opaque — that is the point. Sticky headers and floating panels sit over live content, and
a menu you can read the page through is unreadable, not layered.

### 3.4b The console palette — the one screen with more than one hue

Everywhere else in this app §3 holds as written: one accent, red for
destructive, neutrals for everything else. **`/console` is the exception, and
the reason is what a dashboard is.** A game screen has one thing that matters at
a time, which is what "one accent per screen" is built for. The console shows
five kinds of state at once — a draft's phase, a scrape's outcome, a catalog's
health, an account's role — all equally true, none of them the one thing you are
being asked to do. Told apart by weight alone they read as a wall of grey, which
is exactly what happened.

```css
--hue-blue:   #62B6FF;   /* console access · a job running        */
--hue-violet: #B39DFF;   /* the pick phase                        */
--hue-amber:  #FFC46B;   /* ready to start · a warning, not a fault */
--hue-green:  #5BE9A6;   /* finished, healthy, done               */
/* lime stays --accent (the master admin), red stays --danger (banned, stalled) */
```

Each carries `-fill` (12%, a surface), `-line` (40%, a border) and, where a whole
row is tinted, `-fill-strong` (20%, its hover — a tint has to survive the pointer
or the row looks like it went out). `--role-master` / `--role-admin` /
`--role-user` are semantic aliases on top, so the USERS table asks for a meaning
and the palette answers.

**Three rules that keep this from becoming decoration:**

1. **A hue means one thing.** Blue is access-or-running on every tab it appears
   on. If a new state needs a colour, it takes the hue that already means that,
   or it does not get one.
2. **Colour states, not counts.** LIVE ROOMS goes blue when rooms are live and
   `LAST SCRAPE` goes green or amber by its outcome; PLAYERS IN CATALOG and
   REGISTERED USERS stay white, because a number with no state has nothing to
   say in colour.
3. **Controls stay neutral.** Buttons never take a hue from the row they sit in.
   The accent is the app's "act here" signal, and a MAKE ADMIN button in lime on
   a master's row would read as the one thing on screen asking to be pressed.

This palette does not travel. `home`, `room` and `signin` keep §3 as it stands.

### 3.5 Contrast — measured

Every pair below was computed from the hex values, not eyeballed. The floor is 4.5:1.

| on → | `--bg` | `--bg-elevated` | `--bg-input` |
| --- | --- | --- | --- |
| `--text` | 18.86 | 17.52 | 14.24 |
| `--text-muted` | 6.03 | 5.60 | 4.55 |
| `--danger` | 6.53 | 6.07 | 4.93 |
| `--accent` | 14.40 | 13.38 | 10.87 |
| `--hue-blue` | 8.67 | 8.05 | 6.55 |
| `--hue-violet` | 8.25 | 7.66 | 6.23 |
| `--hue-amber` | 12.00 | 11.15 | 9.06 |
| `--hue-green` | 12.26 | 11.39 | 9.26 |

`--on-accent` on `--accent` — the one pair that is not text-on-surface — is **14.40:1**.
White on `--accent` would be 1.31:1, which is why the rule against it is absolute.

The console hues were picked against `--bg-elevated`, where they are used; the
dimmest of them measures **7.66:1** there, so all four clear the floor at the 12px
that dashboard sets.

Worst body-text pair in the system: **4.55:1**, `--text-muted` on `--bg-input`. That is
close to the floor, so do not lighten a background or darken `--text-muted` without
re-running the numbers.

---

## 4. Typography

```css
--font-body:    "Inter", -apple-system, "Segoe UI", sans-serif;
--font-main:    var(--font-body);
--font-display: var(--font-body);
```

**One family.** Inter, loaded from Google Fonts in all four HTML files at
`wght@400;500;600;700;800`. Orbitron is gone.

`--font-display` is the same stack under a role name. It marks text that is set uppercase
and tracked out — nav labels, kickers, badges — which is a typesetting choice, not a
family. Keeping the name keeps that intent legible in the CSS.

**Size scale.** Five rungs, all in px. `rem` sizing is gone; every declaration was
converted and snapped to the nearest rung.

| px | Role |
| --- | --- |
| 12 | small labels, captions, badges — with `--text-muted`, uppercase, `0.05em` |
| 14 | body, list rows, buttons, inputs, toasts |
| 15 | nav links |
| 20 | page and section headings |
| 22 | logo / app name (weight 800, `letter-spacing: -0.02em`) |

Above 22px is **display numerals only** — the turn clock at 32px. (The Start Match stat
row used to be the other one; it is gone.)
Those are deliberate one-offs, not a sixth rung; do not size body text there.

**Weights.** 400 body · 500 nav links and captions · 600 emphasis and player names ·
700 headings, buttons and the clock · 800 the logo.

**Tracking.** `0.05em` on uppercase labels, `-0.02em` on the logo, `0` everywhere else.
The old ladder went out to `0.25em`; every value above `0.05em` was clamped. Do not track
out body copy.

---

## 5. Shape

| Value | Used for |
| --- | --- |
| `0` | **player cards** — square by design, do not round |
| `--radius-sm` (6px) | small chips, badges, inline tags |
| `--radius` (8px) | the default — cards, panels, buttons, modals, toasts |
| `--radius-pill` (999px) | search inputs, filter chips, the primary CTA, dots, avatars |

Three values plus zero. The old scale had ten; if you reach for 10, 12, 14 or 18px, you
want `--radius`.

---

## 5a. Icons

**Every icon in the app is a `<symbol>` in `public/icons/sprite.svg`, and nothing
else draws one.** There is no icon inside a page, a stylesheet or a template
string; a site names one:

```html
<svg width="14" height="14" viewBox="0 0 24 24"><use href="/icons/sprite.svg#plus" /></svg>
```

```js
import { icon } from "@/shared/icons/icon.js";
icon("check", { size: 13, className: "sort-check" })
```

The set is **Feather (MIT)**: 24×24, monoline, `stroke="currentColor"`, no fill,
`fill="none"`. Keep new icons in that family.

**What belongs to the sprite, and what belongs to the site:**

| The sprite decides | The site decides |
| --- | --- |
| geometry, `viewBox` | `width`/`height` — one number, icons are square |
| `stroke-width` | `class`, and the colour it inherits |

`stroke-width` is the important half of that split. It used to be written per
site, across 83 inline copies of 26 actual shapes, and it drifted exactly as you
would expect: close at 2.5 **and** 3, search at 2.5 **and** 2, grid at 2 **and**
1.5 — the same icon at two weights on one screen, with no way to fix it in one
place. Do not put `stroke`, `fill` or `stroke-width` back on a call site.

**No `stroke-linecap` / `stroke-linejoin`.** The set has always rendered with
butt caps and miter joins. Adding round would restyle every icon at once.

**Colour comes from `currentColor`**, so an icon is whatever colour the thing it
sits in is — which keeps icons inside §3 and out of the token file's way. Do not
give an icon a colour of its own.

**One icon is allowed to stay inline, and it is not a grandfather clause.**
`.room-chat-icon` is two-tone — `shell.css` colours its `path` and its `circle`
separately — and a sprite `<use>` renders into a shadow tree that a page's CSS
selectors cannot reach. Any icon needing more than one colour has the same
problem and the same answer. Everything else goes in the sprite.

**The name must be a literal.** `icon(dir === "asc" ? "arrow-up" : "arrow-down")`
reads fine and is invisible to the `icons` check, which scans for a quoted name
directly after `icon(`. Put the conditional *around* two calls instead. The
check caught six of these the day the sort arrows moved into the sprite.

**No emoji, and no typographic mark standing in for an icon.** A pictograph is
somebody else's art, it renders differently on every platform, and it cannot
take a token colour. The UI had eight of them — and they were written as HTML
entities (`&#128065;`, `&#127787;&#65039;`, `&#9203;`) rather than literal
characters, which is how they outlived two passes that grepped for emoji and
came back clean. **Grep the entity range too**, not just the codepoints.

The rule extends past emoji to every non-ASCII mark doing an icon's job: `✓`
`↑` `↓` `∞` `▶` `●` `✕` `←` are symbols in the sprite now, not characters in a
string.

**Punctuation is not a mark.** `·` between two fields, `—` in a sentence, `…`
on a truncation, `→` inside a tooltip or an `<option>` label all stay text —
and the last two have no choice, because a `title` attribute and an `<option>`
cannot hold an element.

### The generated folder

`public/icons/svg/` holds one standalone `.svg` per symbol. It is **generated**:
`npm run icons` writes it, the `iconFiles` check fails the moment it drifts, and
every file carries a "do not edit" banner on line one. The sprite is still the
only place geometry is written.

It earns its place by doing the one thing a sprite cannot. A `<use>` renders
into a shadow tree, so it can never be a CSS pseudo-element — which is what the
three `content: "✓"` ticks were. They are now:

```css
background: var(--text);
mask: url("/icons/svg/check.svg") center / contain no-repeat;
```

— the only form of a tick that takes a token colour. Reach for a loose file
**only** in a pseudo-element; anything a page or a module draws goes through
the sprite.

`npm run check` fails on a `<use>` naming a symbol the sprite does not define,
on a symbol nothing uses, on a site that draws its own geometry, and on a
generated file that no longer matches the sprite — see `.claude/rules/checks.md`.

---

## 6. Spacing

- **40px** between major sections.
- **16px** gap inside a grid.
- **12–16px** padding inside a card or panel.
- 6–8px inside a control, 10–12px between controls.

Layout is flex/grid + `gap` throughout. Margins are for exceptions, not rhythm.

Layout constants: `--topbar-h: 64px` (home), `--nav-h: 64px` (admin),
`.main-content { max-width: 1400px; margin: 0 auto }`.

---

## 7. Elevation

There is no elevation system beyond this:

```css
/* every raised surface, from a card to a modal */
background: var(--bg-elevated);
border: 1px solid var(--border);
border-radius: var(--radius);
```

No `box-shadow`. No `backdrop-filter`. No gradient. The only `box-shadow` allowed is a
zero-offset, zero-blur ring used to draw a hairline that a `border` cannot
(`box-shadow: 0 0 0 1px var(--line-active)`), and the only gradient left in the codebase
is the `conic-gradient` on the turn clock, which encodes progress.

The ambient background art is gone — no `.pitch-bg`, no `.glow-orb`, no drifting
particles, no radial washes on `body`. Pages sit on a flat `--bg`. The football pitch
markings in `shared/pitchField.css` stay, because that component *is* a pitch, but its
turf is now `--bg` with `--fill-faint` mow stripes.

**One exception, and it is named: the sign-in page.** `/signin` runs a `.falling-cards`
layer of player card art drifting down behind the form, and its TOP PLAYERS strip
scrolls on a loop. It is the only screen with ambient motion, and it is allowed because
it is the only screen with nothing to do: no state, no data, no decision — a person is
there for eight seconds typing a password. The constraints it still keeps are what make
it an exception rather than a second theme:

- it declares **no colour** — the effect is `opacity`, `transform` and a `filter` on the
  art itself, and there is still no literal outside `tokens.css`;
- **no gradient, glow, shadow or `backdrop-filter`** — the form card is the same flat
  `--bg-elevated` panel as everywhere else, and no text ever sits on moving art. The
  falling art does carry a `filter: blur()`, which is not the banned thing: a
  `backdrop-filter` samples and frosts whatever sits *behind* a panel, while this
  blurs the decorative image itself, as depth of field. Nothing is frosted, and no
  surface in the system gained a blur;
- it is **off entirely under `prefers-reduced-motion`**, along with the page's two
  entrance transitions.

Anywhere else, ambient art is still a leftover. `features/auth/auth.css` is the only
sheet that may carry it.

---

## 8. Motion

```css
--transition: 150ms ease;
```

Use `var(--transition)` and name the properties — never `transition: all`.

- **Hover only.** No entrance animations, no reveals, no shine sweeps — outside
  `/signin`, whose backdrop and player strip are the one scoped exception (§7).
- Hover on a grid card: `transform: scale(1.03)` + a 1px `--border` outline. **Nothing
  else** — never add `translateY` to a grid card, it moves the bottom edge off the cursor
  and the hover state loops.
- Hover on a button: a colour change. No lift, no shadow, no `filter: brightness()`.
- `:disabled` is `opacity: 0.5; cursor: not-allowed` — never a colour change.
- **Two exceptions, both opacity-only, both conveying live state rather than decorating:**
  the turn timer (under `LOW_TIME_SECONDS` the digits pulse for 1s, infinitely) and the
  live-status dots (`dotPulse` in `admin.css`, `lsPulse` in `lobby.css`, both
  `1 → 0.7 → 1`). Opacity only — no scale, no colour flashing, no ring.

---

## 9. Component recipes

Copy these rather than inventing a variant.

```css
/* base button */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text);
  padding: 10px 24px;
  border-radius: var(--radius);
  font-family: var(--font-body); font-weight: 600; font-size: 14px;
  transition: background var(--transition), border-color var(--transition);
}

/* primary CTA — accent, pill, near-black label. ONE per screen. */
.rooms-create-cta {
  background: var(--accent);
  color: var(--on-accent);
  border: none;
  border-radius: var(--radius-pill);
  font-size: 14px; font-weight: 700; letter-spacing: 0.05em;
}
.rooms-create-cta:hover { background: var(--accent-hover); }

/* secondary — transparent, hairline, white label */
.rooms-join-cta {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--radius-pill);
}

/* panel */
.draft-panel {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
}

/* text input — no border until focus, then accent */
.field-input {
  background: var(--bg-input);
  border: 1px solid transparent;
  color: var(--text);
  font-size: 14px;
}
.field-input:focus { border-color: var(--accent); }

/* focus ring — system-wide, in controls.css */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

**Where the accent lives, screen by screen** — exactly one owner each:

| Screen | The accent element |
| --- | --- |
| sign-in | the SIGN IN button |
| my players | ADD PLAYER |
| game plans | the focused plan-name field |
| rooms | CREATE ROOM (JOIN is the outline secondary) |
| room / draft | the turn clock's progress bar, and the pick slot waiting on you |
| admin | `.btn--primary` |

The room page's `.btn--primary` is deliberately **white, not accent**: the accent is
already spoken for by the clock, and a READY button wearing it would make the player look
in two places at once.

Scrollbars are themed globally (5px, `--fill-strong` thumb, pill radius, transparent
track) — inherit it, do not restyle per-component.

---

## 10. Structural rules that constrain design

These have bitten before; a "purely visual" change can break them.

- **Responsive down to 320px**, with a fixed breakpoint ladder per page — home
  `768 → 480`; room `1200 → 1100 → 900 → 860 → 620 → 480` plus a `max-height: 820px`
  rung. Do not invent a rung. Verify with a measured headless-Chrome harness, never by
  eye: `.claude/rules/responsive-testing.md`.
- **The player grid is a fixed column count** — 6 / 3 / 2 on the home ladder — not
  `auto-fill`. The card art has a fixed aspect ratio, so a column count that drifts with
  the viewport gives cards of a different size on every screen.
- **One canonical rule block per component.** Do not add a second rule for the same
  selector later in the file to tweak a value — edit the existing block. Variants use
  modifier classes (`.is-active`, `.is-mine`), not repeated base selectors.
- **Sticky headers and popovers need an opaque surface** — `--bg-elevated`, which they
  already get through `--bg-card-solid` / `--surface-popover`.
- **Touch:** any hover-revealed control needs an `@media (hover: none)` block keeping it
  visible, or it becomes unreachable on a phone.
- **Never hide a primary action at a narrow width** (CONFIRM PICKS, START DRAFT, READY,
  Send) — collapsing the column that carries it strands the user.
- **Banned vs picked is never colour alone.** Both states drop the card to 35% opacity
  and `pointer-events: none`, and both carry a word — `BANNED` in `--danger`, `PICKED` in
  `--text-muted`. A red-blind player must still be able to tell them apart.
- Page-level CSS notes live in `.claude/rules/home/css.md` and `.claude/rules/room/css.md`;
  the component maps there are the companion to this file.

---

## 11. Checklist before shipping a visual change

1. No hex or `rgba()` literal outside `tokens.css` — every colour is a token.
2. Radius, spacing, font size and tracking picked from §4–6, not invented.
3. Still **one** accent element on the screen (§9 table), and no white text on it.
4. No gradient, glow, drop shadow or backdrop blur added.
5. No duplicate selector added; variant expressed as a modifier class.
6. Hover uses `scale`, not `translateY`, on grid cards; 150ms; hover states only.
7. `npm run check` passes — `dead-css` catches a class name that matches no markup.
8. Measured at 320 / 768 / 1440 px, both sides of any breakpoint touched.

---

## 12. What the re-skin removed

Named here so a leftover is recognisable as a leftover, not as a second theme:

- **Navy + emerald + cyan.** `#0b1b29`, `#2ccf75`, `#35d6ff` and the eleven-rung
  green/cyan alpha ladders (`--g-*`, `--c-*`) — all mapped onto the neutral ladder.
  ~550 raw colour literals across 20 sheets went with them.
- **Amber and gold.** "Pending" and "achievement" no longer have hues; they are
  `--text-muted` and `--text`.
- **Orbitron**, and the wide-tracking display convention that came with it.
- **115 `box-shadow` declarations, 66 gradients, 42 `backdrop-filter`s** and every
  `text-shadow`.
- **The ambient art** — `.pitch-bg`, four `.glow-orb`s, `orbFloat`, the sign-in particle
  field and `initParticles()`, the floating card backdrop and `renderBackgroundCards()`,
  and the `.btn-shine` sweep. A rooms hero stage briefly reintroduced some of it and was
  taken out again. The flat `--bg` rule has exactly one exception, and it is the sign-in
  page — see §7 for what that exception is allowed to do. The **particle field, the glow
  orbs and `.btn-shine` are still gone**, including there: what came back is card art and
  nothing else.
- **The four duplicated `:root` blocks.** There is one now, and a token change no longer
  has to be applied in four places.
- **Two hex literals in JS** (`GREEN`/`RED` in `features/draft/constants.js`). The timer
  engine now writes a `--timer-progress` percentage and a class; `draft/shell.css` decides
  what those look like.
