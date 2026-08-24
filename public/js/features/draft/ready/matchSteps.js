/**
 * The Start Match screen's three handshakes.
 *
 * One table, read by two modules: `readyView` paints the footer from it and
 * `draftControls` posts from it. Everything that differs between the three
 * steps — the button, the chip on each team head, what the hint says while you
 * wait — is a row here rather than a branch somewhere.
 *
 * (Whether this screen is up at all is a different question, and `isReadyPhase`
 * in `engine/draftFlow.js` answers it — that is what `stageTabs` and `cardGrid`
 * ask.)
 *
 * Each step needs **both** sides before the room advances, which is the same
 * rule the draft already used for confirming squads. The server owns the
 * transitions (`/match-step`); this side only says which one is open.
 */

import {
  ROOM_STATUS_AWAIT_READY,
  ROOM_STATUS_AWAIT_START,
  ROOM_STATUS_LIVE,
} from '@/features/draft/constants.js';

/**
 * `status` is the room status the step is open in; `stage` is what gets written
 * to `data-stage` on the board, which is all `ready.css` reads. `flag` is the
 * `{ host, guest }` field on the room holding each side's answer, and `step` is
 * the name the server knows it by.
 *
 * `hint` has three cases and never a fourth: once both sides have answered, the
 * room is already on the next step, so "both done" is not a state this screen
 * can be caught in.
 */
export const MATCH_STEPS = [
  {
    status: ROOM_STATUS_AWAIT_READY,
    stage: "confirm",
    step: "ready",
    flag: "matchReady",
    label: "READY",
    chip: { on: "READY", off: "NOT READY" },
    hint: {
      idle:     () => "Squads are locked in. Press READY once yours is set up in the game.",
      waiting:  (them) => `Waiting for ${them} to get ready…`,
      prompted: (them) => `${them} is ready and waiting for you.`,
    },
  },
  {
    status: ROOM_STATUS_AWAIT_START,
    stage: "start",
    step: "start",
    flag: "matchStarted",
    label: "START MATCH",
    chip: { on: "STARTING", off: "NOT STARTED" },
    hint: {
      idle:     () => "Both ready. Press START MATCH when you kick off in eFootball.",
      waiting:  (them) => `Waiting for ${them} to kick off…`,
      prompted: (them) => `${them} has kicked off. Press START MATCH when you do.`,
    },
  },
  {
    status: ROOM_STATUS_LIVE,
    stage: "live",
    step: "finish",
    flag: "matchFinished",
    label: "FINISH MATCH",
    chip: { on: "FINISHED", off: "PLAYING" },
    hint: {
      idle:     () => "Match in progress. Press FINISH MATCH at the final whistle.",
      waiting:  (them) => `Waiting for ${them} to finish…`,
      prompted: (them) => `${them} has finished. Press FINISH MATCH when you are done.`,
    },
  },
];

/** The open step for a room status, or null once the match is over. */
export function stepForStatus(status) {
  const key = String(status || "");
  return MATCH_STEPS.find((s) => s.status === key) || null;
}

/* There is no tip line. A rotating row of encouragement sat under the button
   during `live` — it said nothing about the room, nothing about the match, and
   it was the only text on this screen that was not answering a question the
   player had. The hint above the button says what the room is waiting for,
   which is the whole job of this footer. */
