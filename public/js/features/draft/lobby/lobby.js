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
  ALLOWANCE_SEARCH_KEYS,
  ALLOWANCE_VALUE_LIST_KEYS,
  FIXED_PICKS_PER_SIDE,
  UNLIMITED_DURATION_SEC,
  DEFAULT_BAN_DURATION_SECONDS,
  DEFAULT_PICK_DURATION_SECONDS,
} from '@/features/draft/constants.js';

import {
  normalizeAllowanceCapValue,
  normalizeAllowanceListValue,
  normalizeAllowanceRangeValue,
  orderAllowanceCountPair,
  parseAllowanceCountMap,
  parseAllowanceRangeValue,
  rawAllowanceRangeValue,
  stringifyAllowanceCountMap,
} from '@/features/draft/allowance.js';

import { cb } from '@/features/draft/callbacks.js';
import { setPendingToast } from '@/shared/ui/pendingToast.js';
import {
  state,
  defaultRoomConfig,
  applyPresenceSnapshot,
  emptyRoom,
  isUnlimitedDuration,
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

import { renderAllowanceList } from './allowanceView.js';
import { readAllowanceFieldValue, scheduleLobbyConfigPush } from './config.js';
import {
  addAllowanceValue,
  clearAllowancePicker,
  removeAllowanceValue,
  renderAllowancePickerPanel,
  updateAllowancePicker,
} from './valuePicker.js';

/** Rate-limits the "only host can edit" toast on the read-only settings panel. */
let readonlySettingsToastAt = 0;

/* ── Unlimited durations ──────────────────────────────────────
   `0` is the sentinel (see `constants.js`). The number input keeps carrying it,
   so `readLobbyConfigFromDom` needs no special case; the field just stops
   *showing* a number, because a box reading "0 sec" says the opposite of what
   it means. */

const DURATION_FIELDS = {
  ban:  { input: "lobbyBanDurationInput",  field: "banDurationField",  btn: "lobbyBanUnlimitedBtn",  cfgKey: "banDurationSec",  fallback: DEFAULT_BAN_DURATION_SECONDS },
  pick: { input: "lobbyPickDurationInput", field: "pickDurationField", btn: "lobbyPickUnlimitedBtn", cfgKey: "pickDurationSec", fallback: DEFAULT_PICK_DURATION_SECONDS },
};

/** Reflects one duration's value into its field and its button. */
function paintDurationField(which, seconds) {
  const ids = DURATION_FIELDS[which];
  if (!ids) return;
  const unlimited = isUnlimitedDuration(seconds);
  document.getElementById(ids.field)?.classList.toggle("is-unlimited", unlimited);
  document.getElementById(ids.btn)?.setAttribute("aria-pressed", unlimited ? "true" : "false");
}

/**
 * The toggle. Off → on stores 0; on → off restores the number that was there
 * before, which is why the input keeps carrying it — losing the host's 90s and
 * handing back the default would punish a mis-click.
 */
function bindUnlimitedToggle(which) {
  const ids = DURATION_FIELDS[which];
  const btn = document.getElementById(ids.btn);
  const input = document.getElementById(ids.input);
  if (!btn || !input) return;

  btn.addEventListener("click", () => {
    if (state.mySide !== "host" || !state.room) return;  // read-only for the guest
    const wasUnlimited = btn.getAttribute("aria-pressed") === "true";
    if (!wasUnlimited && Number(input.value) > 0) input.dataset.lastFinite = input.value;
    const next = wasUnlimited
      ? Number(input.dataset.lastFinite || ids.fallback)
      : UNLIMITED_DURATION_SEC;

    input.dataset.touched = "1";
    input.value = String(next);
    state.room.config[ids.cfgKey] = next;
    paintDurationField(which, next);
    scheduleLobbyConfigPush();
  });
}

/**
 * The "N players" line under a name in the matchup band.
 *
 * Hidden for a seat with no account behind it — there is no squad to report,
 * and a blank line is quieter than "unknown". A squad below a full
 * FIXED_PICKS_PER_SIDE prints as a fraction, because the number that matters
 * there is how far short it falls.
 */
function paintSquadLine(id, size) {
  const el = document.getElementById(id);
  if (!el) return;
  if (size == null) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  const short = size < FIXED_PICKS_PER_SIDE;
  el.hidden = false;
  el.textContent = short ? `${size} of ${FIXED_PICKS_PER_SIDE} players` : `${size} players`;
  el.classList.toggle("is-short", short);
}

function renderLobby() {
  const room = state.room;
  const isHost = state.mySide === "host";
  const cfg = room.config || defaultRoomConfig();
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

  /* What the two squads allow. `maxBanCountPerSide` is computed by the server
     (`maxBansForSquads` in rooms/config.js) and published on the snapshot, so
     this file keeps no copy of that arithmetic — the only comparison here is
     against FIXED_PICKS_PER_SIDE, which the squad lines have to print anyway.
     A null count is a seat with no account behind it: nothing to check. */
  const squadSizes = {
    host: room.host?.playerCount ?? null,
    guest: room.guest?.playerCount ?? null,
  };
  const maxBans = room.maxBanCountPerSide ?? null;
  const banCountNow = Number(room.config?.banCountPerSide ?? 0);

  paintSquadLine("lobbyHostSquad", squadSizes.host);
  paintSquadLine("lobbyGuestSquad", squadSizes.guest);

  const shortSides = ["host", "guest"].filter(
    (side) => squadSizes[side] != null && squadSizes[side] < FIXED_PICKS_PER_SIDE,
  );
  const shortSide = shortSides[0];
  /* The one place a blocked start is announced, in the CTA bar beside the button
     it blocks. Uppercase 12px mono, so it has to stay short — and worded from
     where the reader sits, because "guest needs 23 players" read as a note about
     somebody else to the very person who had to go and fix it. */
  const squadBlockReason = shortSides.length === 2
    ? `Both squads need ${FIXED_PICKS_PER_SIDE} players`
    : shortSide
      ? shortSide === state.mySide
        ? `You have ${squadSizes[shortSide]} of ${FIXED_PICKS_PER_SIDE} players`
        : `${room[shortSide]?.username || shortSide} has ${squadSizes[shortSide]} of ${FIXED_PICKS_PER_SIDE} players`
      : maxBans != null && banCountNow > maxBans
        ? `Too many bans — max ${maxBans} per side`
        : "";

  const capHintEl = document.getElementById("banCountCapHint");
  if (capHintEl) {
    /* Only when there is a real ceiling to state. Below zero a squad is simply
       too small, which the line under the name already says. */
    const showCap = maxBans != null && maxBans >= 0;
    capHintEl.hidden = !showCap;
    if (showCap) capHintEl.textContent = `max ${maxBans} with these squads`;
  }

  // Waiting pill in center
  const waitingEl = document.getElementById("lobbyWaiting");
  const waitingTextEl = document.getElementById("lobbyWaitingText");
  if (waitingEl) {
    const bothReady = room.ready?.host && room.ready?.guest;
    /* A squad problem outlives readiness, so the pill has to stay up to say so —
       otherwise the host reads "Opponent ready" beside a dead START button. */
    waitingEl.hidden = bothReady && !squadBlockReason;
    /* Red is reserved for a reason START cannot run: the other states this pill
       shows are ordinary waiting, and colouring those would spend the signal. */
    waitingEl.classList.toggle("is-blocked", Boolean(squadBlockReason));
    if (waitingTextEl) {
      if (!room.guest) {
        waitingTextEl.textContent = "Waiting for opponent";
      } else if (squadBlockReason) {
        waitingTextEl.textContent = squadBlockReason;
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
  /* The guest sees this too — the settings panel is read-only for them but it
     still has to say what the host chose. */
  paintDurationField("ban", normalizeBanDurationSec(cfg.banDurationSec));
  paintDurationField("pick", normalizePickDurationSec(cfg.pickDurationSec));
  if (revealModeEl && !revealModeEl.dataset.touched) revealModeEl.value = normalizeRevealMode(cfg.revealMode);

  // Sync lv-settings-panel visual controls from config
  const banCountValEl = document.getElementById("banCountVal");
  const banCount = Number(cfg.banCountPerSide ?? 0);
  if (banCountValEl) banCountValEl.textContent = String(banCount);
  const banPlusEl = document.getElementById("banCountPlus");
  if (banPlusEl) banPlusEl.disabled = maxBans != null && banCount >= maxBans;
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
      /* No class swap: `#lobbyLeaveBtn` is red on both screens because the
         button *is* the way out of the room, not because of the label it wears.
         There used to be an `is-close-room` class toggled here that no
         stylesheet ever matched. */
    }
    startBtn.hidden = false;
    settings.hidden = false;

    // The reason it is disabled is spelled out by #lobbyWaiting beside it in
    // .lobby-cta-bar, so the label stays a label.
    const canStart = room.guest && guestReady && !squadBlockReason;
    startBtn.disabled = !canStart;
    startBtn.textContent = "START DRAFT";
    startBtn.title = canStart
      ? ""
      : !room.guest
        ? "Waiting for an opponent to join"
        : squadBlockReason || "Waiting for the opponent to be ready";
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
  /* The chat dock is not part of the lobby any more — it renders off the
     presence poll, which covers every phase. See features/draft/chat.js. */
  cb.updateStageTabs?.();
}

/* The host's card prints the name and the connection dot, and nothing else. It
   used to carry "34 players · 4 plans" under the name, which cost two API calls
   on every lobby load to tell the host the size of their own collection — on the
   screen where they are configuring bans, about a squad they cannot change from
   here. The guest's card never had it, so the two cards now match as well. */

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


  void registerAndPollPresence();

  bindDraftSettings(user);



  bindRevealModeDropdown();
  bindAddAllowanceButton();
  bindAllowanceListClick();
  bindAllowanceCategoryDropdown();
  bindAllowanceListInputs();
  bindGlobalDropdownDismiss();
  bindLobbyExit();
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
  bindUnlimitedToggle("ban");
  bindUnlimitedToggle("pick");

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
    /* The ceiling is the server's, off the snapshot; unknown squads impose none. */
    const cap = state.room?.maxBanCountPerSide;
    let next = Math.max(0, Math.floor(Number(bansEl.value) || 0) + delta);
    if (cap != null) next = Math.min(next, Math.max(0, cap));
    bansEl.value = String(next);
    state.room.config.banCountPerSide = next;
    renderLobby();
    scheduleLobbyConfigPush();
  };
  document.getElementById("banCountMinus")?.addEventListener("click", () => _stepBans(-1));
  document.getElementById("banCountPlus")?.addEventListener("click", () => _stepBans(1));
}

/**
 * Caps an opening dropdown at the room left below its trigger.
 *
 * The panel is absolutely positioned inside `.prep-scroll`, and an abspos box
 * extends its scroll container's scrollable area — so a 280px panel opened near
 * the bottom of the settings column handed `.prep-scroll` 143px of scroll it
 * did not have, and scrolling that slid BAN PER SIDE and the MODE cards up
 * under the panel header. Inside the ban-setting box only the category list
 * scrolls; everything else stays where the host left it.
 *
 * Only in the desktop regime: below the 1200/820 rung `.prep-scroll` is
 * `overflow: visible` and clips nothing, so there is no reason to shorten it.
 */
function clampDropdownToScroller(panel, trigger) {
  panel.style.maxHeight = "";
  const scroller = panel.closest(".prep-scroll");
  if (!scroller || getComputedStyle(scroller).overflowY !== "auto") return;
  const room = scroller.getBoundingClientRect().bottom - trigger.getBoundingClientRect().bottom - 12;
  /* The floor is the point below which a clamped panel shows nothing useful.
     Under it the panel keeps its own height and the scroller takes the
     overflow — one scrollbar beats a two-line menu. */
  if (room >= 96) panel.style.maxHeight = `${Math.round(room)}px`;
}

/** Closes the category picker and any open allowance value picker. */
function closeAllLobbyDropdowns() {
  const categoryPanel = document.getElementById("allowanceCategoryPanel");
  const categoryTrigger = document.getElementById("allowanceCategoryTrigger");
  if (categoryPanel) {
    categoryPanel.classList.remove("is-open");
    categoryPanel.style.maxHeight = "";
  }
  if (categoryTrigger) {
    categoryTrigger.classList.remove("open");
    categoryTrigger.setAttribute("aria-expanded", "false");
  }

  if (state.allowancePickerOpen) {
    state.allowancePickerOpen = false;
    state.allowancePickerActiveIndex = -1;
    renderAllowancePickerPanel();
  }
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
    cfg.allowanceEnabled = [...enabled];

    /* A category arrives with whatever it was last configured with — removing
       one and adding it back is not a reset — so the stored value and both
       count maps are re-normalised against each other rather than blanked. */
    if (ALLOWANCE_VALUE_LIST_KEYS.has(key)) {
      const values = normalizeAllowanceListValue(key, cfg.allowance[key]);
      cfg.allowance[key] = values.join(",");
      cfg.allowanceCaps[key] = stringifyAllowanceCountMap(cfg.allowanceCaps[key], values);
      cfg.allowanceMins[key] = stringifyAllowanceCountMap(cfg.allowanceMins[key], values);
    } else {
      cfg.allowance[key] = cfg.allowance[key] || "";
      cfg.allowanceCaps[key] = normalizeAllowanceCapValue(cfg.allowanceCaps[key]);
      cfg.allowanceMins[key] = normalizeAllowanceCapValue(cfg.allowanceMins[key]);
    }

    renderLobby();
    const node = document.querySelector(`.allowance-item[data-allowance-key="${key}"]`);
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

/** Re-renders the list and puts the cursor back in the category's search box. */
function refocusValuePicker(key) {
  renderLobby();
  document.querySelector(`.allowance-picker-search[data-allowance-picker-search="${key}"]`)?.focus();
  scheduleLobbyConfigPush();
}

/** Allowance list: clicks (remove, add a value, open a picker). */
function bindAllowanceListClick() {
  document.getElementById("allowanceList")?.addEventListener("click", (e) => {
    if (state.mySide !== "host") return;

    const removeCategoryBtn = e.target.closest("[data-allowance-remove]");
    if (removeCategoryBtn) {
      if (removeCategoryBtn.disabled) return;
      const key = removeCategoryBtn.dataset.allowanceRemove;
      const cfg = state.room.config || defaultRoomConfig();
      cfg.allowanceEnabled = (cfg.allowanceEnabled || []).filter((k) => k !== key);
      cfg.allowance[key] = "";
      cfg.allowanceCaps[key] = "";
      cfg.allowanceMins[key] = "";
      if (state.allowancePickerKey === key) clearAllowancePicker();
      renderLobby();
      scheduleLobbyConfigPush();
      return;
    }

    const removeValueBtn = e.target.closest("[data-allowance-value-remove]");
    if (removeValueBtn) {
      if (removeValueBtn.disabled) return;
      const key = String(removeValueBtn.closest(".allowance-item")?.dataset.allowanceKey || "").trim();
      if (!removeAllowanceValue(key, removeValueBtn.dataset.allowanceValueRemove)) return;
      renderLobby();
      scheduleLobbyConfigPush();
      return;
    }

    /* Clicking an option *is* the add — for a list category there is no Add
       button, and for a search one filling the box and asking for a second
       click was a step that never had a decision in it. */
    const pickerOption = e.target.closest("[data-allowance-picker-option]");
    if (pickerOption) {
      const key = String(pickerOption.closest(".allowance-item")?.dataset.allowanceKey || "").trim();
      if (!addAllowanceValue(key, pickerOption.dataset.allowancePickerOption)) return;
      /* Straight back to an open picker: adding one club is rarely adding all
         of them, and reopening it by hand each time is the annoying part. */
      updateAllowancePicker(key, "", { open: true });
      refocusValuePicker(key);
      return;
    }

    const addBtn = e.target.closest("[data-allowance-value-add]");
    if (addBtn) {
      if (addBtn.disabled) return;
      const key = String(addBtn.dataset.allowanceValueAdd || "").trim();
      const searchInput = addBtn.closest(".allowance-item")?.querySelector(".allowance-picker-search");
      if (!searchInput || !addAllowanceValue(key, searchInput.value)) return;
      updateAllowancePicker(key, "", { open: true });
      refocusValuePicker(key);
      return;
    }

    /* Opening on click, not on focus: a click is also how the panel is
       dismissed, and a focus-open panel cannot be closed by clicking the box
       it hangs off. */
    const searchInput = e.target.closest(".allowance-picker-search");
    if (searchInput) {
      if (searchInput.disabled) return;
      const key = String(searchInput.dataset.allowancePickerSearch || "").trim();
      const reopening = !(state.allowancePickerKey === key && state.allowancePickerOpen);
      closeAllLobbyDropdowns();
      if (reopening) updateAllowancePicker(key, searchInput.value, { open: true });
    }
  });

}

/**
 * Writes a category's player-count pair back, in order.
 *
 * A floor above its ceiling is a rule nobody can satisfy — "at least 23, at most
 * 22" refuses every squad — so an inverted pair is swapped, the same way the
 * value range beside it is. On `change` only: doing this per keystroke is what
 * made the range fields impossible to type in.
 */
function commitAllowanceCountPair(item, key) {
  const minEl = item?.querySelector(`.allowance-item-min[data-allowance-min-key="${key}"]`);
  const capEl = item?.querySelector(`.allowance-item-cap[data-allowance-cap-key="${key}"]`);

  const { min, cap } = orderAllowanceCountPair(minEl?.value, capEl?.value);
  if (minEl) minEl.value = min;
  if (capEl) capEl.value = cap;
  state.room.config.allowanceMins[key] = min;
  state.room.config.allowanceCaps[key] = cap;
  scheduleLobbyConfigPush();
}

/** The same write for one value of a per-value category, into the two maps. */
function commitAllowanceValueCounts(row, { order }) {
  const key = String(row.closest(".allowance-item")?.dataset.allowanceKey || "").trim();
  const value = row.dataset.allowanceValueItem || "";
  if (!key || !value) return;

  const minEl = row.querySelector(".allowance-value-min");
  const capEl = row.querySelector(".allowance-value-max");
  const pair = order
    ? orderAllowanceCountPair(minEl?.value, capEl?.value)
    : {
      min: normalizeAllowanceCapValue(minEl?.value),
      cap: normalizeAllowanceCapValue(capEl?.value),
    };
  /* Only `change` rewrites the boxes. Doing it per keystroke is what made the
     range fields impossible to type in — a swap mid-number moves the digits
     the host is still typing into the other field. */
  if (order) {
    if (minEl) minEl.value = pair.min;
    if (capEl) capEl.value = pair.cap;
  }

  const cfg = state.room.config;
  const values = normalizeAllowanceListValue(key, cfg.allowance[key]);
  const write = (store, count) => {
    const map = parseAllowanceCountMap(store[key], values);
    if (count) map[value] = count;
    else delete map[value];
    store[key] = stringifyAllowanceCountMap(map, values);
  };
  write(cfg.allowanceMins, pair.min);
  write(cfg.allowanceCaps, pair.cap);
  scheduleLobbyConfigPush();
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
      clampDropdownToScroller(allowancePanel, allowanceTrigger);
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

/**
 * Allowance list: every number and text field on it.
 *
 * `input` records; `change` normalises and writes back. That split is the whole
 * reason these fields are usable — anything that rewrites a box does it on
 * blur, never under the cursor.
 */
function bindAllowanceListInputs() {
  const list = document.getElementById("allowanceList");

  list?.addEventListener("input", (e) => {
    if (state.mySide !== "host") return;

    const searchInput = e.target.closest(".allowance-picker-search");
    if (searchInput) {
      updateAllowancePicker(
        String(searchInput.dataset.allowancePickerSearch || "").trim(),
        searchInput.value,
        { open: true },
      );
      return;
    }

    const valueCount = e.target.closest(".allowance-value-count");
    if (valueCount) {
      commitAllowanceValueCounts(valueCount.closest(".allowance-value-row"), { order: false });
      return;
    }

    const rangeCount = e.target.closest(".allowance-item-min, .allowance-item-cap");
    if (rangeCount) {
      const key = rangeCount.dataset.allowanceMinKey || rangeCount.dataset.allowanceCapKey;
      if (!key) return;
      const store = rangeCount.dataset.allowanceMinKey
        ? state.room.config.allowanceMins
        : state.room.config.allowanceCaps;
      store[key] = normalizeAllowanceCapValue(rangeCount.value);
      scheduleLobbyConfigPush();
      return;
    }

    const input = e.target.closest(".allowance-item-input");
    const key = input?.dataset.allowanceKey;
    if (!key) return;
    if (input.classList.contains("allowance-item-range")) {
      /* Typing only records what is in the two boxes. Clamping and the
         inverted-pair swap happen on `change` below, because both rewrite the
         fields — under the cursor, if they ran per keystroke. Same split the
         duration fields use. */
      const item = input.closest(".allowance-item");
      state.room.config.allowance[key] = rawAllowanceRangeValue(
        rangeBoundInput(item, key, "min")?.value,
        rangeBoundInput(item, key, "max")?.value,
      );
    } else {
      state.room.config.allowance[key] = readAllowanceFieldValue(input);
    }
    scheduleLobbyConfigPush();
  });

  list?.addEventListener("change", (e) => {
    if (state.mySide !== "host") return;

    const valueCount = e.target.closest(".allowance-value-count");
    if (valueCount) {
      commitAllowanceValueCounts(valueCount.closest(".allowance-value-row"), { order: true });
      return;
    }

    /* Both ends of a player count commit together: read on its own, a minimum
       cannot tell whether it now exceeds its maximum. Same normaliser for each,
       so 0 and blank both come back as "" — a minimum of zero is the absence of
       a rule, not a rule. */
    const rangeCount = e.target.closest(".allowance-item-min, .allowance-item-cap");
    if (rangeCount) {
      const key = rangeCount.dataset.allowanceMinKey || rangeCount.dataset.allowanceCapKey;
      if (key) commitAllowanceCountPair(rangeCount.closest(".allowance-item"), key);
      return;
    }

    const input = e.target.closest(".allowance-item-range");
    const key = input?.dataset.allowanceKey;
    if (!key) return;
    const item = input.closest(".allowance-item");
    const minInput = rangeBoundInput(item, key, "min");
    const maxInput = rangeBoundInput(item, key, "max");
    const normalizedRange = normalizeAllowanceRangeValue(minInput?.value, maxInput?.value);
    const parsedRange = parseAllowanceRangeValue(normalizedRange);
    if (minInput) minInput.value = parsedRange.min;
    if (maxInput) maxInput.value = parsedRange.max;
    state.room.config.allowance[key] = normalizedRange;
    scheduleLobbyConfigPush();
  });

  list?.addEventListener("keydown", (e) => {
    const searchInput = e.target.closest(".allowance-picker-search");
    if (!searchInput || state.mySide !== "host") return;
    const key = String(searchInput.dataset.allowancePickerSearch || "").trim();
    const options = state.allowancePickerOptions;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!options.length) return;
      e.preventDefault();
      const cursor = state.allowancePickerActiveIndex;
      state.allowancePickerActiveIndex = e.key === "ArrowDown"
        ? (cursor < 0 ? 0 : Math.min(options.length - 1, cursor + 1))
        : Math.max(0, cursor - 1);
      state.allowancePickerOpen = true;
      renderAllowancePickerPanel();
      return;
    }
    if (e.key === "Escape") {
      if (!state.allowancePickerOpen) return;
      e.preventDefault();
      state.allowancePickerOpen = false;
      state.allowancePickerActiveIndex = -1;
      renderAllowancePickerPanel();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    /* Enter takes the highlighted option, or the typed text where the category
       accepts free text at all. A list category has no free text to take. */
    const highlighted = state.allowancePickerOpen ? options[state.allowancePickerActiveIndex] : "";
    const typed = ALLOWANCE_SEARCH_KEYS.has(key) ? searchInput.value : "";
    if (!addAllowanceValue(key, highlighted || typed)) return;
    updateAllowancePicker(key, "", { open: true });
    refocusValuePicker(key);
  });
}

/** One half of a range category's value pair. */
function rangeBoundInput(item, key, bound) {
  return item?.querySelector(
    `.allowance-item-range[data-allowance-key="${key}"][data-allowance-range-bound="${bound}"]`,
  );
}

/** Any outside click closes the lobby dropdowns. */
function bindGlobalDropdownDismiss() {
  const OPEN_OWNERS = "#allowanceCategoryDd, #allowanceCategoryPanel, [data-allowance-picker-wrap]";

  /* The event's **path**, not `e.target.closest(...)`.
     Clicking a suggestion adds the value, which rebuilds the allowance list —
     so by the time the click reaches `document` the option has been detached
     and `closest` walks up to nothing. That read as "clicked outside" and shut
     the panel on every single add. `composedPath()` is fixed at dispatch and
     still describes where the click landed. */
  document.addEventListener("click", (e) => {
    const landedInside = e.composedPath()
      .some((node) => node?.nodeType === 1 && node.matches(OPEN_OWNERS));
    if (landedInside) return;
    closeAllLobbyDropdowns();
  });

}

/** LEAVE / close room, KICK guest. */
function bindLobbyExit() {
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
    setPendingToast(state.mySide === "host" ? "Room closed." : "You left the room.");
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
