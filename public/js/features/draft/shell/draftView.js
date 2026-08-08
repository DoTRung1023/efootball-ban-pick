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

export function renderDraftUi() {
  const room = state.room;
  if (!room || (state.phase !== "draft" && state.phase !== "ready")) return;

  const mySide = state.mySide;
  const theirSide = mySide === "host" ? "guest" : "host";
  const turn = state.schedule[room.turnIndex];
  const readyPhase = isReadyPhase(room);
  // The server flips `status` to "await-ready" once both squads are confirmed;
  // this is where that becomes the client's phase too.
  if (readyPhase) enterReadyPhase();
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
  renderReadyBoard({ room, mySide, theirSide, visible: readyPhase });

  updateStageTabs();
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
