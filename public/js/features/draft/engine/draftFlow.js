/**
 * Draft state machine: which stage we're in, the countdown timer, and
 * optimistic application of the local user's ban/pick before the server
 * confirms it.
 *
 * The schedule always holds exactly two entries — a simultaneous ban stage
 * then a simultaneous pick stage (see buildTurnSchedule).
 */

import { cb } from '@/features/draft/callbacks.js';
import { showToast } from '@/features/draft/utils.js';
import {
  state,
  defaultRoomConfig,
  normalizeBanDurationSec,
  normalizePickDurationSec,
} from '@/features/draft/state.js';
import { getBanListPlayers, getPickListPlayers } from '@/features/draft/playerQuery.js';
import { START_MATCH_STATUSES } from '@/features/draft/constants.js';
import { isUnlimitedDuration } from '@/features/draft/state.js';

const FALLBACK_TURN_SECONDS = 60;
const TIMER_TICK_MS = 250;
const LOW_TIME_SECONDS = 10;   // when the clock turns red — styling only

/**
 * True once picking is done — the whole Start Match screen, from confirming
 * squads through to the final whistle. The ban and pick boards are off for all
 * of it, which is the only thing every caller wants to know.
 *
 * `state.phase === "ready"` covers the same ground locally: the client keeps one
 * phase for all three handshakes, because they are one screen.
 */
export function isReadyPhase(room = state.room) {
  return state.phase === "ready" || START_MATCH_STATUSES.includes(String(room?.status || ""));
}

/** The ban/pick list currently backing the grid. */
export function getDraftDisplayPlayers(room = state.room) {
  if (!room) return [];
  if (isReadyPhase(room)) return state.players;
  return getDraftStage(room) === "ban" ? getBanListPlayers() : getPickListPlayers();
}

function getTurnDurationSec(turn, cfg = state.room?.config || defaultRoomConfig()) {
  if (turn?.action === "ban") return normalizeBanDurationSec(cfg?.banDurationSec);
  if (turn?.action === "pick") return normalizePickDurationSec(cfg?.pickDurationSec);
  return FALLBACK_TURN_SECONDS;
}

function getDraftStage(room = state.room) {
  return String((room ? state.schedule[room.turnIndex] : null)?.action || "");
}

/** Seeds turnEndsAt when a snapshot arrives without one (e.g. after a reload). */
export function ensureDraftTimer(room = state.room) {
  if (!room || room.turnEndsAt) return;
  const durationSec = getTurnDurationSec({ action: getDraftStage(room) }, room.config);
  /* Unlimited stays `null`. Inventing a deadline here would give this client a
     countdown the server never set and the opponent never sees — and it would
     expire, taking the player's turn with it. */
  if (isUnlimitedDuration(durationSec)) return;
  room.turnEndsAt = Date.now() + durationSec * 1000;
}

export function syncCurrentTurnFromIndex(room) {
  room.currentTurn = state.schedule[room.turnIndex] || null;
}

function advanceDraftStage(room, nextAction) {
  if (!room) return;
  const nextIdx = state.schedule.findIndex((t) => String(t?.action || "") === String(nextAction || ""));
  if (nextIdx < 0) return;

  state.stagedBans = [];
  state.opponentStagedBans = [];
  room.turnIndex = nextIdx;
  syncCurrentTurnFromIndex(room);
  room.turnEndsAt = Date.now() + getTurnDurationSec(state.schedule[nextIdx], room.config) * 1000;
  startTurnTimer();
}

/** Once both sides have used every ban, move on without waiting for the timer. */
function maybeAutoAdvanceFromBan(room = state.room) {
  if (!room || getDraftStage(room) !== "ban") return;
  const target = banLimit(room.config);
  if (!target) return;
  const doneHost = (room.bans?.host || []).length >= target;
  const doneGuest = (room.bans?.guest || []).length >= target;
  if (doneHost && doneGuest) advanceDraftStage(room, "pick");
}

const asCount = (raw) => Math.max(0, Math.floor(Number(raw) || 0));

export const banLimit = (cfg) => asCount((cfg || defaultRoomConfig()).banCountPerSide);
export const pickLimit = (cfg) => asCount((cfg || defaultRoomConfig()).pickCountPerSide);

/**
 * Applies a ban to the local room copy so the UI updates immediately.
 * Returns false when the ban is not allowed; the caller should not post it.
 *
 * **There is no pick equivalent.** A pick names its slot now, and
 * `placePickInSlot` posts the whole lineup and takes the server's answer rather
 * than guessing where the player will land — see `pick-phase.md`. This used to
 * be `applyLocalAction`, with a second half that appended a pick to the first
 * free slot.
 */
export function applyLocalBan(room, player) {
  const turn = state.schedule[room.turnIndex];
  if (turn?.action !== "ban") return false;

  const mySide = state.mySide;
  if (!mySide) return false;

  /* Bans are **per-side**: each player bans out of the opponent's squad, so the
     opponent holding a ban is irrelevant to you. Only your own side can
     conflict with itself. */
  const id = String(player.id);
  if ((room.bans?.[mySide] || []).some((b) => String(b.id) === id)) return false;

  const maxBans = banLimit(room.config);
  if (maxBans && (room.bans?.[mySide] || []).length >= maxBans) {
    showToast("You already used all bans for your side.");
    return false;
  }

  room.bans[mySide].push(player);
  room.bannedPlayerIds.push(id);
  maybeAutoAdvanceFromBan(room);
  return true;
}

// ── Countdown timer ──────────────────────────────────────────

export function clearTurnTimer() {
  if (state.turnTimer) {
    clearInterval(state.turnTimer);
    state.turnTimer = null;
  }
}

/** Paints the digits + progress bar for the remaining seconds.
    Colour is not decided here: the element carries `is-low` and a
    `--timer-progress` width, and `draft/shell.css` says what those look like. */
function paintTimer(secondsLeft, durationSec) {
  const inner = document.getElementById("timerInner");
  const ring = document.getElementById("timerRing");
  const isLow = secondsLeft <= LOW_TIME_SECONDS;

  if (inner) inner.textContent = String(secondsLeft);
  if (ring) {
    const pct = Math.min(1, secondsLeft / durationSec) * 100;
    ring.classList.toggle("is-low", isLow);
    ring.style.setProperty("--timer-progress", `${pct}%`);
  }
}

/** The clock for a phase with no deadline: full bar, never low, never counts. */
function paintUnlimitedTimer() {
  const inner = document.getElementById("timerInner");
  const ring = document.getElementById("timerRing");
  if (inner && inner.textContent !== "∞") inner.textContent = "∞";
  if (ring) {
    ring.classList.remove("is-low");
    ring.style.setProperty("--timer-progress", "100%");
  }
}

/** Time-up: submit whatever the user staged, then move to the next stage. */
function handleTurnExpiry() {
  clearTurnTimer();
  const room = state.room;
  if (!room) return;

  const stage = getDraftStage(room);
  if (stage === "ban") {
    void cb.flushAndSubmitStagedBans();
    if (getDraftStage(room) === "ban") advanceDraftStage(room, "pick");
    cb.renderDraftUi();
  } else if (stage === "pick") {
    /* Time up confirms whatever you have, complete or not — the same shape as
       the ban stage flushing what you staged. It does **not** jump to the ready
       phase on its own any more: the server moves everyone once both sides are
       confirmed, and both clocks run out together, so both confirmations land. */
    void cb.confirmPicks(true);
    cb.renderDraftUi();
  }
}

export function startTurnTimer() {
  clearTurnTimer();
  const tick = () => {
    const room = state.room;
    if (!room || state.phase !== "draft") return;

    /* No deadline during a live draft means the host turned this phase's clock
       off. `turnEndsAt` is null in other phases too, which is why the phase is
       tested first — this branch only ever runs for a turn that is genuinely
       untimed. */
    if (!room.turnEndsAt) {
      paintUnlimitedTimer();
      return;
    }

    const left = Math.max(0, Math.ceil((room.turnEndsAt - Date.now()) / 1000));
    paintTimer(left, getTurnDurationSec(state.schedule[room.turnIndex], room.config));
    if (left <= 0) handleTurnExpiry();
  };
  tick();
  state.turnTimer = setInterval(tick, TIMER_TICK_MS);
}

// ── Post-draft ready phase ───────────────────────────────────

/* There is no `isBothMatchReady`. It answered "should the room advance?" from
   the client's copy of the flags, which is a second implementation of a rule
   the server already owns — and with three handshakes rather than one it would
   have had to grow a step argument to keep saying the same thing. The status on
   the snapshot is the answer. */

/**
 * Switches this client into the ready phase.
 *
 * **The server decides when that happens** — `status: "await-ready"` arrives in
 * a snapshot once *both* sides have confirmed their squads — so this moves local
 * state only and leaves every room field to the snapshot that announced it. It
 * replaces `beginPostDraftReadyPhase`, which wrote `status`, `turnEndsAt` and
 * `matchReady` itself and so could carry one player into Start Match alone.
 *
 * The phase then holds for all three handshakes — ready, start, finish — because
 * they are one screen and one set of rules about what else is on it. Only the
 * finished room moves off it, into `done`.
 *
 * Idempotent: `renderDraftUi` calls it on every poll while the phase holds.
 */
export function enterReadyPhase() {
  if (state.phase === "ready") return;
  state.phase = "ready";
  clearTurnTimer();
}
