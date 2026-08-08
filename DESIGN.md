# DESIGN.md — visual language

The single source of truth for how this app looks. Read this **before** writing any CSS
or markup that has a visual result, and before answering "make it look better" requests.

Everything below is descriptive, not aspirational: these are the values already shipping
in `public/css/`. When you add UI, pick from these tokens. When you think you need a
value that is not here, you are almost always looking for the nearest rung that already
exists.

**Palette provenance:** the two anchors come from a huemint monochrome palette —
background `#0b1b29`, accent `#2ccf75`
(`https://huemint.com/website-monochrome/#palette=0b1b29-2ccf75`). Every other neutral is
derived from the background by lightness, and every green is derived from the accent, so
the whole dark ladder moves together if the anchors ever change. The semantic hues
(cyan / amber / red / gold, §3.2) are deliberately *not* derived from the anchors: they
encode meaning, not brand.

---

## 1. Identity

**eFootball Ban & Pick — deep navy pitch + emerald.** A dark competitive-esports HUD:
a deep navy background (`#0b1b29`) with a faint drawn football pitch, emerald primary
accents (`#2ccf75`), cyan for the opponent, glass panels with blurred backdrops, neutral
type with wide uppercase tracking on labels, and glow instead of drop-shadow as the main
depth cue.

Style rules that define the look:

- **Dark only.** There is no light theme and no `prefers-color-scheme` branch. Do not add
  one; every surface assumes a deep navy backdrop.
- **Glow, not shadow.** Depth comes from coloured `box-shadow` halos on accent elements
  plus a large soft black shadow on raised panels. Grey material-style elevation is off-brand.
- **Colour carries meaning** (see §3). Green is never "just decoration" — it means *you*.
- **Glass surfaces.** Panels are translucent dark fills over the ambient background, often
  with `backdrop-filter: blur(20px)`. Sticky surfaces are the exception — they need the
  opaque `--bg-card-solid`.
- **Wide-tracked uppercase display type** for anything label-like: nav tabs, kickers,
  buttons, stage names, badges.

---

## 2. Where the tokens live

Four independent `:root` blocks, one per page bundle. They are intentionally duplicated
(no build step, no shared stylesheet), so **a token change must be applied to every block
that declares it.**

| File | Scope | Notes |
| --- | --- | --- |
| `public/css/pages/home/base.css` | home page | declares `--radius: 10px`, `--topbar-h: 62px` |
| `public/css/features/draft/base.css` | room page | the richest block — hue *ladders* (§3.2); no `--radius` |
| `public/css/features/admin/admin.css` | admin | home's block + `--cyan/--red/--yellow`, `--nav-h: 56px` |
| `public/css/features/auth/auth.css` | sign-in | home's block + `--bg-field`, `--radius: 12px`, `--transition: 0.25s` |

The room page's CSS is seven sheets, not one — `base / shell / lobby / ban / pick /
ready / responsive` under `public/css/features/draft/`, linked in that order. Where the
rest of this document says **`draft.css`** it means that set; `base.css` is the sheet
that carries the `:root` block. The component map is in `.claude/rules/room/css.md`.

**Known divergence to respect, not "fix" blindly:** home/admin/signin use solid navy-tinted text
(`--text: #e7f0f6`, `--text-dim: #8aa5b8`); `draft.css` uses a white-alpha ladder
(`rgba(255,255,255,0.92 / .45 / .28)`). Both read correctly on their own backgrounds.
`draft.css` deliberately re-declares `--bg-card`, `--bg-card-hover` and `--transition` with
home's values so shared components (`.player-card`) match across pages.

---

## 3. Colour

### 3.1 Base palette

```
Green (primary / you)   #2ccf75     Green dim  #22b063     Green dark  #14663a
Cyan (opponent)         #35d6ff     (admin/signin use #00e5ff)
Amber (pending)         #f2c14e
Red (destructive)       #ff4444     (admin uses #ff5252)
Gold (achievement)      #ffd700     (admin --yellow #ffd740)
Background              #0b1b29     Black #061119
Text                    #e7f0f6     Dim #8aa5b8          (home/admin/signin)
Text                    rgba(255,255,255,.92) / .45 / .28  (room)
```

### 3.2 Hue meaning — hard rule

Each hue carries exactly one meaning, everywhere:

| Hue | Means |
| --- | --- |
| green | you / your side / primary action / confirmed |
| cyan | the opponent / incoming |
| amber | pending, waiting on someone |
| red | destructive only (close room, kick, leave) |
| gold | achievement (Start Match stats) |

Never use red for emphasis, or green for a destructive action.

### 3.3 Accent ladders (`draft.css`)

**Never write a raw `rgba()` for green, cyan, red, amber, a light text colour, or a dark
panel surface — use the token.** The file once carried 26 alphas of the same green;
~340 literals were snapped onto this ladder and it must not drift back. Adding an
intermediate rung is how the drift starts: pick the closest existing one.

```css
:root {
  --green: #2ccf75;
  --cyan: #35d6ff;
  --amber: #f2c14e;
  --red: #ff4444;
  --gold: #ffd700;

  /* green ladder — one rung per role */
  --g-line-faint: rgba(44, 207, 117, 0.1);     /* panel edges, dividers      */
  --g-line: rgba(44, 207, 117, 0.18);          /* control borders            */
  --g-line-hover: rgba(44, 207, 117, 0.34);    /* hover borders              */
  --g-line-active: rgba(44, 207, 117, 0.55);   /* selected / focused borders */
  --g-fill-faint: rgba(44, 207, 117, 0.03);    /* tint washes                */
  --g-fill: rgba(44, 207, 117, 0.07);          /* hover fills                */
  --g-fill-strong: rgba(44, 207, 117, 0.14);   /* selected fills             */
  --g-glow-soft: rgba(44, 207, 117, 0.1);      /* resting shadow             */
  --g-glow: rgba(44, 207, 117, 0.22);          /* active shadow              */
  --g-text: rgba(44, 207, 117, 0.72);          /* green text below full      */
  --g-text-dim: rgba(44, 207, 117, 0.45);      /* muted green text           */

  /* cyan ladder — identical rungs, so an opponent-side component is a hue
     swap, not a re-design */
  --c-line-faint: rgba(53, 214, 255, 0.1);
  --c-line: rgba(53, 214, 255, 0.18);
  --c-line-hover: rgba(53, 214, 255, 0.34);
  --c-line-active: rgba(53, 214, 255, 0.55);
  --c-fill-faint: rgba(53, 214, 255, 0.03);
  --c-fill: rgba(53, 214, 255, 0.07);
  --c-fill-strong: rgba(53, 214, 255, 0.14);
  --c-glow-soft: rgba(53, 214, 255, 0.1);
  --c-glow: rgba(53, 214, 255, 0.22);
  --c-text: rgba(53, 214, 255, 0.72);
  --c-text-dim: rgba(53, 214, 255, 0.45);

  /* destructive + pending */
  --r-line: rgba(255, 68, 68, 0.42);
  --r-line-hover: rgba(255, 68, 68, 0.78);
  --r-fill: rgba(255, 68, 68, 0.1);
  --r-fill-hover: rgba(255, 68, 68, 0.18);
  --a-glow: rgba(242, 193, 78, 0.45);

  /* text ladder */
  --text: rgba(255, 255, 255, 0.92);
  --text-dim: rgba(255, 255, 255, 0.45);
  --text-muted: rgba(255, 255, 255, 0.28);

  /* surfaces, recessed → raised */
  --surface-sunken: rgba(6, 17, 26, 0.5);      /* inset blocks inside a card */
  --surface-control: rgba(10, 27, 43, 0.7);    /* inputs, steppers           */
  --surface-card: rgba(8, 21, 32, 0.84);       /* panel cards                */
  --border: var(--g-line);
}
```

Home / admin / signin block:

```css
:root {
  --green: #2ccf75;
  --green-dim: #22b063;
  --green-dark: #14663a;
  --green-glow: rgba(44, 207, 117, 0.35);
  --green-glow-sm: rgba(44, 207, 117, 0.15);
  --black: #061119;
  --bg: #0b1b29;
  --bg-card: rgba(11, 31, 49, 0.82);
  --bg-card-hover: rgba(16, 44, 69, 0.92);
  --bg-card-solid: #0a1a27;   /* opaque — required for sticky headers */
  --border: rgba(44, 207, 117, 0.18);
  --border-active: rgba(44, 207, 117, 0.7);
  --text: #e7f0f6;
  --text-dim: #8aa5b8;
}
```

**Deliberate non-token exceptions:** alphas above the ladder (filled-button gradients,
bright focus rings), `rgba(...,0)` keyframe endpoints, the blue-tinted draft-view
surfaces, and the purple/pink in the ambient background art (`#b36bff`, `#ff4fd8`) —
that is background art, not UI colour.

Keep `:root` free of dead tokens. `--panel`, `--panel-2`, `--green-dim`, `--cyan-dim`,
`--purple-dim`, `--pink-dim`, `--red-dim` were declared, never referenced, and removed.

---

## 4. Typography

```css
--font-body:    'Inter', system-ui, sans-serif;      /* --font-main on home/admin/signin */
--font-display: 'Orbitron', 'Inter', sans-serif;
```

Loaded from Google Fonts in all four HTML files: `Inter:wght@400;500;600;700;800` and
`Orbitron:wght@400;600;700;900`.

- **Orbitron (`--font-display`)** — brand marks, nav tabs, buttons, kickers, stage labels,
  badges, numbers that should read as a scoreboard. Always paired with uppercase and wide
  tracking. Never for paragraphs.
- **Inter (`--font-body`)** — everything else, including player names and inputs.

**Weights.** 700 is the workhorse; 600 for secondary labels, 800 for primary buttons,
900 for the brand mark, 400–500 for body copy and dropdown items.

**Inter is not condensed.** It replaced Rajdhani, which was — at the same px size Inter
sets **~18% wider** (measured: 184.2 px vs 156.4 px for a 28-character name at 13px/600).
Every existing size and tracking value was kept, so if you add a fixed-width control that
holds text, check it at 320 px before assuming it fits.

**Size scale.** Two conventions coexist: `draft.css` sizes mostly in **px**, the home
bundle and `auth.css` size in **rem**. Follow the file you are editing.

| Role | px (room) | rem (home) |
| --- | --- | --- |
| micro label / badge | 9–10px | 0.58–0.65rem |
| control label, nav tab | 11–12px | 0.68–0.72rem |
| body, list row | 13px | 0.8–0.85rem |
| button, emphasis | 14–15px | 0.88–0.95rem |
| section title | 16–18px | 1–1.05rem |

**Tracking.** Uppercase display text is always tracked out. Ladder in use:
`0.02 / 0.04 / 0.06 / 0.08 / 0.1 / 0.12 / 0.15 / 0.18 / 0.2 / 0.25em` — roughly, the
smaller the text, the wider the tracking. A 0.5rem kicker sits at `0.25em`; a 14px button
at `0.06em`. Body copy stays at 0 or `0.02em`.

---

## 5. Shape

Radii in use, smallest to largest — pick the closest, do not invent between:

| Value | Used for |
| --- | --- |
| `0` | **player cards** (`.player-card`, ban thumbs) — square by design, do not round |
| `2–4px` | tiny chips, progress bars, inline tags |
| `6–7px` | inputs, small buttons, nav tabs, dropdown items |
| `8px` | `.btn`, most controls — the default |
| `10px` | cards, dropdown panels (`--radius` on home/admin) |
| `12px` | modals, larger cards (`--radius` on signin) |
| `14–18px` | big panels (`.draft-panel` is 18px) |
| `20px` | hero / full-bleed sheets |
| `50%` / `999px` | avatars, dots, timer ring, pills, scrollbar thumb |

---

## 6. Spacing

Base rhythm is **2px, with a strong 4px preference**. Observed gap frequency:
`8 > 10 > 6 > 12 > 4 > 7 > 14 > 16 > 20 > 24`.

- **Component gap:** 6–8px inside a control, 10–12px between controls, 14–16px between
  sections, 20–24px between page regions.
- **Control padding:** `7px 10px` / `6px 12px` (small), `8px 12px` / `10px 14px`
  (medium), `10px 24px` (`.btn`).
- **Panel padding:** 12–16px (`.draft-panel` is 14px); modals 22–28px.
- Layout is flex/grid + `gap` throughout. Margins are for exceptions, not rhythm.

Layout constants: `--topbar-h: 62px` (home), `--nav-h: 56px` (admin),
`.main-content { max-width: 1400px; margin: 0 auto }`.

---

## 7. Elevation & glow

Three stacked effects, applied together:

```css
/* raised panel: soft black lift + hairline inset */
box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24), 0 0 0 1px rgba(255, 255, 255, 0.02) inset;

/* floating surface (dropdown, modal) */
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(44, 207, 117, 0.05);

/* accent halo — resting vs active */
box-shadow: 0 0 8px rgba(44, 207, 117, 0.14);   /* or 0 0 0 2px var(--g-glow-soft) */
box-shadow: 0 0 12px var(--g-glow);

/* primary button */
box-shadow: 0 10px 26px rgba(44, 207, 117, 0.28), 0 0 0 1px rgba(44, 207, 117, 0.08) inset;
```

Glass: `backdrop-filter: blur(20px)` on the topbar, `blur(24px)` on dropdowns — always
with the `-webkit-` prefix alongside.

Ambient backdrop (do not remove; it is the brand): fixed `.pitch-bg` with `.pitch-lines`,
`.pitch-halfway`, `.pitch-center-circle` at `rgba(44,207,117,0.04)`, plus three blurred
`.glow-orb`s (`filter: blur(120px)`) drifting on a 12–20s `orbFloat` keyframe. `draft.css`
adds four radial gradients on `body` (cyan, green, purple, pink) as ambient art.

---

## 8. Motion

```css
--transition: 0.22s cubic-bezier(0.4, 0, 0.2, 1);   /* 0.25s on signin */
```

Use `var(--transition)` and name the properties — never `transition: all`. Fast
interaction feedback uses `0.16s ease` (transform) / `0.2s ease` (colour, shadow).

- Hover on a card: `transform: scale(1.04)` **only**. Never add `translateY` to a grid
  card — it moves the bottom edge off the cursor and the hover state loops. (See
  `.claude/rules/room/css.md`.)
- Hover on a button: `translateY(-1px)` + brighter shadow; `:active` returns to 0.
- Dropdowns: `opacity` + `translateY(6px) scale(0.97)` → `translateY(0) scale(1)`.
- Pulses (live dot, amber "waiting") are 1.5–2s `ease-in-out infinite`.
- `:disabled` is `opacity: 0.5; cursor: not-allowed` — never a colour change.

---

## 9. Component recipes

Copy these rather than inventing a variant.

```css
/* base button — 8px radius, glass fill, green hairline */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid rgba(44, 207, 117, 0.22);
  background: linear-gradient(180deg, rgba(17, 47, 72, 0.92), rgba(14, 39, 61, 0.9));
  color: rgba(244, 252, 255, 0.96);
  padding: 10px 24px;
  border-radius: 8px;
  font-family: var(--font-body); font-weight: 600; font-size: 14px;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(44, 207, 117, 0.05) inset;
}

/* primary — the only saturated fill in the system */
.btn--primary {
  background: linear-gradient(135deg, #22b063 0%, #2ccf75 58%, #6ee6a4 100%);
  color: #06131c;                 /* near-black on green, never white */
  border-color: transparent;
  font-family: var(--font-display); font-weight: 800; letter-spacing: 0.06em;
}

.btn--ghost { /* cyan-tinted secondary */ }
.btn--small { padding: 7px 15px; font-size: 13px; }

/* focus ring — cyan, 3px, applies system-wide */
.btn:focus-visible {
  outline: none;
  border-color: rgba(53, 214, 255, 0.6);
  box-shadow: 0 14px 30px rgba(0,0,0,.35), 0 0 0 1px rgba(44,207,117,.12) inset,
              0 0 0 3px rgba(53, 214, 255, 0.2);
}

/* panel */
.draft-panel {
  background: linear-gradient(180deg, rgba(10, 29, 45, 0.94), rgba(6, 17, 26, 0.92));
  border: 1px solid var(--g-line-faint);
  border-radius: 18px;
  padding: 14px;
}

/* input */
.filter-input {
  background: var(--g-fill-faint);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 0.85rem;
  padding: 7px 10px;
  outline: none;
}
```

State convention on interactive surfaces: rest `--g-line` + no fill → hover
`--g-line-hover` + `--g-fill` → selected `--g-line-active` + `--g-fill-strong` + glow.

Scrollbars are themed globally (5px, `rgba(44,207,117,0.22)` thumb, `99px` radius,
transparent track, brighter + glowing on hover) — inherit it, do not restyle per-component.

---

## 10. Structural rules that constrain design

These have bitten before; a "purely visual" change can break them.

- **Responsive down to 320px**, with a fixed breakpoint ladder per page — home
  `768 → 480`; room `1200 → 1100 → 900 → 860 → 620 → 480` plus a `max-height: 760px`
  rung. Do not invent a rung. Verify with a measured headless-Chrome harness, never by
  eye: `.claude/rules/responsive-testing.md`.
- **One canonical rule block per component.** Do not add a second rule for the same
  selector later in the file to tweak a value — edit the existing block. `draft.css` and
  `auth.css` currently have zero duplicated top-level selectors; keep it that way.
  Variants use modifier classes (`.is-active`, `.is-mine`), not repeated base selectors.
- **Sticky headers need `--bg-card-solid`** — `--bg-card` is translucent and content
  scrolls through it.
- **Touch:** any hover-revealed control needs an `@media (hover: none)` block keeping it
  visible, or it becomes unreachable on a phone.
- **Never hide a primary action at a narrow width** (CONFIRM PICKS, START DRAFT, READY,
  Send) — collapsing the column that carries it strands the user.
- Page-level CSS notes live in `.claude/rules/home/css.md` and `.claude/rules/room/css.md`;
  the component maps there are the companion to this file.

---

## 11. Checklist before shipping a visual change

1. Every colour is a token on the §3 ladder — no new `rgba()` green/cyan/red/amber.
2. Radius, spacing, font size, tracking picked from §4–6, not invented.
3. Hue meaning respected (green = you, cyan = opponent, red = destructive only).
4. Token edits applied to **all** `:root` blocks that declare the token (§2).
5. No duplicate selector added; variant expressed as a modifier class.
6. Hover uses `scale`, not `translateY`, on grid cards.
7. Measured at 320 / 390 / 620 / 900 / 1440 px, both sides of any breakpoint touched.
