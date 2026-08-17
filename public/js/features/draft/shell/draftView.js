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

/** Phases with a board to draw. `done` is one of them — see `enterMatchLive`. */
const RENDERED_PHASES = new Set(["draft", "ready", "done"]);

export function renderDraftUi() {
  const room = state.room;
  if (!room || !RENDERED_PHASES.has(state.phase)) return;

  const mySide = state.mySide;
  const theirSide = mySide === "host" ? "guest" : "host";
  renderLeaveLabel(mySide);
  const turn = state.schedule[room.turnIndex];
  /* Both players have pressed READY: the match is on and the Start Match screen
     stays up, having swapped its footer for the three ways out. It is the same
     board, so everything below treats `done` as a ready phase. */
  const matchLive = state.phase === "done";
  const readyPhase = matchLive || isReadyPhase(room);
  // The server flips `status` to "await-ready" once both squads are confirmed;
  // this is where that becomes the client's phase too. Not once the match is
  // live, or it would walk the phase back out of `done` on the next poll.
  if (readyPhase && !matchLive) enterReadyPhase();
  const isBanPhase = turn?.action === "ban";
  // Both stages are simultaneous, so side "both" always means it's your turn.
  const isMyTurn = String(turn?.side || "") === "both" || turn?.side === mySide;

  if (isBanPhase && !state.opponentBanPlayersLoaded && !state.loadingOpponentBanPlayers) {
    void loadOpponentBanPlayers();
  }

  renderActionError();

  const showBanBoard = isBanPhase && !readyPhase;
  renderBanBoard({ room, mySide, theirSide, isMyTurn, readyPhase, visible: showBanBoard });

  // The server can advance to the pick phase via ban-confirm while our timer is
  // still idle; pick it up here rather than waiting for another event.
  if (!isBanPhase && !readyPhase && state.phase === "draft" && !state.turnTimer) {
    startTurnTimer();
  }

  renderPickBoard({ room, mySide, theirSide, visible: !showBanBoard && !readyPhase });
  renderReadyBoard({ room, mySide, theirSide, matchLive, visible: readyPhase });

  updateStageTabs();
}

/**
 * Both sides are ready — move into the match-live stage of Start Match.
 *
 * Deliberately **not** a view change: the squads on screen are the squads the
 * match is being played with, and re-listing them on a second screen was the
 * whole complaint against `#viewDone`. Only the footer changes.
 *
 * The room is over as far as the exit guard is concerned, so the guard stands
 * down — a finished match should not raise "are you sure you want to leave?".
 *
 * The cached phase is deliberately **left alone**. It is what lets a reload skip
 * the lobby flash, and a reload from here should come back to this screen: the
 * room is still live, and a rematch offer may be waiting on it.
 */
export function enterMatchLive() {
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
