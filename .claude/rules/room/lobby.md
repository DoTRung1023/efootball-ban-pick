---
paths:
  - "public/js/room/lobby.js"
  - "public/room.html"
---

# Lobby settings UI (`room.html` + `lobby.js` + `room.css`)

- `#lobbySettings` (`.lv-settings-panel`) is a **direct child** of
  `.prep-col--settings` — no inner `.prep-section` wrapper. The outer prep-col card
  provides the container; the `lv-settings-panel` flows flat inside it, followed by
  `.prep-section--allowance`.

## Hidden-input source-of-truth pattern

`pushLobbyConfig()` reads `#lobbyBansInput.value`, `#lobbyBanDurationInput.value`,
`#lobbyPickDurationInput.value`, `#lobbyRevealModeInput.value` directly. Visual controls
write to these hidden inputs and call `scheduleLobbyConfigPush()`. `renderLobby()` syncs
hidden inputs *from* `room.config` on every 500 ms poll (guarded by `data-touched` for
inputs the user is actively editing).

**Never update the visual display by writing to these inputs directly** — always update
`state.room.config` then call `renderLobby()`.

## CSS system

`.lv-settings-panel` (`flex column; gap: 14px; margin-bottom: 14px`) →
`.lv-field-group` (`flex column; gap: 7px`) → controls:

- `.lv-stepper` — `display: inline-flex; align-self: flex-start` (prevents cross-axis
  stretch in the flex parent). Contains `.lv-stepper-btn` (38×38 px, green, transparent
  bg) and `.lv-stepper-val` (min-width 44 px, centered, green inner borders).
- `.lv-time-pills` / `.lv-time-pill` — pill row; `is-active` = green border + subtle
  tint. Each pill carries `data-dur` (seconds).
- `.lv-reveal-cards` (2-column grid) / `.lv-reveal-card` — always-visible mode option
  cards; `is-selected` = green border + glow. Each card carries
  `data-lobby-reveal-mode-option`. The old trigger+panel dropdown pattern is gone —
  `renderLobby()` toggles `is-selected` on each card directly, and the existing
  click-delegation in `initLobby()` handles selection.

Layout:

- `.prep-title` — `border-left: 2px solid var(--green); padding-left: 10px;
  margin-bottom: 16px`. Shared by both "BAN SETTING" and "LOBBY CHAT" headings; do not
  add a second rule for this selector.
- `.prep-col--chat` — `display: grid; grid-template-rows: auto minmax(0, 1fr) auto`
  (3 rows: title → chat-log → compose form). No `prep-sub` element in this panel.
- `.lobby-bottom-row` — `grid-template-columns: minmax(0, 1fr) minmax(280px, 0.78fr)`
  (settings left, chat right).

Guest read-only: `.prep-col--settings.is-readonly :is(button, ...)` disables all
interactive elements including `.lv-stepper-btn`, `.lv-time-pill`, and
`.lv-reveal-card` — no extra CSS needed for new controls.