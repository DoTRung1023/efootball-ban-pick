/**
 * Lobby view and its event wiring.
 *
 * Settings use a hidden-input-as-source-of-truth pattern: visual controls write
 * to the hidden inputs and call scheduleLobbyConfigPush(); renderLobby() syncs
 * those inputs back from room.config on every poll, skipping any input the user
 * is currently editing (data-touched). Never update the visuals by writing to
 * the hidden inputs directly — set state.room.config and re-render.
 */

import {
  ALLOWANCE_DEF_MAP,
  POSITION_OPTIONS,
  FOOT_OPTIONS,
  TEXT_ALLOWANCE_LIST_KEYS,
  FIXED_PICKS_PER_SIDE,
} from '@/features/draft/constants.js';

import {
  normalizePositionValue,
  normalizeFootValue,
  normalizeCardTypeValue,
  normalizeRegionValue,
  normalizePlayingStyleValue,
  normalizeTextAllowanceListValue,
  positionSummaryText,
  cardTypeSummaryText,
  regionSummaryText,
  playingStyleSummaryText,
  normalizeAllowanceCapValue,
  parsePositionCapMap,
  stringifyPositionCapMap,
  parseCardTypeCapMap,
  stringifyCardTypeCapMap,
  parseRegionCapMap,
  stringifyRegionCapMap,
  parsePlayingStyleCapMap,
  stringifyPlayingStyleCapMap,
  parseTextAllowanceCapMap,
  stringifyTextAllowanceCapMap,
  normalizeAllowanceRangeValue,
  parseAllowanceRangeValue,
} from '@/features/draft/allowance.js';

import { cb } from '@/features/draft/callbacks.js';
import {
  state,
  defaultRoomConfig,
  applyPresenceSnapshot,
  emptyRoom,
  normalizeBanDurationSec,
  normalizePickDurationSec,
  normalizeRevealMode,
} from '@/features/draft/state.js';
import {
  showToast,
  askConfirm,
  showView,
  getRoomCodeFromUrl,
  parseQuery,
  getUser,
  getCurrentIdentity,
} from '@/features/draft/utils.js';
import {
  registerAndPollPresence,
  stopPresencePolling,
  leavePresence,
  opponentLiveness,
} from '@/features/draft/engine/presence.js';
import { paintErrorView } from '@/features/draft/errorView.js';
import { allowLeave } from '@/features/draft/shell/leaveGuard.js';
import { fetchFilterOptions } from '@/features/draft/filterOptions.js';
import { getJson } from '@/features/draft/api.js';

import { renderAllowanceList } from './allowanceView.js';
import { renderLobbyChat, sendLobbyChatMessage } from './chat.js';
import { readAllowanceFieldValue, scheduleLobbyConfigPush } from './config.js';
import {
  clearClubSearchState,
  addTextAllowanceValue,
  scheduleClubSuggestions,
  renderClubSuggestionPanel,
} from './clubSuggest.js';

/** Rate-limits the "only host can edit" toast on the read-only settings panel. */
let readonlySettingsToastAt = 0;

function renderLobby() {
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

  // Guest sub: show "Share the invite link" only when no guest
  const guestSub = document.getElementById("lobbyGuestSub");
  if (guestSub) guestSub.hidden = !!room.guest;

  /* Occupancy is not liveness — a guest who closed their browser keeps the seat
     (there is no TTL), so this reads their heartbeat. `away` is left as
     "connected" on purpose: in the lobby, waiting on the host, a backgrounded
     tab is the normal state and does not need reporting. */
  const guestStatusEl = document.getElementById("lobbyGuestStatus");
  if (guestStatusEl) {
    const guestLive = opponentLiveness(room.guest);
    const guestHere = guestLive === "connected" || guestLive === "away";
    guestStatusEl.textContent = !room.guest
      ? ""
      : guestLive === "gone"
        ? "● connection lost"
        : guestLive === "reconnecting"
          ? "● reconnecting…"
          : room.ready?.guest ? "● ready" : "● connected";
    guestStatusEl.classList.toggle("player-slot-status--ok", Boolean(room.guest) && guestHere);
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
  const revealModePanel = document.getElementById("lobbyRevealModePanel");
  if (allowAllEl && !allowAllEl.dataset.touched) allowAllEl.checked = Boolean(cfg.allowAllPlayers);
  if (bansEl && !bansEl.dataset.touched) bansEl.value = String(cfg.banCountPerSide ?? 0);
  if (banDurationEl && !banDurationEl.dataset.touched) banDurationEl.value = String(normalizeBanDurationSec(cfg.banDurationSec));
  if (pickDurationEl && !pickDurationEl.dataset.touched) pickDurationEl.value = String(normalizePickDurationSec(cfg.pickDurationSec));
  if (revealModeEl && !revealModeEl.dataset.touched) revealModeEl.value = normalizeRevealMode(cfg.revealMode);

  // Sync lv-settings-panel visual controls from config
  const banCountValEl = document.getElementById("banCountVal");
  const banCount = Number(cfg.banCountPerSide ?? 0);
  if (banCountValEl) banCountValEl.textContent = String(banCount);
  const banCountHintEl = document.getElementById("banCountHint");
  if (banCountHintEl) banCountHintEl.textContent = `${pluralize(banCount * 2, "ban")} in total`;
  const revealModeValue = normalizeRevealMode(revealModeEl?.value || cfg.revealMode);
  // The cards are always visible; selection is the only state they carry. Their
  // disabled look comes from the .is-readonly rule on the settings panel.
  revealModePanel?.querySelectorAll("[data-lobby-reveal-mode-option]").forEach((opt) => {
    const mode = String(opt.dataset.lobbyRevealModeOption || "").trim();
    opt.classList.toggle("is-selected", mode === revealModeValue);
  });

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

    // The reason it is disabled is spelled out by #lobbyWaiting beside it in
    // .lobby-cta-bar, so the label stays a label.
    const canStart = room.guest && guestReady;
    startBtn.disabled = !canStart;
    startBtn.textContent = "START DRAFT";
    startBtn.title = canStart
      ? ""
      : !room.guest
        ? "Waiting for an opponent to join"
        : "Waiting for the opponent to be ready";
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
    startBtn.title = "";
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

const pluralize = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** "24 players · 6 plans" under the host's name. */
async function loadLobbyStats(userId) {
  const el = document.getElementById("lobbyHostStats");
  if (!userId || !el) return;

  const [squad, plans] = await Promise.all([
    getJson(`/api/my-players?userId=${encodeURIComponent(userId)}`),
    getJson(`/api/game-plans?userId=${encodeURIComponent(userId)}`),
  ]);

  // Both endpoints wrap their rows — { players: [...] } and { plans: [...] }.
  const playerCount = Array.isArray(squad.players) ? squad.players.length : 0;
  const planCount = Array.isArray(plans.plans) ? plans.plans.length : 0;

  el.innerHTML =
    `${pluralize(playerCount, "player")}<span class="ls-dot"> · </span>${pluralize(planCount, "plan")}`;
}

export function initLobby() {
  const q = parseQuery();
  const user = getUser();
  const code = getRoomCodeFromUrl();

  if (!code || code.length < 4) {
    paintErrorView({
      modifier: null,
      title: null,
      icon: false,
      leaveText: "Leave room",
      message: "Invalid room code.",
    });
    return;
  }

  const settingsPanel = document.querySelector(".prep-col--settings");
  if (settingsPanel && !settingsPanel.dataset.readonlyGuardBound) {
    settingsPanel.dataset.readonlyGuardBound = "1";
    settingsPanel.addEventListener("click", (e) => {
      if (state.mySide === "host" || !settingsPanel.classList.contains("is-readonly")) return;
      // The CTA bar is inside this panel but is not a ban setting — it holds the
      // guest's own READY button, which they are allowed to press.
      if (e.target.closest(".lobby-cta-bar")) return;
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
  // "done" too: the match is over but the room is not, and a rematch offer
  // lands on that screen.
  const restoringDraft = cachedPhase === "draft" || cachedPhase === "ready" || cachedPhase === "done";

  if (!restoringDraft) {
    showView("viewLobby");
    renderLobby();
  }

  if (user?.id) void loadLobbyStats(user.id);

  void registerAndPollPresence();

  bindDraftSettings(user);



  bindRevealModeDropdown();
  bindAddAllowanceButton();
  bindAllowanceListClick();
  bindAllowanceListChange();
  bindAllowanceCategoryDropdown();
  bindAllowanceCapInputs();
  bindGlobalDropdownDismiss();
  bindLobbyChatAndExit();
}

// Set the renderLobby callback so presence.js can call it
cb.renderLobby = renderLobby;

/* ── initLobby wiring, split by concern ─────────────────────────── */

/** Ban count / durations / allow-all / START DRAFT. */
function bindDraftSettings(user) {
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
}

/** Closes every open lobby dropdown (reveal mode, category picker, caps). */
function closeAllLobbyDropdowns() {
    const categoryPanel = document.getElementById("allowanceCategoryPanel");
    const categoryTrigger = document.getElementById("allowanceCategoryTrigger");
    if (categoryPanel) categoryPanel.classList.remove("is-open");
    if (categoryTrigger) {
      categoryTrigger.classList.remove("open");
      categoryTrigger.setAttribute("aria-expanded", "false");
    }

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
  }

/** Ban reveal mode dropdown. */
function bindRevealModeDropdown() {
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
    renderLobby();
    scheduleLobbyConfigPush();
  });

}

/** ADD CATEGORY button on the allowance panel. */
function bindAddAllowanceButton() {
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

}

/** Allowance list: clicks (chips, removes, cap toggles, multi-selects). */
function bindAllowanceListClick() {
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

}

/** Allowance list: select / checkbox commits. */
function bindAllowanceListChange() {
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

}

/** The category picker beside ADD CATEGORY. */
function bindAllowanceCategoryDropdown() {
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

}

/** Allowance list: cap number fields (input / change / keydown). */
function bindAllowanceCapInputs() {
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
}

/** Any outside click closes the lobby dropdowns. */
function bindGlobalDropdownDismiss() {
  document.addEventListener("click", (e) => {
    if (e.target.closest("#allowanceCategoryDd")) return;
    if (e.target.closest("#allowanceCategoryPanel")) return;
    if (e.target.closest("[data-allowance-pos-dropdown]")) return;
    if (e.target.closest("[data-allowance-pos-cap-wrap]")) return;
    if (e.target.closest("[data-allowance-cap-wrap]")) return;
    if (e.target.closest("[data-allowance-multi-dropdown]")) return;
    if (e.target.closest("[data-allowance-club-search-wrap]")) return;
    closeAllLobbyDropdowns();
    if (state.clubSearchOpen) {
      state.clubSearchOpen = false;
      state.clubSearchActiveIndex = -1;
      renderClubSuggestionPanel();
    }
  });

}

/** Chat submit, LEAVE / close room, KICK guest. */
function bindLobbyChatAndExit() {
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
    allowLeave();
    stopPresencePolling();
    await leavePresence();
    window.location.href = "/";
  });
  document.getElementById("kickGuestBtn")?.addEventListener("click", async () => {
    if (state.mySide !== "host" || !state.room?.guest) return;
    const yes = await askConfirm({
      title: "Kick guest",
      message: `Remove ${state.room.guest.username || "guest"} from this room? They will not be able to rejoin it.`,
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
      showToast("Guest removed — they cannot rejoin this room.");
    } catch {
      showToast("Could not kick guest.");
    }
  });
}
