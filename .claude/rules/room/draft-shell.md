---
paths:
  - "public/room.html"
  - "public/js/pages/room.js"
  - "public/js/features/draft/state.js"
  - "public/css/features/draft/shell.css"
---

# Draft view shell (`#viewDraft`)

- There is no topbar and no turn pill (`#turnPill` / `.turn-pill-*` fully removed from
  HTML, CSS, and JS). Phase context comes from the stage dots alone.
- The `.stage-progress-container` is `justify-content: space-between` with the timer ring
  (`#timerRing`) in `.stage-header-left` on the left and the Leave button
  (`#draftLeaveBtn`) in `.stage-header-right` on the right. The `.stage-progress-bar`
  sits between them with `flex: 1; max-width: 620px`. Below **480 px** the container
  wraps: timer + Leave on row 1, the bar full width on row 2 — see the responsive ladder
  in the room CSS rule. Side by side the three parts need ~455 px, and since `.view` has
  no horizontal scroll that width leaks down into every panel of the draft.
- `.stage-header-left` carries `min-width: 72px` so it holds its slot when the clock is
  not in it. The container is `space-between`, so a column collapsing to zero would drag
  the stage rail sideways — and the rail is the one element on screen in every phase.
- The clock is digits over a **3px bar** that empties as the turn runs down. JS writes
  `--timer-progress` and the `is-low` class and nothing else; `shell.css` decides both
  colours. (It was a conic-gradient ring painted from `ring.style.background`, which put
  two hex literals in JS.) There is a single canonical `.timer-ring` / `.timer-inner`
  definition — no context-specific overrides. There is no READY button in the topbar —
  `#draftTopReadyBtn` has been removed from HTML (JS already null-guards it).
- **`renderDraftUi` hides the clock for the whole ready phase** (`renderTurnClock`).
  `startTurnTimer`'s tick returns early outside the `draft` phase, so the countdown
  stops — but stopping is not clearing, and the last digits it painted stayed frozen on
  the Start Match screen with a half-full accent bar under them. Nothing there is timed.
- The draft schedule (`buildTurnSchedule`) always returns exactly two entries:
  `{ side: "both", action: "ban" }` then `{ side: "both", action: "pick" }`. Both phases
  are simultaneous — **there are no per-player turns.**