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
  ROOM_STATUS_DONE,
  ROOM_STATUS_DRAFTING,
  START_MATCH_STATUSES,
} from '@/features/draft/constants.js';
import { showToast, showView } from '@/features/draft/utils.js';
import { state, defaultRoomConfig, applyPresenceSnapshot, isUnlimitedDuration } from '@/features/draft/state.js';
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

/* Every status that means "not the lobby". They all enter the draft view; which
   board is up inside it is `renderDraftUi`'s business. */
const DRAFT_STATUSES = [ROOM_STATUS_DRAFTING, ...START_MATCH_STATUSES, ROOM_STATUS_DONE];

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
  /* `state.schedule` is written by `applyPresenceSnapshot` from the snapshot the
     server sends — including the zero-ban case, which used to be corrected here
     by jumping `turnIndex` past a ban turn the server still thought it was on.
     A schedule with no ban entry needs no correction. */
  syncCurrentTurnFromIndex(room);
  ensureDraftTimer(room);

  /* Three statuses map to one phase: the client keeps a single `ready` phase for
     the whole Start Match screen, because its three handshakes are one screen
     with one set of rules about what else is on it. Only the finished room is
     its own phase, and only because the exit guard and the rematch watch turn
     on it. */
  state.phase = status === ROOM_STATUS_DONE ? "done"
    : status === ROOM_STATUS_DRAFTING ? "draft"
    : "ready";
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

/**
 * Reads a duration input and reports whether it is inside the allowed range —
 * **or is the unlimited sentinel**, which is deliberately outside it. Without
 * that case the UNLIMITED button set a value START then refused to accept.
 */
function validateDuration(inputId, min, max, label) {
  const input = document.getElementById(inputId);
  const value = Number(input?.value);
  if (isUnlimitedDuration(input?.value)) return true;
  if (Number.isFinite(value) && value >= min && value <= max) return true;

  showToast(`${label} duration must be between ${min} and ${max} seconds, or unlimited.`, "warn");
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
