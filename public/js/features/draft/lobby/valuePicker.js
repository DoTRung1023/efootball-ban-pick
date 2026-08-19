/**
 * The one picker behind every per-value allowance category.
 *
 * Two sources, one panel. A `list` category (position, league, card type,
 * region, playing style) has its options in memory, so the panel opens showing
 * **all** of them and the box above filters — 36 leagues is a list you read, not
 * one you scroll. A `search` category (club, nationality) has hundreds, so the
 * panel stays empty until something is typed and then shows what
 * `/api/players/distinct` answers. Everything after the click is identical:
 * the value joins the category and gets its own Min/Max.
 *
 * Only one picker is open at a time, which is why its state is a single set of
 * fields on `state` rather than a map keyed by category.
 */

import {
  ALLOWANCE_DEF_MAP,
  ALLOWANCE_SEARCH_KEYS,
  ALLOWANCE_VALUE_LIST_KEYS,
  POSITION_OPTIONS,
  FOOT_OPTIONS,
  CARD_TYPE_OPTIONS,
  REGION_OPTIONS,
  PLAYING_STYLE_OPTIONS,
} from '@/features/draft/constants.js';
import {
  dedupeCaseInsensitive,
  normalizeAllowanceListValue,
  stringifyAllowanceCountMap,
} from '@/features/draft/allowance.js';
import { escapeHtml, showToast } from '@/features/draft/utils.js';
import { state } from '@/features/draft/state.js';
import { getJson } from '@/features/draft/api.js';
import { LEAGUE_OPTIONS } from '@/features/draft/filterOptions.js';

const DEBOUNCE_MS = 150;
const MAX_SUGGESTIONS = 10;

let debounceTimer = null;

const collapseSpaces = (raw) => String(raw || "").replace(/\s+/g, " ").trim();

/**
 * Where a category's options come from when they are in memory.
 *
 * The last four are filled by `fetchFilterOptions()` after the page loads and
 * are read through this table on every render, never captured — a copy taken at
 * module load would be permanently empty.
 */
const LOCAL_OPTIONS = {
  position: POSITION_OPTIONS,
  foot: FOOT_OPTIONS,
  league: LEAGUE_OPTIONS,
  cardType: CARD_TYPE_OPTIONS,
  region: REGION_OPTIONS,
  playingStyle: PLAYING_STYLE_OPTIONS,
};

const localAllowanceOptions = (key) => LOCAL_OPTIONS[key] || [];

/** The word the placeholder and the empty line use for one of these. */
export const allowanceValueNoun = (key) =>
  String(ALLOWANCE_DEF_MAP.get(key)?.label || key).toLowerCase();

export function clearAllowancePicker() {
  state.allowancePickerQuery = "";
  state.allowancePickerOptions = [];
  state.allowancePickerOpen = false;
  state.allowancePickerLoading = false;
  state.allowancePickerActiveIndex = -1;
}

/** Adds a value to a per-value allowance category. False if it was already there. */
export function addAllowanceValue(key, rawValue) {
  const typed = collapseSpaces(rawValue);
  if (!typed || !ALLOWANCE_VALUE_LIST_KEYS.has(key)) return false;

  const values = normalizeAllowanceListValue(key, state.room?.config?.allowance?.[key] || "");
  if (values.some((v) => v.toLowerCase() === typed.toLowerCase())) {
    showToast(`${ALLOWANCE_DEF_MAP.get(key)?.label || key} already added.`);
    return false;
  }

  values.push(typed);
  const next = normalizeAllowanceListValue(key, values.join(","));
  state.room.config.allowance[key] = next.join(",");
  state.room.config.allowanceCaps[key] = stringifyAllowanceCountMap(state.room.config.allowanceCaps[key], next);
  state.room.config.allowanceMins[key] = stringifyAllowanceCountMap(state.room.config.allowanceMins[key], next);
  clearAllowancePicker();
  return true;
}

/** Removes one value, and the Min/Max that hung off it. */
export function removeAllowanceValue(key, rawValue) {
  const target = collapseSpaces(rawValue).toLowerCase();
  if (!target || !ALLOWANCE_VALUE_LIST_KEYS.has(key)) return false;

  const values = normalizeAllowanceListValue(key, state.room?.config?.allowance?.[key] || "")
    .filter((v) => v.toLowerCase() !== target);
  state.room.config.allowance[key] = values.join(",");
  state.room.config.allowanceCaps[key] = stringifyAllowanceCountMap(state.room.config.allowanceCaps[key], values);
  state.room.config.allowanceMins[key] = stringifyAllowanceCountMap(state.room.config.allowanceMins[key], values);
  return true;
}

/** The values already on the row, lowercased — a picker never offers those. */
function selectedLowercase(key) {
  return new Set(
    normalizeAllowanceListValue(key, state.room?.config?.allowance?.[key] || "")
      .map((v) => v.toLowerCase()),
  );
}

/** Fetches suggestions, dropping the response if a newer request has started. */
async function fetchRemoteOptions(query) {
  const key = String(state.allowancePickerKey || "club").trim();
  const q = collapseSpaces(query);
  if (!q) {
    state.allowancePickerOptions = [];
    state.allowancePickerLoading = false;
    state.allowancePickerActiveIndex = -1;
    renderAllowancePickerPanel();
    return;
  }

  const reqSeq = ++state.allowancePickerReqSeq;
  const rows = await getJson(
    `/api/players/distinct?field=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}`,
  );
  if (reqSeq !== state.allowancePickerReqSeq) return;

  const taken = selectedLowercase(key);
  state.allowancePickerOptions = dedupeCaseInsensitive(
    Array.isArray(rows) ? rows.map(collapseSpaces).filter(Boolean) : [],
  ).filter((v) => !taken.has(v.toLowerCase())).slice(0, MAX_SUGGESTIONS);
  state.allowancePickerLoading = false;
  state.allowancePickerActiveIndex = state.allowancePickerOptions.length ? 0 : -1;
  renderAllowancePickerPanel();
}

/** Filters the in-memory list. No request, so no debounce and no loading line. */
function applyLocalOptions(key, query) {
  const q = collapseSpaces(query).toLowerCase();
  const taken = selectedLowercase(key);
  state.allowancePickerOptions = localAllowanceOptions(key)
    .map(collapseSpaces)
    .filter(Boolean)
    .filter((v) => !taken.has(v.toLowerCase()))
    .filter((v) => !q || v.toLowerCase().includes(q));
  state.allowancePickerLoading = false;
  state.allowancePickerActiveIndex = -1;
}

/**
 * Repoints the picker at one category and reflects a query into it.
 *
 * `open` is what a click on the field passes and a keystroke does not need to:
 * the panel is already open by then, and re-asserting it would reopen a panel
 * the host had just dismissed with Escape.
 */
export function updateAllowancePicker(key, query, { open = false } = {}) {
  clearTimeout(debounceTimer);
  state.allowancePickerKey = String(key || "");
  state.allowancePickerQuery = String(query || "");
  if (open) state.allowancePickerOpen = true;

  if (!ALLOWANCE_SEARCH_KEYS.has(state.allowancePickerKey)) {
    applyLocalOptions(state.allowancePickerKey, state.allowancePickerQuery);
    renderAllowancePickerPanel();
    return;
  }

  if (!state.allowancePickerQuery.trim()) {
    state.allowancePickerOptions = [];
    state.allowancePickerLoading = false;
    state.allowancePickerActiveIndex = -1;
    renderAllowancePickerPanel();
    return;
  }

  state.allowancePickerLoading = true;
  state.allowancePickerActiveIndex = -1;
  renderAllowancePickerPanel();
  debounceTimer = setTimeout(() => void fetchRemoteOptions(state.allowancePickerQuery), DEBOUNCE_MS);
}

/**
 * The panel's contents for the current picker state.
 *
 * `allowanceView.js` calls this when it rebuilds the whole allowance list and
 * this module calls it on every keystroke — they must agree exactly, or the
 * panel flickers to a different shape on the next re-render.
 */
export function allowancePickerPanelHtml(key) {
  if (state.allowancePickerLoading) {
    return '<div class="allowance-picker-empty">Searching...</div>';
  }
  if (state.allowancePickerOptions.length) {
    return state.allowancePickerOptions
      .map((option, idx) => `
        <button
          type="button"
          class="allowance-picker-option ${idx === state.allowancePickerActiveIndex ? "is-active" : ""}"
          data-allowance-picker-option="${escapeHtml(option)}"
        >${escapeHtml(option)}</button>
      `)
      .join("");
  }

  const noun = allowanceValueNoun(key);
  if (ALLOWANCE_SEARCH_KEYS.has(key)) {
    /* Empty and untyped is not "none found" — it is the whole point of a search
       category, so the line says what to do instead of reporting a failure. */
    return state.allowancePickerQuery.trim()
      ? `<div class="allowance-picker-empty">No ${escapeHtml(noun)} found.</div>`
      : `<div class="allowance-picker-empty">Type to search ${escapeHtml(noun)}.</div>`;
  }
  return state.allowancePickerQuery.trim()
    ? `<div class="allowance-picker-empty">No ${escapeHtml(noun)} matches.</div>`
    : `<div class="allowance-picker-empty">All ${escapeHtml(noun)} options added.</div>`;
}

export function renderAllowancePickerPanel() {
  const key = String(state.allowancePickerKey || "").trim();
  const input = document.querySelector(`.allowance-picker-search[data-allowance-picker-search="${key}"]`);
  const panel = document.querySelector(`[data-allowance-picker-panel="${key}"]`);
  if (!input || !panel) return;

  input.value = state.allowancePickerQuery || "";
  panel.classList.toggle("is-open", Boolean(state.allowancePickerOpen));
  panel.innerHTML = state.allowancePickerOpen ? allowancePickerPanelHtml(key) : "";
}
