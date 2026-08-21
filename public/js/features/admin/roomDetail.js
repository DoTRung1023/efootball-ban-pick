/* ============================================================
   ROOM DETAIL — the read-only inspection panel behind WATCH

   Rooms have exactly two seats and the room page claims one on load, so the
   console cannot look at a draft by opening `/room/<code>`: it was answered
   with "Host slot taken", and on a room with an empty guest seat it would have
   sat the admin down in it instead. This panel reads
   `GET /api/admin/rooms/:code` and never writes, so watching a draft cannot
   disturb it.

   It polls faster than the ROOMS table behind it (3 s against 10 s) because a
   live ban phase is the thing you opened it to watch, and the read is an
   in-memory map lookup.
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { apiFetch } from "./adminApi.js";
import { fmtSeconds, phasePill } from "./format.js";

const POLL_MS = 3000;

/** `0` is unlimited, and it is the one duration that must not read as "unset". */
const UNLIMITED_DURATION_SEC = 0;

let openCode = "";
let pollTimer = null;

const el = (id) => document.getElementById(id);

// ── Field formatting ─────────────────────────────────────────

const yesNo = (v) => (v ? "yes" : "no");

function fmtDuration(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return "—";
  if (n === UNLIMITED_DURATION_SEC) return "unlimited";
  return fmtSeconds(n);
}

/** Time left on the server's turn deadline. Past it, the turn is simply overdue —
    there are no server-side timers, so nothing resolves it until somebody reads
    the room. See `rooms/turns.js`. */
function fmtTurnRemaining(turnEndsAt) {
  if (turnEndsAt == null) return "no deadline";
  const left = Math.floor((Number(turnEndsAt) - Date.now()) / 1000);
  return left <= 0 ? "expired" : `${fmtSeconds(left)} left`;
}

function seatCard(label, seat) {
  if (!seat) {
    return `
      <div class="rd-seat is-empty">
        <div class="rd-seat-role">${escapeHtml(label)}</div>
        <div class="rd-seat-name">— empty —</div>
      </div>`;
  }
  const idle = Math.floor((Date.now() - Number(seat.lastSeenAt || 0)) / 1000);
  return `
    <div class="rd-seat">
      <div class="rd-seat-role">${escapeHtml(label)}</div>
      <div class="rd-seat-name">${escapeHtml(seat.username || "—")}</div>
      <dl class="rd-facts">
        <dt>id</dt><dd class="td-mono">${escapeHtml(String(seat.id || "—"))}</dd>
        <dt>squad</dt><dd>${seat.playerCount == null ? "unknown" : `${seat.playerCount} players`}</dd>
        <dt>last beat</dt><dd>${fmtSeconds(idle)} ago${seat.hidden ? " · tabbed away" : ""}</dd>
      </dl>
    </div>`;
}

function playerChip(p) {
  if (!p) return `<li class="rd-chip is-hole">empty slot</li>`;
  const meta = [p.position, p.overall].filter(Boolean).join(" · ");
  return `<li class="rd-chip">
    <span class="rd-chip-name">${escapeHtml(p.name || "—")}</span>
    ${meta ? `<span class="rd-chip-meta">${escapeHtml(String(meta))}</span>` : ""}
  </li>`;
}

/** Bans, or the reason there are none to show. */
function banList(bans, confirmed) {
  const list = Array.isArray(bans) ? bans : [];
  return `
    <div class="rd-col-head">
      <span>BANS · ${list.length}</span>
      <span class="rd-flag ${confirmed ? "is-on" : ""}">${confirmed ? "CONFIRMED" : "editing"}</span>
    </div>
    ${list.length
      ? `<ul class="rd-chips">${list.map(playerChip).join("")}</ul>`
      : `<p class="rd-none">none yet</p>`}`;
}

/**
 * Picks, which arrive as a sparse slot array — a `null` is a hole the player
 * left in their formation, not a missing player, so the count and the list have
 * to disagree on purpose.
 */
function pickList(picks, confirmed, formation) {
  const slots = Array.isArray(picks) ? picks : [];
  const filled = slots.filter(Boolean).length;
  return `
    <div class="rd-col-head">
      <span>PICKS · ${filled}${slots.length > filled ? ` of ${slots.length} slots` : ""}</span>
      <span class="rd-flag ${confirmed ? "is-on" : ""}">${confirmed ? "CONFIRMED" : "editing"}</span>
    </div>
    <p class="rd-sub">formation ${escapeHtml(String(formation || "—"))}</p>
    ${slots.length
      ? `<ul class="rd-chips">${slots.map(playerChip).join("")}</ul>`
      : `<p class="rd-none">none yet</p>`}`;
}

/** The published turn schedule, with the one being played marked. */
function scheduleStrip(schedule, turnIndex) {
  const turns = Array.isArray(schedule) ? schedule : [];
  if (!turns.length) return "";
  return `<ul class="rd-schedule">${turns.map((t, i) => `
    <li class="rd-turn ${i === Number(turnIndex) ? "is-current" : ""}">
      ${escapeHtml(String(t.action || "?"))} · ${escapeHtml(String(t.side || "?"))}
    </li>`).join("")}</ul>`;
}

function matchSteps(room) {
  const steps = [
    ["guest ready", room.ready?.guest],
    ["host at Start Match", room.matchReady?.host],
    ["guest at Start Match", room.matchReady?.guest],
    ["host started", room.matchStarted?.host],
    ["guest started", room.matchStarted?.guest],
    ["host finished", room.matchFinished?.host],
    ["guest finished", room.matchFinished?.guest],
  ];
  return `<dl class="rd-facts">${steps
    .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${yesNo(v)}</dd>`)
    .join("")}</dl>`;
}

// ── Rendering ────────────────────────────────────────────────

function render(room) {
  const cfg = room.config || {};
  el("roomDetailTitle").textContent = room.code;
  el("roomDetailPhase").innerHTML = phasePill(room.phase);

  el("roomDetailBody").innerHTML = `
    ${room.closed
      ? `<p class="panel-notice">Room closed — ${escapeHtml(room.closeReason || "no reason given")}</p>`
      : ""}

    <div class="rd-grid">
      ${seatCard("HOST", room.host)}
      ${seatCard("GUEST", room.guest)}
    </div>

    <div class="rd-section">
      <h3 class="rd-title">SETTINGS</h3>
      <dl class="rd-facts rd-facts--wide">
        <dt>status</dt><dd>${escapeHtml(String(room.status || "—"))}</dd>
        <dt>idle</dt><dd>${fmtSeconds(room.idleSec)}</dd>
        <dt>bans per side</dt><dd>${escapeHtml(String(cfg.banCountPerSide ?? "—"))}${
          room.maxBanCountPerSide != null ? ` (max ${room.maxBanCountPerSide})` : ""}</dd>
        <dt>ban order</dt><dd>${escapeHtml(String(cfg.banOrder || "—"))}</dd>
        <dt>ban timer</dt><dd>${fmtDuration(cfg.banDurationSec)}</dd>
        <dt>pick timer</dt><dd>${fmtDuration(cfg.pickDurationSec)}</dd>
        <dt>picks per side</dt><dd>${escapeHtml(String(cfg.pickCountPerSide ?? "—"))}</dd>
        <dt>pick reveal</dt><dd>${escapeHtml(String(cfg.revealMode || "—"))}</dd>
        <dt>ban reveal</dt><dd>${escapeHtml(String(cfg.banRevealMode || "—"))}</dd>
      </dl>
    </div>

    <div class="rd-section">
      <h3 class="rd-title">TURN · ${escapeHtml(fmtTurnRemaining(room.turnEndsAt))}</h3>
      ${scheduleStrip(room.schedule, room.turnIndex)}
    </div>

    <div class="rd-section">
      <h3 class="rd-title">BOARD</h3>
      <div class="rd-grid">
        <div class="rd-col">
          ${banList(room.bans?.host, room.bansConfirmed?.host)}
          ${pickList(room.picks?.host, room.picksConfirmed?.host, room.formations?.host)}
        </div>
        <div class="rd-col">
          ${banList(room.bans?.guest, room.bansConfirmed?.guest)}
          ${pickList(room.picks?.guest, room.picksConfirmed?.guest, room.formations?.guest)}
        </div>
      </div>
    </div>

    <div class="rd-section">
      <h3 class="rd-title">MATCH STEPS</h3>
      ${matchSteps(room)}
    </div>`;
}

/** The room went away mid-watch — a restart, or the host closing it. */
function renderGone(message) {
  el("roomDetailBody").innerHTML = `<p class="panel-notice">${escapeHtml(message)}</p>`;
}

// ── Polling ──────────────────────────────────────────────────

async function refresh() {
  if (!openCode) return;
  try {
    const { room } = await apiFetch(`/api/admin/rooms/${encodeURIComponent(openCode)}`);
    if (!openCode) return;   // closed while the fetch was in flight
    render(room);
  } catch (err) {
    stopPolling();
    renderGone(err?.message || "Failed to load this room.");
  }
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

// ── Open / close ─────────────────────────────────────────────

export function openRoomDetail(code) {
  openCode = String(code || "");
  if (!openCode) return;
  el("roomDetailTitle").textContent = openCode;
  el("roomDetailPhase").innerHTML = "";
  el("roomDetailBody").innerHTML = `<p class="rd-none">Loading…</p>`;
  el("roomDetail").hidden = false;
  refresh();
  stopPolling();
  pollTimer = setInterval(() => {
    if (!document.hidden) refresh();
  }, POLL_MS);
}

export function closeRoomDetail() {
  openCode = "";
  stopPolling();
  const overlay = el("roomDetail");
  if (overlay) overlay.hidden = true;
}

export function initRoomDetail() {
  el("roomDetailClose")?.addEventListener("click", closeRoomDetail);
  /* Clicking the scrim, but not the card standing on it. */
  el("roomDetail")?.addEventListener("click", (ev) => {
    if (ev.target === ev.currentTarget) closeRoomDetail();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && openCode) closeRoomDetail();
  });
}
