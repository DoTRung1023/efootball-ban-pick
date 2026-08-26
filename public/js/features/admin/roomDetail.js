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
import { phasePill } from "./format.js";

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

/* Host is blue, guest is red, everywhere on this panel — the seat card, the
   column tags, the player cells, the turn strip. DESIGN.md gives red to
   "banned, stalled, broken" and blue to console access, so this is a deliberate
   second meaning for both, contained to one read-only modal: here they are
   simply which side you are looking at, and the panel is far easier to scan
   for it.

   `stepCell` is the one exception, and see it for why. */
const SIDE_CLASS = { host: "is-host", guest: "is-guest" };
const sideClass = (side) => (side === "guest" ? SIDE_CLASS.guest : SIDE_CLASS.host);

/** `34 players` · `1 game plan` · `unknown`. Both seat counts can be absent:
    a squad size the room has not read yet, or a plan count the database did
    not answer for. */
function countOf(n, noun) {
  if (n == null) return "unknown";
  return `${n} ${noun}${Number(n) === 1 ? "" : "s"}`;
}

function seatCard(label, seat, side) {
  const tone = sideClass(side);
  if (!seat) {
    return `
      <div class="rd-seat is-empty ${tone}">
        <div class="rd-seat-role">${escapeHtml(label)}</div>
        <div class="rd-seat-name">empty</div>
      </div>`;
  }
  return `
    <div class="rd-seat ${tone}">
      <div class="rd-seat-role">${escapeHtml(label)}</div>
      <div class="rd-seat-name">${escapeHtml(seat.username || "—")}</div>
      <dl class="rd-facts">
        <dt>id</dt><dd class="td-mono">${escapeHtml(String(seat.id || "—"))}</dd>
        <dt>squad</dt><dd>${countOf(seat.playerCount, "player")}</dd>
        <dt>plans</dt><dd>${countOf(seat.planCount, "game plan")}</dd>
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

/** The one header row that names the two columns under it. */
function sidesHead(leftLabel, rightLabel) {
  return `
    <div class="rd-pair rd-pair--head">
      <span class="rd-side-tag is-host">${leftLabel}</span>
      <span class="rd-pair-idx"></span>
      <span class="rd-side-tag is-guest">${rightLabel}</span>
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
 * One side's players, boxed, under that side's own count.
 *
 * **Its own box, not a column of a shared one.** The two lists no longer pad
 * each other to a common length: a side that has banned once shows one row and
 * a box that ends there, which says "one against three" more directly than two
 * rows of `—` did. What they *do* still share is the row height and a common
 * top edge, so ban 3 is level with ban 3 for as long as both sides have one.
 *
 * Internal `null`s stay, and are not padding — in a pick list a `null` is a
 * slot the player left empty in their formation, so dropping it would move
 * every player below it up a number.
 */
function sideList(side, count, players, sub = "") {
  const rows = Array.isArray(players) ? players : [];
  const body = rows.length
    ? `<ol class="rd-rows">${rows.map((p, i) => `
      <li class="rd-row">
        <span class="rd-row-idx">${i + 1}</span>
        ${playerCell(p, side)}
      </li>`).join("")}</ol>`
    : `<p class="rd-none">none</p>`;
  /* The tally rides *inside* the box, in a strip of its own across its top,
     rather than trailing the side's name outside it. `HOST · 0  4-3-3` put
     three unlike things on one line — whose column this is, how full it is, and
     what shape they are playing — in one weight and one colour, and the two
     that describe the list below sat outside the rule drawn around it. */
  return `
    <section class="rd-side">
      <span class="rd-side-tag ${sideClass(side)}">${side === "guest" ? "GUEST" : "HOST"}</span>
      <div class="rd-list">
        <div class="rd-list-head">
          <span class="rd-list-count">${escapeHtml(String(count))}</span>
          ${sub ? `<span class="rd-side-sub">${escapeHtml(String(sub))}</span>` : ""}
        </div>
        ${body}
      </div>
    </section>`;
}

/* Both boxes ride `.rd-pair`, the same three tracks every other row on this
   panel uses, so the two lists sit on exactly the columns the confirm row
   under them does. The middle track is an empty gutter here — the numbering
   moved inside each box when the lists stopped sharing one. */
const sideLists = (left, right) =>
  `<div class="rd-pair">${left}<span class="rd-pair-idx"></span>${right}</div>`;

/**
 * The ban turns, in order, with the one being played marked.
 *
 * **Only the turns that belong to one side**, which is why this is the ban
 * strip and not a general one. `buildTurnSchedule` gives a simultaneous ban
 * phase a single `both` turn and gives *every* schedule a single `both` pick
 * turn, so drawing those produced a one-pill strip reading "ban · both" or
 * "pick · both" — a turn order for something that has no turn order, restating
 * what the LOBBY band already says under `ban order`. Alternating bans are the
 * one case with a real sequence, and this is it.
 *
 * Filtered, but numbered by the *original* index, because that is what
 * `turnIndex` counts — renumbering after the filter would mark the wrong pill.
 */
function banTurnStrip(schedule, turnIndex) {
  const turns = (Array.isArray(schedule) ? schedule : [])
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => String(t.action || "") === "ban" && String(t.side || "") !== "both");
  if (!turns.length) return "";
  return `<ul class="rd-schedule">${turns.map(({ t, i }) => {
    const side = String(t.side || "?");
    return `
    <li class="rd-turn ${sideClass(side)} ${i === Number(turnIndex) ? "is-current" : ""}">
      ${escapeHtml(side)}
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
    ${sidesHead("HOST", "GUEST")}
    <ul class="rd-pairs">${stepRow(null, room.ready?.guest, STEP_WORDS.ready)}</ul>`);
}

/** Only the guest readies in the lobby, so the host column is a hole. */
function banStage(room) {
  const host = Array.isArray(room.bans?.host) ? room.bans.host : [];
  const guest = Array.isArray(room.bans?.guest) ? room.bans.guest : [];
  /* No settings band: order, timer and reveal are shown under LOBBY, where they
     were chosen. Repeating them here said the same thing twice and made the two
     draft stages look like they configured themselves. */
  return stageBlock("ban", "2 · BAN", room.phase, `
    ${banTurnStrip(room.schedule, room.turnIndex)}
    ${sideLists(
      sideList("host", countOf(host.length, "ban"), host),
      sideList("guest", countOf(guest.length, "ban"), guest))}
    ${confirmRow(room.bansConfirmed)}`);
}

/**
 * Picks arrive as a sparse slot array — a `null` is a hole the player left in
 * their formation, not a missing player, so the count and the list disagree on
 * purpose.
 */
function pickStage(room) {
  const host = Array.isArray(room.picks?.host) ? room.picks.host : [];
  const guest = Array.isArray(room.picks?.guest) ? room.picks.guest : [];
  /* `2 of 3 picks` while slots are still empty, `3 picks` once none are — the
     count and the list length only disagree while a formation hole is open. */
  const filled = (slots) => {
    const n = slots.filter(Boolean).length;
    return slots.length > n ? `${n} of ${slots.length} picks` : countOf(n, "pick");
  };
  return stageBlock("pick", "3 · PICK", room.phase, `
    ${sideLists(
      sideList("host", filled(host), host, room.formations?.host || "—"),
      sideList("guest", filled(guest), guest, room.formations?.guest || "—"))}
    ${confirmRow(room.picksConfirmed)}`);
}

/** Each step row's own words for done and not-done. */
const STEP_WORDS = {
  ready: ["ready", "unready"],
  confirmed: ["confirmed", "editing"],
  started: ["started", "not started"],
  finished: ["finished", "not finished"],
};

/**
 * One side's answer to a yes/no step, as a state box.
 *
 * **The word is the whole label.** These rows carry no name of their own — not
 * in front of the columns and not between them — so `unready` / `ready` and
 * `not started` / `started` are the only thing that says which step this is.
 * That is the reason they are not `yes` / `no`: a bare yes needs a caption
 * somewhere, and every place to put one costs a column. Read either box on its
 * own and it still says what it means.
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

/** One `host | guest` row of state boxes, on the same grid as a player row. */
const stepRow = (host, guest, words) => `
  <li class="rd-pair">
    ${stepCell(host, words)}
    <span class="rd-pair-idx"></span>
    ${stepCell(guest, words)}
  </li>`;

/**
 * Has each side locked its list in?
 *
 * It was a word trailing the column tag — `HOST · 3 CONFIRMED` — carrying
 * `.rd-flag` and `.is-on`, **neither of which any stylesheet defines**. So the
 * two states were the same colour as each other and as the count in front of
 * them, and the one that was supposed to stand out did not. As a state row it
 * is the same black-or-green box the lobby and START MATCH rows use, which is
 * the right answer anyway: "has this side finished" now looks identical
 * wherever the panel asks it.
 */
const confirmRow = (flags) =>
  `<ul class="rd-pairs">${stepRow(
    Boolean(flags?.host), Boolean(flags?.guest), STEP_WORDS.confirmed)}</ul>`;

/** The handshake after the draft, as the comparison it always was. */
function readyStage(room) {
  /* No row labels: each pair of words names its own step. The order is the
     order they happen in, which is the only thing the rows share. */
  const rows = [
    [room.matchReady?.host, room.matchReady?.guest, STEP_WORDS.ready],
    [room.matchStarted?.host, room.matchStarted?.guest, STEP_WORDS.started],
    [room.matchFinished?.host, room.matchFinished?.guest, STEP_WORDS.finished],
  ];
  return stageBlock("ready", "4 · START MATCH", room.phase, `
    ${sidesHead("HOST", "GUEST")}
    <ul class="rd-pairs">${
      rows.map(([host, guest, words]) => stepRow(host, guest, words)).join("")}</ul>`);
}

// ── Rendering ────────────────────────────────────────────────

/**
 * **A closed room shows CLOSED where its phase would go, and nothing else.**
 *
 * The phase it stopped in is not a state it is still in, so drawing `LOBBY`
 * beside a "Room closed" notice put the panel's two most prominent things in
 * disagreement, and left the reader to work out which one was current. One
 * pill, and the four stages below it read as the record of a room that is over.
 *
 * The reason rides in the `title` rather than in a line of its own: it is the
 * follow-up question, not the headline, and every room that is *not* closed was
 * paying for that line with a row of header text.
 */
function headerPill(room) {
  if (!room.closed) return phasePill(room.phase);
  const why = escapeHtml(room.closeReason || "no reason given");
  return `<span class="phase-pill is-closed" title="closed — ${why}">CLOSED</span>`;
}

function render(room) {
  const cfg = room.config || {};
  el("roomDetailTitle").textContent = room.code;
  /* Just the code and the pill up here. The status word, the idle clock and the
     turn deadline used to trail the pill, and none of the three survived the
     question "what would I do differently knowing it": status restated the
     pill, idle is the seats' own `last beat` twice over, and the deadline
     belongs to whichever stage is being played rather than to the room. */
  el("roomDetailPhase").innerHTML = headerPill(room);

  el("roomDetailBody").innerHTML = `
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
