/**
 * Pushes lobby settings to the server (host only).
 *
 * The payload is read from the DOM rather than from state.room.config so that
 * in-flight typing is never clobbered by an incoming presence poll. Rapid edits
 * are debounced and sequence-numbered; stale responses are discarded.
 */

import { cb } from '../callbacks.js';
import { POSITION_OPTIONS, TEXT_ALLOWANCE_LIST_KEYS } from '../constants.js';
import {
  normalizeAllowanceCapValue,
  normalizeAllowanceRangeValue,
  normalizeTextAllowanceListValue,
  stringifyTextAllowanceCapMap,
} from '../allowance.js';
import {
  state,
  defaultRoomConfig,
  applyPresenceSnapshot,
  normalizeBanDurationSec,
  normalizePickDurationSec,
  normalizeRevealMode,
} from '../state.js';
import { postAsMe } from '../api.js';

const PUSH_DEBOUNCE_MS = 300;

let pushDebounce = null;
let latestSyncSeq = 0;
let latestAckSeq = 0;

const queryAll = (selector) => Array.from(document.querySelectorAll(selector));
const distinctDataKeys = (els, attr) =>
  Array.from(new Set(els.map((el) => el.dataset[attr]).filter(Boolean)));

/** Reads a value from an allowance control, joining multi-selects with commas. */
export function readAllowanceFieldValue(input) {
  if (!input) return "";
  if (input.tagName === "SELECT" && input.multiple) {
    return Array.from(input.selectedOptions)
      .map((opt) => String(opt.value || "").trim())
      .filter(Boolean)
      .join(",");
  }
  return String(input.value || "").trim();
}

/** Collects allowance values from the rendered controls. */
function readAllowanceFromDom() {
  const allowance = {};

  for (const input of queryAll(".allowance-item-input")) {
    const key = input.dataset.allowanceKey;
    // Range bounds are paired below; skip the individual halves here.
    if (!key || input.classList.contains("allowance-item-range")) continue;
    allowance[key] = readAllowanceFieldValue(input);
  }

  for (const key of distinctDataKeys(queryAll(".allowance-item-range"), "allowanceKey")) {
    const bound = (which) =>
      document.querySelector(`.allowance-item-range[data-allowance-key="${key}"][data-allowance-range-bound="${which}"]`);
    allowance[key] = normalizeAllowanceRangeValue(bound("min")?.value, bound("max")?.value);
  }

  return allowance;
}

/** Collects per-category caps: simple numbers, the position map, and text-list maps. */
function readAllowanceCapsFromDom(allowance) {
  const caps = {};

  for (const input of queryAll(".allowance-item-cap")) {
    const key = input.dataset.allowanceCapKey;
    if (!key || TEXT_ALLOWANCE_LIST_KEYS.has(key)) continue;
    caps[key] = normalizeAllowanceCapValue(input.value);
  }

  const posInputs = queryAll(".allowance-pos-cap-input");
  if (posInputs.length) {
    const posCaps = {};
    for (const input of posInputs) {
      const pos = String(input.dataset.allowancePos || "").trim().toUpperCase();
      if (!POSITION_OPTIONS.includes(pos)) continue;
      const cap = normalizeAllowanceCapValue(input.value);
      if (cap) posCaps[pos] = cap;
    }
    caps.position = Object.keys(posCaps).length ? JSON.stringify(posCaps) : "";
  }

  for (const hidden of queryAll(".allowance-club-cap-hidden[data-allowance-cap-key]")) {
    const capKey = String(hidden.dataset.allowanceCapKey || "").trim();
    if (!TEXT_ALLOWANCE_LIST_KEYS.has(capKey)) continue;
    const values = normalizeTextAllowanceListValue(allowance[capKey] || "");
    caps[capKey] = stringifyTextAllowanceCapMap(hidden.value, values);
  }

  return caps;
}

/** Reads a control's value, falling back to the stored config when absent. */
function readOrFallback(elementId, normalize, fallback) {
  const el = document.getElementById(elementId);
  return normalize(el ? el.value : fallback);
}

function buildConfigPayload() {
  const cfg = state.room.config || defaultRoomConfig();

  const allowAllInput = document.getElementById("allowAllPlayersInput");
  const bansInput = document.getElementById("lobbyBansInput");
  const allowanceInputs = queryAll(".allowance-item-input");

  const allowance = readAllowanceFromDom();
  const allowanceCaps = readAllowanceCapsFromDom(allowance);
  const allowanceEnabled = distinctDataKeys(allowanceInputs, "allowanceKey");

  return {
    allowAllPlayers: allowAllInput ? Boolean(allowAllInput.checked) : Boolean(cfg.allowAllPlayers),
    banCountPerSide: bansInput
      ? Math.max(0, Math.floor(Number(bansInput.value) || 0))
      : Number(cfg.banCountPerSide) || 0,
    banDurationSec: readOrFallback("lobbyBanDurationInput", normalizeBanDurationSec, cfg.banDurationSec),
    pickDurationSec: readOrFallback("lobbyPickDurationInput", normalizePickDurationSec, cfg.pickDurationSec),
    revealMode: readOrFallback("lobbyRevealModeInput", normalizeRevealMode, cfg.revealMode),
    // An empty DOM read means the list has not rendered yet — keep the stored config.
    allowanceEnabled: allowanceEnabled.length
      ? allowanceEnabled
      : (Array.isArray(cfg.allowanceEnabled) ? [...cfg.allowanceEnabled] : []),
    allowance: Object.keys(allowance).length ? allowance : { ...(cfg.allowance || {}) },
    allowanceCaps: Object.keys(allowanceCaps).length ? allowanceCaps : { ...(cfg.allowanceCaps || {}) },
  };
}

export async function pushLobbyConfig() {
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
