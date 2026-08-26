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

/**
 * A configured duration, in the unit it was configured in.
 *
 * Plain seconds, not `fmtSeconds`' minutes-and-seconds: these two are typed
 * into a SEC field in the lobby, so `120s` is the number the host actually set
 * and `2m 0s` was arithmetic on it. The elapsed times on this panel — last
 * beat, idle, turn remaining — keep `fmtSeconds`, because nobody typed those.
 */
function fmtDuration(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return "—";
  if (n === UNLIMITED_DURATION_SEC) return "unlimited";
  return `${n}s`;
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
   column tags, the player cells, the turn strip. DESIGN.md gives red to
   "banned, stalled, broken" and blue to console access, so this is a deliberate
   second meaning for both, contained to one read-only modal: here they are
   simply which side you are looking at, and the panel is far easier to scan
   for it.

   `stepCell` is the one exception, and see it for why. */
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

/** A wrapping band of small labelled facts. Each stage gets the ones it uses. */
function statBand(stats) {
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
      <span class="rd-side-tag is-host">${leftLabel}${leftFlag}</span>
      <span class="rd-pair-idx"></span>
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
      ${side(a[i], "host")}
      <span class="rd-pair-idx">${i + 1}</span>
      ${side(b[i], "guest")}
    </li>`).join("")}</ul>`;
}

/**
 * The turns of one stage, with the one being played marked.
 *
 * Filtered by action but numbered by the *original* index, because that is what
 * `turnIndex` counts — renumbering after the filter would mark the wrong pill.
 */
function scheduleStrip(schedule, turnIndex, action) {
  const turns = (Array.isArray(schedule) ? schedule : [])
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => String(t.action || "") === action);
  if (!turns.length) return `<p class="rd-none">no turns scheduled</p>`;
  return `<ul class="rd-schedule">${turns.map(({ t, i }) => {
    const side = String(t.side || "?");
    const tone = side === "guest" ? SIDE_CLASS.guest : side === "host" ? SIDE_CLASS.host : "";
    return `
    <li class="rd-turn ${tone} ${i === Number(turnIndex) ? "is-current" : ""}">
      ${escapeHtml(String(t.action || "?"))} · ${escapeHtml(side)}
    </li>`;
  }).join("")}</ul>`;
}

/* ── Stages ──────────────────────────────────────────────────
   A room moves through these in order, and this panel is now laid out the same
   way: one block per stage, carrying the settings that stage uses, the turns it
   plays, and what the two sides did in it.

   It used to be grouped by *kind* — every setting in one band, every ban in
   another, the match handshake at the bottom — which meant answering "where has
   this room got to" by reading four separate places and holding the order in
   your head. */
const STAGES = ["lobby", "ban", "pick", "ready", "done"];

/** done · now · not reached, from where the room actually is. */
function stageState(id, phase) {
  const at = STAGES.indexOf(String(phase || "lobby"));
  const here = STAGES.indexOf(id);
  if (at < 0) return { cls: "is-ahead", label: "not reached" };
  if (here < at) return { cls: "is-done", label: "done" };
  if (here === at) return { cls: "is-now", label: "now" };
  return { cls: "is-ahead", label: "not reached" };
}

function stageBlock(id, title, phase, body) {
  const { cls, label } = stageState(id, phase);
  return `
    <section class="rd-stage ${cls}">
      <header class="rd-stage-head">
        <h3 class="rd-stage-title">${escapeHtml(title)}</h3>
        <span class="rd-stage-state ${cls}">${escapeHtml(label)}</span>
      </header>
      <div class="rd-stage-body">${body}</div>
    </section>`;
}

/**
 * The seats, and **everything the host set before starting**.
 *
 * All of it in one place, and this place, because the room has exactly one
 * screen where these are chosen — the LOBBY panel — and an admin watching wants
 * to read what was agreed, not hunt for each value in the stage that later
 * consumes it. Same fields, same order and same units as that panel.
 *
 * Picks per side is not among them: it is fixed at `PICK_COUNT_PER_SIDE` and
 * the lobby offers no control for it, so a room-settings band is the wrong
 * place to print a constant. The PICK stage already shows the real number —
 * how many of those slots each side has actually filled.
 */
function lobbyStage(room, cfg) {
  return stageBlock("lobby", "1 · LOBBY", room.phase, `
    <div class="rd-grid">
      ${seatCard("HOST", room.host, "host")}
      ${seatCard("GUEST", room.guest, "guest")}
    </div>
    ${statBand([
      ["ban per side", `${cfg.banCountPerSide ?? "—"}${
        room.maxBanCountPerSide != null ? ` of ${room.maxBanCountPerSide}` : ""}`],
      ["ban duration", fmtDuration(cfg.banDurationSec)],
      ["pick duration", fmtDuration(cfg.pickDurationSec)],
      ["ban order", cfg.banOrder || "—"],
      ["ban reveal", cfg.banRevealMode || "—"],
      ["pick reveal", cfg.revealMode || "—"],
    ])}
    ${sidesHead("HOST", "GUEST", "", "", "rd-pair--steps")}
    <ul class="rd-pairs">
      <li class="rd-pair rd-pair--steps">
        ${stepCell(null, STEP_WORDS.ready)}
        <span class="rd-pair-idx rd-pair-label">ready</span>
        ${stepCell(room.ready?.guest, STEP_WORDS.ready)}
      </li>
    </ul>`);
}

/** Only the guest readies in the lobby, so the host column is a hole. */
function banStage(room) {
  const host = Array.isArray(room.bans?.host) ? room.bans.host : [];
  const guest = Array.isArray(room.bans?.guest) ? room.bans.guest : [];
  /* No settings band: order, timer and reveal are shown under LOBBY, where they
     were chosen. Repeating them here said the same thing twice and made the two
     draft stages look like they configured themselves. */
  return stageBlock("ban", "2 · BAN", room.phase, `
    ${scheduleStrip(room.schedule, room.turnIndex, "ban")}
    ${sidesHead(`HOST · ${host.length}`, `GUEST · ${guest.length}`,
      flagPill(room.bansConfirmed?.host), flagPill(room.bansConfirmed?.guest))}
    ${pairedRows(host, guest)}`);
}

/**
 * Picks arrive as a sparse slot array — a `null` is a hole the player left in
 * their formation, not a missing player, so the count and the list disagree on
 * purpose.
 */
function pickStage(room) {
  const host = Array.isArray(room.picks?.host) ? room.picks.host : [];
  const guest = Array.isArray(room.picks?.guest) ? room.picks.guest : [];
  const count = (slots) => slots.filter(Boolean).length;
  const label = (name, slots, formation) =>
    `${name} · ${count(slots)}${slots.length > count(slots) ? ` of ${slots.length}` : ""}`
    + ` <span class="rd-side-sub">${escapeHtml(String(formation || "—"))}</span>`;
  return stageBlock("pick", "3 · PICK", room.phase, `
    ${scheduleStrip(room.schedule, room.turnIndex, "pick")}
    ${sidesHead(
      label("HOST", host, room.formations?.host),
      label("GUEST", guest, room.formations?.guest),
      flagPill(room.picksConfirmed?.host), flagPill(room.picksConfirmed?.guest))}
    ${pairedRows(host, guest)}`);
}

/** Each step row's own words for done and not-done. */
const STEP_WORDS = {
  ready: ["ready", "unready"],
  started: ["started", "not started"],
  finished: ["finished", "not finished"],
};

/**
 * One side's answer to a yes/no step, as a state box.
 *
 * The word is the row's own — `unready` / `ready`, `not started` / `started` —
 * rather than a bare yes: the row's name sits *between* the two columns now
 * instead of in front of them, and a lone "yes" that far from the thing it
 * answers is a value with nothing attached to it. Read either box on its own
 * and it still says what it means.
 *
 * **These are the one place on the panel a cell is not tinted by side.** A step
 * row asks *has this happened*, so the box is black until it has and green once
 * it has; which column you are in is already stated by the tag above it, and
 * saying it twice would spend the colour on the half of the question that was
 * never in doubt.
 */
function stepCell(value, [done, notYet]) {
  if (value == null) return `<span class="rd-cell rd-cell--step is-hole">—</span>`;
  return `<span class="rd-cell rd-cell--step ${value ? "is-on" : "is-off"}">${
    escapeHtml(value ? done : notYet)}</span>`;
}

/** The handshake after the draft, as the comparison it always was. */
function readyStage(room) {
  const rows = [
    ["at Start Match", room.matchReady?.host, room.matchReady?.guest, STEP_WORDS.ready],
    ["started", room.matchStarted?.host, room.matchStarted?.guest, STEP_WORDS.started],
    ["finished", room.matchFinished?.host, room.matchFinished?.guest, STEP_WORDS.finished],
  ];
  return stageBlock("ready", "4 · START MATCH", room.phase, `
    ${sidesHead("HOST", "GUEST", "", "", "rd-pair--steps")}
    <ul class="rd-pairs">${rows.map(([label, host, guest, words]) => `
      <li class="rd-pair rd-pair--steps">
        ${stepCell(host, words)}
        <span class="rd-pair-idx rd-pair-label">${escapeHtml(label)}</span>
        ${stepCell(guest, words)}
      </li>`).join("")}</ul>`);
}

// ── Rendering ────────────────────────────────────────────────

function render(room) {
  const cfg = room.config || {};
  el("roomDetailTitle").textContent = room.code;
  /* The two room-wide facts ride in the header rather than in a stage, because
     they belong to none of them and a "ROOM" section above four stages is one
     heading too many for two values. */
  el("roomDetailPhase").innerHTML = phasePill(room.phase)
    + `<span class="rd-headmeta">${escapeHtml(String(room.status || "—"))}`
    + ` · idle ${escapeHtml(fmtSeconds(room.idleSec))}`
    /* No "turn" prefix: `fmtTurnRemaining` already returns a phrase that stands
       on its own — "no deadline", "expired", "1m 20s left". */
    + ` · ${escapeHtml(fmtTurnRemaining(room.turnEndsAt))}</span>`;

  el("roomDetailBody").innerHTML = `
    ${room.closed
      ? `<p class="panel-notice">Room closed: ${escapeHtml(room.closeReason || "no reason given")}</p>`
      : ""}
    ${lobbyStage(room, cfg)}
    ${banStage(room)}
    ${pickStage(room)}
    ${readyStage(room)}`;
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
