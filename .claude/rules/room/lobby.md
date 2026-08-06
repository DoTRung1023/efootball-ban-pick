---
paths:
  - "public/js/room/lobby.js"
  - "public/room.html"
---

# Lobby settings UI (`room.html` + `lobby.js` + `room.css`)

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
- `.lv-reveal-cards` (2-column grid) / `.lv-reveal-card` — always-visible mode option
  cards; `is-selected` = green border + glow. Each card carries
  `data-lobby-reveal-mode-option`. The old trigger+panel dropdown pattern is gone —
  `renderLobby()` toggles `is-selected` on each card directly, and the existing
  click-delegation in `initLobby()` handles selection.

Layout:

- `.prep-col` sets `text-align: left`. `.centered-box` (shared with the error/abandoned
  boxes) centers text, and without this override every `.lv-field-label`,
  `.lv-field-hint` and `.prep-section-title` floats centered above a left-aligned
  control.
- `.prep-title` — `border-left: 2px solid var(--green); padding-left: 10px;
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
centre line does not work with three columns). `.lobby-kick-btn` is absolutely positioned
in the guest slot's top-right corner. Under 620 px the band stacks vertically.

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
`MIN/MAX_PICK_DURATION_SECONDS` in `room/constants.js`, which in turn mirror
`src/rooms/config.js`: **ban 5–900 s, pick 5–1200 s**. The `input` handler updates
`state.room.config` as the user types without pushing; the `change` handler (blur or
Enter) clamps through `normalizeBanDurationSec` / `normalizePickDurationSec`, writes the
clamped value back into the field, and schedules the config push. `startDraftFromLobby`
re-validates both fields and refuses to start on an out-of-range value.