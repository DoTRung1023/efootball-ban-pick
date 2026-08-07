---
paths:
  - "public/room.html"
  - "public/js/room.js"
  - "public/js/features/draft/state.js"
  - "public/css/room.css"
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
- The timer ring is **56×56 px** with a **44×44 px** inner circle; JS drives the
  conic-gradient via `ring.style.background`. There is a single canonical `.timer-ring` /
  `.timer-inner` definition in `room.css` — no context-specific overrides. There is no
  READY button in the topbar — `#draftTopReadyBtn` has been removed from HTML (JS
  already null-guards it).
- The draft schedule (`buildTurnSchedule`) always returns exactly two entries:
  `{ side: "both", action: "ban" }` then `{ side: "both", action: "pick" }`. Both phases
  are simultaneous — **there are no per-player turns.**