/**
 * Draft state machine: which stage we're in, the countdown timer, and
 * optimistic application of the local user's ban/pick before the server
 * confirms it.
 *
 * The schedule always holds exactly two entries — a simultaneous ban stage
 * then a simultaneous pick stage (see buildTurnSchedule).
 */

import { GREEN, RED, LOBBY_PRESENCE_POLL_MS } from '@/features/draft/constants.js';
import { getAllowanceCapViolation } from '@/features/draft/allowance.js';
import { cb } from '@/features/draft/callbacks.js';
import { showToast } from '@/features/draft/utils.js';
import {
  state,
  defaultRoomConfig,
  normalizeBanDurationSec,
  normalizePickDurationSec,
} from '@/features/draft/state.js';
import { getBanListPlayers, getPickListPlayers } from '@/features/draft/ban/ban.js';
import { stopPresencePolling, pollPresence } from './presence.js';

const FALLBACK_TURN_SECONDS = 60;
const TIMER_TICK_MS = 250;
const LOW_TIME_SECONDS = 5;

/** True once picking is done and both sides are confirming the match. */
export function isReadyPhase(room = state.room) {
  return state.phase === "ready" || String(room?.status || "") === "await-ready";
}

/** The ban/pick list currently backing the grid. */
export function getDraftDisplayPlayers(room = state.room) {
  if (!room) return [];
  if (isReadyPhase(room)) return state.players;
  return getDraftStage(room) === "ban" ? getBanListPlayers() : getPickListPlayers();
}

export function getTurnDurationSec(turn, cfg = state.room?.config || defaultRoomConfig()) {
  if (turn?.action === "ban") return normalizeBanDurationSec(cfg?.banDurationSec);
  if (turn?.action === "pick") return normalizePickDurationSec(cfg?.pickDurationSec);
  return FALLBACK_TURN_SECONDS;
}

export function getDraftStage(room = state.room) {
  return String((room ? state.schedule[room.turnIndex] : null)?.action || "");
}

/** Seeds turnEndsAt when a snapshot arrives without one (e.g. after a reload). */
export function ensureDraftTimer(room = state.room) {
  if (!room || room.turnEndsAt) return;
  const durationSec = getTurnDurationSec({ action: getDraftStage(room) }, room.config);
  room.turnEndsAt = Date.now() + durationSec * 1000;
}

export function syncCurrentTurnFromIndex(room) {
  room.currentTurn = state.schedule[room.turnIndex] || null;
}

export function advanceDraftStage(room, nextAction) {
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
export function maybeAutoAdvanceFromBan(room = state.room) {
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
 * Applies a ban or pick to the local room copy so the UI updates immediately.
 * Returns false when the action is not allowed; the caller should not post it.
 */
export function applyLocalAction(room, player) {
  const turn = state.schedule[room.turnIndex];
  if (!turn) return false;

  const mySide = state.mySide;
  if (!mySide) return false;

  const id = String(player.id);
  const isBan = turn.action === "ban";

  // A player may be banned by both sides, but picked by only one.
  if (isBan) {
    const myBanIds = (room.bans?.[mySide] || []).map((b) => String(b.id));
    if (myBanIds.includes(id) || room.pickedPlayerIds.includes(id)) return false;
  } else if (room.pickedPlayerIds.includes(id)) {
    return false;
  }

  if (isBan) {
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

  const violation = getAllowanceCapViolation(room, mySide, player);
  if (violation) {
    state.actionError = `${violation.label}: max ${violation.cap} card(s) allowed per side.`;
    showToast(state.actionError);
    return false;
  }

  room.picks[mySide].push(player);
  room.pickedPlayerIds.push(id);
  return true;
}

// ── Countdown timer ──────────────────────────────────────────

export function clearTurnTimer() {
  if (state.turnTimer) {
    clearInterval(state.turnTimer);
    state.turnTimer = null;
  }
}

/** Paints the ring + digits for the remaining seconds. */
function paintTimer(secondsLeft, durationSec) {
  const inner = document.getElementById("timerInner");
  const ring = document.getElementById("timerRing");
  const isLow = secondsLeft <= LOW_TIME_SECONDS;

  if (inner) {
    inner.textContent = String(secondsLeft);
    inner.style.color = isLow ? RED : "#fff";
  }
  if (ring) {
    const deg = Math.min(1, secondsLeft / durationSec) * 360;
    ring.classList.toggle("is-low", isLow);
    ring.style.background = `conic-gradient(${isLow ? RED : GREEN} ${deg}deg, #263c4e 0deg)`;
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
    beginPostDraftReadyPhase(room);
    cb.renderDraftUi();
  }
}

export function startTurnTimer() {
  clearTurnTimer();
  const tick = () => {
    const room = state.room;
    if (!room?.turnEndsAt || state.phase !== "draft") return;

    const left = Math.max(0, Math.ceil((room.turnEndsAt - Date.now()) / 1000));
    paintTimer(left, getTurnDurationSec(state.schedule[room.turnIndex], room.config));
    if (left <= 0) handleTurnExpiry();
  };
  tick();
  state.turnTimer = setInterval(tick, TIMER_TICK_MS);
}

// ── Post-draft ready phase ───────────────────────────────────

export function isBothMatchReady(room = state.room) {
  return Boolean(room?.matchReady?.host) && Boolean(room?.matchReady?.guest);
}

/** Closes the draft locally and switches polling back to the slower lobby cadence. */
export function beginPostDraftReadyPhase(room = state.room) {
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
