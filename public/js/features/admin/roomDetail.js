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

/* Host is blue, guest is red, everywhere on this panel — the seat card, the
   column tags, the cells, the turn strip. DESIGN.md gives red to "banned,
   stalled, broken" and blue to console access, so this is a deliberate second
   meaning for both, contained to one read-only modal: here they are simply
   which side you are looking at, and the panel is far easier to scan for it. */
const SIDE_CLASS = { host: "is-host", guest: "is-guest" };
const sideClass = (side) => (side === "guest" ? SIDE_CLASS.guest : SIDE_CLASS.host);

function seatCard(label, seat, side) {
  const tone = sideClass(side);
  if (!seat) {
    return `
      <div class="rd-seat is-empty ${tone}">
        <div class="rd-seat-role">${escapeHtml(label)}</div>
        <div class="rd-seat-name">empty</div>
      </div>`;
  }
  const idle = Math.floor((Date.now() - Number(seat.lastSeenAt || 0)) / 1000);
  return `
    <div class="rd-seat ${tone}">
      <div class="rd-seat-role">${escapeHtml(label)}</div>
      <div class="rd-seat-name">${escapeHtml(seat.username || "—")}</div>
      <dl class="rd-facts">
        <dt>id</dt><dd class="td-mono">${escapeHtml(String(seat.id || "—"))}</dd>
        <dt>squad</dt><dd>${seat.playerCount == null ? "unknown" : `${seat.playerCount} players`}</dd>
        <dt>last beat</dt><dd>${fmtSeconds(idle)} ago${seat.hidden ? " · tabbed away" : ""}</dd>
      </dl>
    </div>`;
}

/** Room-wide settings, as a wrapping row rather than two columns of pairs —
    two columns read as host and guest, which none of these are. */
function settingsRow(room, cfg) {
  const stats = [
    ["status", room.status || "—"],
    ["idle", fmtSeconds(room.idleSec)],
    ["bans / side", `${cfg.banCountPerSide ?? "—"}${
      room.maxBanCountPerSide != null ? ` of ${room.maxBanCountPerSide}` : ""}`],
    ["ban order", cfg.banOrder || "—"],
    ["ban timer", fmtDuration(cfg.banDurationSec)],
    ["ban reveal", cfg.banRevealMode || "—"],
    ["picks / side", cfg.pickCountPerSide ?? "—"],
    ["pick timer", fmtDuration(cfg.pickDurationSec)],
    ["pick reveal", cfg.revealMode || "—"],
  ];
  return `<div class="rd-stats">${stats.map(([k, v]) => `
    <div class="rd-stat">
      <span class="rd-stat-k">${escapeHtml(k)}</span>
      <span class="rd-stat-v">${escapeHtml(String(v))}</span>
    </div>`).join("")}</div>`;
}

const flagPill = (confirmed) =>
  `<span class="rd-flag ${confirmed ? "is-on" : ""}">${confirmed ? "CONFIRMED" : "editing"}</span>`;

/** The one header row that names the two columns under it. */
function sidesHead(leftLabel, rightLabel, leftFlag, rightFlag, extra = "") {
  return `
    <div class="rd-pair rd-pair--head ${extra}">
      <span class="rd-pair-idx"></span>
      <span class="rd-side-tag is-host">${leftLabel}${leftFlag}</span>
      <span class="rd-side-tag is-guest">${rightLabel}${rightFlag}</span>
    </div>`;
}

function playerCell(p, side) {
  const tone = sideClass(side);
  if (!p) return `<span class="rd-cell is-hole">—</span>`;
  const meta = [p.position, p.overall].filter(Boolean).join(" · ");
  return `<span class="rd-cell ${tone}">
    <span class="rd-cell-name">${escapeHtml(p.name || "—")}</span>
    ${meta ? `<span class="rd-cell-meta">${escapeHtml(String(meta))}</span>` : ""}
  </span>`;
}

/**
 * The comparison this panel exists for: one row per index, host on the left and
 * guest on the right, so the two sides can be read across rather than scrolled
 * between. Rows are paired by position and the shorter side gets a hole, which
 * is what keeps them lined up when the counts differ — three bans against none
 * used to push every pick below it out of step with its opposite number.
 */
function pairedRows(left, right, side = playerCell) {
  const a = Array.isArray(left) ? left : [];
  const b = Array.isArray(right) ? right : [];
  const n = Math.max(a.length, b.length);
  if (!n) return `<p class="rd-none">none yet</p>`;
  return `<ul class="rd-pairs">${Array.from({ length: n }, (_, i) => `
    <li class="rd-pair">
      <span class="rd-pair-idx">${i + 1}</span>
      ${side(a[i], "host")}
      ${side(b[i], "guest")}
    </li>`).join("")}</ul>`;
}

/** Bans, side by side. */
function bansSection(room) {
  const host = Array.isArray(room.bans?.host) ? room.bans.host : [];
  const guest = Array.isArray(room.bans?.guest) ? room.bans.guest : [];
  return `
    <div class="rd-section">
      <h3 class="rd-title">BANS</h3>
      ${sidesHead(`HOST · ${host.length}`, `GUEST · ${guest.length}`,
        flagPill(room.bansConfirmed?.host), flagPill(room.bansConfirmed?.guest))}
      ${pairedRows(host, guest)}
    </div>`;
}

/**
 * Picks, side by side. They arrive as a sparse slot array — a `null` is a hole
 * the player left in their formation, not a missing player, so the count and
 * the list disagree on purpose.
 */
function picksSection(room) {
  const host = Array.isArray(room.picks?.host) ? room.picks.host : [];
  const guest = Array.isArray(room.picks?.guest) ? room.picks.guest : [];
  const count = (slots) => slots.filter(Boolean).length;
  const label = (name, slots, formation) =>
    `${name} · ${count(slots)}${slots.length > count(slots) ? ` of ${slots.length}` : ""}`
    + ` <span class="rd-side-sub">${escapeHtml(String(formation || "—"))}</span>`;
  return `
    <div class="rd-section">
      <h3 class="rd-title">PICKS</h3>
      ${sidesHead(
        label("HOST", host, room.formations?.host),
        label("GUEST", guest, room.formations?.guest),
        flagPill(room.picksConfirmed?.host), flagPill(room.picksConfirmed?.guest))}
      ${pairedRows(host, guest)}
    </div>`;
}

/** The published turn schedule, with the one being played marked. */
function scheduleStrip(schedule, turnIndex) {
  const turns = Array.isArray(schedule) ? schedule : [];
  if (!turns.length) return "";
  return `<ul class="rd-schedule">${turns.map((t, i) => {
    const side = String(t.side || "?");
    const tone = side === "guest" ? SIDE_CLASS.guest : side === "host" ? SIDE_CLASS.host : "";
    return `
    <li class="rd-turn ${tone} ${i === Number(turnIndex) ? "is-current" : ""}">
      ${escapeHtml(String(t.action || "?"))} · ${escapeHtml(side)}
    </li>`;
  }).join("")}</ul>`;
}

/** yes / no / not-applicable, in the column it belongs to. */
function stepCell(value, side) {
  if (value == null) return `<span class="rd-cell is-hole">—</span>`;
  const tone = value ? sideClass(side) : "";
  return `<span class="rd-cell ${tone} rd-cell--step">${value ? "yes" : "no"}</span>`;
}

/**
 * The match handshake, as the comparison it always was: every step but the
 * first is a host/guest pair, and they were printed as seven separate lines
 * with the side spelled into each label.
 */
function matchSteps(room) {
  const rows = [
    ["ready", null, room.ready?.guest],
    ["at Start Match", room.matchReady?.host, room.matchReady?.guest],
    ["started", room.matchStarted?.host, room.matchStarted?.guest],
    ["finished", room.matchFinished?.host, room.matchFinished?.guest],
  ];
  /* A wider first track than the numbered lists: these rows are named, and
     "at Start Match" in 34px broke across three lines. */
  return `
    ${sidesHead("HOST", "GUEST", "", "", "rd-pair--steps")}
    <ul class="rd-pairs">${rows.map(([label, host, guest]) => `
      <li class="rd-pair rd-pair--steps">
        <span class="rd-pair-idx rd-pair-label">${escapeHtml(label)}</span>
        ${stepCell(host, "host")}
        ${stepCell(guest, "guest")}
      </li>`).join("")}</ul>`;
}

// ── Rendering ────────────────────────────────────────────────

function render(room) {
  const cfg = room.config || {};
  el("roomDetailTitle").textContent = room.code;
  el("roomDetailPhase").innerHTML = phasePill(room.phase);

  el("roomDetailBody").innerHTML = `
    ${room.closed
      ? `<p class="panel-notice">Room closed: ${escapeHtml(room.closeReason || "no reason given")}</p>`
      : ""}

    <div class="rd-grid">
      ${seatCard("HOST", room.host, "host")}
      ${seatCard("GUEST", room.guest, "guest")}
    </div>

    <div class="rd-section">
      <h3 class="rd-title">SETTINGS</h3>
      ${settingsRow(room, cfg)}
    </div>

    <div class="rd-section">
      <h3 class="rd-title">TURN · ${escapeHtml(fmtTurnRemaining(room.turnEndsAt))}</h3>
      ${scheduleStrip(room.schedule, room.turnIndex)}
    </div>

    ${bansSection(room)}
    ${picksSection(room)}

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
