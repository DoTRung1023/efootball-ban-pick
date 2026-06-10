import {
  ALLOWANCE_CATEGORY_DEFS,
  ALLOWANCE_DEF_MAP,
  ALLOWANCE_CAP_OPTIONS,
  POSITION_OPTIONS,
  FOOT_OPTIONS,
  CARD_TYPE_OPTIONS,
  REGION_OPTIONS,
  PLAYING_STYLE_OPTIONS,
  TEXT_ALLOWANCE_LIST_KEYS,
  FIXED_PICKS_PER_SIDE,
  REVEAL_MODE_HIDDEN,
  REVEAL_MODE_INSTANT,
} from './constants.js';

import {
  normalizePositionValue,
  normalizeFootValue,
  normalizeCardTypeValue,
  normalizeRegionValue,
  normalizePlayingStyleValue,
  normalizeClubValue,
  normalizeTextAllowanceListValue,
  dedupeCaseInsensitive,
  positionSummaryText,
  cardTypeSummaryText,
  regionSummaryText,
  playingStyleSummaryText,
  normalizeAllowanceCapValue,
  parsePositionCapMap,
  stringifyPositionCapMap,
  positionCapSummaryText,
  parseCardTypeCapMap,
  stringifyCardTypeCapMap,
  cardTypeCapSummaryText,
  parseRegionCapMap,
  stringifyRegionCapMap,
  regionCapSummaryText,
  parsePlayingStyleCapMap,
  stringifyPlayingStyleCapMap,
  playingStyleCapSummaryText,
  parseTextAllowanceCapMap,
  stringifyTextAllowanceCapMap,
  normalizeAllowanceRangeValue,
  parseAllowanceRangeValue,
} from './allowance.js';

import { cb } from './callbacks.js';
import { state, defaultRoomConfig, normalizeRoomConfig, applyPresenceSnapshot, emptyRoom } from './state.js';
import { normalizeBanDurationSec, normalizePickDurationSec, normalizeRevealMode } from './state.js';
import { escapeHtml, showToast, askConfirm, showView, getRoomCodeFromUrl, parseQuery, getUser, getCurrentIdentity, getAnonId } from './utils.js';
import { registerAndPollPresence, stopPresencePolling, leavePresence } from './presence.js';
import { fetchFilterOptions } from './ban.js';

let clubSearchDebounceTimer = null;
let readonlySettingsToastAt = 0;
let configSyncDebounce = null;
let latestConfigSyncSeq = 0;
let latestConfigAckSeq = 0;

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

export function clearClubSearchState() {
  state.clubSearchQuery = "";
  state.clubSearchOptions = [];
  state.clubSearchOpen = false;
  state.clubSearchLoading = false;
  state.clubSearchActiveIndex = -1;
}

export function addClubAllowanceValue(rawClub) {
  const typed = String(rawClub || "").replace(/\s+/g, " ").trim();
  if (!typed) return false;
  const clubs = normalizeClubValue(state.room?.config?.allowance?.club || "");
  if (clubs.some((club) => club.toLowerCase() === typed.toLowerCase())) {
    showToast("Club already added.");
    return false;
  }
  clubs.push(typed);
  state.room.config.allowance.club = clubs.join(",");
  state.room.config.allowanceCaps.club = stringifyClubCapMap(state.room.config.allowanceCaps.club, clubs);
  clearClubSearchState();
  return true;
}

export function addTextAllowanceValue(key, rawValue) {
  const typed = String(rawValue || "").replace(/\s+/g, " ").trim();
  if (!typed || !TEXT_ALLOWANCE_LIST_KEYS.has(key)) return false;
  const values = normalizeTextAllowanceListValue(state.room?.config?.allowance?.[key] || "");
  if (values.some((v) => v.toLowerCase() === typed.toLowerCase())) {
    showToast(`${ALLOWANCE_DEF_MAP.get(key)?.label || key} already added.`);
    return false;
  }
  values.push(typed);
  state.room.config.allowance[key] = values.join(",");
  state.room.config.allowanceCaps[key] = stringifyTextAllowanceCapMap(state.room.config.allowanceCaps[key], values);
  clearClubSearchState();
  return true;
}

export async function fetchClubSuggestions(query) {
  const key = String(state.clubSearchKey || "club").trim();
  const q = String(query || "").replace(/\s+/g, " ").trim();
  if (!q) {
    state.clubSearchOptions = [];
    state.clubSearchOpen = false;
    state.clubSearchLoading = false;
    state.clubSearchActiveIndex = -1;
    renderClubSuggestionPanel();
    return;
  }

  const reqSeq = ++state.clubSearchReqSeq;
  state.clubSearchLoading = true;
  state.clubSearchOpen = true;
  renderClubSuggestionPanel();

  try {
    const res = await fetch(`/api/players/distinct?field=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}`);
    const rows = res.ok ? await res.json() : [];
    if (reqSeq !== state.clubSearchReqSeq) return;
    const selected = normalizeTextAllowanceListValue(state.room?.config?.allowance?.[key] || "");
    const selectedSet = new Set(selected.map((v) => v.toLowerCase()));
    const options = dedupeCaseInsensitive(
      Array.isArray(rows)
        ? rows.map((row) => String(row || "").replace(/\s+/g, " ").trim()).filter(Boolean)
        : [],
    ).filter((v) => !selectedSet.has(v.toLowerCase()));
    state.clubSearchOptions = options.slice(0, 10);
    state.clubSearchLoading = false;
    state.clubSearchOpen = true;
    state.clubSearchActiveIndex = state.clubSearchOptions.length ? 0 : -1;
    renderClubSuggestionPanel();
  } catch {
    if (reqSeq !== state.clubSearchReqSeq) return;
    state.clubSearchOptions = [];
    state.clubSearchLoading = false;
    state.clubSearchOpen = true;
    state.clubSearchActiveIndex = -1;
    renderClubSuggestionPanel();
  }
}

export function scheduleClubSuggestions(key, query) {
  clearTimeout(clubSearchDebounceTimer);
  state.clubSearchKey = String(key || "club");
  state.clubSearchQuery = String(query || "");
  if (!state.clubSearchQuery.trim()) {
    state.clubSearchOptions = [];
    state.clubSearchOpen = false;
    state.clubSearchLoading = false;
    state.clubSearchActiveIndex = -1;
    renderClubSuggestionPanel();
    return;
  }
  state.clubSearchLoading = true;
  state.clubSearchOpen = true;
  state.clubSearchActiveIndex = -1;
  renderClubSuggestionPanel();
  clubSearchDebounceTimer = setTimeout(() => {
    void fetchClubSuggestions(state.clubSearchQuery);
  }, 150);
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
    const singularLabel = String(ALLOWANCE_DEF_MAP.get(key)?.label || key).toLowerCase();
    panel.innerHTML = state.clubSearchQuery.trim()
      ? `<div class="allowance-club-suggest-empty">No ${escapeHtml(singularLabel)} found.</div>`
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

export function renderLobbyChat() {
  const room = state.room;
  const log = document.getElementById("chatLog");
  if (!log || !room) return;

  const myId = getCurrentIdentity().id;
  const messages = Array.isArray(room.chat) ? room.chat : [];
  if (!messages.length) {
    log.innerHTML = '<div class="chat-empty">No messages yet. Agree rules here before starting.</div>';
    return;
  }

  log.innerHTML = messages.map((m) => {
    if (String(m.senderId || "") === "system") {
      return `<div class="chat-announce">${escapeHtml(m.message || "")}</div>`;
    }
    const mine = String(m.senderId) === String(myId);
    const dt = new Date(m.createdAt || Date.now());
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    return `
      <div class="chat-item ${mine ? "is-mine" : ""}">
        <div class="chat-head">
          <span class="chat-name">${escapeHtml(m.senderName || "User")}</span>
          <span class="chat-time">${hh}:${mm}</span>
        </div>
        <div class="chat-msg">${escapeHtml(m.message || "")}</div>
      </div>
    `;
  }).join("");
  log.scrollTop = log.scrollHeight;
}

export async function pushLobbyConfig() {
  if (state.mySide !== "host" || !state.room?.code) return;
  const myId = getCurrentIdentity().id;
  // Build payload from DOM first so unsynced typing/spam cannot be overwritten by polling.
  const allowAllInput = document.getElementById("allowAllPlayersInput");
  const bansInput = document.getElementById("lobbyBansInput");
  const allowanceInputs = Array.from(document.querySelectorAll(".allowance-item-input"));
  const allowanceRangeInputs = Array.from(document.querySelectorAll(".allowance-item-range"));
  const allowanceCapInputs = Array.from(document.querySelectorAll(".allowance-item-cap"));
  const allowancePosCapInputs = Array.from(document.querySelectorAll(".allowance-pos-cap-input"));
  const allowanceClubCapHiddens = Array.from(document.querySelectorAll(".allowance-club-cap-hidden[data-allowance-cap-key]"));

  const allowAllFromDom = allowAllInput ? Boolean(allowAllInput.checked) : null;
  const bansFromDom = bansInput ? Math.max(0, Math.floor(Number(bansInput.value) || 0)) : null;
  const allowanceEnabledFromDom = Array.from(new Set(allowanceInputs.map((input) => input.dataset.allowanceKey).filter(Boolean)));
  const allowanceFromDom = {};
  const allowanceCapsFromDom = {};
  allowanceInputs.forEach((input) => {
    const key = input.dataset.allowanceKey;
    if (!key) return;
    if (input.classList.contains("allowance-item-range")) return;
    allowanceFromDom[key] = readAllowanceFieldValue(input);
  });
  Array.from(new Set(allowanceRangeInputs.map((input) => input.dataset.allowanceKey).filter(Boolean))).forEach((key) => {
    const minInput = document.querySelector(`.allowance-item-range[data-allowance-key="${key}"][data-allowance-range-bound="min"]`);
    const maxInput = document.querySelector(`.allowance-item-range[data-allowance-key="${key}"][data-allowance-range-bound="max"]`);
    allowanceFromDom[key] = normalizeAllowanceRangeValue(minInput?.value, maxInput?.value);
  });
  allowanceCapInputs.forEach((input) => {
    const key = input.dataset.allowanceCapKey;
    if (!key) return;
    if (TEXT_ALLOWANCE_LIST_KEYS.has(key)) return;
    allowanceCapsFromDom[key] = normalizeAllowanceCapValue(input.value);
  });
  if (allowancePosCapInputs.length) {
    const posCaps = {};
    allowancePosCapInputs.forEach((input) => {
      const pos = String(input.dataset.allowancePos || "").trim().toUpperCase();
      if (!POSITION_OPTIONS.includes(pos)) return;
      const cap = normalizeAllowanceCapValue(input.value);
      if (cap) posCaps[pos] = cap;
    });
    allowanceCapsFromDom.position = Object.keys(posCaps).length ? JSON.stringify(posCaps) : "";
  }
  allowanceClubCapHiddens.forEach((hidden) => {
    const capKey = String(hidden.dataset.allowanceCapKey || "").trim();
    if (!TEXT_ALLOWANCE_LIST_KEYS.has(capKey)) return;
    const values = normalizeTextAllowanceListValue(allowanceFromDom[capKey] || "");
    allowanceCapsFromDom[capKey] = stringifyTextAllowanceCapMap(hidden.value, values);
  });

  const cfg = state.room.config || defaultRoomConfig();
  const allowAll = allowAllFromDom == null ? Boolean(cfg.allowAllPlayers) : allowAllFromDom;
  const banCountPerSide = bansFromDom == null ? Number(cfg.banCountPerSide) || 0 : bansFromDom;
  const allowanceEnabled =
    allowanceEnabledFromDom.length
      ? allowanceEnabledFromDom
      : (Array.isArray(cfg.allowanceEnabled) ? [...cfg.allowanceEnabled] : []);
  const allowance = Object.keys(allowanceFromDom).length
    ? allowanceFromDom
    : { ...(cfg.allowance || {}) };
  const allowanceCaps = Object.keys(allowanceCapsFromDom).length
    ? allowanceCapsFromDom
    : { ...(cfg.allowanceCaps || {}) };
  const banDurationInput = document.getElementById("lobbyBanDurationInput");
  const pickDurationInput = document.getElementById("lobbyPickDurationInput");
  const revealModeInput = document.getElementById("lobbyRevealModeInput");
  const banDurationSec = banDurationInput
    ? normalizeBanDurationSec(banDurationInput.value)
    : normalizeBanDurationSec(cfg.banDurationSec);
  const pickDurationSec = pickDurationInput
    ? normalizePickDurationSec(pickDurationInput.value)
    : normalizePickDurationSec(cfg.pickDurationSec);
  const revealMode = revealModeInput
    ? normalizeRevealMode(revealModeInput.value)
    : normalizeRevealMode(cfg.revealMode);
  const reqSeq = ++latestConfigSyncSeq;

  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId: myId, clientSeq: reqSeq, allowAllPlayers: allowAll, banCountPerSide, banDurationSec, pickDurationSec, revealMode, allowanceEnabled, allowance, allowanceCaps }),
    });
    if (!res.ok) return;
    const data = await res.json();
    // Ignore stale responses when rapid changes trigger overlapping requests.
    if (reqSeq < latestConfigAckSeq || reqSeq !== latestConfigSyncSeq) return;
    latestConfigAckSeq = reqSeq;
    state.lobbyConfigDirty = false;
    if (data.room) {
      applyPresenceSnapshot(data.room);
      renderLobby();
    }
  } catch {
    /* ignore */
  }
}

export function scheduleLobbyConfigPush() {
  clearTimeout(configSyncDebounce);
  state.lobbyConfigDirty = true;
  configSyncDebounce = setTimeout(pushLobbyConfig, 300);
}

export async function sendLobbyChatMessage(raw) {
  const message = String(raw || "").trim();
  if (!message || !state.room?.code) return;
  const me = getCurrentIdentity();
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId: me.id, username: me.username, message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || "Could not send message.");
      return;
    }
    if (data.room) {
      applyPresenceSnapshot(data.room);
      renderLobby();
    }
  } catch {
    showToast("Could not send message.");
  }
}

export function renderAllowanceList({ isHost, cfg }) {
  const dropdown = document.getElementById("allowanceCategoryDd");
  const trigger = document.getElementById("allowanceCategoryTrigger");
  const label = document.getElementById("allowanceCategoryLabel");
  const panel = document.getElementById("allowanceCategoryPanel");
  const addBtn = document.getElementById("addAllowanceBtn");
  const list = document.getElementById("allowanceList");
  const controls = document.getElementById("allowanceControls");
  if (!dropdown || !trigger || !label || !panel || !addBtn || !list || !controls) return;

  const enabled = Array.isArray(cfg.allowanceEnabled) ? cfg.allowanceEnabled : [];
  const enabledSet = new Set(enabled);
  const canEdit = isHost && !cfg.allowAllPlayers;
  controls.classList.toggle("is-disabled", !canEdit);

  if (!canEdit) {
    state.openAllowancePosKey = "";
    state.openAllowancePosCapKey = "";
    state.openAllowancePosScrollTop = 0;
    state.openAllowanceCardTypeCapKey = "";
    state.openAllowanceRegionCapKey = "";
    state.openAllowancePlayingStyleCapKey = "";
  } else if (state.openAllowancePosKey && !enabledSet.has(state.openAllowancePosKey)) {
    state.openAllowancePosKey = "";
    state.openAllowancePosCapKey = "";
    state.openAllowancePosScrollTop = 0;
    if (state.openAllowancePosKey === "cardType") state.openAllowanceCardTypeCapKey = "";
    if (state.openAllowancePosKey === "region") state.openAllowanceRegionCapKey = "";
    if (state.openAllowancePosKey === "playingStyle") state.openAllowancePlayingStyleCapKey = "";
  }

  const openPosKey = state.openAllowancePosKey;
  const openPosScrollTop = state.openAllowancePosScrollTop;
  if (openPosKey) {
    const existingOpenDropdown = document.querySelector(`[data-allowance-pos-dropdown][data-allowance-pos-key="${openPosKey}"] .allowance-pos-panel`);
    if (existingOpenDropdown) {
      state.openAllowancePosScrollTop = existingOpenDropdown.scrollTop;
    }
  }

  if (!canEdit) {
    panel.classList.remove("is-open");
    trigger.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  }

  const selectedKey = dropdown.dataset.selectedKey || "";
  addBtn.disabled = !canEdit || !selectedKey;

  const available = ALLOWANCE_CATEGORY_DEFS
    .filter((d) => !enabledSet.has(d.key))
    .sort((a, b) => a.label.localeCompare(b.label));
  const nextSelected = available.some((d) => d.key === selectedKey) ? selectedKey : "";

  dropdown.dataset.selectedKey = nextSelected;
  trigger.disabled = !canEdit || !available.length;
  trigger.classList.toggle("is-placeholder", !nextSelected);
  trigger.classList.toggle("open", panel.classList.contains("is-open"));
  label.textContent = available.find((d) => d.key === nextSelected)?.label || (available.length ? "Choose a category" : "All categories added");

  panel.innerHTML = available.length
    ? available.map((d) => `
      <button type="button" class="allowance-category-option ${d.key === nextSelected ? "is-selected" : ""}" data-allowance-category-option="${d.key}" ${canEdit ? "" : "disabled"}>
        <span>${escapeHtml(d.label)}</span>
        <span class="allowance-category-check" aria-hidden="true">✓</span>
      </button>
    `).join("")
    : '<div class="allowance-category-option is-selected" role="presentation"><span>All categories added</span></div>';

  panel.classList.toggle("is-disabled", !canEdit);

  if (!enabled.length) {
    list.innerHTML = '<div class="allowance-empty">No categories added. All players are allowed.</div>';
    return;
  }

  list.innerHTML = enabled.map((key) => {
    const def = ALLOWANCE_DEF_MAP.get(key);
    if (!def) return "";
    const value = cfg.allowance?.[key] ?? "";
    const capValue = normalizeAllowanceCapValue(cfg.allowanceCaps?.[key]);
    const isPosition = key === "position";
    const isFoot = key === "foot";
    const isCardType = key === "cardType";
    const isRegion = key === "region";
    const isPlayingStyle = key === "playingStyle";
    const isTextList = TEXT_ALLOWANCE_LIST_KEYS.has(key);
    const isMultiSelect = isPosition || isFoot || isCardType || isRegion || isPlayingStyle;
    const isRange = def.type === "range";
    const showCap = !isRange && !isFoot && !isCardType && !isRegion && !isPlayingStyle && !isTextList;

    const selectedPositions = normalizePositionValue(value);
    const effectivePositions = selectedPositions.length ? selectedPositions : POSITION_OPTIONS;
    const selectedSet = new Set(selectedPositions);
    const positionCapMap = parsePositionCapMap(cfg.allowanceCaps?.position, effectivePositions);

    const selectedCardTypes = normalizeCardTypeValue(value);
    const selectedCardTypeSet = new Set(selectedCardTypes);

    const selectedRegions = normalizeRegionValue(value);
    const selectedRegionSet = new Set(selectedRegions);

    const selectedPlayingStyles = normalizePlayingStyleValue(value);
    const selectedPlayingStyleSet = new Set(selectedPlayingStyles);

    const positionSelectHtml = `
      <div class="allowance-pos-dropdown ${canEdit ? "" : "is-disabled"} ${canEdit && state.openAllowancePosKey === key ? "is-open" : ""}" data-allowance-pos-dropdown data-allowance-pos-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-pos-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(selectedPositions.join(","))}"
        />
        <button
          type="button"
          class="allowance-pos-trigger"
          data-allowance-pos-trigger
          ${canEdit ? "" : "disabled"}
        >
          <span class="allowance-pos-summary">${escapeHtml(positionSummaryText(selectedPositions))}</span>
          <span class="allowance-pos-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-pos-panel" data-allowance-pos-panel>
          ${POSITION_OPTIONS.map((pos) => `
            <button
              type="button"
              class="allowance-pos-option ${selectedSet.has(pos) ? "is-selected" : ""}"
              data-allowance-pos-option="${pos}"
            >
              <span class="allowance-pos-check" aria-hidden="true"></span>
              <span>${pos}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;

    const cardTypeSelectHtml = `
      <div class="allowance-multi-dropdown ${canEdit ? "" : "is-disabled"} ${canEdit && state.openAllowanceCardTypeKey === key ? "is-open" : ""}" data-allowance-multi-dropdown="cardType" data-allowance-multi-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-multi-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(selectedCardTypes.join(","))}"
        />
        <button
          type="button"
          class="allowance-multi-trigger"
          data-allowance-multi-trigger="cardType"
          ${canEdit ? "" : "disabled"}
        >
          <span class="allowance-multi-summary">${escapeHtml(cardTypeSummaryText(selectedCardTypes))}</span>
          <span class="allowance-multi-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-multi-panel allowance-multi-panel--single-column" data-allowance-multi-panel="cardType">
          ${CARD_TYPE_OPTIONS.map((ct) => `
            <button
              type="button"
              class="allowance-multi-option ${selectedCardTypeSet.has(ct) ? "is-selected" : ""}"
              data-allowance-multi-option="cardType"
              data-allowance-multi-value="${escapeHtml(ct)}"
            >
              <span class="allowance-multi-check" aria-hidden="true"></span>
              <span>${escapeHtml(ct)}</span>
            </button>
          `).join("")}
          ${CARD_TYPE_OPTIONS.length === 0 ? '<div class="allowance-multi-empty">No options available</div>' : ''}
        </div>
      </div>
    `;

    const regionSelectHtml = `
      <div class="allowance-multi-dropdown ${canEdit ? "" : "is-disabled"} ${canEdit && state.openAllowanceRegionKey === key ? "is-open" : ""}" data-allowance-multi-dropdown="region" data-allowance-multi-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-multi-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(selectedRegions.join(","))}"
        />
        <button
          type="button"
          class="allowance-multi-trigger"
          data-allowance-multi-trigger="region"
          ${canEdit ? "" : "disabled"}
        >
          <span class="allowance-multi-summary">${escapeHtml(regionSummaryText(selectedRegions))}</span>
          <span class="allowance-multi-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-multi-panel" data-allowance-multi-panel="region">
          ${REGION_OPTIONS.map((r) => `
            <button
              type="button"
              class="allowance-multi-option ${selectedRegionSet.has(r) ? "is-selected" : ""}"
              data-allowance-multi-option="region"
              data-allowance-multi-value="${escapeHtml(r)}"
            >
              <span class="allowance-multi-check" aria-hidden="true"></span>
              <span>${escapeHtml(r)}</span>
            </button>
          `).join("")}
          ${REGION_OPTIONS.length === 0 ? '<div class="allowance-multi-empty">No options available</div>' : ''}
        </div>
      </div>
    `;

    const playingStyleSelectHtml = `
      <div class="allowance-multi-dropdown ${canEdit ? "" : "is-disabled"} ${canEdit && state.openAllowancePlayingStyleKey === key ? "is-open" : ""}" data-allowance-multi-dropdown="playingStyle" data-allowance-multi-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-multi-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(selectedPlayingStyles.join(","))}"
        />
        <button
          type="button"
          class="allowance-multi-trigger"
          data-allowance-multi-trigger="playingStyle"
          ${canEdit ? "" : "disabled"}
        >
          <span class="allowance-multi-summary">${escapeHtml(playingStyleSummaryText(selectedPlayingStyles))}</span>
          <span class="allowance-multi-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-multi-panel" data-allowance-multi-panel="playingStyle">
          ${PLAYING_STYLE_OPTIONS.map((ps) => `
            <button
              type="button"
              class="allowance-multi-option ${selectedPlayingStyleSet.has(ps) ? "is-selected" : ""}"
              data-allowance-multi-option="playingStyle"
              data-allowance-multi-value="${escapeHtml(ps)}"
            >
              <span class="allowance-multi-check" aria-hidden="true"></span>
              <span>${escapeHtml(ps)}</span>
            </button>
          `).join("")}
          ${PLAYING_STYLE_OPTIONS.length === 0 ? '<div class="allowance-multi-empty">No options available</div>' : ''}
        </div>
      </div>
    `;

    const regularInputHtml = `
      <input
        class="allowance-item-input"
        data-allowance-key="${key}"
        type="${def.type}"
        placeholder="${escapeHtml(def.placeholder)}"
        value="${escapeHtml(value)}"
        ${canEdit ? "" : "disabled"}
      />
    `;
    const selectedFoot = normalizeFootValue(value, { defaultAll: true });
    const selectedFootSet = new Set(selectedFoot);
    const footChecklistHtml = `
      <div class="allowance-foot-list" data-allowance-foot-list data-allowance-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-foot-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(selectedFoot.join(","))}"
        />
        ${FOOT_OPTIONS.map((foot) => `
          <button
            type="button"
            class="allowance-foot-option ${selectedFootSet.has(foot) ? "is-selected" : ""}"
            data-allowance-foot-option="${foot}"
            ${canEdit ? "" : "disabled"}
          >
            <span class="allowance-foot-check" aria-hidden="true"></span>
            <span>${foot}</span>
          </button>
        `).join("")}
      </div>
    `;
    const rangeValue = parseAllowanceRangeValue(value);
    const rangeInputHtml = `
      <div class="allowance-item-range-grid">
        <label class="allowance-item-range-col">
          <span class="allowance-item-range-label">Min</span>
          <input
            class="allowance-item-input allowance-item-range"
            data-allowance-key="${key}"
            data-allowance-range-bound="min"
            type="number"
            inputmode="numeric"
            step="1"
            placeholder="${escapeHtml(def.minPlaceholder || "-")}"
            value="${escapeHtml(rangeValue.min)}"
            ${canEdit ? "" : "disabled"}
          />
        </label>
        <label class="allowance-item-range-col">
          <span class="allowance-item-range-label">Max</span>
          <input
            class="allowance-item-input allowance-item-range"
            data-allowance-key="${key}"
            data-allowance-range-bound="max"
            type="number"
            inputmode="numeric"
            step="1"
            placeholder="${escapeHtml(def.maxPlaceholder || "-")}"
            value="${escapeHtml(rangeValue.max)}"
            ${canEdit ? "" : "disabled"}
          />
        </label>
      </div>
    `;
    const positionCapHtml = `
      <div class="allowance-pos-cap-wrap ${canEdit ? "" : "is-disabled"} ${canEdit && state.openAllowancePosCapKey === key ? "is-open" : ""}" data-allowance-pos-cap-wrap data-allowance-pos-cap-key="${key}">
        <span class="allowance-cap-label">Max cards</span>
        <button
          type="button"
          class="allowance-pos-cap-trigger"
          data-allowance-pos-cap-trigger
          ${canEdit ? "" : "disabled"}
        >
          <span class="allowance-pos-cap-summary">${escapeHtml(positionCapSummaryText(positionCapMap, selectedPositions))}</span>
          <span class="allowance-pos-cap-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-pos-cap-panel" data-allowance-pos-cap-panel>
          ${effectivePositions.length
            ? effectivePositions.map((pos) => `
              <label class="allowance-pos-cap-row">
                <span class="allowance-pos-cap-pos">${pos}</span>
                <input
                  class="allowance-pos-cap-input"
                  data-allowance-pos-cap-input
                  data-allowance-cap-key="position"
                  data-allowance-pos="${pos}"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="23"
                  step="1"
                  value="${escapeHtml(positionCapMap[pos] || "")}"
                  placeholder="-"
                  ${canEdit ? "" : "disabled"}
                />
              </label>
            `).join("")
            : '<div class="allowance-pos-cap-empty">No positions available</div>'}
        </div>
      </div>
    `;

    const cardTypeCapMap = parseCardTypeCapMap(cfg.allowanceCaps?.cardType, selectedCardTypes);
    const effectiveCardTypes = selectedCardTypes.length ? selectedCardTypes : CARD_TYPE_OPTIONS;
    const cardTypeCapHtml = `
      <div class="allowance-cap-wrap ${canEdit ? "" : "is-disabled"} ${canEdit && state.openAllowanceCardTypeCapKey === key ? "is-open" : ""}" data-allowance-cap-wrap data-allowance-cap-key="${key}">
        <span class="allowance-cap-label">Max cards</span>
        <button
          type="button"
          class="allowance-cap-trigger"
          data-allowance-cap-trigger="cardType"
          ${canEdit ? "" : "disabled"}
        >
          <span class="allowance-cap-summary">${escapeHtml(cardTypeCapSummaryText(cardTypeCapMap, selectedCardTypes))}</span>
          <span class="allowance-cap-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-cap-panel" data-allowance-cap-panel>
          ${effectiveCardTypes.length
            ? effectiveCardTypes.map((ct) => `
              <label class="allowance-cap-row">
                <span class="allowance-cap-item">${escapeHtml(ct)}</span>
                <input
                  class="allowance-cap-input"
                  data-allowance-cap-input
                  data-allowance-cap-key="cardType"
                  data-allowance-cap-value="${escapeHtml(ct)}"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="23"
                  step="1"
                  value="${escapeHtml(cardTypeCapMap[ct] || "")}"
                  placeholder="-"
                  ${canEdit ? "" : "disabled"}
                />
              </label>
            `).join("")
            : '<div class="allowance-cap-empty">No card types available</div>'}
        </div>
      </div>
    `;

    const regionCapMap = parseRegionCapMap(cfg.allowanceCaps?.region, selectedRegions);
    const effectiveRegions = selectedRegions.length ? selectedRegions : REGION_OPTIONS;
    const regionCapHtml = `
      <div class="allowance-cap-wrap allowance-cap-wrap--region ${canEdit ? "" : "is-disabled"} ${canEdit && state.openAllowanceRegionCapKey === key ? "is-open" : ""}" data-allowance-cap-wrap data-allowance-cap-key="${key}">
        <span class="allowance-cap-label">Max cards</span>
        <button
          type="button"
          class="allowance-cap-trigger"
          data-allowance-cap-trigger="region"
          ${canEdit ? "" : "disabled"}
        >
          <span class="allowance-cap-summary">${escapeHtml(regionCapSummaryText(regionCapMap, selectedRegions))}</span>
          <span class="allowance-cap-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-cap-panel" data-allowance-cap-panel>
          ${effectiveRegions.length
            ? effectiveRegions.map((r) => `
              <label class="allowance-cap-row">
                <span class="allowance-cap-item">${escapeHtml(r)}</span>
                <input
                  class="allowance-cap-input"
                  data-allowance-cap-input
                  data-allowance-cap-key="region"
                  data-allowance-cap-value="${escapeHtml(r)}"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="23"
                  step="1"
                  value="${escapeHtml(regionCapMap[r] || "")}"
                  placeholder="-"
                  ${canEdit ? "" : "disabled"}
                />
              </label>
            `).join("")
            : '<div class="allowance-cap-empty">No regions available</div>'}
        </div>
      </div>
    `;

    const playingStyleCapMap = parsePlayingStyleCapMap(cfg.allowanceCaps?.playingStyle, selectedPlayingStyles);
    const effectivePlayingStyles = selectedPlayingStyles.length ? selectedPlayingStyles : PLAYING_STYLE_OPTIONS;
    const playingStyleCapHtml = `
      <div class="allowance-cap-wrap allowance-cap-wrap--playing-style ${canEdit ? "" : "is-disabled"} ${canEdit && state.openAllowancePlayingStyleCapKey === key ? "is-open" : ""}" data-allowance-cap-wrap data-allowance-cap-key="${key}">
        <span class="allowance-cap-label">Max cards</span>
        <button
          type="button"
          class="allowance-cap-trigger"
          data-allowance-cap-trigger="playingStyle"
          ${canEdit ? "" : "disabled"}
        >
          <span class="allowance-cap-summary">${escapeHtml(playingStyleCapSummaryText(playingStyleCapMap, selectedPlayingStyles))}</span>
          <span class="allowance-cap-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-cap-panel" data-allowance-cap-panel>
          ${effectivePlayingStyles.length
            ? effectivePlayingStyles.map((ps) => `
              <label class="allowance-cap-row">
                <span class="allowance-cap-item">${escapeHtml(ps)}</span>
                <input
                  class="allowance-cap-input"
                  data-allowance-cap-input
                  data-allowance-cap-key="playingStyle"
                  data-allowance-cap-value="${escapeHtml(ps)}"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="23"
                  step="1"
                  value="${escapeHtml(playingStyleCapMap[ps] || "")}"
                  placeholder="-"
                  ${canEdit ? "" : "disabled"}
                />
              </label>
            `).join("")
            : '<div class="allowance-cap-empty">No playing styles available</div>'}
        </div>
      </div>
    `;

    const selectedClubs = normalizeTextAllowanceListValue(value);
    const clubCapMap = parseTextAllowanceCapMap(cfg.allowanceCaps?.[key], selectedClubs);
    const effectiveClubs = selectedClubs.length ? selectedClubs : Object.keys(clubCapMap);
    const clubCapMapString = stringifyTextAllowanceCapMap(clubCapMap, effectiveClubs);
    const singularLabel = String(def.label || key).toLowerCase();
    const isSearchActiveForKey = state.clubSearchKey === key;
    const clubBuilderHtml = `
      <div class="allowance-club-builder" data-allowance-club-builder data-allowance-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-club-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(effectiveClubs.join(","))}"
        />
        <input
          type="hidden"
          class="allowance-club-cap-hidden"
          data-allowance-cap-key="${key}"
          value="${escapeHtml(clubCapMapString)}"
        />
        <div class="allowance-club-add-row">
          <div class="allowance-club-search-wrap" data-allowance-club-search-wrap>
            <input
              class="allowance-item-input allowance-club-search"
              data-allowance-club-search="${key}"
              type="text"
              placeholder="Search ${escapeHtml(singularLabel)} and add"
              value="${escapeHtml(isSearchActiveForKey ? (state.clubSearchQuery || "") : "")}"
              autocomplete="off"
              ${canEdit ? "" : "disabled"}
            />
            <div class="allowance-club-suggest-panel ${isSearchActiveForKey && state.clubSearchOpen ? "is-open" : ""}" data-allowance-club-suggest-panel="${key}">
              ${isSearchActiveForKey && state.clubSearchLoading
                ? '<div class="allowance-club-suggest-empty">Searching...</div>'
                : (isSearchActiveForKey && state.clubSearchOptions.length
                  ? state.clubSearchOptions.map((club, idx) => `
                    <button
                      type="button"
                      class="allowance-club-suggest-option ${idx === state.clubSearchActiveIndex ? "is-active" : ""}"
                      data-allowance-club-suggestion="${escapeHtml(club)}"
                    >${escapeHtml(club)}</button>
                  `).join("")
                  : (isSearchActiveForKey && state.clubSearchQuery.trim()
                    ? `<div class="allowance-club-suggest-empty">No ${escapeHtml(singularLabel)} found.</div>`
                    : ""))}
            </div>
          </div>
          <button
            type="button"
            class="allowance-club-add-btn"
            data-allowance-club-add="${key}"
            ${canEdit ? "" : "disabled"}
          >
            Add ${escapeHtml(singularLabel)}
          </button>
          <button
            type="button"
            class="allowance-remove-btn allowance-club-remove-category"
            data-allowance-remove="${key}"
            ${canEdit ? "" : "disabled"}
          >
            Remove
          </button>
        </div>
        <div class="allowance-club-list" data-allowance-club-list="${key}">
          ${effectiveClubs.length
            ? effectiveClubs.map((club) => `
              <div class="allowance-club-row" data-allowance-club-item="${escapeHtml(club)}">
                <span class="allowance-club-name" title="${escapeHtml(club)}">${escapeHtml(club)}</span>
                <label class="allowance-club-cap-col">
                  <span class="allowance-club-cap-label">Max cards</span>
                  <input
                    class="allowance-club-cap-input"
                    data-allowance-club-cap="${escapeHtml(club)}"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    max="23"
                    step="1"
                    value="${escapeHtml(clubCapMap[club] || "")}"
                    placeholder="-"
                    ${canEdit ? "" : "disabled"}
                  />
                </label>
                <button
                  type="button"
                  class="allowance-club-row-remove"
                  data-allowance-club-remove="${escapeHtml(club)}"
                  ${canEdit ? "" : "disabled"}
                >
                  Remove
                </button>
              </div>
            `).join("")
            : `<div class="allowance-club-empty">No ${escapeHtml(singularLabel)} added yet.</div>`}
        </div>
      </div>
    `;

    const mainHtml = isPosition
      ? positionSelectHtml
      : isCardType
        ? cardTypeSelectHtml
        : isRegion
          ? regionSelectHtml
          : isPlayingStyle
            ? playingStyleSelectHtml
            : isTextList
              ? clubBuilderHtml
            : (isRange ? rangeInputHtml : (isFoot ? footChecklistHtml : regularInputHtml));

    const capHtmlForCategory = isPosition
      ? positionCapHtml
      : isCardType
        ? cardTypeCapHtml
        : isRegion
          ? regionCapHtml
          : isPlayingStyle
            ? playingStyleCapHtml
            : null;
    const hasCapColumn = !isTextList && Boolean(capHtmlForCategory || showCap);

    return `
      <div class="allowance-item" data-allowance-key="${key}">
        <label>${escapeHtml(def.label)}</label>
        <div class="allowance-item-row ${hasCapColumn ? "" : "allowance-item-row--no-cap"}">
          <div class="allowance-item-main">${mainHtml}</div>
          ${capHtmlForCategory ? capHtmlForCategory : (showCap ? `
          <label class="allowance-cap-wrap" title="Maximum cards per side for this category">
            <span class="allowance-cap-label">Max cards</span>
            <input
              class="allowance-item-cap"
              data-allowance-cap-key="${key}"
              type="number"
              inputmode="numeric"
              min="1"
              max="23"
              step="1"
              value="${escapeHtml(capValue)}"
              ${canEdit ? "" : "disabled"}
            />
          </label>
          ` : "")}
          ${isTextList ? "" : `<button type="button" class="allowance-remove-btn" data-allowance-remove="${key}" ${canEdit ? "" : "disabled"}>Remove</button>`}
        </div>
      </div>
    `;
  }).join("");

  if (openPosKey) {
    const openPanel = document.querySelector(`[data-allowance-pos-dropdown][data-allowance-pos-key="${openPosKey}"] .allowance-pos-panel`);
    if (openPanel) {
      openPanel.scrollTop = openPosScrollTop;
    }
  }
}

export function renderLobby() {
  const room = state.room;
  const isHost = state.mySide === "host";
  const cfg = room.config || defaultRoomConfig();
  const allowance = cfg.allowance || {};
  const allowanceEnabled = Array.isArray(cfg.allowanceEnabled) ? cfg.allowanceEnabled : [];
  const identity = isHost ? (room.host?.username || getCurrentIdentity().username) : (room.guest?.username || getCurrentIdentity().username);

  document.getElementById("lobbyCodeDisplay").textContent = room.code;
  document.getElementById("lobbyHostName").textContent = room.host?.username || "—";
  document.getElementById("lobbyGuestName").textContent = room.guest?.username || "Waiting…";
  const identityBtn = document.getElementById("lobbyIdentityBtn");
  if (identityBtn) {
    identityBtn.textContent = identity;
    identityBtn.title = identity;
  }

  const hostSlot = document.getElementById("lobbyHostSlot");
  const guestSlot = document.getElementById("lobbyGuestSlot");
  hostSlot.classList.toggle("is-ready", !!room.host);
  guestSlot.classList.toggle("is-ready", !!room.guest);

  // Avatar initials
  const hostAvatar = document.getElementById("lobbyHostAvatar");
  const guestAvatar = document.getElementById("lobbyGuestAvatar");
  if (hostAvatar) hostAvatar.textContent = (room.host?.username?.[0] || "?").toUpperCase();
  if (guestAvatar) {
    guestAvatar.textContent = room.guest ? (room.guest.username?.[0] || "?").toUpperCase() : "?";
    guestAvatar.classList.toggle("ls-avatar--empty", !room.guest);
  }

  // Guest sub: show "Share the invite link" only when no guest
  const guestSub = document.getElementById("lobbyGuestSub");
  if (guestSub) guestSub.hidden = !!room.guest;

  const guestStatusEl = document.getElementById("lobbyGuestStatus");
  if (guestStatusEl) {
    guestStatusEl.textContent = room.guest
      ? (room.ready?.guest ? "● ready" : "● connected")
      : "";
    guestStatusEl.classList.toggle("player-slot-status--ok", !!room.guest);
  }

  // Waiting pill in center
  const waitingEl = document.getElementById("lobbyWaiting");
  const waitingTextEl = document.getElementById("lobbyWaitingText");
  if (waitingEl) {
    const bothReady = room.ready?.host && room.ready?.guest;
    waitingEl.hidden = bothReady;
    if (waitingTextEl) {
      if (!room.guest) {
        waitingTextEl.textContent = "Waiting for opponent";
      } else if (isHost) {
        waitingTextEl.textContent = room.ready?.guest ? "Opponent ready" : "Waiting for opponent ready";
      } else {
        waitingTextEl.textContent = "Waiting for host to start";
      }
    }
  }

  const allowAllEl = document.getElementById("allowAllPlayersInput");
  const bansEl = document.getElementById("lobbyBansInput");
  const banDurationEl = document.getElementById("lobbyBanDurationInput");
  const pickDurationEl = document.getElementById("lobbyPickDurationInput");
  const revealModeEl = document.getElementById("lobbyRevealModeInput");
  const revealModeTrigger = document.getElementById("lobbyRevealModeTrigger");
  const revealModePanel = document.getElementById("lobbyRevealModePanel");
  const revealModeLabel = document.getElementById("lobbyRevealModeLabel");
  if (!isHost) state.openRevealModeMenu = false;
  if (allowAllEl && !allowAllEl.dataset.touched) allowAllEl.checked = Boolean(cfg.allowAllPlayers);
  if (bansEl && !bansEl.dataset.touched) bansEl.value = String(cfg.banCountPerSide ?? 0);
  if (banDurationEl && !banDurationEl.dataset.touched) banDurationEl.value = String(normalizeBanDurationSec(cfg.banDurationSec));
  if (pickDurationEl && !pickDurationEl.dataset.touched) pickDurationEl.value = String(normalizePickDurationSec(cfg.pickDurationSec));
  if (revealModeEl && !revealModeEl.dataset.touched) revealModeEl.value = normalizeRevealMode(cfg.revealMode);

  // Sync lv-settings-panel visual controls from config
  const banCountValEl = document.getElementById("banCountVal");
  if (banCountValEl) banCountValEl.textContent = String(cfg.banCountPerSide ?? 0);
  const banDurActive = normalizeBanDurationSec(cfg.banDurationSec);
  document.querySelectorAll("#banDurationPills .lv-time-pill").forEach((p) => {
    p.classList.toggle("is-active", Number(p.dataset.dur) === banDurActive);
  });
  const pickDurActive = normalizePickDurationSec(cfg.pickDurationSec);
  document.querySelectorAll("#pickDurationPills .lv-time-pill").forEach((p) => {
    p.classList.toggle("is-active", Number(p.dataset.dur) === pickDurActive);
  });
  const revealModeValue = normalizeRevealMode(revealModeEl?.value || cfg.revealMode);
  if (revealModeLabel) {
    revealModeLabel.textContent = revealModeValue === REVEAL_MODE_HIDDEN
      ? "Hide picks, reveal squad later"
      : "Show picks after each turn";
  }
  if (revealModePanel) {
    revealModePanel.querySelectorAll("[data-lobby-reveal-mode-option]").forEach((opt) => {
      const mode = String(opt.dataset.lobbyRevealModeOption || "").trim();
      opt.classList.toggle("is-selected", mode === revealModeValue);
    });
    revealModePanel.classList.toggle("is-open", Boolean(state.openRevealModeMenu));
  }
  if (revealModeTrigger) {
    revealModeTrigger.disabled = !isHost;
    revealModeTrigger.title = isHost ? "" : "Only the host can change Mode";
    revealModeTrigger.classList.toggle("open", Boolean(state.openRevealModeMenu));
    revealModeTrigger.setAttribute("aria-expanded", String(Boolean(state.openRevealModeMenu)));
  }

  const meta = document.getElementById("lobbyMeta");
  if (meta) {
    meta.textContent = "";
    meta.hidden = true;
  }

  const startBtn = document.getElementById("startDraftBtn");
  const lobbyLeaveBtn = document.getElementById("lobbyLeaveBtn");
  const kickGuestBtn = document.getElementById("kickGuestBtn");
  const settings = document.getElementById("lobbySettings");
  const settingsPanel = document.querySelector(".prep-col--settings");
  const guestReady = Boolean(room.ready?.guest);
  if (settingsPanel) settingsPanel.classList.toggle("is-readonly", !isHost);

  if (isHost) {
    if (lobbyLeaveBtn) {
      lobbyLeaveBtn.textContent = "Close room";
      lobbyLeaveBtn.classList.add("is-close-room");
    }
    startBtn.hidden = false;
    settings.hidden = false;

    const canStart = room.guest && guestReady;
    startBtn.disabled = !canStart;
    startBtn.textContent = !room.guest
      ? "Waiting for opponent…"
      : !guestReady
        ? "Waiting for opponent ready…"
        : "START DRAFT";
    startBtn.classList.toggle("btn--primary", canStart);
    startBtn.classList.toggle("btn--ghost", !canStart);
    if (kickGuestBtn) {
      const showKick = Boolean(room.guest);
      kickGuestBtn.hidden = !showKick;
      kickGuestBtn.disabled = !showKick;
      kickGuestBtn.style.display = showKick ? "inline-flex" : "none";
    }
  } else {
    if (lobbyLeaveBtn) {
      lobbyLeaveBtn.textContent = "Leave";
      lobbyLeaveBtn.classList.remove("is-close-room");
    }
    startBtn.hidden = false;
    startBtn.disabled = !room.host || !room.guest;
    startBtn.textContent = guestReady ? "UNREADY" : "READY";
    startBtn.classList.add("btn--primary");
    startBtn.classList.remove("btn--ghost");
    settings.hidden = false;
    if (kickGuestBtn) {
      kickGuestBtn.hidden = true;
      kickGuestBtn.disabled = true;
      kickGuestBtn.style.display = "none";
    }
  }

  if (allowAllEl) allowAllEl.disabled = !isHost;
  if (bansEl) bansEl.disabled = !isHost;
  if (banDurationEl) banDurationEl.disabled = !isHost;
  if (pickDurationEl) pickDurationEl.disabled = !isHost;
  if (revealModeTrigger) revealModeTrigger.disabled = !isHost;
  if (!isHost) state.openRevealModeMenu = false;
  renderAllowanceList({ isHost, cfg });

  const chatInput = document.getElementById("chatInput");
  const chatFormBtn = document.querySelector("#chatForm button[type='submit']");
  const canChat = Boolean(room.host && room.guest);
  if (chatInput) chatInput.disabled = !canChat;
  if (chatFormBtn) chatFormBtn.disabled = !canChat;
  if (chatInput && !canChat) {
    chatInput.placeholder = "Chat unlocks when both users are connected...";
  }

  renderClubSuggestionPanel();
  renderLobbyChat();
  cb.updateStageTabs?.();
}

async function loadLobbyStats(userId) {
  if (!userId) return;
  try {
    const [playersRes, plansRes] = await Promise.all([
      fetch(`/api/my-players?userId=${encodeURIComponent(userId)}`),
      fetch(`/api/game-plans?userId=${encodeURIComponent(userId)}`),
    ]);
    const players = playersRes.ok ? await playersRes.json() : [];
    const plans = plansRes.ok ? await plansRes.json() : [];
    const el = document.getElementById("lobbyHostStats");
    if (el) {
      const pc = Array.isArray(players) ? players.length : 0;
      const gc = Array.isArray(plans) ? plans.length : 0;
      el.innerHTML = `${pc} players<span class="ls-dot"> · </span>${gc} plans`;
    }
  } catch { /* ignore */ }
}

export function initLobby() {
  const q = parseQuery();
  const user = getUser();
  const code = getRoomCodeFromUrl();

  if (!code || code.length < 4) {
    const errorView = document.getElementById("viewError");
    const errorTitle = document.getElementById("errorTitle");
    const errorIcon = document.getElementById("errorStateIcon");
    const errorBtn = document.getElementById("errorLeaveBtn");
    if (errorView) {
      errorView.classList.remove("is-room-closed");
      errorView.classList.remove("is-host-lock");
      errorView.classList.remove("is-access-denied");
    }
    if (errorTitle) errorTitle.hidden = true;
    if (errorIcon) errorIcon.hidden = true;
    if (errorBtn) errorBtn.textContent = "Leave room";
    showView("viewError");
    document.getElementById("errorMessage").textContent = "Invalid room code.";
    return;
  }

  const settingsPanel = document.querySelector(".prep-col--settings");
  if (settingsPanel && !settingsPanel.dataset.readonlyGuardBound) {
    settingsPanel.dataset.readonlyGuardBound = "1";
    settingsPanel.addEventListener("click", (e) => {
      if (state.mySide === "host" || !settingsPanel.classList.contains("is-readonly")) return;
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - readonlySettingsToastAt < 1200) return;
      readonlySettingsToastAt = now;
      showToast("Only host can edit ban settings.");
    });
  }

  // Fetch filter options from server
  void fetchFilterOptions();

  const isJoin = q.mode === "join";
  const isHost = !isJoin;

  let host;
  let guest;
  if (isJoin) {
    host = { id: "remote-host", username: "Host" };
    guest = user
      ? { id: user.id, username: user.username }
      : { id: "guest-anon", username: "Guest" };
  } else {
    host = user
      ? { id: user.id, username: user.username }
      : { id: "local-host", username: "You" };
    guest = null;
  }

  state.room = emptyRoom(code, host, guest);
  state.mySide = isJoin ? "guest" : "host";
  state.phase = "lobby";

  // On reload from an active draft, skip the lobby flash and reconnect directly.
  // The async handler will fall back to showing the lobby if the server disagrees.
  let cachedPhase;
  try { cachedPhase = code ? sessionStorage.getItem(`efb_room_${code}_phase`) : null; } catch { /* ignore */ }
  const restoringDraft = cachedPhase === "draft" || cachedPhase === "ready";

  if (!restoringDraft) {
    showView("viewLobby");
    renderLobby();
  }

  if (user?.id) void loadLobbyStats(user.id);

  void registerAndPollPresence();

  document.getElementById("startDraftBtn")?.addEventListener("click", () => cb.startDraftFromLobby());

  document.getElementById("allowAllPlayersInput")?.addEventListener("change", (e) => {
    e.target.dataset.touched = "1";
    state.room.config.allowAllPlayers = Boolean(e.target.checked);
    renderLobby();
    scheduleLobbyConfigPush();
  });
  // Let user type freely; normalize only on commit (change/blur).
  document.getElementById("lobbyBansInput")?.addEventListener("input", (e) => {
    e.target.dataset.touched = "1";
    const raw = String(e.target.value ?? "");
    // Keep local config in sync when user enters a valid number,
    // but don't overwrite the input while typing.
    const n = Number(raw);
    if (Number.isFinite(n)) {
      state.room.config.banCountPerSide = Math.max(0, Math.floor(n));
      renderLobby();
      scheduleLobbyConfigPush();
    }
  });
  document.getElementById("lobbyBansInput")?.addEventListener("change", (e) => {
    e.target.dataset.touched = "1";
    const normalized = Math.max(0, Math.floor(Number(e.target.value) || 0));
    e.target.value = String(normalized);
    state.room.config.banCountPerSide = normalized;
    renderLobby();
    scheduleLobbyConfigPush();
  });
  document.getElementById("lobbyBanDurationInput")?.addEventListener("input", (e) => {
    e.target.dataset.touched = "1";
    const typed = String(e.target.value ?? "").trim();
    if (!typed) return;
    const n = Math.floor(Number(typed));
    if (!Number.isFinite(n)) return;
    state.room.config.banDurationSec = n;
  });
  document.getElementById("lobbyBanDurationInput")?.addEventListener("change", (e) => {
    e.target.dataset.touched = "1";
    const normalized = normalizeBanDurationSec(e.target.value);
    e.target.value = String(normalized);
    state.room.config.banDurationSec = normalized;
    scheduleLobbyConfigPush();
  });
  document.getElementById("lobbyPickDurationInput")?.addEventListener("input", (e) => {
    e.target.dataset.touched = "1";
    const typed = String(e.target.value ?? "").trim();
    if (!typed) return;
    const n = Math.floor(Number(typed));
    if (!Number.isFinite(n)) return;
    state.room.config.pickDurationSec = n;
  });
  document.getElementById("lobbyPickDurationInput")?.addEventListener("change", (e) => {
    e.target.dataset.touched = "1";
    const normalized = normalizePickDurationSec(e.target.value);
    e.target.value = String(normalized);
    state.room.config.pickDurationSec = normalized;
    scheduleLobbyConfigPush();
  });

  // Ban count stepper
  const _stepBans = (delta) => {
    if (state.mySide !== "host") return;
    const bansEl = document.getElementById("lobbyBansInput");
    if (!bansEl) return;
    const next = Math.max(0, Math.floor(Number(bansEl.value) || 0) + delta);
    bansEl.value = String(next);
    state.room.config.banCountPerSide = next;
    renderLobby();
    scheduleLobbyConfigPush();
  };
  document.getElementById("banCountMinus")?.addEventListener("click", () => _stepBans(-1));
  document.getElementById("banCountPlus")?.addEventListener("click", () => _stepBans(1));

  // Ban duration pills
  document.getElementById("banDurationPills")?.addEventListener("click", (e) => {
    if (state.mySide !== "host") return;
    const pill = e.target.closest(".lv-time-pill");
    if (!pill) return;
    const dur = Number(pill.dataset.dur);
    if (!dur) return;
    const input = document.getElementById("lobbyBanDurationInput");
    if (input) input.value = String(dur);
    state.room.config.banDurationSec = dur;
    renderLobby();
    scheduleLobbyConfigPush();
  });

  // Pick duration pills
  document.getElementById("pickDurationPills")?.addEventListener("click", (e) => {
    if (state.mySide !== "host") return;
    const pill = e.target.closest(".lv-time-pill");
    if (!pill) return;
    const dur = Number(pill.dataset.dur);
    if (!dur) return;
    const input = document.getElementById("lobbyPickDurationInput");
    if (input) input.value = String(dur);
    state.room.config.pickDurationSec = dur;
    renderLobby();
    scheduleLobbyConfigPush();
  });

  const closeAllLobbyDropdowns = () => {
    const categoryPanel = document.getElementById("allowanceCategoryPanel");
    const categoryTrigger = document.getElementById("allowanceCategoryTrigger");
    const modePanel = document.getElementById("lobbyRevealModePanel");
    const modeTrigger = document.getElementById("lobbyRevealModeTrigger");
    if (categoryPanel) categoryPanel.classList.remove("is-open");
    if (categoryTrigger) {
      categoryTrigger.classList.remove("open");
      categoryTrigger.setAttribute("aria-expanded", "false");
    }
    if (modePanel) modePanel.classList.remove("is-open");
    if (modeTrigger) {
      modeTrigger.classList.remove("open");
      modeTrigger.setAttribute("aria-expanded", "false");
    }

    state.openRevealModeMenu = false;

    document.querySelectorAll("[data-allowance-pos-dropdown].is-open").forEach((el) => {
      el.classList.remove("is-open");
    });
    document.querySelectorAll("[data-allowance-pos-cap-wrap].is-open").forEach((el) => {
      el.classList.remove("is-open");
    });
    document.querySelectorAll("[data-allowance-cap-wrap].is-open").forEach((el) => {
      el.classList.remove("is-open");
    });
    document.querySelectorAll("[data-allowance-multi-dropdown].is-open").forEach((el) => {
      el.classList.remove("is-open");
    });

    state.openAllowancePosKey = "";
    state.openAllowancePosCapKey = "";
    state.openAllowanceCardTypeKey = "";
    state.openAllowanceCardTypeCapKey = "";
    state.openAllowanceRegionKey = "";
    state.openAllowanceRegionCapKey = "";
    state.openAllowancePlayingStyleKey = "";
    state.openAllowancePlayingStyleCapKey = "";
    state.clubSearchOpen = false;
    state.clubSearchActiveIndex = -1;
  };

  document.getElementById("lobbyRevealModeTrigger")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (state.mySide !== "host" || e.currentTarget.disabled) return;
    const willOpen = !state.openRevealModeMenu;
    closeAllLobbyDropdowns();
    state.openRevealModeMenu = willOpen;
    renderLobby();
  });
  document.getElementById("lobbyRevealModePanel")?.addEventListener("click", (e) => {
    const option = e.target.closest("[data-lobby-reveal-mode-option]");
    if (!option || state.mySide !== "host") return;
    const mode = normalizeRevealMode(option.dataset.lobbyRevealModeOption);
    const input = document.getElementById("lobbyRevealModeInput");
    if (input) {
      input.value = mode;
      input.dataset.touched = "1";
    }
    state.room.config.revealMode = mode;
    state.openRevealModeMenu = false;
    renderLobby();
    scheduleLobbyConfigPush();
  });

  document.getElementById("addAllowanceBtn")?.addEventListener("click", () => {
    if (state.mySide !== "host") return;
    const dropdown = document.getElementById("allowanceCategoryDd");
    const key = dropdown?.dataset.selectedKey || "";
    if (!key) return;
    const cfg = state.room.config || defaultRoomConfig();
    const enabled = new Set(cfg.allowanceEnabled || []);
    if (enabled.has(key)) return;
    enabled.add(key);
    state.room.config.allowanceEnabled = [...enabled];
    if (key === "foot") {
      state.room.config.allowance[key] = normalizeFootValue(state.room.config.allowance[key], { defaultAll: true }).join(",");
    } else if (TEXT_ALLOWANCE_LIST_KEYS.has(key)) {
      state.room.config.allowance[key] = normalizeTextAllowanceListValue(state.room.config.allowance[key]).join(",");
    } else {
      state.room.config.allowance[key] = state.room.config.allowance[key] || "";
    }
    if (TEXT_ALLOWANCE_LIST_KEYS.has(key)) {
      state.room.config.allowanceCaps[key] = stringifyTextAllowanceCapMap(
        state.room.config.allowanceCaps[key],
        normalizeTextAllowanceListValue(state.room.config.allowance[key]),
      );
    } else {
      state.room.config.allowanceCaps[key] = normalizeAllowanceCapValue(state.room.config.allowanceCaps[key]);
    }
    renderLobby();
    const node = document.querySelector(`[data-allowance-key="${key}"]`);
    if (node) {
      node.classList.add("is-added");
      setTimeout(() => node.classList.remove("is-added"), 220);
    }

    if (dropdown) dropdown.dataset.selectedKey = "";
    const trigger = document.getElementById("allowanceCategoryTrigger");
    const label = document.getElementById("allowanceCategoryLabel");
    const panel = document.getElementById("allowanceCategoryPanel");
    if (trigger) trigger.classList.remove("open");
    if (trigger) trigger.classList.add("is-placeholder");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (panel) panel.classList.remove("is-open");
    if (label) label.textContent = "Choose a category";

    scheduleLobbyConfigPush();
  });

  document.getElementById("allowanceList")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-allowance-remove]");
    if (btn && state.mySide === "host") {
      const key = btn.dataset.allowanceRemove;
      const cfg = state.room.config || defaultRoomConfig();
      cfg.allowanceEnabled = (cfg.allowanceEnabled || []).filter((k) => k !== key);
      cfg.allowance[key] = "";
      cfg.allowanceCaps[key] = "";
      if (TEXT_ALLOWANCE_LIST_KEYS.has(key)) clearClubSearchState();
      if (state.openAllowancePosKey === key) state.openAllowancePosKey = "";
      if (state.openAllowancePosCapKey === key) state.openAllowancePosCapKey = "";
      if (state.openAllowanceCardTypeCapKey === key) state.openAllowanceCardTypeCapKey = "";
      if (state.openAllowanceRegionCapKey === key) state.openAllowanceRegionCapKey = "";
      if (state.openAllowancePlayingStyleCapKey === key) state.openAllowancePlayingStyleCapKey = "";
      renderLobby();
      scheduleLobbyConfigPush();
      return;
    }

    const trigger = e.target.closest("[data-allowance-pos-trigger]");
    if (trigger && state.mySide === "host") {
      if (trigger.disabled) return;
      const dropdown = trigger.closest("[data-allowance-pos-dropdown]");
      if (!dropdown) return;
      const key = String(dropdown.dataset.allowancePosKey || "").trim();
      const willOpen = !dropdown.classList.contains("is-open");
      closeAllLobbyDropdowns();
      if (willOpen) {
        dropdown.classList.add("is-open");
        state.openAllowancePosKey = key;
      }
      return;
    }

    const option = e.target.closest("[data-allowance-pos-option]");
    if (option && state.mySide === "host") {
      const dropdown = option.closest("[data-allowance-pos-dropdown]");
      if (!dropdown) return;
      const key = String(dropdown.dataset.allowancePosKey || "").trim();
      const panel = dropdown.querySelector(".allowance-pos-panel");
      if (panel) state.openAllowancePosScrollTop = panel.scrollTop;
      option.classList.toggle("is-selected");
      const selected = Array.from(dropdown.querySelectorAll("[data-allowance-pos-option].is-selected"))
        .map((el) => String(el.dataset.allowancePosOption || "").trim())
        .filter(Boolean);
      const normalized = normalizePositionValue(selected.join(","));
      const hiddenInput = dropdown.querySelector(".allowance-pos-hidden");
      if (hiddenInput) hiddenInput.value = normalized.join(",");
      const summary = dropdown.querySelector(".allowance-pos-summary");
      if (summary) summary.textContent = positionSummaryText(normalized);
      state.room.config.allowance.position = normalized.join(",");
      state.room.config.allowanceCaps.position = stringifyPositionCapMap(state.room.config.allowanceCaps.position, normalized);
      renderLobby();
      scheduleLobbyConfigPush();
      return;
    }

    const footOption = e.target.closest("[data-allowance-foot-option]");
    if (footOption && state.mySide === "host") {
      const listWrap = footOption.closest("[data-allowance-foot-list]");
      if (!listWrap || footOption.disabled) return;
      if (footOption.classList.contains("is-selected")) {
        const selectedCount = listWrap.querySelectorAll("[data-allowance-foot-option].is-selected").length;
        if (selectedCount <= 1) {
          showToast("You have to select at least 1 option.");
          return;
        }
      }
      footOption.classList.toggle("is-selected");
      const selected = Array.from(listWrap.querySelectorAll("[data-allowance-foot-option].is-selected"))
        .map((el) => String(el.dataset.allowanceFootOption || "").trim())
        .filter((v) => FOOT_OPTIONS.includes(v));
      const normalized = normalizeFootValue(selected.join(","));
      const hiddenInput = listWrap.querySelector(".allowance-foot-hidden");
      if (hiddenInput) hiddenInput.value = normalized.join(",");
      state.room.config.allowance.foot = normalized.join(",");
      scheduleLobbyConfigPush();
      return;
    }

    const clubAddBtn = e.target.closest("[data-allowance-club-add]");
    if (clubAddBtn && state.mySide === "host") {
      if (clubAddBtn.disabled) return;
      const key = String(clubAddBtn.dataset.allowanceClubAdd || "").trim();
      if (!TEXT_ALLOWANCE_LIST_KEYS.has(key)) return;
      const item = clubAddBtn.closest(".allowance-item");
      const searchInput = item?.querySelector(".allowance-club-search");
      if (!searchInput) return;

      const typed = String(searchInput.value || "").replace(/\s+/g, " ").trim();
      if (!typed) return;
      if (!addTextAllowanceValue(key, typed)) return;
      renderLobby();
      const nextSearchInput = document.querySelector(`.allowance-club-search[data-allowance-club-search="${key}"]`);
      if (nextSearchInput) nextSearchInput.focus();
      scheduleLobbyConfigPush();
      return;
    }

    const clubSuggestion = e.target.closest("[data-allowance-club-suggestion]");
    if (clubSuggestion && state.mySide === "host") {
      const value = String(clubSuggestion.dataset.allowanceClubSuggestion || "").replace(/\s+/g, " ").trim();
      if (!value) return;
      const key = String(clubSuggestion.closest(".allowance-item")?.dataset.allowanceKey || state.clubSearchKey || "club").trim();
      state.clubSearchKey = key;
      state.clubSearchQuery = value;
      state.clubSearchOpen = false;
      state.clubSearchActiveIndex = -1;
      renderClubSuggestionPanel();
      const searchInput = document.querySelector(`.allowance-club-search[data-allowance-club-search="${key}"]`);
      if (searchInput) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }
      return;
    }

    const clubRemoveBtn = e.target.closest("[data-allowance-club-remove]");
    if (clubRemoveBtn && state.mySide === "host") {
      if (clubRemoveBtn.disabled) return;
      const key = String(clubRemoveBtn.closest(".allowance-item")?.dataset.allowanceKey || "").trim();
      if (!TEXT_ALLOWANCE_LIST_KEYS.has(key)) return;
      const club = String(clubRemoveBtn.dataset.allowanceClubRemove || "").replace(/\s+/g, " ").trim();
      if (!club) return;
      const clubs = normalizeTextAllowanceListValue(state.room.config.allowance[key] || "").filter((c) => c.toLowerCase() !== club.toLowerCase());
      const capMap = parseTextAllowanceCapMap(
        state.room.config.allowanceCaps[key],
        normalizeTextAllowanceListValue(state.room.config.allowance[key] || ""),
      );
      Object.keys(capMap).forEach((name) => {
        if (name.toLowerCase() === club.toLowerCase()) delete capMap[name];
      });
      state.room.config.allowance[key] = clubs.join(",");
      state.room.config.allowanceCaps[key] = stringifyTextAllowanceCapMap(capMap, clubs);
      renderLobby();
      scheduleLobbyConfigPush();
      return;
    }

    const multiTrigger = e.target.closest("[data-allowance-multi-trigger]");
    if (multiTrigger && state.mySide === "host") {
      if (multiTrigger.disabled) return;
      const dropdown = multiTrigger.closest("[data-allowance-multi-dropdown]");
      if (!dropdown) return;
      const multiType = String(multiTrigger.dataset.allowanceMultiTrigger || "").trim();
      const key = String(dropdown.dataset.allowanceMultiKey || "").trim();
      if (!multiType || !key) return;
      const willOpen = !dropdown.classList.contains("is-open");
      closeAllLobbyDropdowns();
      if (willOpen) {
        dropdown.classList.add("is-open");
        if (multiType === "cardType") {
          state.openAllowanceCardTypeKey = key;
        } else if (multiType === "region") {
          state.openAllowanceRegionKey = key;
        } else if (multiType === "playingStyle") {
          state.openAllowancePlayingStyleKey = key;
        }
      }
      return;
    }

    const multiOption = e.target.closest("[data-allowance-multi-option]");
    if (multiOption && state.mySide === "host") {
      const dropdown = multiOption.closest("[data-allowance-multi-dropdown]");
      if (!dropdown || multiOption.disabled) return;
      const multiType = String(multiOption.dataset.allowanceMultiOption || "").trim();
      const key = String(dropdown.dataset.allowanceMultiKey || "").trim();
      if (!key) return;
      multiOption.classList.toggle("is-selected");
      const selected = Array.from(dropdown.querySelectorAll("[data-allowance-multi-option].is-selected"))
        .map((el) => String(el.dataset.allowanceMultiValue || "").trim())
        .filter(Boolean);
      let normalized = [];
      let summaryText = "";
      if (multiType === "cardType") {
        normalized = normalizeCardTypeValue(selected.join(","));
        summaryText = cardTypeSummaryText(normalized);
      } else if (multiType === "region") {
        normalized = normalizeRegionValue(selected.join(","));
        summaryText = regionSummaryText(normalized);
      } else if (multiType === "playingStyle") {
        normalized = normalizePlayingStyleValue(selected.join(","));
        summaryText = playingStyleSummaryText(normalized);
      }
      const hiddenInput = dropdown.querySelector(".allowance-multi-hidden");
      if (hiddenInput) hiddenInput.value = normalized.join(",");
      const summary = dropdown.querySelector(".allowance-multi-summary");
      if (summary) summary.textContent = summaryText;
      state.room.config.allowance[key] = normalized.join(",");
      renderLobby();
      scheduleLobbyConfigPush();
      return;
    }

    const capTrigger = e.target.closest("[data-allowance-pos-cap-trigger]");
    if (capTrigger && state.mySide === "host") {
      const wrap = capTrigger.closest("[data-allowance-pos-cap-wrap]");
      if (!wrap || capTrigger.disabled) return;
      const key = String(wrap.dataset.allowancePosCapKey || "").trim();
      const willOpen = !wrap.classList.contains("is-open");
      closeAllLobbyDropdowns();
      if (willOpen) {
        wrap.classList.add("is-open");
        state.openAllowancePosCapKey = key;
      }
      return;
    }

    const multiCapTrigger = e.target.closest("[data-allowance-cap-trigger]");
    if (multiCapTrigger && state.mySide === "host") {
      const wrap = multiCapTrigger.closest("[data-allowance-cap-wrap]");
      if (!wrap || multiCapTrigger.disabled) return;
      const key = String(wrap.dataset.allowanceCapKey || "").trim();
      const capType = String(multiCapTrigger.dataset.allowanceCapTrigger || "").trim();
      const willOpen = !wrap.classList.contains("is-open");
      closeAllLobbyDropdowns();
      if (willOpen) {
        wrap.classList.add("is-open");
        if (capType === "cardType") {
          state.openAllowanceCardTypeCapKey = key;
        } else if (capType === "region") {
          state.openAllowanceRegionCapKey = key;
        } else if (capType === "playingStyle") {
          state.openAllowancePlayingStyleCapKey = key;
        }
      }
      return;
    }
  });

  document.getElementById("allowanceList")?.addEventListener("change", (e) => {
    const capInput = e.target.closest(".allowance-cap-input");
    if (capInput && state.mySide === "host") {
      const capType = String(capInput.dataset.allowanceCapKey || "").trim();
      const capValue = String(capInput.dataset.allowanceCapValue || "").trim();
      const key = capInput.closest("[data-allowance-cap-wrap]")?.dataset.allowanceCapKey;
      if (!capType || !capValue || !key) return;

      const n = Number(capInput.value);
      if (Number.isFinite(n) && n > FIXED_PICKS_PER_SIDE) {
        capInput.value = String(FIXED_PICKS_PER_SIDE);
      }
      if (Number.isFinite(n) && n < 1) {
        capInput.value = "";
      }

      let capMap = {};
      let normalizedCap = normalizeAllowanceCapValue(capInput.value);

      if (capType === "cardType") {
        const selected = normalizeCardTypeValue(state.room.config.allowance.cardType || "");
        capMap = parseCardTypeCapMap(state.room.config.allowanceCaps.cardType, selected);
      } else if (capType === "region") {
        const selected = normalizeRegionValue(state.room.config.allowance.region || "");
        capMap = parseRegionCapMap(state.room.config.allowanceCaps.region, selected);
      } else if (capType === "playingStyle") {
        const selected = normalizePlayingStyleValue(state.room.config.allowance.playingStyle || "");
        capMap = parsePlayingStyleCapMap(state.room.config.allowanceCaps.playingStyle, selected);
      } else {
        return;
      }

      if (normalizedCap) capMap[capValue] = normalizedCap;
      else delete capMap[capValue];

      if (capType === "cardType") {
        const selected = normalizeCardTypeValue(state.room.config.allowance.cardType || "");
        state.room.config.allowanceCaps.cardType = stringifyCardTypeCapMap(capMap, selected);
      } else if (capType === "region") {
        const selected = normalizeRegionValue(state.room.config.allowance.region || "");
        state.room.config.allowanceCaps.region = stringifyRegionCapMap(capMap, selected);
      } else if (capType === "playingStyle") {
        const selected = normalizePlayingStyleValue(state.room.config.allowance.playingStyle || "");
        state.room.config.allowanceCaps.playingStyle = stringifyPlayingStyleCapMap(capMap, selected);
      }

      scheduleLobbyConfigPush();
      return;
    }
  });

  const allowanceDropdown = document.getElementById("allowanceCategoryDd");
  const allowanceTrigger = document.getElementById("allowanceCategoryTrigger");
  const allowancePanel = document.getElementById("allowanceCategoryPanel");
  const allowanceLabel = document.getElementById("allowanceCategoryLabel");

  allowanceTrigger?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (state.mySide !== "host" || allowanceTrigger.disabled || !allowanceDropdown || !allowancePanel) return;
    const willOpen = !allowancePanel.classList.contains("is-open");
    closeAllLobbyDropdowns();
    if (willOpen) {
      allowancePanel.classList.add("is-open");
      allowanceTrigger.classList.add("open");
      allowanceTrigger.setAttribute("aria-expanded", "true");
    }
  });

  allowancePanel?.addEventListener("click", (e) => {
    const option = e.target.closest("[data-allowance-category-option]");
    if (!option || state.mySide !== "host" || !allowanceDropdown || !allowanceTrigger || !allowanceLabel || !allowancePanel) return;
    const key = String(option.dataset.allowanceCategoryOption || "").trim();
    if (!key) return;
    allowanceDropdown.dataset.selectedKey = key;
    allowanceLabel.textContent = ALLOWANCE_DEF_MAP.get(key)?.label || key;
    allowancePanel.classList.remove("is-open");
    allowanceTrigger.classList.remove("open");
    allowanceTrigger.setAttribute("aria-expanded", "false");
    renderLobby();
  });

  document.getElementById("allowanceList")?.addEventListener("input", (e) => {
    const searchInput = e.target.closest(".allowance-club-search");
    if (searchInput && state.mySide === "host") {
      const key = String(searchInput.dataset.allowanceClubSearch || "club").trim();
      scheduleClubSuggestions(key, searchInput.value);
      return;
    }

    const input = e.target.closest(".allowance-item-input");
    if (!input || state.mySide !== "host") return;
    const key = input.dataset.allowanceKey;
    if (!key) return;
    if (input.classList.contains("allowance-item-range")) {
      const item = input.closest(".allowance-item");
      const minInput = item?.querySelector(`.allowance-item-range[data-allowance-key="${key}"][data-allowance-range-bound="min"]`);
      const maxInput = item?.querySelector(`.allowance-item-range[data-allowance-key="${key}"][data-allowance-range-bound="max"]`);
      const normalizedRange = normalizeAllowanceRangeValue(minInput?.value, maxInput?.value);
      const parsedRange = parseAllowanceRangeValue(normalizedRange);
      if (minInput) minInput.value = parsedRange.min;
      if (maxInput) maxInput.value = parsedRange.max;
      state.room.config.allowance[key] = normalizedRange;
    } else {
      state.room.config.allowance[key] = readAllowanceFieldValue(input);
    }
    scheduleLobbyConfigPush();
  });
  document.getElementById("allowanceList")?.addEventListener("change", (e) => {
    const clubCapInput = e.target.closest(".allowance-club-cap-input");
    if (clubCapInput && state.mySide === "host") {
      const key = String(clubCapInput.closest(".allowance-item")?.dataset.allowanceKey || "").trim();
      if (!TEXT_ALLOWANCE_LIST_KEYS.has(key)) return;
      const club = String(clubCapInput.dataset.allowanceClubCap || "").replace(/\s+/g, " ").trim();
      if (!club) return;
      const clubs = normalizeTextAllowanceListValue(state.room.config.allowance[key] || "");
      const capMap = parseTextAllowanceCapMap(state.room.config.allowanceCaps[key], clubs);
      const normalizedCap = normalizeAllowanceCapValue(clubCapInput.value);
      clubCapInput.value = normalizedCap;
      if (normalizedCap) capMap[club] = normalizedCap;
      else delete capMap[club];
      state.room.config.allowanceCaps[key] = stringifyTextAllowanceCapMap(capMap, clubs);
      scheduleLobbyConfigPush();
      return;
    }

    const capInput = e.target.closest(".allowance-item-cap");
    if (capInput && state.mySide === "host") {
      const key = capInput.dataset.allowanceCapKey;
      if (!key) return;
      const normalizedCap = normalizeAllowanceCapValue(capInput.value);
      capInput.value = normalizedCap;
      state.room.config.allowanceCaps[key] = normalizedCap;
      scheduleLobbyConfigPush();
      return;
    }
    const input = e.target.closest(".allowance-item-input");
    if (!input || state.mySide !== "host") return;
    const key = input.dataset.allowanceKey;
    if (!key) return;
    if (input.classList.contains("allowance-item-range")) {
      const item = input.closest(".allowance-item");
      const minInput = item?.querySelector(`.allowance-item-range[data-allowance-key="${key}"][data-allowance-range-bound="min"]`);
      const maxInput = item?.querySelector(`.allowance-item-range[data-allowance-key="${key}"][data-allowance-range-bound="max"]`);
      const normalizedRange = normalizeAllowanceRangeValue(minInput?.value, maxInput?.value);
      const parsedRange = parseAllowanceRangeValue(normalizedRange);
      if (minInput) minInput.value = parsedRange.min;
      if (maxInput) maxInput.value = parsedRange.max;
      state.room.config.allowance[key] = normalizedRange;
    } else {
      state.room.config.allowance[key] = readAllowanceFieldValue(input);
    }
    scheduleLobbyConfigPush();
  });
  document.getElementById("allowanceList")?.addEventListener("change", (e) => {
    const capInput = e.target.closest(".allowance-pos-cap-input");
    if (!capInput || state.mySide !== "host") return;
    const pos = String(capInput.dataset.allowancePos || "").trim().toUpperCase();
    if (!POSITION_OPTIONS.includes(pos)) return;
    const selected = normalizePositionValue(state.room.config.allowance.position || "");
    const capMap = parsePositionCapMap(state.room.config.allowanceCaps.position, selected);
    const normalizedCap = normalizeAllowanceCapValue(capInput.value);
    capInput.value = normalizedCap;
    if (normalizedCap) capMap[pos] = normalizedCap;
    else delete capMap[pos];
    state.room.config.allowanceCaps.position = stringifyPositionCapMap(capMap, selected);
    scheduleLobbyConfigPush();
  });
  document.getElementById("allowanceList")?.addEventListener("input", (e) => {
    const clubCapInput = e.target.closest(".allowance-club-cap-input");
    if (clubCapInput && state.mySide === "host") {
      const key = String(clubCapInput.closest(".allowance-item")?.dataset.allowanceKey || "").trim();
      if (!TEXT_ALLOWANCE_LIST_KEYS.has(key)) return;
      const club = String(clubCapInput.dataset.allowanceClubCap || "").replace(/\s+/g, " ").trim();
      if (!club) return;
      const clubs = normalizeTextAllowanceListValue(state.room.config.allowance[key] || "");
      const capMap = parseTextAllowanceCapMap(state.room.config.allowanceCaps[key], clubs);
      if (clubCapInput.value === "") {
        delete capMap[club];
        state.room.config.allowanceCaps[key] = stringifyTextAllowanceCapMap(capMap, clubs);
        scheduleLobbyConfigPush();
        return;
      }
      const n = Number(clubCapInput.value);
      if (Number.isFinite(n) && n > FIXED_PICKS_PER_SIDE) {
        clubCapInput.value = String(FIXED_PICKS_PER_SIDE);
      }
      if (Number.isFinite(n) && n < 1) {
        clubCapInput.value = "";
      }
      const normalizedCap = normalizeAllowanceCapValue(clubCapInput.value);
      if (normalizedCap) capMap[club] = normalizedCap;
      else delete capMap[club];
      state.room.config.allowanceCaps[key] = stringifyTextAllowanceCapMap(capMap, clubs);
      scheduleLobbyConfigPush();
      return;
    }

    const capInput = e.target.closest(".allowance-item-cap");
    if (capInput && state.mySide === "host") {
      const key = capInput.dataset.allowanceCapKey;
      if (!key) return;
      if (capInput.value === "") {
        state.room.config.allowanceCaps[key] = "";
        scheduleLobbyConfigPush();
        return;
      }
      const n = Number(capInput.value);
      if (Number.isFinite(n) && n > FIXED_PICKS_PER_SIDE) {
        capInput.value = String(FIXED_PICKS_PER_SIDE);
      }
      if (Number.isFinite(n) && n < 1) {
        capInput.value = "";
      }
      state.room.config.allowanceCaps[key] = normalizeAllowanceCapValue(capInput.value);
      scheduleLobbyConfigPush();
      return;
    }

    const posCapInput = e.target.closest(".allowance-pos-cap-input");
    if (posCapInput && state.mySide === "host") {
      const pos = String(posCapInput.dataset.allowancePos || "").trim().toUpperCase();
      if (!POSITION_OPTIONS.includes(pos)) return;
      if (posCapInput.value === "") {
        const selected = normalizePositionValue(state.room.config.allowance.position || "");
        const capMap = parsePositionCapMap(state.room.config.allowanceCaps.position, selected);
        delete capMap[pos];
        state.room.config.allowanceCaps.position = stringifyPositionCapMap(capMap, selected);
        scheduleLobbyConfigPush();
        return;
      }
      const n = Number(posCapInput.value);
      if (Number.isFinite(n) && n > FIXED_PICKS_PER_SIDE) {
        posCapInput.value = String(FIXED_PICKS_PER_SIDE);
      }
      if (Number.isFinite(n) && n < 1) {
        posCapInput.value = "";
      }
      const selected = normalizePositionValue(state.room.config.allowance.position || "");
      const capMap = parsePositionCapMap(state.room.config.allowanceCaps.position, selected);
      const normalizedCap = normalizeAllowanceCapValue(posCapInput.value);
      if (normalizedCap) capMap[pos] = normalizedCap;
      else delete capMap[pos];
      state.room.config.allowanceCaps.position = stringifyPositionCapMap(capMap, selected);
      scheduleLobbyConfigPush();
      return;
    }
  });
  document.getElementById("allowanceList")?.addEventListener("keydown", (e) => {
    const searchInput = e.target.closest(".allowance-club-search");
    if (!searchInput || state.mySide !== "host") return;
    const key = String(searchInput.dataset.allowanceClubSearch || "club").trim();
    state.clubSearchKey = key;
    if (e.key === "ArrowDown") {
      if (!state.clubSearchOptions.length) return;
      e.preventDefault();
      const next = state.clubSearchActiveIndex < 0
        ? 0
        : Math.min(state.clubSearchOptions.length - 1, state.clubSearchActiveIndex + 1);
      state.clubSearchActiveIndex = next;
      state.clubSearchOpen = true;
      renderClubSuggestionPanel();
      return;
    }
    if (e.key === "ArrowUp") {
      if (!state.clubSearchOptions.length) return;
      e.preventDefault();
      const next = state.clubSearchActiveIndex <= 0
        ? 0
        : state.clubSearchActiveIndex - 1;
      state.clubSearchActiveIndex = next;
      state.clubSearchOpen = true;
      renderClubSuggestionPanel();
      return;
    }
    if (e.key === "Escape") {
      if (!state.clubSearchOpen) return;
      e.preventDefault();
      state.clubSearchOpen = false;
      state.clubSearchActiveIndex = -1;
      renderClubSuggestionPanel();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (state.clubSearchOpen && state.clubSearchActiveIndex >= 0 && state.clubSearchOptions[state.clubSearchActiveIndex]) {
      state.clubSearchQuery = state.clubSearchOptions[state.clubSearchActiveIndex];
      state.clubSearchOpen = false;
      state.clubSearchActiveIndex = -1;
      renderClubSuggestionPanel();
      const nextSearchInput = document.querySelector(`.allowance-club-search[data-allowance-club-search="${key}"]`);
      if (nextSearchInput) {
        nextSearchInput.focus();
        nextSearchInput.setSelectionRange(nextSearchInput.value.length, nextSearchInput.value.length);
      }
      return;
    }
    const addBtn = searchInput.closest(".allowance-item")?.querySelector(`[data-allowance-club-add='${key}']`);
    if (addBtn && !addBtn.disabled) addBtn.click();
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("#allowanceCategoryDd")) return;
    if (e.target.closest("#allowanceCategoryPanel")) return;
    if (e.target.closest("[data-allowance-pos-dropdown]")) return;
    if (e.target.closest("[data-allowance-pos-cap-wrap]")) return;
    if (e.target.closest("[data-allowance-cap-wrap]")) return;
    if (e.target.closest("[data-allowance-multi-dropdown]")) return;
    if (e.target.closest("[data-allowance-club-search-wrap]")) return;
    if (e.target.closest("#lobbyRevealModeDd")) return;
    closeAllLobbyDropdowns();
    if (state.clubSearchOpen) {
      state.clubSearchOpen = false;
      state.clubSearchActiveIndex = -1;
      renderClubSuggestionPanel();
    }
  });

  document.getElementById("chatForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chatInput");
    const value = input?.value || "";
    if (!value.trim()) return;
    await sendLobbyChatMessage(value);
    input.value = "";
  });

  document.getElementById("lobbyLeaveBtn")?.addEventListener("click", async () => {
    if (state.mySide === "host") {
      const ok = await askConfirm({
        title: "Close Room",
        message: "Close room for everyone?",
        okText: "Close room",
      });
      if (!ok) return;
    } else if (state.phase === "draft") {
      const ok = await askConfirm({
        title: "Leave Draft",
        message: "Leaving will exit the draft. Continue?",
        okText: "Leave",
      });
      if (!ok) return;
    }
    stopPresencePolling();
    await leavePresence();
    window.location.href = "/";
  });
  document.getElementById("kickGuestBtn")?.addEventListener("click", async () => {
    if (state.mySide !== "host" || !state.room?.guest) return;
    const yes = await askConfirm({
      title: "Kick guest",
      message: `Remove ${state.room.guest.username || "guest"} from this room?`,
      okText: "Kick",
      cancelText: "Cancel",
    });
    if (!yes) return;
    const me = getCurrentIdentity();
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/kick-guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId: me.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Could not kick guest.");
        return;
      }
      if (data.room) {
        applyPresenceSnapshot(data.room);
        renderLobby();
      }
      showToast("Guest removed.");
    } catch {
      showToast("Could not kick guest.");
    }
  });
}

// Set the renderLobby callback so presence.js can call it
cb.renderLobby = renderLobby;
