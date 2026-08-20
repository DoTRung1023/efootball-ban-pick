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
- **The header is the same on every screen of a room**, lobby included: three slots in
  one order — the way out, where you are, who you are. `.lobby-stage-row` and
  `#viewDraft > .stage-progress-container` are two markups for one component, so every
  metric is shared and **changing one means changing both**. Verified equal at 1440:
  row 95px, leave button at x=16, rail at x=460 × 520px, right edge at 1424, first dot
  21px below the row top.

  They had drifted — 16px of padding against 20px, a 520px rail against 620px, an 80px
  button against 68px, and the draft header carried the turn clock on the left where the
  lobby carries the way out. The clock has moved (below), and `#lobbyLeaveBtn` and
  `#draftLeaveBtn` now share one rule instead of two with different paddings.

  The 13px of head-room above the rail is load-bearing: stage labels hang below their
  dots, so the dots need pushing down to sit optically centred. On the lobby it comes from
  the base `.stage-progress-container` padding — which that view's own `--lobby` modifier,
  declared earlier in the file, never manages to override — applied to a wrapper around
  the bar. The draft has no wrapper, so it asks for the same 13px on the bar itself, as a
  **`margin`**.

  **Never as padding.** `.stage-progress-line` is absolutely positioned against the bar's
  *padding box*, so padding-top moves the dots down and leaves the connector behind: 13px
  of padding put the line 14px above the centres it runs through. A margin moves the box
  and the line with it. Both rails measure 0px offset at every dot, active one included.

  `.stage-progress-line`'s own `top: 20px` is the dot's arithmetic — 4px of dot padding
  above a 34px circle (30px plus 2px of border a side) puts the centre at 21, and a 2px
  line centred there starts at 20. It was 19px, which rested the line's *bottom edge* on
  the centre rather than its middle. Re-derive it if the circle or the padding changes.

  Below **480 px** the container wraps: left + right on row 1, the bar full width on
  row 2 — see the responsive ladder in the room CSS rule. Side by side the three parts
  need ~455 px, and since `.view` has no horizontal scroll that width leaks down into
  every panel of the draft.
- `.stage-header-right` holds the turn clock **and** the identity chip
  (`#draftIdentityBtn`, painted by `renderIdentity`, mirroring `#lobbyIdentityBtn`).
- The clock is digits over a **3px bar** that empties as the turn runs down. JS writes
  `--timer-progress` and the `is-low` class and nothing else; `shell.css` decides both
  colours. (It was a conic-gradient ring painted from `ring.style.background`, which put
  two hex literals in JS.) There is a single canonical `.timer-ring` / `.timer-inner`
  definition — no context-specific overrides. There is no READY button in the topbar —
  `#draftTopReadyBtn` has been removed from HTML (JS already null-guards it).
- **The clock is on screen only when there is something to count** (`renderTurnClock`).
  Two ways there is not, and they are the same absence: the Start Match screen has no
  turn, and a phase the host set to **unlimited** has no deadline. Both are
  `turnEndsAt == null`, so one test covers them — and it is the value `startTurnTimer`
  keys on too, which is what stops the two disagreeing.

  `startTurnTimer` returning early was never enough by itself: stopping a countdown is not
  clearing it, and the last digits it painted stayed frozen in the corner. Start Match
  showed something like "275" under a half-full accent bar, which reads as time left to do
  something.

  The digits are **20px**, down from 32px. At the old size it was the largest thing on the
  page, which was defensible alone in the top-left corner and is not now that it shares a
  slot with a 12px identity chip.
- The draft schedule (`buildTurnSchedule`) always returns exactly two entries:
  `{ side: "both", action: "ban" }` then `{ side: "both", action: "pick" }`. Both phases
  are simultaneous — **there are no per-player turns.**

## The turn schedule is the server's

`state.schedule` is **read off the snapshot**, not built. `buildTurnSchedule`
used to live in `state.js` and return a two-entry constant, and the server
hardcoded the indices that constant implied — `turnIndex = 0` at START,
`turnIndex = 1` on the ban→pick advance. An alternating ban phase is
`2 × banCountPerSide + 1` entries and the server has to walk them, so it builds
the schedule (`src/features/rooms/schedule.js`) and publishes it from
`serializeRoomEntry`; `applyPresenceSnapshot` copies it into `state.schedule` on
**every** snapshot, because changing the ban count or the ban order in the lobby
reshapes it.

The same split as `ROOM_STATUS`: the server owns every transition, the client
only compares.

It also removed a real divergence. With zero bans the client used to jump
`turnIndex` past a ban turn the server still thought it was on
(`draftSession.js`); a schedule built with no ban entry needs no correction, and
both sides now agree that index 0 *is* the pick turn. Verified: schedule
`[{both, pick}]`, `turnIndex: 0`, and the browser opens on the pick board.

`turns.js` is where the room moves between them — `advanceBanTurnIfSolo`,
`enterPickTurn`, `maybeResolveExpiredBanTurn`. It is separate from `schedule.js`
because that file is pure: it says what the turns *are*, `turns.js` moves
between them, and it is separate from `routes.js` because two paths need it (a
ban write ends its own turn; the heartbeat notices an expired one).
