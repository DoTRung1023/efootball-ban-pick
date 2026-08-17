/**
 * Entering the draft: the host's START action, and the transition from lobby
 * into the draft view once the server reports the room is drafting.
 */

import {
  FIXED_PICKS_PER_SIDE,
  LOBBY_PRESENCE_POLL_MS,
  MIN_BAN_DURATION_SECONDS,
  MAX_BAN_DURATION_SECONDS,
  MIN_PICK_DURATION_SECONDS,
  MAX_PICK_DURATION_SECONDS,
} from '@/features/draft/constants.js';
import { showToast, showView } from '@/features/draft/utils.js';
import { state, defaultRoomConfig, buildTurnSchedule, applyPresenceSnapshot } from '@/features/draft/state.js';
import { postAsMe } from '@/features/draft/api.js';
import { loadOpponentBanPlayers, resetOpponentBanPlayers } from '@/features/draft/ban/opponentSquad.js';
import { loadDraftPlayers } from '@/features/draft/pick/pick.js';
import { pollPresence, stopPresencePolling } from './presence.js';
import { loadDraftGamePlans } from '@/features/draft/gamePlans.js';
import {
  banLimit,
  ensureDraftTimer,
  startTurnTimer,
  syncCurrentTurnFromIndex,
} from './draftFlow.js';
import { setGuestReady } from './draftActions.js';
import { renderDraftUi, attachDraftGridHandlers } from '@/features/draft/shell/draftView.js';
import { updateStageTabs } from '@/features/draft/shell/stageTabs.js';

const DRAFT_STATUSES = ["drafting", "await-ready", "done"];

/** Survives a page reload — see initLobby, which reads this back on load. */
function cacheRoomPhase(code, phase) {
  try {
    if (code) sessionStorage.setItem(`efb_room_${code}_phase`, phase);
  } catch {
    /* private browsing / storage disabled */
  }
}

/**
 * Moves from the lobby into the draft if the server says the room has started.
 * Returns false when the room is still in the lobby.
 */
export function tryEnterDraftFromRoomSnapshot() {
  const room = state.room;
  if (!room || state.phase !== "lobby") return false;

  const status = String(room.status || "");
  if (!DRAFT_STATUSES.includes(status)) return false;

  /* `done` is entered exactly like the other two, and that is the fix: it used
     to get its own branch that called `showDone()` and **stopped polling**. Both
     halves are now wrong — there is no separate done screen to show, and a
     client that has stopped polling can never receive the rematch offer that is
     the only reason to still be here. Reloading during a live match landed on a
     dead lobby because of it. */
  const bansPerSide = banLimit(room.config);
  state.schedule = buildTurnSchedule(bansPerSide, FIXED_PICKS_PER_SIDE);
  // With no bans configured the draft opens straight into the pick stage.
  if (bansPerSide <= 0) {
    room.turnIndex = Math.max(0, state.schedule.findIndex((t) => t.action === "pick"));
  }
  syncCurrentTurnFromIndex(room);
  ensureDraftTimer(room);

  state.phase = status === "done" ? "done" : status === "await-ready" ? "ready" : "draft";
  cacheRoomPhase(room.code, state.phase);

  stopPresencePolling();
  showView("viewDraft");
  updateStageTabs();
  resetOpponentBanPlayers();

  void loadDraftGamePlans();
  renderDraftUi();
  attachDraftGridHandlers();
  void loadDraftPlayers();
  void loadOpponentBanPlayers();

  if (state.phase === "draft") startTurnTimer();
  state.presencePollId = setInterval(pollPresence, LOBBY_PRESENCE_POLL_MS);
  return true;
}

/** Reads a duration input and reports whether it is inside the allowed range. */
function validateDuration(inputId, min, max, label) {
  const input = document.getElementById(inputId);
  const value = Number(input?.value);
  if (Number.isFinite(value) && value >= min && value <= max) return true;

  showToast(`${label} duration must be between ${min} and ${max} seconds.`, "warn");
  input?.focus();
  return false;
}

/**
 * START button. For the guest this toggles their ready flag instead — only the
 * host can actually begin the draft.
 */
export function startDraftFromLobby() {
  if (state.mySide !== "host") {
    void setGuestReady(!Boolean(state.room?.ready?.guest));
    return;
  }

  if (!state.room?.ready?.guest) {
    showToast("Guest must be ready before starting.");
    return;
  }
  if (!validateDuration("lobbyBanDurationInput", MIN_BAN_DURATION_SECONDS, MAX_BAN_DURATION_SECONDS, "Ban")) return;
  if (!validateDuration("lobbyPickDurationInput", MIN_PICK_DURATION_SECONDS, MAX_PICK_DURATION_SECONDS, "Pick")) return;

  const cfg = state.room?.config || defaultRoomConfig();
  if (banLimit(cfg) === 0 && FIXED_PICKS_PER_SIDE === 0) {
    showToast("Set at least one ban or pick per side.");
    return;
  }

  void (async () => {
    const { ok, data } = await postAsMe("start");
    if (!ok) {
      showToast(data.error || "Could not start draft.", "warn");
      return;
    }
    if (data.room) applyPresenceSnapshot(data.room);
    if (!tryEnterDraftFromRoomSnapshot()) {
      showToast("Draft started. Waiting for room sync...", "warn");
    }
  })();
}
