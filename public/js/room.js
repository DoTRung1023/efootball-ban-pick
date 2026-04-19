/* ============================================================
   Room page — lobby · draft · done
   Mirrors the React RoomPage flow. Socket.io can replace the
   local state machine later (see SOCKET HOOKS comments).
   ============================================================ */

const GREEN = "#00e676";
const RED = "#ff4444";
const TURN_SECONDS = 30;

const DEMO_GUEST = { id: "demo-guest", username: "Demo opponent" };

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

/**
 * Merge server-reported host/guest into local room.
 * Keeps local demo opponent if server has not registered a guest yet.
 */
function applyPresenceSnapshot(sr) {
  if (!state.room || !sr) return;
  const room = state.room;
  if (sr.host?.username) {
    room.host = { id: String(sr.host.id), username: sr.host.username };
  }
  if (sr.guest?.username) {
    room.guest = { id: String(sr.guest.id), username: sr.guest.username };
  } else if (room.guest?.id !== DEMO_GUEST.id) {
    room.guest = null;
  }
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
  if (!res.ok) return;
  const data = await res.json();
  if (data.room) applyPresenceSnapshot(data.room);
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
    const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.room) applyPresenceSnapshot(data.room);
    renderLobby();
  } catch {
    /* ignore */
  }
}

async function registerAndPollPresence() {
  try {
    await registerPresence();
  } catch (e) {
    console.warn("Room presence register failed", e);
  }
  stopPresencePolling();
  state.presencePollId = setInterval(pollPresence, 2000);
  void pollPresence();
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
    bannedPlayerIds: [],
    pickedPlayerIds: [],
    currentTurn: null,
  };
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
  const res = await fetch(`/api/players?${params}`);
  if (!res.ok) throw new Error("Players unavailable");
  const data = await res.json();
  return (data.players || []).map(normalizeApiPlayer);
}

function isDemoGuest(room) {
  return room.guest?.id === DEMO_GUEST.id;
}

/* ── Draft: opponent auto-action ───────────────────────────── */
function scheduleDemoAction() {
  const room = state.room;
  if (!room || state.phase !== "draft") return;
  const t = state.schedule[room.turnIndex];
  if (!t || t.side !== "guest" || !isDemoGuest(room)) return;

  window.setTimeout(() => {
    if (state.phase !== "draft" || !state.room || state.room.turnIndex !== room.turnIndex) return;
    const r = state.room;
    const turn = state.schedule[r.turnIndex];
    if (!turn || turn.side !== "guest") return;

    const pool = state.players.filter((p) => !getTakenIds(r).has(String(p.id)));
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    applyLocalAction(r, pick);
    renderDraftUi();
  }, 900);
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
  if (isDemoGuest(room) && state.schedule[room.turnIndex]?.side === "guest") {
    scheduleDemoAction();
  }
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
        if (isDemoGuest(r) && state.schedule[r.turnIndex]?.side === "guest") scheduleDemoAction();
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
  const q = parseQuery();
  const isHost = state.mySide === "host";

  document.getElementById("lobbyCodeDisplay").textContent = room.code;
  document.getElementById("lobbyHostName").textContent = room.host?.username || "—";
  document.getElementById("lobbyGuestName").textContent = room.guest?.username || "Waiting…";

  const hostSlot = document.getElementById("lobbyHostSlot");
  const guestSlot = document.getElementById("lobbyGuestSlot");
  hostSlot.classList.toggle("is-ready", !!room.host);
  guestSlot.classList.toggle("is-ready", !!room.guest);

  document.getElementById("lobbyGuestStatus").textContent = room.guest ? "● Connected" : "";
  document.getElementById("lobbyGuestStatus").classList.toggle("player-slot-status--ok", !!room.guest);

  const hint = document.getElementById("lobbyHint");
  if (isHost) {
    hint.textContent = "Share this code with your opponent.";
  } else {
    hint.textContent = "Waiting for host to start…";
  }

  const bansEl = document.getElementById("lobbyBansInput");
  const picksEl = document.getElementById("lobbyPicksInput");
  if (bansEl && !bansEl.dataset.touched) bansEl.value = String(q.bans);
  if (picksEl && !picksEl.dataset.touched) picksEl.value = String(q.picks);

  const meta = document.getElementById("lobbyMeta");
  const b = bansEl ? Number(bansEl.value) || 0 : q.bans;
  const p = picksEl ? Number(picksEl.value) || 0 : q.picks;
  const total = b * 2 + p * 2;
  meta.textContent =
    total > 0
      ? `Session: ${b} ban(s) per side, ${p} pick(s) per side (${total} turns).`
      : "Set bans and picks per side below before starting (or use defaults).";

  const demoBtn = document.getElementById("demoOpponentBtn");
  const startBtn = document.getElementById("startDraftBtn");
  const settings = document.getElementById("lobbySettings");

  if (isHost) {
    demoBtn.hidden = false;
    startBtn.hidden = false;
    settings.hidden = false;
    demoBtn.textContent = room.guest ? "Remove demo opponent" : "Add demo opponent";

    const canStart = room.guest && total > 0;
    startBtn.disabled = !canStart;
    startBtn.textContent = !room.guest
      ? "Waiting for opponent…"
      : !total
        ? "Set bans / picks first"
        : "START DRAFT";
    startBtn.classList.toggle("btn--primary", canStart);
  } else {
    demoBtn.hidden = true;
    startBtn.hidden = true;
    settings.hidden = true;
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
  const bansInput = document.getElementById("lobbyBansInput");
  const picksInput = document.getElementById("lobbyPicksInput");
  const b = Math.max(0, Math.min(6, Number(bansInput?.value) || 0));
  const p = Math.max(0, Math.min(11, Number(picksInput?.value) || 0));

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

  if (isDemoGuest(room) && state.schedule[room.turnIndex]?.side === "guest") {
    scheduleDemoAction();
  }
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

  document.getElementById("demoOpponentBtn")?.addEventListener("click", () => {
    if (state.room.guest?.id === DEMO_GUEST.id) {
      state.room.guest = null;
    } else {
      state.room.guest = { ...DEMO_GUEST };
    }
    renderLobby();
  });

  document.getElementById("startDraftBtn")?.addEventListener("click", () => startDraftFromLobby());

  document.getElementById("lobbyBansInput")?.addEventListener("input", (e) => {
    e.target.dataset.touched = "1";
    renderLobby();
  });
  document.getElementById("lobbyPicksInput")?.addEventListener("input", (e) => {
    e.target.dataset.touched = "1";
    renderLobby();
  });

  document.getElementById("lobbyLeaveBtn")?.addEventListener("click", () => {
    if (state.phase === "draft") {
      if (!window.confirm("Leaving will exit the draft. Continue?")) return;
    }
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
  document.getElementById("draftLeaveBtn")?.addEventListener("click", () => {
    if (!window.confirm("Leave the draft?")) return;
    clearTurnTimer();
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
    navigator.clipboard.writeText(window.location.href).then(
      () => showToast("Invite link copied!"),
      () => showToast(window.location.href),
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
    if (state.phase === "draft") {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  window.requestAnimationFrame(() => {
    initLobby();
  });
});
