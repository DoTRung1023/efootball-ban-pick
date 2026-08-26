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
  FIXED_PICKS_PER_SIDE,
  UNLIMITED_DURATION_SEC,
  DEFAULT_BAN_DURATION_SECONDS,
  DEFAULT_PICK_DURATION_SECONDS,
} from '@/features/draft/constants.js';

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
  normalizeBanOrder,
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
  leavePresence,
  opponentLiveness,
} from '@/features/draft/engine/presence.js';
import { paintErrorView } from '@/features/draft/errorView.js';
import { allowLeave } from '@/features/draft/shell/leaveGuard.js';
import { fetchFilterOptions } from '@/features/draft/filterOptions.js';

import { scheduleLobbyConfigPush } from './config.js';

import { icon } from '@/shared/icons/icon.js';
/** Rate-limits the "only host can edit" toast on the read-only settings panel. */
let readonlySettingsToastAt = 0;

/* ── Unlimited durations ──────────────────────────────────────
   `0` is the sentinel (see `constants.js`). The number input keeps carrying it,
   so `readLobbyConfigFromDom` needs no special case; the field just stops
   *showing* a number, because a box reading "0 sec" says the opposite of what
   it means. */

/**
 * Every always-visible card row in the settings panel: BAN ORDER, BAN REVEAL,
 * PICK REVEAL.
 *
 * They are a table rather than three copies because everything done with them
 * — sync the hidden input, paint the selection, bind the click, push — is
 * identical, and only the config key, the ids and the normaliser differ.
 */
const REVEAL_GROUPS = [
  { cfgKey: "banOrder",      input: "lobbyBanOrderInput",      panel: "lobbyBanOrderPanel",      attr: "data-lobby-ban-order-option",       dataKey: "lobbyBanOrderOption",     normalize: normalizeBanOrder },
  { cfgKey: "revealMode",    input: "lobbyRevealModeInput",    panel: "lobbyRevealModePanel",    attr: "data-lobby-reveal-mode-option",     dataKey: "lobbyRevealModeOption",    normalize: normalizeRevealMode },
  { cfgKey: "banRevealMode", input: "lobbyBanRevealModeInput", panel: "lobbyBanRevealModePanel", attr: "data-lobby-ban-reveal-mode-option", dataKey: "lobbyBanRevealModeOption", normalize: normalizeRevealMode },
];

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
    /* `innerHTML` because the leading dot is an icon now. Every branch is a
       literal from this ladder — the guest's name is written elsewhere. */
    const dot = icon("dot", { size: 8, className: "ls-conn-dot" });
    guestStatusEl.innerHTML = !room.guest
      ? ""
      : guestLive === "gone"
        ? `${dot}connection lost`
        : guestLive === "reconnecting"
          ? `${dot}reconnecting…`
          : room.ready?.guest ? `${dot}ready` : `${dot}connected`;
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
        ? `Too many bans. Max ${maxBans} per side`
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

  const bansEl = document.getElementById("lobbyBansInput");
  const banDurationEl = document.getElementById("lobbyBanDurationInput");
  const pickDurationEl = document.getElementById("lobbyPickDurationInput");
  if (bansEl && !bansEl.dataset.touched) bansEl.value = String(cfg.banCountPerSide ?? 0);
  if (banDurationEl && !banDurationEl.dataset.touched) banDurationEl.value = String(normalizeBanDurationSec(cfg.banDurationSec));
  if (pickDurationEl && !pickDurationEl.dataset.touched) pickDurationEl.value = String(normalizePickDurationSec(cfg.pickDurationSec));
  /* The guest sees this too — the settings panel is read-only for them but it
     still has to say what the host chose. */
  paintDurationField("ban", normalizeBanDurationSec(cfg.banDurationSec));
  paintDurationField("pick", normalizePickDurationSec(cfg.pickDurationSec));

  // Sync lv-settings-panel visual controls from config
  const banCountValEl = document.getElementById("banCountVal");
  const banCount = Number(cfg.banCountPerSide ?? 0);
  if (banCountValEl) banCountValEl.textContent = String(banCount);
  const banPlusEl = document.getElementById("banCountPlus");
  if (banPlusEl) banPlusEl.disabled = maxBans != null && banCount >= maxBans;
  REVEAL_GROUPS.forEach((group) => paintRevealGroup(group, cfg));

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

  if (bansEl) bansEl.disabled = !isHost;
  if (banDurationEl) banDurationEl.disabled = !isHost;
  if (pickDurationEl) pickDurationEl.disabled = !isHost;
  /* The chat dock is not part of the lobby any more — it renders off the
     presence poll, which covers every phase. See features/draft/chat.js. */
  cb.updateStageTabs?.();
}

/* The host's card prints the name and the connection dot, and nothing else. It
   used to carry "34 players · 4 plans" under the name, which cost two API calls
   on every lobby load to tell the host the size of their own collection — on the
   screen where they are configuring bans, about a squad they cannot change from
   here. The guest's card never had it, so the two cards now match as well. */

/* The lobby settings used to be remembered in localStorage, so a host who once
   set five bans got five bans in every room afterwards. They are defaults now —
   every room opens on the same 3 / 120 / 300 — and this only clears the key that
   is left over on browsers that stored one. Nothing reads it. */
function forgetStoredSettings() {
  try { localStorage.removeItem("efb_draft_settings"); } catch { /* private mode */ }
}

export function initLobby() {
  forgetStoredSettings();
  const q = parseQuery();
  const user = getUser();
  const code = getRoomCodeFromUrl();

  if (!code || code.length < 4) {
    paintErrorView({
      modifier: null,
      title: null,
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
      // The CTA bar is inside this panel but is not a lobby setting — it holds the
      // guest's own READY button, which they are allowed to press.
      if (e.target.closest(".lobby-cta-bar")) return;
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - readonlySettingsToastAt < 1200) return;
      readonlySettingsToastAt = now;
      showToast("Only the host can edit the lobby settings.");
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
  bindLobbyExit();
}

// Set the renderLobby callback so presence.js can call it
cb.renderLobby = renderLobby;

/* ── initLobby wiring, split by concern ─────────────────────────── */

/** Ban count / durations / allow-all / START DRAFT. */
function bindDraftSettings(user) {
  document.getElementById("startDraftBtn")?.addEventListener("click", () => cb.startDraftFromLobby());

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
 * One reveal group's hidden input and card selection.
 *
 * The cards are always visible; selection is the only state they carry. Their
 * disabled look comes from the `.is-readonly` rule on the settings panel.
 */
function paintRevealGroup(group, cfg) {
  const input = document.getElementById(group.input);
  if (input && !input.dataset.touched) input.value = group.normalize(cfg[group.cfgKey]);
  const value = group.normalize(input?.value || cfg[group.cfgKey]);
  document.getElementById(group.panel)?.querySelectorAll(`[${group.attr}]`).forEach((opt) => {
    opt.classList.toggle("is-selected", String(opt.dataset[group.dataKey] || "").trim() === value);
  });
}

/** Every card row in the settings panel. */
function bindRevealModeDropdown() {
  REVEAL_GROUPS.forEach((group) => {
    document.getElementById(group.panel)?.addEventListener("click", (e) => {
      const option = e.target.closest(`[${group.attr}]`);
      if (!option || state.mySide !== "host") return;
      const mode = group.normalize(option.dataset[group.dataKey]);
      const input = document.getElementById(group.input);
      if (input) {
        input.value = mode;
        input.dataset.touched = "1";
      }
      state.room.config[group.cfgKey] = mode;
      renderLobby();
      scheduleLobbyConfigPush();
    });
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
      showToast("Guest removed. They cannot rejoin this room.");
    } catch {
      showToast("Could not kick guest.");
    }
  });
}
