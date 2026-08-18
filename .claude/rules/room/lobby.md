---
paths:
  - "public/js/features/draft/lobby/lobby.js"
  - "public/room.html"
---

# Lobby settings UI (`room.html` + `lobby.js` + `css/features/draft/lobby.css`)

- `.prep-col--settings` is a three-part card: `.prep-title` → `.prep-scroll` →
  `.lobby-cta-bar`. **Only `.prep-scroll` scrolls**, so the "BAN SETTING" heading and the
  START/READY footer stay pinned when the settings overflow. Do not move `overflow-y`
  back onto `.prep-col--settings` — that is what let the header scroll out of view.
- `#lobbySettings` (`.lv-settings-panel`) and `.prep-section--allowance` are siblings
  inside `.prep-scroll` — no `.prep-section` wrapper around the settings panel.

## Hidden-input source-of-truth pattern

`pushLobbyConfig()` reads `#lobbyBansInput.value`, `#lobbyBanDurationInput.value`,
`#lobbyPickDurationInput.value`, `#lobbyRevealModeInput.value` directly. Visual controls
write to these hidden inputs and call `scheduleLobbyConfigPush()`. `renderLobby()` syncs
hidden inputs *from* `room.config` on every 500 ms poll (guarded by `data-touched` for
inputs the user is actively editing).

**Never update the visual display by writing to these inputs directly** — always update
`state.room.config` then call `renderLobby()`.

## CSS system

`.lv-settings-panel` (`flex column; gap: 14px`) → `.lv-field-row` → `.lv-field-group`
(`flex column; gap: 6px`) → controls:

- `.lv-field-row` — `grid-template-columns: repeat(auto-fit, minmax(136px, 190px))`.
  BAN PER SIDE, BAN DURATION and PICK DURATION share one row; the 190 px track cap stops
  a three-digit field from stretching across a third of a wide panel. MODE sits outside
  the row and spans the full width.
- `.lv-stepper` — `display: flex; align-self: stretch` so it fills its grid track and the
  three controls read as one row of equal-width fields. Contains `.lv-stepper-btn`
  (36×36 px, green, transparent bg) and `.lv-stepper-val` (`flex: 1`, centered, green
  inner borders).
- `.lv-duration-field` — free-entry duration control for BAN DURATION and PICK
  DURATION. `display: flex; align-self: stretch`, wrapping a flexing
  `.lv-duration-input` (`type="number"`, native spinners suppressed) plus a
  `.lv-duration-unit` "SEC" label, and mirrors `.lv-stepper`'s framing so all three
  settings read as one control family. `:focus-within` gives the green ring;
  `:out-of-range` turns the value red. The old `.lv-time-pill` preset row was replaced
  by this — fixed presets could not express arbitrary durations.
- `.lv-field-hint` — every field in `.lv-field-row` carries one so the three controls
  share a baseline. The durations state their range; `#banCountHint` is written by
  `renderLobby()` as `"<2×count> bans in total"`. Note `banCountPerSide: 0` does **not**
  skip the ban phase (`maybeAutoAdvanceFromBan` returns early on a falsy limit), so the
  hint must not claim it does.
- `.lv-reveal-cards` / `.lv-reveal-card` — always-visible mode option cards;
  `is-selected` = green border + glow. Each card carries
  `data-lobby-reveal-mode-option`. **Three cards** — INSTANT, BLUR, HIDDEN — laid out
  `repeat(auto-fit, minmax(200px, 1fr))` rather than a fixed column count, so the row
  folds to two and then one instead of squeezing all three. Adding a mode is a fourth
  card plus a `REVEAL_MODE_*` constant on **both** sides of the client/server pair; see
  `pick-phase.md` for what each mode conceals. The old trigger+panel dropdown pattern
  is gone — `renderLobby()` toggles `is-selected` on each card directly, and the
  existing click-delegation in `initLobby()` handles selection.
  - The BLUR card's icon is `🌫️` **with the U+FE0F variation selector**. U+1F32B is
    `Emoji_Presentation=No`, so bare it renders as a monochrome text glyph.

Layout:

- `.prep-col` sets `text-align: left`. `.centered-box` (shared with the error/abandoned
  boxes) centers text, and without this override every `.lv-field-label`,
  `.lv-field-hint` and `.prep-section-title` floats centered above a left-aligned
  control.
- `.prep-title` — `border-left: 2px solid var(--text); padding-left: 10px;
  margin-bottom: 16px`. Shared by both "BAN SETTING" and "LOBBY CHAT" headings; do not
  add a second rule for this selector.
- `.prep-col--chat` — `display: grid; grid-template-rows: auto minmax(0, 1fr) auto`
  (3 rows: title → chat-log → compose form). No `prep-sub` element in this panel.
- `.lobby-bottom-row` — `grid-template-columns: minmax(0, 1fr) minmax(270px, 0.4fr)`
  (settings left, chat right). The chat rail is deliberately narrow: the settings column
  is the working surface.
- `.lobby-cta-bar` — settings-panel footer, `space-between`: `#lobbyWaiting` (why the CTA
  is blocked) on the left, `.lobby-actions` on the right. `.lobby-actions` carries
  `margin-left: auto` so the button stays right when the status is hidden.

## Matchup band (`.lobby-summary`)

Three columns: `.ls-player--host` | `.ls-center` | `.ls-player--guest`. Each `.ls-player`
centres one `.ls-meta` stack — role / name / stats / connection. **There are no avatars
anywhere in this app** (`.ls-avatar` in the lobby, `.sm-col-avatar` in Start Match, and a
dead `#userAvatar` reference on home were all removed): there is no profile-image
feature, so an initial in a circle carried no information. Do not reintroduce one.

`.ls-center` carries the hairline side borders (the old single `.lobby-summary::after`
centre line does not work with three columns). `.lobby-kick-btn` positions `#kickGuestBtn`
absolutely in the guest slot's top-right corner; it is shown only while a guest is in the
seat. There is **no** counterpart button — a kick is permanent by design, so nothing in
the UI lifts one. Under 620 px the band stacks vertically.

`is-ready` on `.ls-player` tracks **slot occupancy**, not readiness — it only drives
`.ls-player--guest:not(.is-ready) .ls-name` (the italic "Waiting…" placeholder). Actual
ready state is the `.ls-conn` text.

Status is stated **once**: the guest slot says whether an opponent is present, and
`#lobbyWaiting` in the CTA bar says why START is disabled. The host's START button label
therefore stays "START DRAFT" and carries the reason in `title` only — do not put the
waiting text back on the button.

Guest read-only: `.prep-col--settings.is-readonly .prep-scroll :is(button, ...)` disables
all interactive elements including `.lv-stepper-btn` and `.lv-reveal-card` — no extra CSS
needed for new controls. `renderLobby()` additionally sets `.disabled` on the two
duration inputs directly (`banDurationEl.disabled = !isHost`).

**The `.prep-scroll` in that selector is load-bearing — never widen it back to the whole
panel.** `.lobby-cta-bar` is also inside `.prep-col--settings`, and the guest's own
READY button lives there; a panel-wide rule gives it `pointer-events: none`, so the
button looks live but swallows every click and the guest can never ready up. The dim
(`opacity: 0.58`) is scoped the same way so the CTA stays full strength. The readonly
click-guard in `initLobby()` skips `.lobby-cta-bar` for the same reason.

## Chat message accents

`.chat-item:not(.is-mine)` is the **opponent** — cyan fill, cyan border, cyan name, and a
`inset 3px 0 0` accent bar. `.is-mine` is the quieter green equivalent. The opponent is
deliberately the louder of the two: a new message from the other side is what needs
noticing. The bar is an inset shadow, not a border, so neither variant shifts layout.

## Duration input ranges

The `min`/`max` attributes must match `MIN/MAX_BAN_DURATION_SECONDS` and
`MIN/MAX_PICK_DURATION_SECONDS` in `features/draft/constants.js`, which in turn mirror
`src/features/rooms/config.js`: **ban 5–900 s, pick 5–1200 s**. The `input` handler updates
`state.room.config` as the user types without pushing; the `change` handler (blur or
Enter) clamps through `normalizeBanDurationSec` / `normalizePickDurationSec`, writes the
clamped value back into the field, and schedules the config push. `startDraftFromLobby`

> **Colour system note.** This file predates the efhub re-skin. The token *names* below
> are current, but the reasoning often says "green", "cyan" or "glow" — those hues and
> that glow are gone. Green meant "you" and cyan meant "the opponent"; both are greyscale
> now, and the only accent left on this page is the turn clock and the pick slot waiting
> on you. Read `DESIGN.md` §3 and §12 for what replaced what; treat colour claims here as
> history and the structural claims as current.
re-validates both fields and refuses to start on an out-of-range value.
## Unlimited ban / pick time

The host can turn either clock off. **`0` is the sentinel** (`UNLIMITED_DURATION_SEC`,
declared in `src/features/rooms/config.js` and `public/js/features/draft/constants.js`);
that phase then runs with no deadline and ends the only other way a phase ever ends — both
sides confirming.

Four places had to learn it, and each was a real trap:

- **Both normalisers test for it first.** They are written `Number(raw) || DEFAULT`, which
  reads `0` as absent and hands back 120 / 300 — the one value that must not be clamped is
  the one that means "do not clamp me". `isUnlimitedDuration` is deliberately strict: `""`,
  `null` and `undefined` are *not* unlimited, they are missing, and still fall back to the
  default. Verified in a browser against the client copy and over the API against the
  server's: `0` and `"0"` → 0; `""`, `null`, `undefined` → the default; `2` → 5; `9999` →
  the max.
- **`turnDeadline(sec)` on the server** is the single place a live turn's `turnEndsAt` is
  computed, and it answers `null` for unlimited. Every reader already handled a null
  deadline, so nothing downstream needed a second case.
- **`ensureDraftTimer` must not invent one.** It fills in a missing `turnEndsAt` on
  reconnect; left alone it would have given this client a countdown the server never set,
  the opponent never sees, and that expires — taking the player's turn with it.
- **`validateDuration` accepts it.** It gates START on `min ≤ value ≤ max`, so without the
  case the UNLIMITED button set a value START then refused.

In the draft, a `draft`-phase room with `turnEndsAt === null` is *by definition* untimed —
the server writes null there for no other reason — so `startTurnTimer`'s tick paints `∞`
with a full bar and returns without scheduling an expiry.

The field swaps rather than dims: `.lv-duration-field.is-unlimited` hides the number and
its `sec` unit and shows "No limit". A disabled box reading `0 sec` says the opposite of
what it means. Measured: normal → input/unit `block`, no-limit `none`; unlimited → the
reverse. The input keeps carrying the 0 (so `readLobbyConfigFromDom` needs no special
case) and remembers the last real number in `dataset.lastFinite`, so turning unlimited off
gives the host their 90s back instead of the default.

**The ∞ toggle is a segment of the field**, mirroring `.lv-duration-unit` on the other side
of the number — same height, same divider, no radius of its own. It began as a pill on its
own row underneath, which gave the two duration columns a row the ban-count column did not
have; the settings row is three columns of *label · one control · one line of hint*, and
anything that only modifies the value beside it has to sit beside it.

`.lv-duration-field` carries `min-height: 38px` for the same reason: that is what
`.lv-stepper` measures (36px buttons plus its own borders), and the three controls share a
row. Measured at 1440: all three tops at y=303, all three 38px tall, all three groups 78px.

`#banCountHint` is gone — it read "6 bans in total" under a stepper showing 3, beside a
label reading BAN PER SIDE. Doubling a number the user just set is not information.
