/**
 * Autocomplete for the text-list allowance categories (club / league /
 * nationality), backed by GET /api/players/distinct.
 */

import { TEXT_ALLOWANCE_LIST_KEYS, ALLOWANCE_DEF_MAP } from '@/features/draft/constants.js';
import {
  dedupeCaseInsensitive,
  normalizeTextAllowanceListValue,
  stringifyTextAllowanceCapMap,
} from '@/features/draft/allowance.js';
import { escapeHtml, showToast } from '@/features/draft/utils.js';
import { state } from '@/features/draft/state.js';
import { getJson } from '@/features/draft/api.js';

const DEBOUNCE_MS = 150;
const MAX_SUGGESTIONS = 10;

let debounceTimer = null;

const collapseSpaces = (raw) => String(raw || "").replace(/\s+/g, " ").trim();

export function clearClubSearchState() {
  state.clubSearchQuery = "";
  state.clubSearchOptions = [];
  state.clubSearchOpen = false;
  state.clubSearchLoading = false;
  state.clubSearchActiveIndex = -1;
}

/** Closes the panel and clears results without touching the typed query. */
function resetSuggestions({ open }) {
  state.clubSearchOptions = [];
  state.clubSearchOpen = open;
  state.clubSearchLoading = false;
  state.clubSearchActiveIndex = -1;
  renderClubSuggestionPanel();
}

/** Adds a value to a text-list allowance category. Returns false if it was already present. */
export function addTextAllowanceValue(key, rawValue) {
  const typed = collapseSpaces(rawValue);
  if (!typed || !TEXT_ALLOWANCE_LIST_KEYS.has(key)) return false;

  const values = normalizeTextAllowanceListValue(state.room?.config?.allowance?.[key] || "");
  if (values.some((v) => v.toLowerCase() === typed.toLowerCase())) {
    showToast(`${ALLOWANCE_DEF_MAP.get(key)?.label || key} already added.`);
    return false;
  }

  values.push(typed);
  state.room.config.allowance[key] = values.join(",");
  state.room.config.allowanceCaps[key] = stringifyTextAllowanceCapMap(
    state.room.config.allowanceCaps[key],
    values,
  );
  clearClubSearchState();
  return true;
}

/** Fetches suggestions, dropping the response if a newer request has started. */
export async function fetchClubSuggestions(query) {
  const key = String(state.clubSearchKey || "club").trim();
  const q = collapseSpaces(query);
  if (!q) {
    resetSuggestions({ open: false });
    return;
  }

  const reqSeq = ++state.clubSearchReqSeq;
  state.clubSearchLoading = true;
  state.clubSearchOpen = true;
  renderClubSuggestionPanel();

  const rows = await getJson(
    `/api/players/distinct?field=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}`,
  );
  if (reqSeq !== state.clubSearchReqSeq) return;

  const alreadySelected = new Set(
    normalizeTextAllowanceListValue(state.room?.config?.allowance?.[key] || "")
      .map((v) => v.toLowerCase()),
  );
  const options = dedupeCaseInsensitive(
    Array.isArray(rows) ? rows.map(collapseSpaces).filter(Boolean) : [],
  ).filter((v) => !alreadySelected.has(v.toLowerCase()));

  state.clubSearchOptions = options.slice(0, MAX_SUGGESTIONS);
  state.clubSearchLoading = false;
  state.clubSearchOpen = true;
  state.clubSearchActiveIndex = state.clubSearchOptions.length ? 0 : -1;
  renderClubSuggestionPanel();
}

export function scheduleClubSuggestions(key, query) {
  clearTimeout(debounceTimer);
  state.clubSearchKey = String(key || "club");
  state.clubSearchQuery = String(query || "");

  if (!state.clubSearchQuery.trim()) {
    resetSuggestions({ open: false });
    return;
  }

  state.clubSearchLoading = true;
  state.clubSearchOpen = true;
  state.clubSearchActiveIndex = -1;
  renderClubSuggestionPanel();

  debounceTimer = setTimeout(() => void fetchClubSuggestions(state.clubSearchQuery), DEBOUNCE_MS);
}

export function renderClubSuggestionPanel() {
  const key = String(state.clubSearchKey || "club").trim();
  const input = document.querySelector(`.allowance-club-search[data-allowance-club-search="${key}"]`);
  const panel = document.querySelector(`[data-allowance-club-suggest-panel="${key}"]`);
  if (!input || !panel) return;

  input.value = state.clubSearchQuery || "";
  panel.classList.toggle("is-open", Boolean(state.clubSearchOpen));

  if (!state.clubSearchOpen) {
    panel.innerHTML = "";
    return;
  }
  if (state.clubSearchLoading) {
    panel.innerHTML = '<div class="allowance-club-suggest-empty">Searching...</div>';
    return;
  }
  if (!state.clubSearchOptions.length) {
    const singular = String(ALLOWANCE_DEF_MAP.get(key)?.label || key).toLowerCase();
    panel.innerHTML = state.clubSearchQuery.trim()
      ? `<div class="allowance-club-suggest-empty">No ${escapeHtml(singular)} found.</div>`
      : "";
    return;
  }

  panel.innerHTML = state.clubSearchOptions.map((club, idx) => `
    <button
      type="button"
      class="allowance-club-suggest-option ${idx === state.clubSearchActiveIndex ? "is-active" : ""}"
      data-allowance-club-suggestion="${escapeHtml(club)}"
    >${escapeHtml(club)}</button>
  `).join("");
}
