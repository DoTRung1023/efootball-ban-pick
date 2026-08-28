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

import { BENCH_ROW_LABEL, LINEUP_SIZE } from "@/shared/players/formations.js";
import { ANON_PLAYER_IMG, CARD_IMG, escapeHtml } from "@/shared/players/playerMeta.js";
import { apiFetch } from "./adminApi.js";
import { phasePill } from "./format.js";

const POLL_MS = 3000;

/** `0` is unlimited, and it is the one duration that must not read as "unset". */
const UNLIMITED_DURATION_SEC = 0;

let openCode = "";
let pollTimer = null;
/* The markup currently on screen, **per stage**. See `render`. */
let painted = {};

/** The four stages, in the order they are drawn. */
const STAGE_ORDER = ["lobby", "ban", "pick", "ready"];

/* What `renderGone` last wrote, or "" while the body is a panel. Kept so a
   closed room does not rewrite the same sentence every 3 s. */
let goneMessage = "";

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

function seatCard(label, seat, side, newMatch) {
  const tone = sideClass(side);
  if (!seat) {
    /* An empty seat has two meanings and they are not close: nobody has taken
       it, or somebody had it and left for a room of their own. The second ends
       the room — whoever is left can leave or open their own, but there is
       nobody to rematch — while the room itself keeps heartbeating and stays on
       the console's live list. Naming the leaver is the difference between a
       lobby waiting for a guest and a match that is over. */
    const left = newMatch?.by === side;
    return `
      <div class="rd-seat is-empty ${tone}">
        <div class="rd-seat-role">${escapeHtml(label)}</div>
        <div class="rd-seat-name">${left ? escapeHtml(newMatch.username || "—") : "empty"}</div>
        ${left ? `<div class="rd-seat-note">left for a new room</div>` : ""}
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

/**
 * One player, as the card art and nothing else.
 *
 * **The name is the `title`, not a line under the picture.** A ban list was a
 * column of names in boxes, which is the least recognisable form the app has
 * for a player — every other surface shows the card, and an admin comparing two
 * squads is matching artwork they have already seen in the draft. The footer
 * the browser tabs put under theirs is left off on purpose: position and rating
 * are what you pick *by*, and nothing here is being picked.
 *
 * Deliberately **not** `.player-card` from `shared/playerCard.css`: that one
 * carries `cursor: pointer` and a hover scale, both of which promise a click
 * this panel does not answer. Read-only artwork should not flinch under the
 * pointer.
 */
function playerCard(p) {
  if (!p) return `<div class="rd-pcard is-empty"></div>`;
  const name = escapeHtml(String(p.name || "—"));
  const src = escapeHtml(CARD_IMG(p.id));
  /* `data-card-src` is what a repaint matches on, not `src`: a card whose art
     404s has had its `src` swapped to the anonymous placeholder, and keying on
     the live value would fail to recognise it and re-request the 404 every
     time. See `patchStage`. */
  return `<div class="rd-pcard" title="${name}">`
    + `<img class="rd-pcard-img" src="${src}" data-card-src="${src}" alt="${name}" loading="lazy" />`
    + `</div>`;
}

/** Art that 404s falls back to the anonymous card, the way `makePlayerImg` does
    for the grids built as DOM nodes. This panel writes its markup as a string,
    so the handler goes on afterwards. */
function armCardFallback(img) {
  img.addEventListener("error", () => {
    if (img.dataset.fallbackApplied === "1") return;
    img.dataset.fallbackApplied = "1";
    img.src = ANON_PLAYER_IMG;
  });
}

function armCardFallbacks(root) {
  root.querySelectorAll("img.rd-pcard-img").forEach(armCardFallback);
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
/**
 * One run of slots inside a side's box, under its own label.
 *
 * A `null` keeps its place as an empty card rather than being dropped: in a
 * pick list it is a slot left open in the formation, so closing the gap would
 * shift every player after it into somebody else's position.
 */
function rowGroup(label, players) {
  if (!players.length) return "";
  return `
    ${label ? `<div class="rd-group">${escapeHtml(label)}</div>` : ""}
    <div class="rd-cards">${players.map(playerCard).join("")}</div>`;
}

function sideList(side, count, groups, sub = "", onTurn = false) {
  const body = groups.map(([label, players]) =>
    rowGroup(label, Array.isArray(players) ? players : [])).join("")
    || `<p class="rd-none">none</p>`;
  /* The tally rides *inside* the box, in a strip of its own across its top,
     rather than trailing the side's name outside it. `HOST · 0  4-3-3` put
     three unlike things on one line — whose column this is, how full it is, and
     what shape they are playing — in one weight and one colour, and the two
     that describe the list below sat outside the rule drawn around it. */
  return `
    <section class="rd-side">
      <span class="rd-side-tag ${sideClass(side)}">${side === "guest" ? "GUEST" : "HOST"}${
        onTurn ? `<span class="rd-turn-dot" title="on the clock"></span>` : ""}</span>
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
 * The side on the clock right now, or `""`.
 *
 * **Only an alternating ban phase ever has one.** `buildTurnSchedule` gives a
 * simultaneous ban phase a single `both` turn and gives *every* schedule a
 * single `both` pick turn, so on those there is no side to mark and this
 * answers empty.
 *
 * This replaced a strip of every turn in the phase — `host guest host guest
 * host guest`, with the live one filled. Six pills to say one thing, and the
 * five that were not current were the *setting* redrawn as a list: the LOBBY
 * band already says `ban order: alternating`, and the count already says how
 * many each side gets. What the strip alone knew is which side is waited on,
 * and that belongs on that side, not in a row above both of them.
 */
function sideOnTurn(room) {
  const turn = (Array.isArray(room.schedule) ? room.schedule : [])[Number(room.turnIndex)];
  const side = String(turn?.side || "");
  return side === "host" || side === "guest" ? side : "";
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

/**
 * **This ladder has to cover everything `roomPhase` can answer.** It did not,
 * and the gap was `live`.
 *
 * `roomPhase` in `rooms/store.js` folds `await-ready` and `await-start` into
 * `ready` and then falls through to the raw status, so a match being played
 * answers `live` — deliberately, because the dashboard pill wants to say LIVE
 * and "is a match being played" is the split that matters there. But `live` is
 * not a *stage* on this panel: block 4 (START MATCH) carries the whole
 * ready → started → finished handshake, so a live room is **on** that block,
 * not past it.
 *
 * Missing from the ladder, `indexOf` answered −1 and `stageState`'s guard
 * badged **every** block "not reached" — a room with a finished draft, two full
 * squads on screen and one side already pressing FINISH read as though nothing
 * had happened, for the entire length of the match. The guard is meant for a
 * value that means nothing; it was firing on one that means "furthest along".
 *
 * Keep this map in step with `roomPhase`. They are a client/server pair with no
 * shared module, like the others CLAUDE.md lists.
 */
const PHASE_STAGE = { live: "ready" };

/** done · now · not reached, from where the room actually is. */
function stageState(id, phase) {
  const raw = String(phase || "lobby");
  const at = STAGES.indexOf(PHASE_STAGE[raw] || raw);
  const here = STAGES.indexOf(id);
  if (at < 0) return { cls: "is-ahead", label: "not reached" };
  if (here < at) return { cls: "is-done", label: "done" };
  if (here === at) return { cls: "is-now", label: "now" };
  return { cls: "is-ahead", label: "not reached" };
}

/** True once the room is past this stage — see `confirmRow`. */
const isPast = (id, phase) => stageState(id, phase).cls === "is-done";

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
      ${seatCard("HOST", room.host, "host", room.newMatch)}
      ${seatCard("GUEST", room.guest, "guest", room.newMatch)}
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
    <ul class="rd-pairs">${stepRow(
      isPast("lobby", room.phase), room.ready?.guest, STEP_WORDS.lobby)}</ul>`);
}

/**
 * **The confirm row belongs to a simultaneous phase only.**
 *
 * `bansConfirmed` is written by `/ban-confirm`, and an alternating phase never
 * calls it — a ban *is* the turn there, so the client does not even draw a
 * CONFIRM BANS button. The flags therefore sit at `false, false` for the whole
 * phase, and the row printed `unconfirmed | unconfirmed` through every turn and
 * then flipped to `confirmed | confirmed` on the `done ||` fallback the moment
 * the phase ended — a confirmation nobody ever gave.
 *
 * So it is the one thing on this stage that did not move while the room did:
 * the counts, the cards and the turn dot all repaint per turn (verified by
 * diffing this function's own output across a whole alternating phase), and the
 * row under them stayed put and then lied. Omitted rather than reworded,
 * because there is no third state to report: whose turn it is, is what this
 * stage has to say, and the dot beside the tag already says it.
 */
const BAN_ORDER_ALTERNATING = "alternating";

/**
 * Confirmed bans plus the ones still staged, in that order and without repeats.
 *
 * **A simultaneous ban does not exist server-side until CONFIRM.** It is staged
 * on the client and mirrored to `entry.stagedBans[side]` by the 500 ms presence
 * heartbeat, and only moves into `bans[side]` when the player confirms — so a
 * panel reading `bans` alone showed an empty column for the whole phase and then
 * three cards at once. Picks land immediately, which is the only reason that
 * stage already felt live. Reading both makes the ban stage behave the same.
 *
 * The two are normally disjoint for a side — staging clears on confirm, and
 * un-confirming moves them back — but they overlap for one heartbeat while
 * `confirmStagedBans` posts each ban ahead of the beat that empties the staged
 * copy. Deduped by id so that window does not double the column.
 *
 * What the admin sees before a confirm is therefore *provisional*: a staged ban
 * can still be taken back off the player's own strip. That is the same deal the
 * PICK stage already offers, and the confirm row underneath is what says whether
 * the side has locked it in.
 */
function bansWithStaged(room, side) {
  const confirmed = Array.isArray(room.bans?.[side]) ? room.bans[side] : [];
  const staged = Array.isArray(room.stagedBans?.[side]) ? room.stagedBans[side] : [];
  if (!staged.length) return confirmed;
  const seen = new Set(confirmed.map((p) => String(p?.id)));
  return [...confirmed, ...staged.filter((p) => p && !seen.has(String(p.id)))];
}

function banStage(room) {
  const host = bansWithStaged(room, "host");
  const guest = bansWithStaged(room, "guest");
  /* No settings band: order, timer and reveal are shown under LOBBY, where they
     were chosen. Repeating them here said the same thing twice and made the two
     draft stages look like they configured themselves. */
  /* Only while the room is actually in the ban phase: a schedule read after the
     fact still has a `turnIndex`, and marking a side on a stage badged DONE
     would show a clock that stopped. */
  const turn = room.phase === "ban" ? sideOnTurn(room) : "";
  const alternating = String(room.config?.banOrder || "") === BAN_ORDER_ALTERNATING;
  return stageBlock("ban", "2 · BAN", room.phase, `
    ${sideLists(
      sideList("host", countOf(host.length, "ban"), [["", host]], "", turn === "host"),
      sideList("guest", countOf(guest.length, "ban"), [["", guest]], "", turn === "guest"))}
    ${alternating ? "" : confirmRow(room.bansConfirmed, isPast("ban", room.phase))}`);
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
  /* **The eleven and the bench are two different questions**, and one run of
     twenty-three rows answered neither: whether this side has a whole team on
     the pitch, and how deep their bench is. `LINEUP_SIZE` is the cut, from
     `shared/players/formations.js` — the module that owns the slot numbering
     the room, the pitch and `game_plan_players` all address players by. */
  const groups = (slots) => [
    ["LINEUP", slots.slice(0, LINEUP_SIZE)],
    [BENCH_ROW_LABEL, slots.slice(LINEUP_SIZE)],
  ];
  return stageBlock("pick", "3 · PICK", room.phase, `
    ${sideLists(
      sideList("host", filled(host), groups(host), room.formations?.host || "—"),
      sideList("guest", filled(guest), groups(guest), room.formations?.guest || "—"))}
    ${confirmRow(room.picksConfirmed, isPast("pick", room.phase))}`);
}

/** Each step row's own words for done and not-done. */
const STEP_WORDS = {
  /* The lobby's two seats answer **different questions**, which is why this row
     is the one place the same slot carries two vocabularies. The guest presses
     READY; the host presses START DRAFT, and `POST /:code/ready` answers a host
     with 403 — so there is no `ready.host` and never was. The box sat on a `—`,
     which reads as "not applicable" when the applicable fact is simply a
     different one: whether the draft has begun. */
  lobby: { host: ["started", "not started"], guest: ["ready", "unready"] },
  ready: ["ready", "unready"],
  /* The button's vocabulary, but the **state** of it rather than the action —
     `confirmed`, not the `UN-CONFIRM` that `#confirmBansBtn` shows a side who
     is already in.

     Mirroring the button put the one negative word in this panel on the one
     green box: green marks done everywhere here, and `unconfirm` under it read
     as a contradiction rather than as "locked in, and here is the way back".
     Every row now holds the same invariant — **a green box never says `un…` or
     `not …`** — which is what lets the colour be read on its own. */
  confirm: ["confirmed", "unconfirmed"],
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
/** One pair of words for both seats, or `{ host, guest }` where the two seats
    are not answering the same question — see `STEP_WORDS.lobby`. */
const wordsFor = (words, seat) => (Array.isArray(words) ? words : words[seat]);

const stepRow = (host, guest, words) => `
  <li class="rd-pair">
    ${stepCell(host, wordsFor(words, "host"))}
    <span class="rd-pair-idx"></span>
    ${stepCell(guest, wordsFor(words, "guest"))}
  </li>`;

/**
 * Has each side locked its list in?
 *
 * **A stage the room has left reports `confirmed` whichever way the flags
 * point, and has to.** Those flags are the latch that *causes* the advance, so
 * the server clears them on the way through — `bansConfirmed` on every turn
 * advance (`rooms/turns.js`), `picksConfirmed` the moment both sides are in
 * (`rooms/routes.js`) — or the next turn would fire on the last turn's
 * confirmations. Read afterwards they say `false, false`, which is a live
 * latch's resting state and not a record of anything: the panel was printing
 * "editing" under a stage badged DONE. Past a stage, the room having advanced
 * is itself the proof both sides confirmed.
 *
 * It was a word trailing the column tag — `HOST · 3 CONFIRMED` — carrying
 * `.rd-flag` and `.is-on`, **neither of which any stylesheet defines**, so the
 * two states were the same colour as each other and as the count in front of
 * them. As a state row it is the same black-or-green box the lobby and START
 * MATCH rows use: "has this side finished" looks identical wherever the panel
 * asks it.
 */
const confirmRow = (flags, done) =>
  `<ul class="rd-pairs">${stepRow(
    done || Boolean(flags?.host), done || Boolean(flags?.guest), STEP_WORDS.confirm)}</ul>`;

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
 * disagreement, and left the reader to work out which one was current.
 *
 * The four stages below it used to stay, on the argument that they read as the
 * record of a room that is over. In practice they read as a live room that had
 * lost both its players — the seats are empty, the counts are zero, and nothing
 * in four panels of that says "this ended". The body collapses now; see
 * `render`.
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

/**
 * Replaces one stage's markup **without disturbing the card art inside it.**
 *
 * `innerHTML =` destroys every `<img>` it replaces, and a fresh `<img>` paints
 * empty for a frame even when the bytes are in cache — so a stage that repainted
 * blinked its whole stack of cards. The cards that are still there are the same
 * cards, so their nodes are lifted out first and put back into the new markup:
 * an already-decoded node that never left the document does not reload and does
 * not blink. Only genuinely new cards are created, and only those need arming.
 *
 * Keyed on `data-card-src` rather than `src` — see `playerCard`.
 */
function patchStage(slot, html) {
  /* **One queue per card, not one node.** The same card legitimately appears
     more than once in a stage — picks are per-side, so both squads can hold the
     same player, and the PICK stage draws both columns into this one slot.
     Keyed to a single node, the first occurrence was kept and every later one
     found nothing and was rebuilt, so every duplicated card was destroyed and
     re-created on **every** repaint — including one that changed nothing about
     the squads, like a CONFIRM toggle. Measured on two five-man columns sharing
     three players: a confirm toggle re-created exactly those three.

     Queueing means N occurrences reuse N nodes, and `shift()` hands them out in
     document order so a card keeps roughly the slot it was in. */
  const live = new Map();
  slot.querySelectorAll("img.rd-pcard-img").forEach((img) => {
    const key = img.dataset.cardSrc;
    if (!key) return;
    const queue = live.get(key);
    if (queue) queue.push(img);
    else live.set(key, [img]);
  });

  slot.innerHTML = html;

  slot.querySelectorAll("img.rd-pcard-img").forEach((fresh) => {
    const queue = live.get(fresh.dataset.cardSrc);
    const kept = queue && queue.length ? queue.shift() : null;
    if (kept) fresh.replaceWith(kept);
    else armCardFallback(fresh);
  });
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

  /* **One string compare per stage, not one for the panel.** This polls every
     3 s, and an unguarded `innerHTML =` rebuilds everything each time. A single
     whole-panel compare fixed the idle case but nothing else: any change at all
     — one pick landing, one READY pressed — repainted all four stages, so
     toggling a button reloaded every card on the screen.

     Comparing per stage means a change is confined to the stage it happened in.
     Pressing READY rewrites the READY stage and leaves the PICK cards untouched
     in the DOM; a pick landing rewrites the PICK stage and leaves the ban strip
     alone. Inside the stage that did change, `patchStage` keeps the card nodes
     that are still there, so the one new card is the only one that loads.

     A string compare is enough because nothing in this markup varies with the
     clock: the idle counter and the last-beat line, the two things that used to
     make every render unique, are both gone. Were one to come back it would
     defeat this guard silently, so keep elapsed times out of the body — the
     header is the place for them. */
  const next = {
    lobby: lobbyStage(room, cfg),
    ban: banStage(room),
    pick: pickStage(room),
    ready: readyStage(room),
  };

  /* **A closed room collapses to one line.** `GET /rooms/:code` answers 404 only
     once the entry has left memory; a room that was *closed* is still there and
     still serialises, so the panel used to keep drawing four stages of a room
     with no host, no guest and no picks — which reads as a live room everyone
     walked out of, not as one that ended. The reason moves into the body, where
     the sentence is, rather than staying only in the pill's `title`.

     Polling continues on purpose: a host closing their own room can walk back
     into it (`reopenRoom`), and the next snapshot rebuilds the panel. An
     admin's close sets `adminClosed` and never reopens, so that one simply
     stays on this line. */
  if (room.closed) {
    renderGone(room.closeReason || "This room is closed.");
    return;
  }

  const body = el("roomDetailBody");
  goneMessage = "";

  /* First paint of this room, or the first after a "Loading…"/"gone" message
     replaced the body: build the four slots the patches will land in. */
  if (!body.firstElementChild?.dataset?.stage) {
    setBrief(false);
    body.innerHTML = STAGE_ORDER
      .map((id) => `<div data-stage="${id}">${next[id]}</div>`)
      .join("");
    armCardFallbacks(body);
    painted = next;
    return;
  }

  for (const id of STAGE_ORDER) {
    if (next[id] === painted[id]) continue;
    patchStage(body.querySelector(`[data-stage="${id}"]`), next[id]);
  }
  painted = next;
}

/** Shrink-to-fit while the body is one sentence, 880px while it is a panel. */
function setBrief(on) {
  el("roomDetail")?.querySelector(".rd-card")?.classList.toggle("is-brief", on);
}

/** The room went away mid-watch — a restart, or the host closing it. */
function renderGone(message) {
  /* Idempotent: a closed room reaches this every 3 s, and rewriting the same
     sentence would be the repaint this panel spent two guards avoiding. */
  if (goneMessage === message) return;
  goneMessage = message;
  painted = {};
  setBrief(true);
  el("roomDetailBody").innerHTML = `<p class="rd-gone">${escapeHtml(message)}</p>`;
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
  painted = {};
  goneMessage = "";
  setBrief(false);
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
