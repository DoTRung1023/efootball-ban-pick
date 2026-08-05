---
paths:
  - "public/room.html"
  - "public/js/room.js"
  - "public/js/room/state.js"
  - "public/css/room.css"
---

# Draft view shell (`#viewDraft`)

- There is no topbar and no turn pill (`#turnPill` / `.turn-pill-*` fully removed from
  HTML, CSS, and JS). Phase context comes from the stage dots alone.
- The `.stage-progress-container` is `justify-content: space-between` with the timer ring
  (`#timerRing`) in `.stage-header-left` on the left and the Leave button
  (`#draftLeaveBtn`) in `.stage-header-right` on the right. The `.stage-progress-bar`
  sits between them with `flex: 1; max-width: 620px`.
- The timer ring is **56×56 px** with a **44×44 px** inner circle; JS drives the
  conic-gradient via `ring.style.background`. There is a single canonical `.timer-ring` /
  `.timer-inner` definition in `room.css` — no context-specific overrides. There is no
  READY button in the topbar — `#draftTopReadyBtn` has been removed from HTML (JS
  already null-guards it).
- The draft schedule (`buildTurnSchedule`) always returns exactly two entries:
  `{ side: "both", action: "ban" }` then `{ side: "both", action: "pick" }`. Both phases
  are simultaneous — **there are no per-player turns.**