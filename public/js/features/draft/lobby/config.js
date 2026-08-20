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
  normalizeBanOrder,
} from '@/features/draft/state.js';
import { postAsMe } from '@/features/draft/api.js';
import { rememberSettings } from './presets.js';

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
    banRevealMode: readOrFallback("lobbyBanRevealModeInput", normalizeRevealMode, cfg.banRevealMode),
    banOrder: readOrFallback("lobbyBanOrderInput", normalizeBanOrder, cfg.banOrder),
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
  /* Stored on the way out, not on the way in: what the host gets back next time
     is what the server accepted, so a value the normalisers clamped is
     remembered as the clamped one. This is the only writer, and it has already
     returned unless this side is the host. */
  rememberSettings(payload);

  if (data.room) {
    applyPresenceSnapshot(data.room);
    cb.renderLobby();
  }
}

/**
 * Pushes now, skipping the debounce, and resolves once the server has answered.
 *
 * For writes that are not typing: a preset chip, and the remembered settings
 * seeded into a room the host has just opened. Both replace every field at once
 * and both race the 500 ms presence poll, which merges the server's config over
 * the local one — so they need to know when their write has actually landed.
 */
export function pushLobbyConfigNow() {
  clearTimeout(pushDebounce);
  state.lobbyConfigDirty = true;
  return pushLobbyConfig();
}

export function scheduleLobbyConfigPush() {
  clearTimeout(pushDebounce);
  state.lobbyConfigDirty = true;
  pushDebounce = setTimeout(pushLobbyConfig, PUSH_DEBOUNCE_MS);
}
