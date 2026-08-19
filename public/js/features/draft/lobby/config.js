/**
 * Pushes lobby settings to the server (host only).
 *
 * The payload is read from the DOM rather than from state.room.config so that
 * in-flight typing is never clobbered by an incoming presence poll. Rapid edits
 * are debounced and sequence-numbered; stale responses are discarded.
 */

import { cb } from '@/features/draft/callbacks.js';
import {
  state,
  defaultRoomConfig,
  applyPresenceSnapshot,
  normalizeBanDurationSec,
  normalizePickDurationSec,
  normalizeRevealMode,
} from '@/features/draft/state.js';
import { postAsMe } from '@/features/draft/api.js';

const PUSH_DEBOUNCE_MS = 300;

let pushDebounce = null;
let latestSyncSeq = 0;
let latestAckSeq = 0;

/** Reads a control's value, falling back to the stored config when absent. */
function readOrFallback(elementId, normalize, fallback) {
  const el = document.getElementById(elementId);
  return normalize(el ? el.value : fallback);
}

function buildConfigPayload() {
  const cfg = state.room.config || defaultRoomConfig();
  const bansInput = document.getElementById("lobbyBansInput");

  return {
    banCountPerSide: bansInput
      ? Math.max(0, Math.floor(Number(bansInput.value) || 0))
      : Number(cfg.banCountPerSide) || 0,
    banDurationSec: readOrFallback("lobbyBanDurationInput", normalizeBanDurationSec, cfg.banDurationSec),
    pickDurationSec: readOrFallback("lobbyPickDurationInput", normalizePickDurationSec, cfg.pickDurationSec),
    revealMode: readOrFallback("lobbyRevealModeInput", normalizeRevealMode, cfg.revealMode),
  };
}

async function pushLobbyConfig() {
  if (state.mySide !== "host" || !state.room?.code) return;

  const payload = buildConfigPayload();
  const reqSeq = ++latestSyncSeq;

  const { ok, data } = await postAsMe("config", { clientSeq: reqSeq, ...payload });
  if (!ok) return;

  // Overlapping requests can land out of order; only the newest wins.
  if (reqSeq < latestAckSeq || reqSeq !== latestSyncSeq) return;
  latestAckSeq = reqSeq;
  state.lobbyConfigDirty = false;

  if (data.room) {
    applyPresenceSnapshot(data.room);
    cb.renderLobby();
  }
}

export function scheduleLobbyConfigPush() {
  clearTimeout(pushDebounce);
  state.lobbyConfigDirty = true;
  pushDebounce = setTimeout(pushLobbyConfig, PUSH_DEBOUNCE_MS);
}
