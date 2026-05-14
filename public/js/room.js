import {
  GREEN,
  RED,
  FIXED_PICKS_PER_SIDE,
  MIN_BAN_DURATION_SECONDS,
  MAX_BAN_DURATION_SECONDS,
  MIN_PICK_DURATION_SECONDS,
  MAX_PICK_DURATION_SECONDS,
  LOBBY_PRESENCE_POLL_MS,
  REVEAL_MODE_INSTANT,
  REVEAL_MODE_HIDDEN,
  DEFAULT_FORMATION,
} from './room/constants.js';

import { getAllowanceCapViolation } from './room/allowance.js';

import { cb } from './room/callbacks.js';

import { escapeHtml, showToast, askConfirm, showView, getRoomCodeFromUrl, getCurrentIdentity, getUser } from './room/utils.js';

import {
  getPlayerCardValue,
  getPlayerImageSrc,
  normalizeFormation,
  getFormationLayout,
  slotCardsSummary,
  mapPlayersBySlot,
  miniCardHtml,
} from './room/players.js';

import {
  state,
  defaultRoomConfig,
  buildTurnSchedule,
  emptyRoom,
  applyPresenceSnapshot,
  normalizeBanDurationSec,
  normalizePickDurationSec,
  normalizeRevealMode,
} from './room/state.js';

import {
  BAN_LEAGUE_OPTIONS,
  normalizeBanSortValue,
  normalizeBanPositionValue,
  getBanListPlayers,
  getPickListPlayers,
  imageOnlyThumbHtml,
  stagedBanThumbHtml,
  opponentStagedBanThumbHtml,
  resetOpponentBanPlayers,
  loadOpponentBanPlayers,
  banPlayerCardHtml,
  renderBanToolbar,
  bindBanPhaseUiOnce,
  attachMiniCardGridHandlers,
} from './room/ban.js';

import { renderPickToolbar, bindPickPhaseUiOnce, loadDraftPlayers } from './room/pick.js';

import {
  clearRoomPhaseCache,
  stopPresencePolling,
  pollPresence,
  leavePresence,
  registerAndPollPresence,
} from './room/presence.js';

import { initLobby } from './room/lobby.js';

// Global handler for unhandled promise rejections to surface friendly messages
window.addEventListener("unhandledrejection", (ev) => {
  try {
    const reason = ev.reason;
    console.error("Unhandled promise rejection:", reason);
    if (typeof showToast === "function") {
      const msg = reason && reason.message ? reason.message : String(reason ?? "Unexpected error");
      showToast(msg, "warn");
    }
  } catch (err) {
    console.error("Error in unhandledrejection handler:", err);
  }
  try { ev.preventDefault && ev.preventDefault(); } catch (e) {}
});

// Global catch for runtime errors to ensure they surface consistently
window.addEventListener("error", (ev) => {
  try {
    console.error("Runtime error:", ev.error || ev.message, ev);
    if (typeof showToast === "function") {
      const m = ev.message || (ev.error && ev.error.message) || "An unexpected error occurred";
      showToast(String(m), "warn");
    }
  } catch (e) {
    console.error("Error in window.onerror handler:", e);
  }
});

function getDraftDisplayPlayers(room = state.room) {
  if (!room) return [];
  const turn = state.schedule[room.turnIndex];
  const isBanPhase = turn?.action === "ban";
  const isReadyPhase = state.phase === "ready" || String(room.status || "") === "await-ready";
  if (isReadyPhase) return state.players;
  return isBanPhase ? getBanListPlayers() : getPickListPlayers();
}

function getTurnDurationSec(turn, cfg = state.room?.config || defaultRoomConfig()) {
  if (turn?.action === "ban") return normalizeBanDurationSec(cfg?.banDurationSec);
  if (turn?.action === "pick") return normalizePickDurationSec(cfg?.pickDurationSec);
  return 60;
}

function getDraftStage(room = state.room) {
  const t = room ? state.schedule[room.turnIndex] : null;
  return String(t?.action || "");
}

function ensureDraftTimer(room = state.room) {
  if (!room || room.turnEndsAt) return;
  const stage = getDraftStage(room);
  const durationSec = getTurnDurationSec({ action: stage }, room.config);
  room.turnEndsAt = Date.now() + durationSec * 1000;
}

function syncCurrentTurnFromIndex(room) {
  const t = state.schedule[room.turnIndex];
  room.currentTurn = t || null;
}

function advanceDraftStage(room, nextAction) {
  if (!room) return;
  const next = String(nextAction || "");
  const nextIdx = state.schedule.findIndex((t) => String(t?.action || "") === next);
  if (nextIdx < 0) return;
  state.stagedBans = [];
  state.opponentStagedBans = [];
  room.turnIndex = nextIdx;
  syncCurrentTurnFromIndex(room);
  room.turnEndsAt = Date.now() + getTurnDurationSec(state.schedule[room.turnIndex], room.config) * 1000;
  startTurnTimer();
}

function maybeAutoAdvanceFromBan(room = state.room) {
  if (!room) return;
  if (getDraftStage(room) !== "ban") return;
  const cfg = room.config || defaultRoomConfig();
  const target = Math.max(0, Math.floor(Number(cfg.banCountPerSide) || 0));
  if (!target) return;
  const doneHost = (room.bans?.host || []).length >= target;
  const doneGuest = (room.bans?.guest || []).length >= target;
  if (doneHost && doneGuest) {
    advanceDraftStage(room, "pick");
  }
}

function getTakenIds(room) {
  return new Set([...(room.bannedPlayerIds || []), ...(room.pickedPlayerIds || [])]);
}

function applyLocalAction(room, player) {
  const turn = state.schedule[room.turnIndex];
  if (!turn) return false;

  const id = String(player.id);
  if (turn.action === "ban") {
    const mySideBanIds = (room.bans?.[state.mySide] || []).map((b) => String(b.id));
    if (mySideBanIds.includes(id) || room.pickedPlayerIds.includes(id)) return false;
  } else {
    if (room.pickedPlayerIds.includes(id)) return false;
  }

  if (turn.action === "pick") {
    const mySide = state.mySide;
    const violation = getAllowanceCapViolation(room, mySide, player);
    if (violation) {
      state.actionError = `${violation.label}: max ${violation.cap} card(s) allowed per side.`;
      showToast(state.actionError);
      return false;
    }
  }

  if (turn.action === "ban") {
    const cfg = room.config || defaultRoomConfig();
    const maxBans = Math.max(0, Math.floor(Number(cfg.banCountPerSide) || 0));
    const mySide = state.mySide;
    if (!mySide) return false;
    const myBans = room.bans?.[mySide] || [];
    if (maxBans && myBans.length >= maxBans) {
      showToast("You already used all bans for your side.");
      return false;
    }
    room.bans[mySide].push(player);
    room.bannedPlayerIds.push(id);
  } else {
    const mySide = state.mySide;
    if (!mySide) return false;
    room.picks[mySide].push(player);
    room.pickedPlayerIds.push(id);
  }
  if (turn.action === "ban") {
    maybeAutoAdvanceFromBan(room);
  }
  return true;
}

function clearTurnTimer() {
  if (state.turnTimer) {
    clearInterval(state.turnTimer);
    state.turnTimer = null;
  }
}

function startTurnTimer() {
  clearTurnTimer();
  const tick = () => {
    const room = state.room;
    if (!room?.turnEndsAt || state.phase !== "draft") return;

    const left = Math.max(0, Math.ceil((room.turnEndsAt - Date.now()) / 1000));
    const el = document.getElementById("timerInner");
    const ring = document.getElementById("timerRing");
    if (el) {
      el.textContent = String(left);
      el.style.color = left <= 5 ? RED : "#fff";
    }
    if (ring) {
      const durationSec = getTurnDurationSec(state.schedule[room.turnIndex], room.config);
      const pct = Math.min(1, left / durationSec);
      const deg = pct * 360;
      const color = left <= 5 ? RED : GREEN;
      ring.classList.toggle("is-low", left <= 5);
      ring.style.background = `conic-gradient(${color} ${deg}deg, #1a1a2a 0deg)`;
    }

    if (left <= 0) {
      clearTurnTimer();
      const r = state.room;
      if (!r) return;
      const stage = getDraftStage(r);
      if (stage === "ban") {
        const flushed = flushStagedBansLocally();
        void submitBansToApi(flushed);
        if (getDraftStage(r) === "ban") advanceDraftStage(r, "pick");
        renderDraftUi();
        return;
      }
      if (stage === "pick") {
        beginPostDraftReadyPhase(r);
        renderDraftUi();
        return;
      }
    }
  };
  tick();
  state.turnTimer = setInterval(tick, 250);
}

function isBothMatchReady(room = state.room) {
  return Boolean(room?.matchReady?.host) && Boolean(room?.matchReady?.guest);
}

function beginPostDraftReadyPhase(room = state.room) {
  if (!room) return;
  room.status = "await-ready";
  room.turnEndsAt = null;
  room.currentTurn = null;
  room.matchReady = { host: false, guest: false };
  state.phase = "ready";
  clearTurnTimer();
  stopPresencePolling();
  state.presencePollId = setInterval(pollPresence, LOBBY_PRESENCE_POLL_MS);
}

async function setGuestReady(ready) {
  if (!state.room?.code) return;
  const me = getCurrentIdentity();
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/ready`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId: me.id, ready: Boolean(ready) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || "Could not update ready.");
      return;
    }
    if (data.room) {
      applyPresenceSnapshot(data.room);
      cb.renderLobby();
    }
  } catch {
    showToast("Could not update ready.");
  }
}

async function setMatchReady(ready) {
  if (!state.room?.code) return;
  const me = getCurrentIdentity();
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/match-ready`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId: me.id, ready: Boolean(ready) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || "Could not update match ready.");
      return;
    }
    if (data.room) applyPresenceSnapshot(data.room);
    if (isBothMatchReady()) {
      stopPresencePolling();
      state.phase = "done";
      showDone();
      return;
    }
    renderDraftUi();
  } catch {
    showToast("Could not update match ready.");
  }
}

function showRoomClosed(message = "Room is closed.") {
  clearRoomPhaseCache(state.room?.code);
  const view = document.getElementById("viewError");
  const msg = document.getElementById("errorMessage");
  const title = document.getElementById("errorTitle");
  const icon = document.getElementById("errorStateIcon");
  const btn = document.getElementById("errorLeaveBtn");
  if (btn) btn.textContent = "Back to home";
  if (title) { title.textContent = "Room closed"; title.hidden = false; }
  if (icon) icon.hidden = false;
  if (view) {
    view.classList.remove("is-host-lock");
    view.classList.add("is-room-closed");
  }
  let secs = 10;
  const update = () => {
    if (msg) msg.textContent = `${message} Returning to home in ${secs}s…`;
  };
  update();
  showView("viewError");
  updateStageTabs();
  const t = setInterval(() => {
    secs--;
    if (secs <= 0) {
      clearInterval(t);
      window.location.href = "/";
      return;
    }
    update();
  }, 1000);
}

function showOpponentLeft() {
  clearTurnTimer();
  clearRoomPhaseCache(state.room?.code);
  const view = document.getElementById("viewError");
  const msg = document.getElementById("errorMessage");
  const title = document.getElementById("errorTitle");
  const icon = document.getElementById("errorStateIcon");
  const btn = document.getElementById("errorLeaveBtn");
  if (title) { title.textContent = "Opponent left"; title.hidden = false; }
  if (icon) { icon.textContent = "🚪"; icon.hidden = false; }
  if (btn) btn.textContent = "Back to home";
  if (view) {
    view.classList.remove("is-host-lock", "is-room-full", "is-access-denied");
    view.classList.add("is-room-closed");
  }
  let secs = 10;
  const update = () => {
    if (msg) msg.textContent = `Your opponent has left the draft. Returning to home in ${secs}s…`;
  };
  update();
  showView("viewError");
  updateStageTabs();
  const t = setInterval(() => {
    secs--;
    if (secs <= 0) {
      clearInterval(t);
      window.location.href = "/";
      return;
    }
    update();
  }, 1000);
}

function tryEnterDraftFromRoomSnapshot() {
  const room = state.room;
  if (!room || state.phase !== "lobby") return false;
  const status = String(room.status || "");
  if (!["drafting", "await-ready", "done"].includes(status)) return false;

  if (status === "done") {
    state.phase = "done";
    stopPresencePolling();
    showDone();
    return true;
  }

  const bansPerSide = Math.max(0, Math.floor(Number(room.config?.banCountPerSide) || 0));
  state.schedule = buildTurnSchedule(bansPerSide, FIXED_PICKS_PER_SIDE);
  syncCurrentTurnFromIndex(room);
  if (bansPerSide <= 0) {
    // No bans configured: start directly in pick phase.
    room.turnIndex = Math.max(0, state.schedule.findIndex((t) => t.action === "pick"));
    syncCurrentTurnFromIndex(room);
  }
  ensureDraftTimer(room);

  state.phase = status === "await-ready" ? "ready" : "draft";
  try { if (state.room?.code) sessionStorage.setItem(`efb_room_${state.room.code}_phase`, state.phase); } catch { /* ignore */ }
  stopPresencePolling();
  showView("viewDraft");
  updateStageTabs();
  resetOpponentBanPlayers();
  void loadDraftGamePlans();
  renderDraftUi();
  attachDraftGridHandlers();
  void loadDraftPlayers();
  void loadOpponentBanPlayers();
  if (state.phase === "draft") {
    startTurnTimer();
  }
  state.presencePollId = setInterval(pollPresence, LOBBY_PRESENCE_POLL_MS);
  return true;
}

function startDraftFromLobby() {
  if (state.mySide !== "host") {
    const guestReady = Boolean(state.room?.ready?.guest);
    void setGuestReady(!guestReady);
    return;
  }
  const cfg = state.room?.config || defaultRoomConfig();
  if (!state.room?.ready?.guest) {
    showToast("Guest must be ready before starting.");
    return;
  }
  const banDurationInput = document.getElementById("lobbyBanDurationInput");
  const pickDurationInput = document.getElementById("lobbyPickDurationInput");
  const typedDuration = Number(banDurationInput?.value);
  if (!Number.isFinite(typedDuration) || typedDuration < MIN_BAN_DURATION_SECONDS || typedDuration > MAX_BAN_DURATION_SECONDS) {
    showToast(`Ban duration must be between ${MIN_BAN_DURATION_SECONDS} and ${MAX_BAN_DURATION_SECONDS} seconds.`, "warn");
    if (banDurationInput) banDurationInput.focus();
    return;
  }
  const typedPickDuration = Number(pickDurationInput?.value);
  if (!Number.isFinite(typedPickDuration) || typedPickDuration < MIN_PICK_DURATION_SECONDS || typedPickDuration > MAX_PICK_DURATION_SECONDS) {
    showToast(`Pick duration must be between ${MIN_PICK_DURATION_SECONDS} and ${MAX_PICK_DURATION_SECONDS} seconds.`, "warn");
    if (pickDurationInput) pickDurationInput.focus();
    return;
  }
  const b = Math.max(0, Math.floor(Number(cfg.banCountPerSide) || 0));
  const p = 23;

  if (b === 0 && p === 0) {
    showToast("Set at least one ban or pick per side.");
    return;
  }

  void (async () => {
    const me = getCurrentIdentity();
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId: me.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Could not start draft.", "warn");
        return;
      }
      if (data.room) applyPresenceSnapshot(data.room);
      if (!tryEnterDraftFromRoomSnapshot()) {
        showToast("Draft started. Waiting for room sync...", "warn");
      }
    } catch {
      showToast("Could not start draft.", "warn");
    }
  })();
}

/* ── Side panels ──────────────────────────────────────────── */
function renderSidePanel(containerId, side, room, mySide) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const title = side === "host" ? room.host?.username || "HOST" : room.guest?.username || "Waiting…";
  const isMe = side === mySide;
  const isTurn = room.currentTurn?.side === side;
  const bMax = Math.max(state.schedule.filter((t) => t.action === "ban" && t.side === side).length, 0);
  const pMax = Math.max(state.schedule.filter((t) => t.action === "pick" && t.side === side).length, 0);
  const bans = room.bans[side] || [];
  const picks = room.picks[side] || [];
  const latestBan = bans[bans.length - 1] || null;
  const latestPick = picks[picks.length - 1] || null;

  const head = `
    <div class="side-panel-head ${isMe ? "is-me" : ""}">
      ${isMe ? "▶ " : ""}${String(title).toUpperCase()}
      ${isMe ? '<span class="you-tag">(you)</span>' : ""}
      ${isTurn ? '<span class="turn-dot"></span>' : ""}
    </div>
    <div class="side-panel-focus">
      ${sidePanelCardHtml({ title: "Latest ban", player: latestBan, phase: "ban" })}
      ${sidePanelCardHtml({ title: "Latest pick", player: latestPick, phase: "pick" })}
    </div>
    <div class="slot-section-label">BANS (${bans.length}/${bMax || "—"})</div>
    <div class="slot-list">
      ${Array.from({ length: Math.max(bMax, bans.length) }).map((_, i) => slotHtml(bans[i], "ban")).join("")}
    </div>
    <div class="slot-section-label">PICKS (${picks.length}/${pMax || "—"})</div>
    <div class="slot-list">
      ${Array.from({ length: Math.max(pMax, picks.length) }).map((_, i) => slotHtml(picks[i], "pick")).join("")}
    </div>
  `;
  el.innerHTML = head;
}

function slotHiddenHtml(filled) {
  return `<div class="slot-item is-pick is-hidden ${filled ? "is-filled" : ""}"><div class="slot-empty">${filled ? "Hidden" : "—"}</div></div>`;
}

function slotHtml(player, type) {
  const isBan = type === "ban";
  if (!player) {
    return `<div class="slot-item ${isBan ? "is-ban" : "is-pick"}"><div class="slot-empty">—</div></div>`;
  }
  const ovr = getPlayerCardValue(player);
  const lastName = String(player.name || "").trim().split(/\s+/).pop() || player.name;
  return `
    <div class="slot-item ${isBan ? "is-ban" : "is-pick"}">
      <div class="slot-thumb">
        <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
      </div>
      <div class="slot-ovr">${ovr}</div>
      <div style="min-width:0">
        <div class="slot-name">${escapeHtml(lastName)}</div>
        <div class="slot-pos">${escapeHtml(player.position || "")}</div>
      </div>
    </div>
  `;
}

function sidePanelCardHtml({ title, player, phase }) {
  if (!player) {
    return `
      <div class="side-panel-card side-panel-card--empty">
        <div class="side-panel-card-k">${escapeHtml(title)}</div>
        <div class="side-panel-card-empty">Waiting for a ${phase}…</div>
      </div>
    `;
  }
  return `
    <div class="side-panel-card side-panel-card--${phase}">
      <div class="side-panel-card-k">${escapeHtml(title)}</div>
      <div class="side-panel-card-body">
        <div class="side-panel-card-thumb">
          <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
        </div>
        <div class="side-panel-card-text">
          <div class="side-panel-card-name">${escapeHtml(player.name || "—")}</div>
          <div class="side-panel-card-meta">${escapeHtml(player.position || "—")} · ${escapeHtml(player.nation || player.nationality || "—")}</div>
          <div class="side-panel-card-ovr">OVR ${escapeHtml(getPlayerCardValue(player))}</div>
        </div>
      </div>
    </div>
  `;
}

function renderSlotMapPreview(title, slotMap, formation, options = {}) {
  const layout = getFormationLayout(formation);
  const benchSlots = Array.from({ length: 12 }, (_, i) => i + 12);
  const bench = benchSlots.map((slot) => slotMap[slot] || null);
  const isCompact = Boolean(options.compact);
  return `
    <div class="formation-preview ${isCompact ? "formation-preview--compact" : ""}">
      <div class="formation-preview-head">
        <div>
          <div class="formation-preview-k">${escapeHtml(title)}</div>
          <div class="formation-preview-sub">${escapeHtml(normalizeFormation(formation))} formation</div>
        </div>
        <div class="formation-preview-count">${slotCardsSummary(Object.values(slotMap).filter(Boolean))}</div>
      </div>
      <div class="formation-pitch">
        ${layout.map((row) => `
          <div class="formation-row" data-row="${escapeHtml(row.id)}">
            ${row.slots.map((slot) => formationSlotHtml(slot, slotMap[slot] || null)).join("")}
          </div>
        `).join("")}
      </div>
      <div class="formation-bench">
        ${bench.map((player, idx) => formationBenchSlotHtml(idx + 12, player)).join("")}
      </div>
    </div>
  `;
}

function formationSlotHtml(slot, player) {
  if (!player) {
    return `
      <div class="formation-slot formation-slot--empty">
        <div class="formation-slot-num">${slot}</div>
        <div class="formation-slot-empty">Empty</div>
      </div>
    `;
  }
  return `
    <div class="formation-slot formation-slot--filled">
      <div class="formation-slot-num">${slot}</div>
      <div class="formation-slot-card">
        <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
        <div class="formation-slot-card-body">
          <div class="formation-slot-name">${escapeHtml(player.name || "—")}</div>
          <div class="formation-slot-meta">${escapeHtml(player.position || "—")} · ${escapeHtml(player.nation || player.nationality || "—")}</div>
        </div>
        <div class="formation-slot-ovr">${escapeHtml(getPlayerCardValue(player))}</div>
      </div>
    </div>
  `;
}

function formationBenchSlotHtml(slot, player) {
  if (!player) {
    return `
      <div class="formation-bench-slot">
        <div class="formation-bench-slot-num">${slot}</div>
        <div class="formation-bench-slot-empty">Open</div>
      </div>
    `;
  }
  return `
    <div class="formation-bench-slot is-filled">
      <div class="formation-bench-slot-num">${slot}</div>
      <div class="formation-bench-slot-name">${escapeHtml(player.name || "—")}</div>
      <div class="formation-bench-slot-meta">${escapeHtml(player.position || "—")}</div>
    </div>
  `;
}

function renderDraftPlanControls() {
  const select = document.getElementById("draftGamePlanSelect");
  const meta = document.getElementById("draftGamePlanMeta");
  const preview = document.getElementById("draftGamePlanPreview");
  if (!select || !meta || !preview) return;

  if (state.draftGamePlansLoading) {
    select.innerHTML = `<option value="">Loading game plans…</option>`;
    select.disabled = true;
    meta.textContent = "Fetching your saved plans…";
    preview.innerHTML = `<div class="draft-empty-panel">Loading game plans…</div>`;
    return;
  }

  if (!state.draftGamePlans.length) {
    select.innerHTML = `<option value="">No game plans found</option>`;
    select.disabled = true;
    meta.textContent = "Create a game plan on the home page to use it as a draft reference.";
    preview.innerHTML = `<div class="draft-empty-panel">No saved game plans yet.</div>`;
    return;
  }

  select.disabled = false;
  select.innerHTML = state.draftGamePlans.map((plan) => {
    const formation = normalizeFormation(plan.formation);
    const suffix = `${Number(plan.lineup_count || 0)}/11 lineup · ${Number(plan.sub_count || 0)}/12 subs`;
    return `<option value="${escapeHtml(String(plan.id))}">${escapeHtml(plan.name || "Plan")} · ${escapeHtml(formation)} · ${escapeHtml(suffix)}</option>`;
  }).join("");

  const selectedPlan = state.draftGamePlans.find((plan) => String(plan.id) === String(state.draftGamePlanSelectedId)) || state.draftGamePlans[0];
  if (!selectedPlan) return;
  state.draftGamePlanSelectedId = selectedPlan.id;
  select.value = String(selectedPlan.id);
  const formation = normalizeFormation(selectedPlan.formation);
  meta.textContent = `${selectedPlan.name || "Plan"} · ${formation} · ${Number(selectedPlan.lineup_count || 0)}/11 starters`;
  preview.innerHTML = renderSlotMapPreview("Consult this plan", mapPlayersBySlot(state.draftGamePlanPlayers), formation, { compact: true });
}

async function loadDraftGamePlans() {
  const user = getUser();
  if (!user?.id) return;
  state.draftGamePlansLoading = true;
  renderDraftPlanControls();
  try {
    const res = await fetch(`/api/game-plans?userId=${encodeURIComponent(user.id)}`);
    const data = await res.json().catch(() => ({}));
    state.draftGamePlans = Array.isArray(data.plans) ? data.plans : [];
    if (!state.draftGamePlans.some((plan) => String(plan.id) === String(state.draftGamePlanSelectedId))) {
      state.draftGamePlanSelectedId = state.draftGamePlans[0]?.id || null;
    }
    if (state.draftGamePlanSelectedId) {
      await loadDraftGamePlanPlayers(state.draftGamePlanSelectedId);
    } else {
      state.draftGamePlanPlayers = [];
    }
  } catch {
    state.draftGamePlans = [];
    state.draftGamePlanPlayers = [];
    state.draftGamePlanSelectedId = null;
  } finally {
    state.draftGamePlansLoading = false;
    renderDraftPlanControls();
    renderDraftUi();
  }
}

async function loadDraftGamePlanPlayers(planId) {
  const user = getUser();
  if (!user?.id || !planId) return;
  state.draftGamePlanPlayersLoading = true;
  try {
    const res = await fetch(`/api/game-plans/${encodeURIComponent(planId)}/players?userId=${encodeURIComponent(user.id)}`);
    const data = await res.json().catch(() => ({}));
    state.draftGamePlanPlayers = Array.isArray(data.players) ? data.players : [];
  } catch {
    state.draftGamePlanPlayers = [];
  } finally {
    state.draftGamePlanPlayersLoading = false;
    renderDraftPlanControls();
    if (state.phase === "draft") renderDraftUi();
  }
}

// Ban phase uses the 3-row board (legacy ban-only mode was removed, keep these as safe no-ops).
function enterBanOnlyDomMode() {}
function exitBanOnlyDomMode() {}

/**
 * Update the stage indicator based on current view and phase.
 * Stages: ban-setting (lobby) -> ban (draft ban phase) -> pick (draft pick phase) -> start (done view)
 */
function updateStageTabs() {
  const progressBar = document.querySelector(".stage-progress-bar");
  const dots = document.querySelectorAll(".stage-progress-dot");
  if (dots.length === 0 || !progressBar) return;

  const currentView = document.querySelector(".view.is-active");
  const viewId = currentView?.id;
  const room = state.room;
  const turn = room ? state.schedule[room.turnIndex] : null;
  const isReadyPhase = state.phase === "ready" || String(room?.status || "") === "await-ready";
  const isBanPhase = turn?.action === "ban";

  let currentStage = null;
  if (viewId === "viewLobby") {
    currentStage = "bansetting";
  } else if (viewId === "viewDraft") {
    if (isReadyPhase) {
      currentStage = "ban";
    } else if (isBanPhase) {
      currentStage = "ban";
    } else {
      currentStage = "pick";
    }
  } else if (viewId === "viewDone") {
    currentStage = "start";
  }

  const stageOrder = ["bansetting", "ban", "pick", "start"];
  const currentIndex = stageOrder.indexOf(currentStage);

  progressBar.classList.remove("stage-0", "stage-1", "stage-2", "stage-3");
  progressBar.classList.add(`stage-${currentIndex}`);

  dots.forEach((dot) => {
    const dotStage = dot.getAttribute("data-stage");
    const dotIndex = stageOrder.indexOf(dotStage);

    dot.classList.remove("is-active", "is-completed");

    if (dotIndex < currentIndex) {
      dot.classList.add("is-completed");
    } else if (dotIndex === currentIndex) {
      dot.classList.add("is-active");
    }
  });
}

function renderDraftUi() {
  const room = state.room;
  if (!room || (state.phase !== "draft" && state.phase !== "ready")) return;

  const mySide = state.mySide;
  const turn = state.schedule[room.turnIndex];
  const isReadyPhase = state.phase === "ready" || String(room.status || "") === "await-ready";
  const isMyTurn = String(turn?.side || "") === "both" ? true : turn?.side === mySide;
  const isBanPhase = turn?.action === "ban";
  const totalTurns = state.schedule.length || 1;
  const progress = (room.turnIndex / totalTurns) * 100;
  const showBanOnly = Boolean(isBanPhase && !isReadyPhase);
  if (showBanOnly) enterBanOnlyDomMode();
  else exitBanOnlyDomMode();

  const pf = document.getElementById("progressFill");
  if (pf) pf.style.width = `${progress}%`;

  const hint = document.getElementById("draftHintBanner");
  if (hint) {
    if (isMyTurn && !isReadyPhase) {
      hint.hidden = false;
      hint.classList.toggle("is-ban", isBanPhase);
      hint.classList.toggle("is-pick", !isBanPhase);
      hint.textContent = isBanPhase
        ? "Ban an opponent card — your opponent cannot use that card, but you still can."
        : "Click a player to add them to your squad.";
    } else {
      hint.hidden = true;
    }
  }

  if (isBanPhase && !state.opponentBanPlayersLoaded && !state.loadingOpponentBanPlayers) {
    void loadOpponentBanPlayers();
  }

  const topReadyBtn = document.getElementById("draftTopReadyBtn");
  if (topReadyBtn) {
    if (isReadyPhase) {
      const myReady = Boolean(room.matchReady?.[mySide]);
      topReadyBtn.textContent = myReady ? "UNREADY" : "READY";
      topReadyBtn.disabled = false;
      topReadyBtn.title = "";
    } else {
      topReadyBtn.textContent = "READY";
      topReadyBtn.disabled = true;
      topReadyBtn.title = "Available after pick phase completes";
    }
  }

  const errEl = document.getElementById("draftActionError");
  if (errEl) {
    if (state.actionError) {
      errEl.textContent = state.actionError;
      errEl.hidden = false;
    } else {
      errEl.hidden = true;
    }
  }

  const myPicks = room.picks[mySide] || [];
  const theirSide = mySide === "host" ? "guest" : "host";
  const theirPicks = room.picks[theirSide] || [];
  const myBans = room.bans[mySide] || [];
  const bannedOnMe = room.bans[theirSide] || [];
  const formation = normalizeFormation(state.draftGamePlans.find((plan) => String(plan.id) === String(state.draftGamePlanSelectedId))?.formation || DEFAULT_FORMATION);

  const showBanBoard = Boolean(isBanPhase && !isReadyPhase);
  const banBoard = document.getElementById("draftBanPhaseBoard");
  const myBansStrip = document.getElementById("draftMyBansStrip");
  const bannedOnMeStrip = document.getElementById("draftBannedOnMeStrip");
  const banSearch = document.getElementById("banSearch");
  const banSort = document.getElementById("banSort");
  const banPos = document.getElementById("banPosition");
  const banGrid = document.getElementById("banGrid");
  if (banBoard && myBansStrip && bannedOnMeStrip && banSearch && banSort && banPos && banGrid) {
    banBoard.hidden = !showBanBoard;
    if (showBanBoard) {
      bindBanPhaseUiOnce();
      banSearch.value = state.banSearch || "";
      banSort.value = normalizeBanSortValue(state.banSort);
      banPos.value = "";
      renderBanToolbar();

      const myCountEl = document.getElementById("draftMyBansCount");
      const bannedOnMeCountEl = document.getElementById("draftBannedOnMeCount");
      const maxBans = Math.max(0, Math.floor(Number(room.config?.banCountPerSide) || 0));
      const myConfirmed = Boolean(room.bansConfirmed?.[mySide]);
      const theirConfirmed = Boolean(room.bansConfirmed?.[theirSide]);
      if (myCountEl) myCountEl.textContent = `${myBans.length + state.stagedBans.length}/${maxBans}`;
      if (bannedOnMeCountEl) bannedOnMeCountEl.textContent = `${bannedOnMe.length + state.opponentStagedBans.length}/${maxBans}`;

      // Opponent presence badge (username + status)
      {
        const theirInfo = mySide === "host" ? room.guest : room.host;
        const isOnline = Boolean(theirInfo?.id);
        const opponentDot = document.getElementById("draftBanOpponentDot");
        const opponentNameEl = document.getElementById("draftBanOpponentName");
        const bannedOnMeStatus = document.getElementById("draftBanOpponentStatus");
        if (opponentDot) opponentDot.classList.toggle("is-online", isOnline);
        if (opponentNameEl && theirInfo?.username) opponentNameEl.textContent = theirInfo.username.toUpperCase();
        if (bannedOnMeStatus) {
          if (!isOnline) {
            bannedOnMeStatus.textContent = "· left the room";
            bannedOnMeStatus.className = "ban-opponent-status-text is-offline";
          } else if (theirConfirmed) {
            bannedOnMeStatus.textContent = "· confirmed ✓";
            bannedOnMeStatus.className = "ban-opponent-status-text is-confirmed";
          } else {
            bannedOnMeStatus.textContent = "· is choosing...";
            bannedOnMeStatus.className = "ban-opponent-status-text";
          }
        }
      }

      // MY BANS self badge (symmetric with opponent badge)
      {
        const myInfo = mySide === "host" ? room.host : room.guest;
        const myDot = document.getElementById("draftMyBansDot");
        const myNameEl = document.getElementById("draftMyBansName");
        const myBadgeStatus = document.getElementById("draftMyBansBadgeStatus");
        if (myDot) myDot.classList.toggle("is-online", !state.presenceError);
        if (myNameEl) myNameEl.textContent = (myInfo?.username || "You").toUpperCase();
        if (myBadgeStatus) {
          if (state.presenceError) {
            myBadgeStatus.textContent = "· reconnecting...";
            myBadgeStatus.className = "ban-opponent-status-text is-offline";
          } else if (myConfirmed) {
            myBadgeStatus.textContent = "· confirmed ✓";
            myBadgeStatus.className = "ban-opponent-status-text is-confirmed";
          } else {
            myBadgeStatus.textContent = "· is choosing...";
            myBadgeStatus.className = "ban-opponent-status-text";
          }
        }
      }

      // MY BANS status hint: waiting for opponent after I confirmed
      const myBansStatus = document.getElementById("draftMyBansStatus");
      if (myBansStatus) {
        if (myConfirmed && !theirConfirmed) {
          myBansStatus.textContent = "Waiting for opponent to confirm...";
          myBansStatus.className = "ban-status-hint is-waiting";
        } else if (myConfirmed && theirConfirmed) {
          myBansStatus.textContent = "Both confirmed — moving to picks!";
          myBansStatus.className = "ban-status-hint is-confirmed";
        } else {
          myBansStatus.textContent = "";
          myBansStatus.className = "ban-status-hint";
        }
      }

      // Use stable state-key diffs instead of innerHTML string comparison.
      const totalShown = myBans.length + state.stagedBans.length;
      const myRemaining = maxBans > 0 ? Math.max(0, maxBans - totalShown) : 0;
      const myBansKey = [
        ...myBans.map((p) => String(p.id) + "c"),
        ...state.stagedBans.map((p) => String(p.id) + "s"),
        `e${myRemaining}`,
      ].join(",");
      if (myBansStrip.dataset.bansKey !== myBansKey) {
        const prevCount = myBansStrip.children.length;
        myBansStrip.dataset.bansKey = myBansKey;
        const emptySlot = `<div class="ban-side-empty-slot"></div>`;
        const allDisplay = [
          ...myBans.map((p) => imageOnlyThumbHtml(p, "md")),
          ...state.stagedBans.map((p) => stagedBanThumbHtml(p, "md")),
          ...Array.from({ length: myRemaining }, () => emptySlot),
        ];
        myBansStrip.innerHTML = allDisplay.join("");
        if (myBansStrip.children.length > prevCount) {
          const newLast = [...myBansStrip.children].filter((c) => c.classList.contains("ban-phase-thumb")).pop();
          newLast?.classList.add("is-new");
        }
      }

      const confirmBansBtn = document.getElementById("confirmBansBtn");
      if (confirmBansBtn) {
        confirmBansBtn.disabled = myConfirmed;
        confirmBansBtn.textContent = myConfirmed ? "CONFIRMED ✓" : "CONFIRM BANS";
        confirmBansBtn.classList.toggle("is-confirmed", myConfirmed);
      }

      // BANS ON ME strip: confirmed opponent bans + opponent staged (pending) + empty slots
      const opponentStagedBans = state.opponentStagedBans || [];
      const opponentRemaining = maxBans > 0 ? Math.max(0, maxBans - bannedOnMe.length - opponentStagedBans.length) : 0;
      const bannedOnMeKey = [
        ...bannedOnMe.map((p) => String(p.id) + "c"),
        ...opponentStagedBans.map((p) => String(p.id) + "s"),
        `e${opponentRemaining}`,
      ].join(",");
      if (bannedOnMeStrip.dataset.bansKey !== bannedOnMeKey) {
        const prevCount = bannedOnMeStrip.children.length;
        bannedOnMeStrip.dataset.bansKey = bannedOnMeKey;
        const emptySlot = `<div class="ban-side-empty-slot"></div>`;
        const display = [
          ...bannedOnMe.map((p) => imageOnlyThumbHtml(p, "md")),
          ...opponentStagedBans.map((p) => opponentStagedBanThumbHtml(p, "md")),
          ...Array.from({ length: opponentRemaining }, () => emptySlot),
        ];
        bannedOnMeStrip.innerHTML = display.join("");
        if (bannedOnMeStrip.children.length > prevCount) {
          const newLast = [...bannedOnMeStrip.children].filter((c) => c.classList.contains("ban-phase-thumb")).pop();
          newLast?.classList.add("is-new");
        }
      }

      const rows = getBanListPlayers();
      const myBanCount = (room.bans?.[mySide] || []).length;
      const canStillBan = !maxBans || (myBanCount + state.stagedBans.length) < maxBans;
      const stagedBanIds = new Set(state.stagedBans.map((p) => String(p.id)));
      const myConfirmedBanIds = new Set((room.bans?.[mySide] || []).map((b) => String(b.id)));
      const gridStateKey = [
        isMyTurn ? 1 : 0,
        canStillBan ? 1 : 0,
        isReadyPhase ? 1 : 0,
        rows.map((p) => {
          const id = String(p.id);
          return id + (myConfirmedBanIds.has(id) ? "b" : stagedBanIds.has(id) ? "s" : room.pickedPlayerIds.includes(id) ? "p" : "");
        }).join(","),
      ].join("|");
      if (banGrid.dataset.stateKey !== gridStateKey) {
        banGrid.dataset.stateKey = gridStateKey;
        banGrid.innerHTML = rows.length
          ? rows.map((p) => {
              const id = String(p.id);
              const banned = myConfirmedBanIds.has(id) || stagedBanIds.has(id);
              const pickedTaken = room.pickedPlayerIds.includes(id);
              const unavailable = banned || pickedTaken;
              const clickable = isMyTurn && canStillBan && !unavailable && !isReadyPhase;
              return banPlayerCardHtml(p, { banned, picked: pickedTaken, clickable });
            }).join("")
          : `<div class="ban-phase-empty ban-phase-empty--panel">${escapeHtml(
              state.loadingOpponentBanPlayers
                ? "Loading opponent squad cards..."
                : state.opponentBanPlayersLoaded
                  ? state.opponentBanPlayers.length
                    ? "Opponent squad loaded."
                    : "No opponent players to show yet."
                  : "Loading opponent squad cards...",
            )}</div>`;
      }
    }
  }

  // If server advanced to pick phase (via ban-confirm) but local timer hasn't started yet, start it.
  if (!isBanPhase && !isReadyPhase && state.phase === "draft" && !state.turnTimer) {
    startTurnTimer();
  }

  const pickBoard = document.getElementById("draftPickPhaseBoard");
  const readyBoard = document.getElementById("draftReadyPhaseBoard");
  const showPickBoard = !showBanBoard && !isReadyPhase;

  if (pickBoard) {
    pickBoard.hidden = !showPickBoard;
    if (showPickBoard) {
      bindPickPhaseUiOnce();

      const pickSearch = document.getElementById("pickSearch");
      if (pickSearch && pickSearch !== document.activeElement) pickSearch.value = state.pickSearch || "";
      renderPickToolbar();

      const myPicksCountEl = document.getElementById("draftMyPicksCount");
      const opponentPicksCountEl = document.getElementById("draftOpponentPicksCount");
      const maxPicks = Math.max(0, Math.floor(Number(room.config?.pickCountPerSide) || 0));
      if (myPicksCountEl) myPicksCountEl.textContent = `${myPicks.length}/${maxPicks || FIXED_PICKS_PER_SIDE}`;
      if (opponentPicksCountEl) opponentPicksCountEl.textContent = `${theirPicks.length}/${maxPicks || FIXED_PICKS_PER_SIDE}`;

      const opponentSection = document.getElementById("draftOpponentPicksSection");
      const revealMode = normalizeRevealMode(room.config?.revealMode);
      if (opponentSection) opponentSection.hidden = revealMode !== REVEAL_MODE_INSTANT;

      // Render my picks strip with state-key diff guard
      const myPicksStrip = document.getElementById("draftMyPicksStrip");
      if (myPicksStrip) {
        const myPicksKey = myPicks.map((p) => String(p.id)).join(",");
        if (myPicksStrip.dataset.picksKey !== myPicksKey) {
          const prevCount = myPicksStrip.children.length;
          myPicksStrip.dataset.picksKey = myPicksKey;
          myPicksStrip.innerHTML = myPicks.length ? myPicks.map((p) => imageOnlyThumbHtml(p, "md")).join("") : "";
          if (myPicksStrip.children.length > prevCount) myPicksStrip.lastElementChild?.classList.add("is-new");
        }
      }

      // Render opponent picks strip
      const opponentPicksStrip = document.getElementById("draftOpponentPicksStrip");
      if (opponentPicksStrip && revealMode === REVEAL_MODE_INSTANT) {
        const theirPicksKey = theirPicks.map((p) => String(p.id)).join(",");
        if (opponentPicksStrip.dataset.picksKey !== theirPicksKey) {
          const prevCount = opponentPicksStrip.children.length;
          opponentPicksStrip.dataset.picksKey = theirPicksKey;
          opponentPicksStrip.innerHTML = theirPicks.length ? theirPicks.map((p) => imageOnlyThumbHtml(p, "md")).join("") : "";
          if (opponentPicksStrip.children.length > prevCount) opponentPicksStrip.lastElementChild?.classList.add("is-new");
        }
      }

      // Render pick grid with state-key diff guard
      const pickGrid = document.getElementById("pickGrid");
      if (pickGrid) {
        const canStillPick = !maxPicks || myPicks.length < maxPicks;
        const pickRows = getPickListPlayers();
        const pickGridKey = [
          isMyTurn ? 1 : 0,
          canStillPick ? 1 : 0,
          pickRows.map((p) => {
            const id = String(p.id || p._raw?.id || "");
            return id + (room.pickedPlayerIds.includes(id) ? "p" : "");
          }).join(","),
        ].join("|");
        if (pickGrid.dataset.stateKey !== pickGridKey) {
          pickGrid.dataset.stateKey = pickGridKey;
          pickGrid.innerHTML = pickRows.length
            ? pickRows.map((p) => {
                const id = String(p.id || p._raw?.id || "");
                const alreadyPicked = room.pickedPlayerIds.includes(id);
                const clickable = isMyTurn && canStillPick && !alreadyPicked;
                return banPlayerCardHtml(p, { banned: false, picked: alreadyPicked, clickable });
              }).join("")
            : `<div class="ban-phase-empty ban-phase-empty--panel">${escapeHtml(
                state.loadingPlayers ? "Loading players..." : "No players found."
              )}</div>`;
        }
      }
    }
  }

  if (readyBoard) {
    readyBoard.hidden = !isReadyPhase;
    if (isReadyPhase) {
      const myReadyState = Boolean(room.matchReady?.[mySide]);
      const theirReadyState = Boolean(room.matchReady?.[theirSide]);
      const readyBtn = document.getElementById("draftReadyBtn");
      if (readyBtn) {
        readyBtn.textContent = myReadyState ? "UNREADY" : "READY";
        readyBtn.classList.toggle("btn--ghost", myReadyState);
        readyBtn.classList.toggle("btn--primary", !myReadyState);
      }
      const hint = document.getElementById("readyPhaseHint");
      if (hint) {
        const myName = room[mySide]?.username || (mySide === "host" ? "Host" : "Guest");
        const theirName = room[theirSide]?.username || (theirSide === "host" ? "Host" : "Guest");
        if (myReadyState && theirReadyState) {
          hint.textContent = "Both players ready — starting…";
        } else if (myReadyState) {
          hint.textContent = `Waiting for ${theirName}…`;
        } else if (theirReadyState) {
          hint.textContent = `${theirName} is ready. Click READY to start!`;
        } else {
          hint.textContent = "Click READY when you're set to play.";
        }
      }

      const revealMode = normalizeRevealMode(room.config?.revealMode);
      const cols = document.getElementById("readyPhaseColumns");
      if (cols) {
        const colKey = [
          myPicks.map((p) => String(p.id)).join(","),
          theirPicks.map((p) => String(p.id)).join(","),
          revealMode,
          mySide,
        ].join("|");
        if (cols.dataset.colKey !== colKey) {
          cols.dataset.colKey = colKey;
          const myName = room[mySide]?.username || (mySide === "host" ? "Host" : "Guest");
          const theirName = room[theirSide]?.username || (theirSide === "host" ? "Host" : "Guest");
          const pickRowHtml = (p) => `
            <div class="ready-phase-pick-row">
              <div class="ready-phase-pick-thumb">
                <img src="${escapeHtml(getPlayerImageSrc(p))}" alt="${escapeHtml(p.name || "Player")}" loading="lazy" />
              </div>
              <div style="min-width:0">
                <div class="ready-phase-pick-name">${escapeHtml(p.name || "—")}</div>
                <div class="ready-phase-pick-pos">${escapeHtml(p.position || "—")}</div>
              </div>
              <div class="ready-phase-pick-ovr">${escapeHtml(getPlayerCardValue(p))}</div>
            </div>`;
          const myCol = `
            <div class="ready-phase-col">
              <div class="ready-phase-col-title is-me">${escapeHtml(myName)} (YOU)</div>
              ${myPicks.map(pickRowHtml).join("") || '<div class="ban-phase-empty">No picks yet.</div>'}
            </div>`;
          const theirCol = revealMode === REVEAL_MODE_INSTANT
            ? `<div class="ready-phase-col">
                <div class="ready-phase-col-title">${escapeHtml(theirName)}</div>
                ${theirPicks.map(pickRowHtml).join("") || '<div class="ban-phase-empty">No picks yet.</div>'}
              </div>`
            : `<div class="ready-phase-hidden-col">
                <div class="ready-phase-hidden-msg">Opponent picks are hidden.<br>Reveal after the match!</div>
              </div>`;
          cols.innerHTML = myCol + theirCol;
        }
      }
    }
  }

  // Update stage tabs
  updateStageTabs();
}

function attachDraftGridHandlers() {
  attachMiniCardGridHandlers(
    document.getElementById("pickGrid"),
    getDraftDisplayPlayers,
    submitBan,
    submitPick,
  );
  attachMiniCardGridHandlers(
    document.getElementById("banGrid"),
    getDraftDisplayPlayers,
    submitBan,
    submitPick,
  );
}

function flushStagedBansLocally() {
  if (!state.stagedBans.length) return [];
  const toSubmit = [...state.stagedBans];
  state.stagedBans = [];
  const room = state.room;
  if (room) {
    for (const player of toSubmit) {
      applyLocalAction(room, player);
    }
  }
  return toSubmit;
}

async function submitBansToApi(players) {
  const room = state.room;
  if (!room || !players.length) return;
  for (const player of players) {
    try {
      const me = getCurrentIdentity();
      const res = await fetch(`/api/rooms/${encodeURIComponent(room.code)}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId: me.id, player: { id: String(player.id), name: player.name } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.error || "Could not confirm ban.");
      } else if (data.room) {
        applyPresenceSnapshot(data.room);
      }
    } catch {
      showToast("Could not confirm ban.");
    }
  }
  renderDraftUi();
}

async function callBanConfirm() {
  if (!state.room?.code) return;
  const me = getCurrentIdentity();
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/ban-confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId: me.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.room) {
      const prevTurnIndex = state.room.turnIndex;
      applyPresenceSnapshot(data.room);
      if (state.room.turnIndex > prevTurnIndex && state.phase === "draft") {
        startTurnTimer();
      }
      renderDraftUi();
    }
  } catch { /* ignore */ }
}

async function confirmStagedBans() {
  const toSubmit = flushStagedBansLocally();
  renderDraftUi();
  await submitBansToApi(toSubmit);
  await callBanConfirm();
}

function submitBan(player) {
  const room = state.room;
  if (!room) return;
  const turn = state.schedule[room.turnIndex];
  const isReadyPhase = state.phase === "ready" || String(room.status || "") === "await-ready";
  const isMyTurn = String(turn?.side || "") === "both" ? true : turn?.side === state.mySide;
  if (turn?.action !== "ban" || isReadyPhase || !isMyTurn) return;

  const id = String(player.id);
  if ((room.bans?.[state.mySide] || []).some((b) => String(b.id) === id)) return;
  if (state.stagedBans.some((p) => String(p.id) === id)) return;

  const cfg = room.config || defaultRoomConfig();
  const maxBans = Math.max(0, Math.floor(Number(cfg.banCountPerSide) || 0));
  const confirmedCount = (room.bans?.[state.mySide] || []).length;
  if (maxBans && confirmedCount + state.stagedBans.length >= maxBans) {
    showToast("You already used all bans for your side.");
    return;
  }

  state.stagedBans.push(player);
  renderDraftUi();
}

async function submitPick(player) {
  const room = state.room;
  if (!room) return;
  const turn = state.schedule[room.turnIndex];
  const isReadyPhase = state.phase === "ready" || String(room.status || "") === "await-ready";
  if (turn?.action !== "pick" || isReadyPhase) return;
  const maxPicks = Math.max(0, Math.floor(Number(room.config?.pickCountPerSide) || 0));
  const myPicks = room.picks?.[state.mySide] || [];
  if (maxPicks && myPicks.length >= maxPicks) {
    showToast("You've reached the pick limit.");
    return;
  }
  applyLocalAction(room, player);
  renderDraftUi();
  try {
    const me = getCurrentIdentity();
    const payloadPlayer = { id: String(player.id), name: player.name };
    const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/pick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId: me.id, player: payloadPlayer }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data?.error || "Could not confirm pick.");
      renderDraftUi();
      return;
    }
    if (data.room) applyPresenceSnapshot(data.room);
  } catch (err) {
    console.error("pick confirm error:", err);
    showToast("Could not confirm pick.");
  }
  renderDraftUi();
}

function showDone() {
  clearRoomPhaseCache(state.room?.code);
  showView("viewDone");
  updateStageTabs();
  const room = state.room;
  document.getElementById("doneRoomCode").textContent = `Room ${room.code}`;

  const mySide = state.mySide;
  const theirSide = mySide === "host" ? "guest" : "host";
  const myName = room[mySide]?.username || mySide;
  const theirName = room[theirSide]?.username || theirSide;
  const myPicks = room.picks[mySide] || [];
  const theirPicks = room.picks[theirSide] || [];

  const col = (name, picks, side, isMe) => `
    <div>
      <div class="done-col-title ${isMe ? "is-me" : ""}">${escapeHtml(name)}${isMe ? " (YOU)" : ""}</div>
      ${picks
        .map(
          (p) => `
        <div class="done-pick-row">
          <div class="done-pick-ovr">${p.overall_rating}</div>
          <div>
            <div class="done-pick-name">${escapeHtml(p.name)}</div>
            <div class="done-pick-sub">${escapeHtml(p.position)} · ${escapeHtml(p.nation)}</div>
          </div>
        </div>`,
        )
        .join("")}
    </div>
  `;

  document.getElementById("doneColumns").innerHTML =
    col(myName, myPicks, mySide, true) + col(theirName, theirPicks, theirSide, false);
}

let searchDebounceTimer = null;

function initDraftControls() {
  document.getElementById("draftSearch")?.addEventListener("input", (e) => {
    state.search = e.target.value;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => loadDraftPlayers(), 300);
  });
  document.getElementById("draftPosition")?.addEventListener("change", (e) => {
    state.position = e.target.value;
    loadDraftPlayers();
  });
  document.getElementById("draftGamePlanSelect")?.addEventListener("change", (e) => {
    state.draftGamePlanSelectedId = e.target.value || null;
    void loadDraftGamePlanPlayers(state.draftGamePlanSelectedId).then(() => renderDraftUi());
  });
  document.getElementById("draftTopReadyBtn")?.addEventListener("click", () => {
    if (state.phase !== "ready" || !state.room) return;
    const me = state.mySide;
    const nextReady = !Boolean(state.room.matchReady?.[me]);
    void setMatchReady(nextReady);
  });
  document.getElementById("draftReadyBtn")?.addEventListener("click", () => {
    if (state.phase !== "ready" || !state.room) return;
    const me = state.mySide;
    const nextReady = !Boolean(state.room.matchReady?.[me]);
    void setMatchReady(nextReady);
  });
  document.getElementById("confirmBansBtn")?.addEventListener("click", () => {
    void confirmStagedBans();
  });
  document.getElementById("draftMyBansStrip")?.addEventListener("click", (e) => {
    const btn = e.target instanceof Element ? e.target.closest("[data-remove-ban]") : null;
    if (!btn) return;
    const id = btn.getAttribute("data-remove-ban");
    state.stagedBans = state.stagedBans.filter((p) => String(p.id) !== id);
    renderDraftUi();
  });
  document.getElementById("draftLeaveBtn")?.addEventListener("click", async () => {
    if (state.mySide === "host") {
      const ok = await askConfirm({
        title: "Close Room",
        message: "Close room for everyone?",
        okText: "Close room",
      });
      if (!ok) return;
    } else {
      const ok = await askConfirm({
        title: "Leave Draft",
        message: "Leave the draft?",
        okText: "Leave",
      });
      if (!ok) return;
    }
    clearTurnTimer();
    await leavePresence();
    window.location.href = "/";
  });
}

// Wire up all callbacks so sub-modules can call back into room.js
cb.renderDraftUi = renderDraftUi;
cb.tryEnterDraftFromRoomSnapshot = tryEnterDraftFromRoomSnapshot;
cb.isBothMatchReady = isBothMatchReady;
cb.showDone = showDone;
cb.showRoomClosed = showRoomClosed;
cb.startDraftFromLobby = startDraftFromLobby;
cb.updateStageTabs = updateStageTabs;
cb.onOpponentLeft = showOpponentLeft;

/* SOCKET HOOKS (future): replace initLobby local room with:
 *   socket.emit('room:rejoin', { code }, cb)
 *   socket.on('room:updated', setRoom)
 *   socket.on('room:done', ...)
 *   emit('room:action', { code, playerId }) instead of applyLocalAction
 * ───────────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  initDraftControls();

  const code = getRoomCodeFromUrl();
  document.getElementById("copyInviteBtn")?.addEventListener("click", () => {
    const inviteUrl = new URL(window.location.origin + `/room/${encodeURIComponent(code)}`);
    inviteUrl.searchParams.set("mode", "join");
    navigator.clipboard.writeText(inviteUrl.toString()).then(
      () => showToast("Invite link copied!"),
      () => showToast(inviteUrl.toString()),
    );
  });
  document.getElementById("copyCodeBtn")?.addEventListener("click", () => {
    if (!code) return showToast("No room code.");
    navigator.clipboard.writeText(code).then(
      () => showToast("Code copied!"),
      () => showToast(code),
    );
  });

  window.requestAnimationFrame(() => {
    initLobby();
  });
});
