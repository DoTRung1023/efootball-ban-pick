/**
 * User-initiated draft actions: staging and confirming bans, submitting picks,
 * and the two ready flags (lobby-ready and post-draft match-ready).
 *
 * Bans are staged locally first and only posted on CONFIRM BANS, so the user
 * can change their mind. Picks post immediately after an optimistic update.
 */

import { cb } from '@/features/draft/callbacks.js';
import { showToast } from '@/features/draft/utils.js';
import { state, applyPresenceSnapshot } from '@/features/draft/state.js';
import { postAsMe } from '@/features/draft/api.js';
import { stopPresencePolling } from './presence.js';
import {
  applyLocalAction,
  banLimit,
  isBothMatchReady,
  isReadyPhase,
  pickLimit,
  startTurnTimer,
} from './draftFlow.js';

/** Only the id and name are persisted server-side; the rest is client-only display data. */
const banPayload = (player) => ({ id: String(player.id), name: player.name });

// ── Ready flags ──────────────────────────────────────────────

export async function setGuestReady(ready) {
  const { ok, data } = await postAsMe("ready", { ready: Boolean(ready) });
  if (!ok) {
    showToast(data.error || "Could not update ready.");
    return;
  }
  if (data.room) {
    applyPresenceSnapshot(data.room);
    cb.renderLobby();
  }
}

export async function setMatchReady(ready) {
  const { ok, data } = await postAsMe("match-ready", { ready: Boolean(ready) });
  if (!ok) {
    showToast(data.error || "Could not update match ready.");
    return;
  }
  if (data.room) applyPresenceSnapshot(data.room);

  if (isBothMatchReady()) {
    stopPresencePolling();
    state.phase = "done";
    cb.showDone();
    return;
  }
  cb.renderDraftUi();
}

// ── Bans ─────────────────────────────────────────────────────

/** Moves staged bans into the local room copy and returns them for posting. */
export function flushStagedBansLocally() {
  if (!state.stagedBans.length) return [];
  const toSubmit = [...state.stagedBans];
  state.stagedBans = [];
  if (state.room) {
    for (const player of toSubmit) applyLocalAction(state.room, player);
  }
  return toSubmit;
}

/** Posts bans one at a time so a single rejection doesn't discard the rest. */
export async function submitBansToApi(players) {
  if (!state.room || !players.length) return;
  for (const player of players) {
    const { ok, data } = await postAsMe("ban", { player: banPayload(player) });
    if (!ok) showToast(data?.error || "Could not confirm ban.");
    else if (data.room) applyPresenceSnapshot(data.room);
  }
  cb.renderDraftUi();
}

/** Marks this side's bans final. The server advances the draft once both agree. */
export async function callBanConfirm() {
  const prevTurnIndex = state.room?.turnIndex;
  const { ok, data } = await postAsMe("ban-confirm");
  if (!ok || !data.room) return;

  applyPresenceSnapshot(data.room);
  // Server moved us to the pick phase — start its timer now rather than
  // waiting for the next render cycle to notice.
  if (state.room.turnIndex > prevTurnIndex && state.phase === "draft") startTurnTimer();
  cb.renderDraftUi();
}

export async function confirmStagedBans() {
  const toSubmit = flushStagedBansLocally();
  cb.renderDraftUi();
  await submitBansToApi(toSubmit);
  await callBanConfirm();
}

/** Timer expiry path: submit whatever is staged without confirming the side. */
export async function flushAndSubmitStagedBans() {
  await submitBansToApi(flushStagedBansLocally());
}

/** Stages a ban locally; nothing is posted until CONFIRM BANS. */
export function submitBan(player) {
  const room = state.room;
  if (!room) return;

  const turn = state.schedule[room.turnIndex];
  const isMyTurn = String(turn?.side || "") === "both" || turn?.side === state.mySide;
  if (turn?.action !== "ban" || isReadyPhase(room) || !isMyTurn) return;

  const id = String(player.id);
  const alreadyConfirmed = (room.bans?.[state.mySide] || []).some((b) => String(b.id) === id);
  const alreadyStaged = state.stagedBans.some((p) => String(p.id) === id);
  if (alreadyConfirmed || alreadyStaged) return;

  const maxBans = banLimit(room.config);
  const used = (room.bans?.[state.mySide] || []).length + state.stagedBans.length;
  if (maxBans && used >= maxBans) {
    showToast("You already used all bans for your side.");
    return;
  }

  state.stagedBans.push(player);
  cb.renderDraftUi();
}

// ── Picks ────────────────────────────────────────────────────

/** Applies the pick locally, then posts it. A rejection is corrected by the next poll. */
export async function submitPick(player) {
  const room = state.room;
  if (!room) return;

  const turn = state.schedule[room.turnIndex];
  if (turn?.action !== "pick" || isReadyPhase(room)) return;

  const maxPicks = pickLimit(room.config);
  if (maxPicks && (room.picks?.[state.mySide] || []).length >= maxPicks) {
    showToast("You've reached the pick limit.");
    return;
  }

  if (!applyLocalAction(room, player)) {
    cb.renderDraftUi();
    return;
  }
  cb.renderDraftUi();

  const { ok, data } = await postAsMe("pick", { player: banPayload(player) });
  if (!ok) showToast(data?.error || "Could not confirm pick.");
  else if (data.room) applyPresenceSnapshot(data.room);
  cb.renderDraftUi();
}
