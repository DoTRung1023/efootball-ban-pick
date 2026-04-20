/* ============================================================
   Room page — lobby · draft · done
   Mirrors the React RoomPage flow. Socket.io can replace the
   local state machine later (see SOCKET HOOKS comments).
   ============================================================ */

const GREEN = "#00e676";
const RED = "#ff4444";
const TURN_SECONDS = 30;
const FIXED_PICKS_PER_SIDE = 23;

const ALLOWANCE_CATEGORY_DEFS = [
  { key: "position", label: "Position", placeholder: "CF,SS,RWF", type: "text" },
  { key: "overallMin", label: "Overall min", placeholder: "85", type: "number" },
  { key: "overallMax", label: "Overall max", placeholder: "100", type: "number" },
  { key: "overallMaxMin", label: "Overall max min", placeholder: "90", type: "number" },
  { key: "overallMaxMax", label: "Overall max max", placeholder: "103", type: "number" },
  { key: "club", label: "Club", placeholder: "Barcelona", type: "text" },
  { key: "league", label: "League", placeholder: "La Liga", type: "text" },
  { key: "nationality", label: "Nationality", placeholder: "France", type: "text" },
  { key: "heightMin", label: "Height min", placeholder: "170", type: "number" },
  { key: "heightMax", label: "Height max", placeholder: "200", type: "number" },
  { key: "weightMin", label: "Weight min", placeholder: "65", type: "number" },
  { key: "weightMax", label: "Weight max", placeholder: "95", type: "number" },
  { key: "ageMin", label: "Age min", placeholder: "18", type: "number" },
  { key: "ageMax", label: "Age max", placeholder: "38", type: "number" },
  { key: "cardType", label: "Card type", placeholder: "Epic,Highlight", type: "text" },
  { key: "region", label: "Region", placeholder: "Europe", type: "text" },
  { key: "foot", label: "Foot", placeholder: "Left,Right", type: "text" },
  { key: "playingStyle", label: "Playing style", placeholder: "Goal Poacher", type: "text" },
];
const ALLOWANCE_DEF_MAP = new Map(ALLOWANCE_CATEGORY_DEFS.map((d) => [d.key, d]));
const POSITION_OPTIONS = ["GK", "CB", "LB", "RB", "DMF", "CMF", "AMF", "LWF", "RWF", "SS", "CF"];

function readAllowanceFieldValue(input) {
  if (!input) return "";
  if (input.tagName === "SELECT" && input.multiple) {
    return Array.from(input.selectedOptions)
      .map((opt) => String(opt.value || "").trim())
      .filter(Boolean)
      .join(",");
  }
  return String(input.value || "").trim();
}

function normalizePositionValue(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i && POSITION_OPTIONS.includes(v));
}

function positionSummaryText(selected) {
  if (!selected.length) return "Any position";
  if (selected.length <= 3) return selected.join(", ");
  return `${selected.length} selected`;
}

/** @type {{ phase: string, room: object | null, schedule: object[], mySide: string, search: string, position: string, players: object[], loadingPlayers: boolean, turnTimer: ReturnType<typeof setInterval> | null, presencePollId: ReturnType<typeof setInterval> | null, actionError: string }} */
const state = {
  phase: "loading",
  room: null,
  schedule: [],
  mySide: "host",
  search: "",
  position: "",
  players: [],
  loadingPlayers: false,
  turnTimer: null,
  presencePollId: null,
  lastRoomUpdatedAt: 0,
  lobbyConfigDirty: false,
  actionError: "",
};

function getUser() {
  try {
    return JSON.parse(localStorage.getItem("efb_user") || "null");
  } catch {
    return null;
  }
}

/** Stable id for signed-out users so server presence does not churn every request */
function getAnonId() {
  try {
    let id = sessionStorage.getItem("efb_room_anon_id");
    if (!id) {
      id = `anon-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
      sessionStorage.setItem("efb_room_anon_id", id);
    }
    return id;
  } catch {
    return `anon-${Date.now()}`;
  }
}

function getCurrentIdentity() {
  const user = getUser();
  if (user?.id) return { id: String(user.id), username: user.username || "User" };
  return { id: getAnonId(), username: state.mySide === "host" ? "Host" : "Guest" };
}

function defaultRoomConfig() {
  return {
    allowAllPlayers: true,
    banCountPerSide: 0,
    pickCountPerSide: FIXED_PICKS_PER_SIDE,
    allowanceEnabled: [],
    allowance: {
      position: "",
      overallMin: "",
      overallMax: "",
      overallMaxMin: "",
      overallMaxMax: "",
      club: "",
      league: "",
      nationality: "",
      heightMin: "",
      heightMax: "",
      weightMin: "",
      weightMax: "",
      ageMin: "",
      ageMax: "",
      cardType: "",
      region: "",
      foot: "",
      playingStyle: "",
    },
  };
}

function defaultReadyState() {
  return { guest: false };
}

function normalizeRoomConfig(raw) {
  return {
    ...defaultRoomConfig(),
    ...(raw || {}),
    allowance: {
      ...defaultRoomConfig().allowance,
      ...((raw && raw.allowance) || {}),
    },
  };
}

/** Merge server-reported host/guest/config/chat into local room. */
function applyPresenceSnapshot(sr) {
  if (!state.room || !sr) return;
  const room = state.room;
  if (sr.host?.username) {
    room.host = { id: String(sr.host.id), username: sr.host.username };
  }
  if (sr.guest?.username) {
    room.guest = { id: String(sr.guest.id), username: sr.guest.username };
  } else {
    room.guest = null;
  }
  const incomingConfig = normalizeRoomConfig(sr.config);
  // While host is actively editing, do not let polling snapshots override local draft values.
  if (!(state.mySide === "host" && state.phase === "lobby" && state.lobbyConfigDirty)) {
    room.config = incomingConfig;
  }
  room.ready = {
    ...defaultReadyState(),
    ...(sr.ready || {}),
  };
  room.chat = Array.isArray(sr.chat) ? sr.chat : [];
  room.closed = Boolean(sr.closed);
  room.closeReason = sr.closeReason || "";
  state.lastRoomUpdatedAt = Number(sr.updatedAt || state.lastRoomUpdatedAt || Date.now());
}

function showRoomClosed(message = "Room is closed.") {
  const msg = document.getElementById("errorMessage");
  if (msg) msg.textContent = message;
  const btn = document.getElementById("errorLeaveBtn");
  if (btn) btn.textContent = "Leave room";
  showView("viewError");
}

async function registerPresence() {
  const code = state.room?.code;
  if (!code) return;
  const user = getUser();
  const userId = user?.id ?? getAnonId();
  const username = user?.username ?? (state.mySide === "host" ? "You" : "Guest");
  const role = state.mySide === "host" ? "host" : "guest";
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/presence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, userId, username }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 410 && data.room) {
      applyPresenceSnapshot(data.room);
      if (state.room?.closed) showRoomClosed(state.room.closeReason || "Host closed the room.");
    }
    return;
  }
  if (data.room) applyPresenceSnapshot(data.room);
  return data.room || null;
}

async function fetchRoomSnapshot() {
  const code = state.room?.code;
  if (!code) return { changed: false };
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
  if (!res.ok) return { changed: false };
  const data = await res.json().catch(() => ({}));
  const room = data.room;
  if (!room) return { changed: false };
  const nextUpdatedAt = Number(room.updatedAt || 0);
  const changed = nextUpdatedAt > Number(state.lastRoomUpdatedAt || 0);
  if (changed || !state.room?.host || !state.room?.guest) {
    applyPresenceSnapshot(room);
  }
  return { changed: changed || !state.room };
}

async function leavePresence() {
  const code = state.room?.code;
  if (!code) return;
  const me = getCurrentIdentity();
  try {
    await fetch(`/api/rooms/${encodeURIComponent(code)}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId: me.id }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

function stopPresencePolling() {
  if (state.presencePollId) {
    clearInterval(state.presencePollId);
    state.presencePollId = null;
  }
}

async function pollPresence() {
  if (state.phase !== "lobby" || !state.room?.code) return;
  try {
    await registerPresence(); // heartbeat
    const snap = await fetchRoomSnapshot();
    if (state.room?.closed) {
      stopPresencePolling();
      showRoomClosed(state.room.closeReason || "Host closed the room.");
      return;
    }
    if (snap.changed) renderLobby();
  } catch {
    /* ignore */
  }
}

async function registerAndPollPresence() {
  try {
    await registerPresence();
    await fetchRoomSnapshot();
  } catch (e) {
    console.warn("Room presence register failed", e);
  }
  stopPresencePolling();
  state.presencePollId = setInterval(pollPresence, 2000);
  renderLobby();
}

function getRoomCodeFromUrl() {
  const path = window.location.pathname || "";
  const m = path.match(/\/room\/([^/]+)$/);
  if (m?.[1]) return decodeURIComponent(m[1]).toUpperCase();
  const q = new URLSearchParams(window.location.search);
  return (q.get("code") || "").toUpperCase();
}

function parseQuery() {
  const q = new URLSearchParams(window.location.search);
  return {
    bans: Math.max(0, Math.min(6, Number(q.get("bans")) || 0)),
    picks: Math.max(0, Math.min(11, Number(q.get("picks")) || 0)),
    mode: (q.get("mode") || "").toLowerCase(),
  };
}

function showToast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 2400);
}

function askConfirm({ title = "Confirm", message = "Are you sure?", okText = "OK", cancelText = "Cancel" }) {
  const overlay = document.getElementById("confirmOverlay");
  const titleEl = document.getElementById("confirmTitle");
  const msgEl = document.getElementById("confirmMessage");
  const okBtn = document.getElementById("confirmOkBtn");
  const cancelBtn = document.getElementById("confirmCancelBtn");
  if (!overlay || !titleEl || !msgEl || !okBtn || !cancelBtn) {
    return Promise.resolve(window.confirm(message));
  }

  titleEl.textContent = title;
  msgEl.textContent = message;
  okBtn.textContent = okText;
  cancelBtn.textContent = cancelText;
  overlay.removeAttribute("hidden");

  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      overlay.setAttribute("hidden", "");
      overlay.removeEventListener("click", onBackdrop);
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKey);
      resolve(v);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onBackdrop = (e) => { if (e.target === overlay) finish(false); };
    const onKey = (e) => {
      if (e.key === "Escape") finish(false);
      if (e.key === "Enter") finish(true);
    };
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
    okBtn.focus();
  });
}

function showView(id) {
  ["viewError", "viewAbandoned", "viewLobby", "viewDraft", "viewDone"].forEach((vid) => {
    const el = document.getElementById(vid);
    if (!el) return;
    if (vid === id) {
      el.removeAttribute("hidden");
      el.classList.add("is-active");
    } else {
      el.setAttribute("hidden", "");
      el.classList.remove("is-active");
    }
  });
}

/**
 * Build alternating ban then pick turns (host starts each phase).
 * @param {number} bansPerSide
 * @param {number} picksPerSide
 */
function buildTurnSchedule(bansPerSide, picksPerSide) {
  const turns = [];
  for (let i = 0; i < bansPerSide * 2; i++) {
    turns.push({ side: i % 2 === 0 ? "host" : "guest", action: "ban" });
  }
  for (let i = 0; i < picksPerSide * 2; i++) {
    turns.push({ side: i % 2 === 0 ? "host" : "guest", action: "pick" });
  }
  return turns;
}

function emptyRoom(code, host, guest) {
  return {
    code,
    host: host || null,
    guest: guest || null,
    status: "lobby",
    turnIndex: 0,
    turnEndsAt: null,
    bans: { host: [], guest: [] },
    picks: { host: [], guest: [] },
    config: defaultRoomConfig(),
    ready: defaultReadyState(),
    chat: [],
    bannedPlayerIds: [],
    pickedPlayerIds: [],
    currentTurn: null,
  };
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
      renderLobby();
    }
  } catch {
    showToast("Could not update ready.");
  }
}

function syncCurrentTurnFromIndex(room) {
  const t = state.schedule[room.turnIndex];
  room.currentTurn = t || null;
}

function getTakenIds(room) {
  return new Set([...(room.bannedPlayerIds || []), ...(room.pickedPlayerIds || [])]);
}

function normalizeApiPlayer(p) {
  const ovr = p.overall_max ?? p.overall ?? "—";
  return {
    id: String(p.id),
    name: p.name,
    position: p.position || "—",
    overall_rating: ovr,
    nation: p.nationality || "—",
    speed: "—",
    finishing: "—",
    passing: "—",
    _raw: p,
  };
}

let searchDebounceTimer = null;

async function fetchPlayers() {
  const params = new URLSearchParams({ limit: "30", sortBy: "overall_max_desc" });
  if (state.search.trim()) params.set("q", state.search.trim());
  if (state.position) params.set("position", state.position);
  const cfg = state.room?.config || defaultRoomConfig();
  const a = cfg.allowance || {};
  const enabled = new Set(cfg.allowanceEnabled || []);
  if (!cfg.allowAllPlayers) {
    if (enabled.has("position") && a.position) params.set("positions", a.position);
    if (enabled.has("overallMin") && a.overallMin) params.set("overallMin", a.overallMin);
    if (enabled.has("overallMax") && a.overallMax) params.set("overallMax", a.overallMax);
    if (enabled.has("overallMaxMin") && a.overallMaxMin) params.set("maxOverallMin", a.overallMaxMin);
    if (enabled.has("overallMaxMax") && a.overallMaxMax) params.set("maxOverallMax", a.overallMaxMax);
    if (enabled.has("club") && a.club) params.set("club", a.club);
    if (enabled.has("league") && a.league) params.set("league", a.league);
    if (enabled.has("nationality") && a.nationality) params.set("nationality", a.nationality);
    if (enabled.has("heightMin") && a.heightMin) params.set("heightMin", a.heightMin);
    if (enabled.has("heightMax") && a.heightMax) params.set("heightMax", a.heightMax);
    if (enabled.has("weightMin") && a.weightMin) params.set("weightMin", a.weightMin);
    if (enabled.has("weightMax") && a.weightMax) params.set("weightMax", a.weightMax);
    if (enabled.has("ageMin") && a.ageMin) params.set("ageMin", a.ageMin);
    if (enabled.has("ageMax") && a.ageMax) params.set("ageMax", a.ageMax);
    if (enabled.has("cardType") && a.cardType) params.set("cardType", a.cardType);
    if (enabled.has("foot") && a.foot) params.set("foot", a.foot);
    if (enabled.has("playingStyle") && a.playingStyle) params.set("playingStyle", a.playingStyle);
  }
  const res = await fetch(`/api/players?${params}`);
  if (!res.ok) throw new Error("Players unavailable");
  const data = await res.json();
  let rows = data.players || [];
  if (!cfg.allowAllPlayers && enabled.has("region") && a.region) {
    const regionQ = String(a.region).toLowerCase();
    rows = rows.filter((p) => String(p.region || "").toLowerCase().includes(regionQ));
  }
  return rows.map(normalizeApiPlayer);
}

function applyLocalAction(room, player) {
  const turn = state.schedule[room.turnIndex];
  if (!turn) return;

  const id = String(player.id);
  if (room.bannedPlayerIds.includes(id) || room.pickedPlayerIds.includes(id)) return;

  if (turn.action === "ban") {
    room.bans[turn.side].push(player);
    room.bannedPlayerIds.push(id);
  } else {
    room.picks[turn.side].push(player);
    room.pickedPlayerIds.push(id);
  }

  room.turnIndex += 1;
  syncCurrentTurnFromIndex(room);

  if (room.turnIndex >= state.schedule.length) {
    room.status = "done";
    state.phase = "done";
    clearTurnTimer();
    showDone();
    return;
  }

  room.turnEndsAt = Date.now() + TURN_SECONDS * 1000;
  startTurnTimer();
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
      const pct = Math.min(1, left / TURN_SECONDS);
      const deg = pct * 360;
      const color = left <= 5 ? RED : GREEN;
      ring.classList.toggle("is-low", left <= 5);
      ring.style.background = `conic-gradient(${color} ${deg}deg, #1a1a2a 0deg)`;
    }

    if (left <= 0) {
      clearTurnTimer();
      state.actionError = "⏱ Time ran out — turn skipped (local demo).";
      const r = state.room;
      if (r && state.schedule[r.turnIndex] !== undefined) {
        r.turnIndex += 1;
        syncCurrentTurnFromIndex(r);
        if (r.turnIndex >= state.schedule.length) {
          r.status = "done";
          state.phase = "done";
          showDone();
          return;
        }
        r.turnEndsAt = Date.now() + TURN_SECONDS * 1000;
        startTurnTimer();
      }
      const errEl = document.getElementById("draftActionError");
      if (errEl) {
        errEl.textContent = state.actionError;
        errEl.hidden = false;
      }
      setTimeout(() => {
        state.actionError = "";
        const e = document.getElementById("draftActionError");
        if (e) e.hidden = true;
      }, 3000);
      renderDraftUi();
    }
  };
  tick();
  state.turnTimer = setInterval(tick, 250);
}

/* ── Render lobby ─────────────────────────────────────────── */
function renderLobby() {
  const room = state.room;
  const isHost = state.mySide === "host";
  const cfg = room.config || defaultRoomConfig();
  const allowance = cfg.allowance || {};
  const allowanceEnabled = Array.isArray(cfg.allowanceEnabled) ? cfg.allowanceEnabled : [];

  document.getElementById("lobbyCodeDisplay").textContent = room.code;
  document.getElementById("lobbyHostName").textContent = room.host?.username || "—";
  document.getElementById("lobbyGuestName").textContent = room.guest?.username || "Waiting…";

  const hostSlot = document.getElementById("lobbyHostSlot");
  const guestSlot = document.getElementById("lobbyGuestSlot");
  hostSlot.classList.toggle("is-ready", !!room.host);
  guestSlot.classList.toggle("is-ready", !!room.guest);

  document.getElementById("lobbyGuestStatus").textContent = room.guest ? "● Connected" : "";
  if (room.guest && room.ready?.guest) {
    document.getElementById("lobbyGuestStatus").textContent = "● Ready";
  }
  document.getElementById("lobbyGuestStatus").classList.toggle("player-slot-status--ok", !!room.guest);

  const hint = document.getElementById("lobbyHint");
  if (isHost) {
    hint.textContent = "Share code, agree settings in chat, then start.";
  } else {
    hint.textContent = "Waiting for host to finalize rules and start…";
  }

  const allowAllEl = document.getElementById("allowAllPlayersInput");
  const bansEl = document.getElementById("lobbyBansInput");
  if (allowAllEl && !allowAllEl.dataset.touched) allowAllEl.checked = Boolean(cfg.allowAllPlayers);
  if (bansEl && !bansEl.dataset.touched) bansEl.value = String(cfg.banCountPerSide ?? 0);

  const meta = document.getElementById("lobbyMeta");
  const b = Number(cfg.banCountPerSide) || 0;
  const p = FIXED_PICKS_PER_SIDE;
  const total = b * 2 + p * 2;
  const activeFilters = allowanceEnabled.length;
  meta.textContent =
    total > 0
      ? `Session: ${b} ban(s) per side, ${p} pick(s) per side (${total} turns) · ${cfg.allowAllPlayers ? "All players allowed" : `${activeFilters} allowance filter(s) active`}.`
      : "Set ban/pick counts before starting.";

  const startBtn = document.getElementById("startDraftBtn");
  const lobbyLeaveBtn = document.getElementById("lobbyLeaveBtn");
  const settings = document.getElementById("lobbySettings");
  const guestReady = Boolean(room.ready?.guest);

  if (isHost) {
    if (lobbyLeaveBtn) lobbyLeaveBtn.textContent = "Close room";
    startBtn.hidden = false;
    settings.hidden = false;

    const canStart = room.guest && guestReady && total > 0;
    startBtn.disabled = !canStart;
    startBtn.textContent = !room.guest
      ? "Waiting for opponent…"
      : !guestReady
        ? "Waiting for opponent ready…"
      : !total
        ? "Set bans / picks first"
        : "START DRAFT";
    startBtn.classList.toggle("btn--primary", canStart);
    startBtn.classList.toggle("btn--ghost", !canStart);
  } else {
    if (lobbyLeaveBtn) lobbyLeaveBtn.textContent = "Leave";
    startBtn.hidden = false;
    startBtn.disabled = !room.host || !room.guest;
    startBtn.textContent = guestReady ? "UNREADY" : "READY";
    startBtn.classList.add("btn--primary");
    startBtn.classList.remove("btn--ghost");
    settings.hidden = false;
  }

  if (allowAllEl) allowAllEl.disabled = !isHost;
  if (bansEl) bansEl.disabled = !isHost;
  renderAllowanceList({ isHost, cfg });

  const chatInput = document.getElementById("chatInput");
  const chatFormBtn = document.querySelector("#chatForm button[type='submit']");
  const canChat = Boolean(room.host && room.guest);
  if (chatInput) chatInput.disabled = !canChat;
  if (chatFormBtn) chatFormBtn.disabled = !canChat;
  if (chatInput && !canChat) {
    chatInput.placeholder = "Chat unlocks when both users are connected...";
  }

  renderLobbyChat();
}

function renderAllowanceList({ isHost, cfg }) {
  const select = document.getElementById("allowanceCategorySelect");
  const addBtn = document.getElementById("addAllowanceBtn");
  const list = document.getElementById("allowanceList");
  const controls = document.getElementById("allowanceControls");
  if (!select || !addBtn || !list || !controls) return;

  const enabled = Array.isArray(cfg.allowanceEnabled) ? cfg.allowanceEnabled : [];
  const enabledSet = new Set(enabled);
  const canEdit = isHost && !cfg.allowAllPlayers;
  controls.classList.toggle("is-disabled", !canEdit);
  select.disabled = !canEdit;
  addBtn.disabled = !canEdit;

  const available = ALLOWANCE_CATEGORY_DEFS.filter((d) => !enabledSet.has(d.key));
  const prevSelected = select.value;
  select.innerHTML = available.length
    ? available.map((d) => `<option value="${d.key}">${escapeHtml(d.label)}</option>`).join("")
    : '<option value="">All categories added</option>';
  if (available.some((d) => d.key === prevSelected)) select.value = prevSelected;
  if (!available.length) select.disabled = true;

  if (!enabled.length) {
    list.innerHTML = '<div class="allowance-empty">No categories added. All players are allowed.</div>';
    return;
  }

  list.innerHTML = enabled.map((key) => {
    const def = ALLOWANCE_DEF_MAP.get(key);
    if (!def) return "";
    const value = cfg.allowance?.[key] ?? "";
    const isPosition = key === "position";
    const selectedPositions = normalizePositionValue(value);
    const selectedSet = new Set(selectedPositions);
    const positionSelectHtml = `
      <div class="allowance-pos-dropdown ${canEdit ? "" : "is-disabled"}" data-allowance-pos-dropdown>
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
    return `
      <div class="allowance-item" data-allowance-key="${key}">
        <label>${escapeHtml(def.label)}</label>
        <div class="allowance-item-row">
          ${isPosition ? positionSelectHtml : regularInputHtml}
          <button type="button" class="allowance-remove-btn" data-allowance-remove="${key}" ${canEdit ? "" : "disabled"}>Remove</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderLobbyChat() {
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

let configSyncDebounce = null;
let latestConfigSyncSeq = 0;
let latestConfigAckSeq = 0;
async function pushLobbyConfig() {
  if (state.mySide !== "host" || !state.room?.code) return;
  const myId = getCurrentIdentity().id;
  // Build payload from DOM first so unsynced typing/spam cannot be overwritten by polling.
  const allowAllInput = document.getElementById("allowAllPlayersInput");
  const bansInput = document.getElementById("lobbyBansInput");
  const allowanceInputs = Array.from(document.querySelectorAll(".allowance-item-input"));

  const allowAllFromDom = allowAllInput ? Boolean(allowAllInput.checked) : null;
  const bansFromDom = bansInput ? Math.max(0, Math.min(10, Number(bansInput.value) || 0)) : null;
  const allowanceEnabledFromDom = allowanceInputs.map((input) => input.dataset.allowanceKey).filter(Boolean);
  const allowanceFromDom = {};
  allowanceInputs.forEach((input) => {
    const key = input.dataset.allowanceKey;
    if (!key) return;
    allowanceFromDom[key] = readAllowanceFieldValue(input);
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
  const reqSeq = ++latestConfigSyncSeq;

  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId: myId, clientSeq: reqSeq, allowAllPlayers: allowAll, banCountPerSide, allowanceEnabled, allowance }),
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

function scheduleLobbyConfigPush() {
  clearTimeout(configSyncDebounce);
  state.lobbyConfigDirty = true;
  configSyncDebounce = setTimeout(pushLobbyConfig, 300);
}

async function sendLobbyChatMessage(raw) {
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

  const head = `
    <div class="side-panel-head ${isMe ? "is-me" : ""}">
      ${isMe ? "▶ " : ""}${String(title).toUpperCase()}
      ${isMe ? '<span class="you-tag">(you)</span>' : ""}
      ${isTurn ? '<span class="turn-dot"></span>' : ""}
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

function slotHtml(player, type) {
  const isBan = type === "ban";
  if (!player) {
    return `<div class="slot-item ${isBan ? "is-ban" : "is-pick"}"><div class="slot-empty">—</div></div>`;
  }
  const ovr = player.overall_rating ?? "—";
  const lastName = String(player.name || "").trim().split(/\s+/).pop() || player.name;
  return `
    <div class="slot-item ${isBan ? "is-ban" : "is-pick"}">
      <div class="slot-ovr">${ovr}</div>
      <div style="min-width:0">
        <div class="slot-name">${escapeHtml(lastName)}</div>
        <div class="slot-pos">${escapeHtml(player.position || "")}</div>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDraftUi() {
  const room = state.room;
  if (!room || state.phase !== "draft") return;

  const mySide = state.mySide;
  const turn = state.schedule[room.turnIndex];
  const isMyTurn = turn?.side === mySide;
  const isBanPhase = turn?.action === "ban";
  const totalTurns = state.schedule.length || 1;
  const turnNum = room.turnIndex + 1;
  const progress = (room.turnIndex / totalTurns) * 100;

  const pill = document.getElementById("turnPill");
  const kicker = document.getElementById("turnPillKicker");
  const main = document.getElementById("turnPillMain");
  if (kicker)
    kicker.textContent = `${isBanPhase ? "BAN" : "PICK"} ${turnNum}/${totalTurns}`;
  if (main) {
    const name =
      turn?.side === "host"
        ? room.host?.username || "Host"
        : room.guest?.username || "Guest";
    main.textContent = isMyTurn ? "YOUR TURN" : `${name}'s turn`;
  }
  if (pill) {
    pill.classList.toggle("is-mine", isMyTurn);
    pill.classList.toggle("is-ban", isBanPhase);
    pill.classList.toggle("is-pick", !isBanPhase);
  }

  document.getElementById("progressFill").style.width = `${progress}%`;

  const hint = document.getElementById("draftHintBanner");
  if (isMyTurn) {
    hint.hidden = false;
    hint.classList.toggle("is-ban", isBanPhase);
    hint.classList.toggle("is-pick", !isBanPhase);
    hint.textContent = isBanPhase
      ? "Click a player to BAN — banned players cannot be picked by either side."
      : "Click a player to add them to your squad.";
  } else {
    hint.hidden = true;
  }

  renderSidePanel("sidePanelHost", "host", room, mySide);
  renderSidePanel("sidePanelGuest", "guest", room, mySide);

  const grid = document.getElementById("draftGrid");
  const taken = getTakenIds(room);
  grid.innerHTML = state.players
    .map((p) => {
      const id = String(p.id);
      const banned = room.bannedPlayerIds.includes(id);
      const picked = room.pickedPlayerIds.includes(id);
      const unavailable = banned || picked;
      const clickable = isMyTurn && !unavailable;
      return miniCardHtml(p, { banned, picked, clickable, isBanPhase });
    })
    .join("");
}

function miniCardHtml(player, o) {
  const { banned, picked, clickable, isBanPhase } = o;
  const unavailable = banned || picked;
  const phaseClass = isBanPhase ? "is-ban-phase" : "is-pick-phase";
  return `
    <div class="mini-card ${unavailable ? (banned ? "is-ban" : "is-pick") : ""} ${clickable ? "is-clickable" : ""}"
         data-player-id="${escapeHtml(player.id)}"
         tabindex="${clickable ? 0 : -1}">
      ${banned ? '<div class="mini-overlay" aria-hidden="true">🚫</div>' : ""}
      ${picked ? '<div class="mini-overlay" aria-hidden="true">✅</div>' : ""}
      <div class="mini-row">
        <div class="mini-ovr">${player.overall_rating}</div>
        <div style="min-width:0">
          <div class="mini-name">${escapeHtml(player.name)}</div>
          <div class="mini-sub">${escapeHtml(player.position)} · ${escapeHtml(player.nation)}</div>
        </div>
      </div>
      <div class="mini-stats">
        ${["SPD", "FIN", "PAS"]
          .map((l, i) => {
            const vals = [player.speed, player.finishing, player.passing];
            return `<div class="mini-stat"><div class="mini-stat-l">${l}</div><div class="mini-stat-v">${vals[i] ?? "—"}</div></div>`;
          })
          .join("")}
      </div>
      <div class="mini-cta ${isBanPhase ? "is-ban" : "is-pick"} mini-cta-hover" style="display:none"></div>
    </div>
  `;
}

/* delegated hover + click on grid */
function attachDraftGridHandlers() {
  const grid = document.getElementById("draftGrid");
  if (!grid || grid._bound) return;
  grid._bound = true;

  grid.addEventListener("mouseover", (e) => {
    const card = e.target.closest(".mini-card.is-clickable");
    grid.querySelectorAll(".mini-card.is-hovered").forEach((c) => c.classList.remove("is-hovered"));
    if (card) card.classList.add("is-hovered");
  });
  grid.addEventListener("mouseout", (e) => {
    const card = e.target.closest(".mini-card");
    if (card) card.classList.remove("is-hovered");
  });

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".mini-card.is-clickable");
    if (!card) return;
    const id = card.dataset.playerId;
    const player = state.players.find((p) => String(p.id) === id);
    if (!player) return;

    state.actionError = "";
    const errEl = document.getElementById("draftActionError");
    if (errEl) errEl.hidden = true;

    applyLocalAction(state.room, player);
    renderDraftUi();
  });
}

async function loadDraftPlayers() {
  const loading = document.getElementById("draftLoading");
  state.loadingPlayers = true;
  if (loading) loading.hidden = false;
  try {
    state.players = await fetchPlayers();
  } catch {
    state.players = [];
    showToast("Could not load players.");
  } finally {
    state.loadingPlayers = false;
    if (loading) loading.hidden = true;
    renderDraftUi();
  }
}

function showDone() {
  showView("viewDone");
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
  const b = Math.max(0, Math.min(10, Number(cfg.banCountPerSide) || 0));
  const p = 23;

  if (b === 0 && p === 0) {
    showToast("Set at least one ban or pick per side.");
    return;
  }

  state.schedule = buildTurnSchedule(b, p);
  const room = state.room;
  room.status = "drafting";
  room.turnIndex = 0;
  syncCurrentTurnFromIndex(room);
  room.turnEndsAt = Date.now() + TURN_SECONDS * 1000;
  state.phase = "draft";
  stopPresencePolling();

  showView("viewDraft");
  renderDraftUi();
  attachDraftGridHandlers();
  loadDraftPlayers();
  startTurnTimer();
}

function initLobby() {
  const q = parseQuery();
  const user = getUser();
  const code = getRoomCodeFromUrl();

  if (!code || code.length < 4) {
    showView("viewError");
    document.getElementById("errorMessage").textContent = "Invalid room code.";
    return;
  }

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

  showView("viewLobby");
  renderLobby();

  void registerAndPollPresence();

  document.getElementById("startDraftBtn")?.addEventListener("click", () => startDraftFromLobby());

  document.getElementById("allowAllPlayersInput")?.addEventListener("change", (e) => {
    e.target.dataset.touched = "1";
    state.room.config.allowAllPlayers = Boolean(e.target.checked);
    renderLobby();
    scheduleLobbyConfigPush();
  });
  document.getElementById("lobbyBansInput")?.addEventListener("input", (e) => {
    e.target.dataset.touched = "1";
    const normalized = Math.max(0, Math.min(10, Number(e.target.value) || 0));
    e.target.value = String(normalized);
    state.room.config.banCountPerSide = normalized;
    renderLobby();
    scheduleLobbyConfigPush();
  });

  document.getElementById("addAllowanceBtn")?.addEventListener("click", () => {
    if (state.mySide !== "host") return;
    const select = document.getElementById("allowanceCategorySelect");
    const key = select?.value;
    if (!key) return;
    const cfg = state.room.config || defaultRoomConfig();
    const enabled = new Set(cfg.allowanceEnabled || []);
    if (enabled.has(key)) return;
    enabled.add(key);
    state.room.config.allowanceEnabled = [...enabled];
    state.room.config.allowance[key] = state.room.config.allowance[key] || "";
    renderLobby();
    const node = document.querySelector(`[data-allowance-key="${key}"]`);
    if (node) {
      node.classList.add("is-added");
      setTimeout(() => node.classList.remove("is-added"), 360);
    }
    scheduleLobbyConfigPush();
  });

  document.getElementById("allowanceList")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-allowance-remove]");
    if (btn && state.mySide === "host") {
      const key = btn.dataset.allowanceRemove;
      const cfg = state.room.config || defaultRoomConfig();
      cfg.allowanceEnabled = (cfg.allowanceEnabled || []).filter((k) => k !== key);
      cfg.allowance[key] = "";
      renderLobby();
      scheduleLobbyConfigPush();
      return;
    }

    const trigger = e.target.closest("[data-allowance-pos-trigger]");
    if (trigger && state.mySide === "host") {
      const dropdown = trigger.closest("[data-allowance-pos-dropdown]");
      if (!dropdown) return;
      document.querySelectorAll("[data-allowance-pos-dropdown].is-open").forEach((el) => {
        if (el !== dropdown) el.classList.remove("is-open");
      });
      dropdown.classList.toggle("is-open");
      return;
    }

    const option = e.target.closest("[data-allowance-pos-option]");
    if (option && state.mySide === "host") {
      const dropdown = option.closest("[data-allowance-pos-dropdown]");
      if (!dropdown) return;
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
      scheduleLobbyConfigPush();
      return;
    }
  });

  document.getElementById("allowanceList")?.addEventListener("input", (e) => {
    const input = e.target.closest(".allowance-item-input");
    if (!input || state.mySide !== "host") return;
    const key = input.dataset.allowanceKey;
    if (!key) return;
    state.room.config.allowance[key] = readAllowanceFieldValue(input);
    scheduleLobbyConfigPush();
  });
  document.getElementById("allowanceList")?.addEventListener("change", (e) => {
    const input = e.target.closest(".allowance-item-input");
    if (!input || state.mySide !== "host") return;
    const key = input.dataset.allowanceKey;
    if (!key) return;
    state.room.config.allowance[key] = readAllowanceFieldValue(input);
    scheduleLobbyConfigPush();
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-allowance-pos-dropdown]")) return;
    document.querySelectorAll("[data-allowance-pos-dropdown].is-open").forEach((el) => {
      el.classList.remove("is-open");
    });
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
}

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

  window.addEventListener("beforeunload", (e) => {
    if (state.room?.code) {
      const me = getCurrentIdentity();
      const payload = JSON.stringify({ requesterId: me.id });
      navigator.sendBeacon(`/api/rooms/${encodeURIComponent(state.room.code)}/leave`, new Blob([payload], { type: "application/json" }));
    }
    if (state.phase === "draft") {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  window.requestAnimationFrame(() => {
    initLobby();
  });
});
