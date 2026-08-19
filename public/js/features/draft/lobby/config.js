/**
 * Pushes lobby settings to the server (host only).
 *
 * The payload is read from the DOM rather than from state.room.config so that
 * in-flight typing is never clobbered by an incoming presence poll. Rapid edits
 * are debounced and sequence-numbered; stale responses are discarded.
 */

import { cb } from '@/features/draft/callbacks.js';
import { ALLOWANCE_VALUE_LIST_KEYS } from '@/features/draft/constants.js';
import {
  normalizeAllowanceRangeValue,
  orderAllowanceCountPair,
} from '@/features/draft/allowance.js';
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

/**
 * Both player-count maps, read straight off the visible Min/Max boxes.
 *
 * Off the boxes and not off `state.room.config`, because the two disagree for
 * as long as someone is typing: the list is not rebuilt while a field has
 * focus, so the field is ahead of the config it will be written into.
 *
 * A `range` category yields one bare count per side of the pair; every other
 * shape yields a `{value: count}` JSON map, one entry per value that carries a
 * rule. An empty map is `""` — the same "no rule" every other empty count is.
 */
function readAllowanceCountsFromDom() {
  const caps = {};
  const mins = {};

  for (const item of queryAll(".allowance-item[data-allowance-key]")) {
    const key = item.dataset.allowanceKey;
    if (!key) continue;

    if (!ALLOWANCE_VALUE_LIST_KEYS.has(key)) {
      const pair = orderAllowanceCountPair(
        item.querySelector(`.allowance-item-min[data-allowance-min-key="${key}"]`)?.value,
        item.querySelector(`.allowance-item-cap[data-allowance-cap-key="${key}"]`)?.value,
      );
      mins[key] = pair.min;
      caps[key] = pair.cap;
      continue;
    }

    const capMap = {};
    const minMap = {};
    for (const row of item.querySelectorAll(".allowance-value-row")) {
      const value = row.dataset.allowanceValueItem;
      if (!value) continue;
      const pair = orderAllowanceCountPair(
        row.querySelector(".allowance-value-min")?.value,
        row.querySelector(".allowance-value-max")?.value,
      );
      if (pair.min) minMap[value] = pair.min;
      if (pair.cap) capMap[value] = pair.cap;
    }
    mins[key] = Object.keys(minMap).length ? JSON.stringify(minMap) : "";
    caps[key] = Object.keys(capMap).length ? JSON.stringify(capMap) : "";
  }

  return { caps, mins };
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
  const { caps: allowanceCaps, mins: allowanceMins } = readAllowanceCountsFromDom();
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
    allowanceMins: Object.keys(allowanceMins).length ? allowanceMins : { ...(cfg.allowanceMins || {}) },
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
