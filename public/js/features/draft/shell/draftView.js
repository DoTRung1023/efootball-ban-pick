/**
 * Top-level draft renderer. Runs on every presence poll (~500ms), so it only
 * decides which board is visible and delegates; each board guards its own
 * DOM writes with a state key.
 */

import { state } from '@/features/draft/state.js';
import { attachMiniCardGridHandlers } from './cardGrid.js';
import { loadOpponentBanPlayers } from '@/features/draft/ban/opponentSquad.js';
import { enterReadyPhase, isReadyPhase, startTurnTimer, getDraftDisplayPlayers } from '@/features/draft/engine/draftFlow.js';
import { submitBan, submitPick } from '@/features/draft/engine/draftActions.js';
import { renderBanBoard } from '@/features/draft/ban/banView.js';
import { renderPickBoard } from '@/features/draft/pick/pickView.js';
import { renderReadyBoard } from '@/features/draft/ready/readyView.js';
import { updateStageTabs } from './stageTabs.js';
import { allowLeave } from './leaveGuard.js';
import { getCurrentIdentity } from '@/features/draft/utils.js';

/** Phases with a board to draw. `done` is one of them — see `enterPostMatch`. */
const RENDERED_PHASES = new Set(["draft", "ready", "done"]);

export function renderDraftUi() {
  const room = state.room;
  if (!room || !RENDERED_PHASES.has(state.phase)) return;

  const mySide = state.mySide;
  const theirSide = mySide === "host" ? "guest" : "host";
  renderLeaveLabel(mySide);
  const turn = state.schedule[room.turnIndex];
  /* The match is over and the Start Match screen stays up, having swapped its
     footer for the ways out. It is the same board, so everything below treats
     `done` as a ready phase. */
  const matchOver = state.phase === "done";
  const readyPhase = matchOver || isReadyPhase(room);
  // The server flips `status` to "await-ready" once both squads are confirmed;
  // this is where that becomes the client's phase too. Not once the match is
  // live, or it would walk the phase back out of `done` on the next poll.
  if (readyPhase && !matchOver) enterReadyPhase();
  const isBanPhase = turn?.action === "ban";
  // Both stages are simultaneous, so side "both" always means it's your turn.
  const isMyTurn = String(turn?.side || "") === "both" || turn?.side === mySide;

  if (isBanPhase && !state.opponentBanPlayersLoaded && !state.loadingOpponentBanPlayers) {
    void loadOpponentBanPlayers();
  }

  renderActionError();
  renderTurnClock(readyPhase, room);
  renderIdentity(mySide, room);

  const showBanBoard = isBanPhase && !readyPhase;
  renderBanBoard({ room, mySide, theirSide, isMyTurn, readyPhase, visible: showBanBoard });

  // The server can advance to the pick phase via ban-confirm while our timer is
  // still idle; pick it up here rather than waiting for another event.
  if (!isBanPhase && !readyPhase && state.phase === "draft" && !state.turnTimer) {
    startTurnTimer();
  }

  renderPickBoard({ room, mySide, theirSide, visible: !showBanBoard && !readyPhase });
  /* No stage argument: the board reads it off `room.status`, which is the one
     answer both clients share. */
  renderReadyBoard({ room, mySide, theirSide, visible: readyPhase });

  updateStageTabs();
}

/**
 * Both sides pressed FINISH MATCH — move into the post-match stage of Start
 * Match. This is the only one of the four stage changes that is a local
 * transition rather than a re-render, because it is the one that ends the room.
 *
 * Deliberately **not** a view change: the squads on screen are the squads the
 * match was played with, and re-listing them on a second screen was the whole
 * complaint against `#viewDone`. Only the footer changes.
 *
 * The room is over as far as the exit guard is concerned, so the guard stands
 * down — a finished match should not raise "are you sure you want to leave?".
 * It stays up through `live`: a match in progress is very much something to
 * warn about walking out of.
 *
 * The cached phase is deliberately **left alone**. It is what lets a reload skip
 * the lobby flash, and a reload from here should come back to this screen: the
 * room is still open, and a rematch offer may be waiting on it.
 */
export function enterPostMatch() {
  if (state.phase === "done") return;
  state.phase = "done";
  allowLeave();
  renderDraftUi();
}

/**
 * The host's exit closes the room for both players, so it says so on every
 * board — the lobby already relabels its own button this way, and the confirm
 * dialog in `draftControls.js` already splits on the same test. This is the
 * label catching up with what the button has always done.
 *
 * Rendered rather than set once at draft entry because `mySide` is the
 * server's answer now, not the URL's, and `adoptSeat` can change it mid-session.
 */
function renderLeaveLabel(mySide) {
  const btn = document.getElementById("draftLeaveBtn");
  if (!btn) return;
  const label = mySide === "host" ? "Close room" : "Leave";
  // Runs ~2x/second; rewriting an unchanged text node would drop a selection.
  if (btn.textContent !== label) btn.textContent = label;
}

/**
 * The clock is on screen only while there is something to count.
 *
 * Two ways there is not, and they are the same absence: the Start Match screen
 * has no turn, and a phase the host set to **unlimited** has no deadline. Both
 * show up as `turnEndsAt == null`, so one test covers them — and it is the same
 * value `startTurnTimer` keys on, which is what stops the two disagreeing.
 *
 * `startTurnTimer` returning early was never enough on its own: stopping a
 * countdown is not clearing it, and the last digits it painted stayed frozen in
 * the corner. On Start Match the room showed something like "275" under a
 * half-full accent bar, which reads as time left to do something.
 */
function renderTurnClock(readyPhase, room) {
  const ring = document.getElementById("timerRing");
  if (!ring) return;
  const hide = readyPhase || !room?.turnEndsAt;
  if (ring.hidden !== hide) ring.hidden = hide;
}

/**
 * The name chip on the right of the header, mirroring the lobby's. The header is
 * the same three slots on every screen of a room — the way out, where you are,
 * who you are — so this one has to be filled in here too.
 */
function renderIdentity(mySide, room) {
  const btn = document.getElementById("draftIdentityBtn");
  if (!btn) return;
  const name = room?.[mySide]?.username || getCurrentIdentity().username;
  if (btn.textContent !== name) {
    btn.textContent = name;
    btn.title = name;
  }
}

function renderActionError() {
  const el = document.getElementById("draftActionError");
  if (!el) return;
  el.textContent = state.actionError || "";
  el.hidden = !state.actionError;
}

/** Card clicks route to submitBan or submitPick depending on the active stage. */
export function attachDraftGridHandlers() {
  for (const id of ["pickGrid", "banGrid"]) {
    attachMiniCardGridHandlers(
      document.getElementById(id),
      getDraftDisplayPlayers,
      submitBan,
      submitPick,
    );
  }
}
