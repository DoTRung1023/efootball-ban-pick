import { Router } from "express";
import {
  ALLOWANCE_FIELDS,
  PICK_COUNT_PER_SIDE,
  normalizeBanDurationSec,
  normalizeCapForField,
  normalizePickDurationSec,
  normalizeRevealMode,
} from "./config.js";
import {
  ROOM_STATUS,
  emptyRoomSnapshot,
  ensureRoomEntry,
  isValidRoomCode,
  normalizeRoomCodeParam,
  presenceFingerprint,
  pruneStalePresence,
  pushSystemChat,
  pushUserChat,
  resolveSide,
  roomPresence,
  serializeRoomEntry,
} from "./store.js";

const router = Router({ mergeParams: true });

const MAX_STAGED_BANS_FALLBACK = 10;
const MAX_ALLOWANCE_VALUE_LENGTH = 120;

const sendRoom = (res, entry) => res.json({ room: serializeRoomEntry(entry) });
const sendEmptyRoom = (res) => res.json({ room: emptyRoomSnapshot() });

const asCount = (raw) => Math.max(0, Math.floor(Number(raw) || 0));

/** Normalizes :code and rejects codes too short to be real. */
function withRoomCode(req, res, next) {
  const code = normalizeRoomCodeParam(req.params.code);
  if (!isValidRoomCode(code)) {
    return res.status(400).json({ error: "Invalid room code." });
  }
  req.roomCode = code;
  next();
}

function requireRequesterId(req, res, next) {
  const requesterId = String(req.body?.requesterId || "");
  if (!requesterId) {
    return res.status(400).json({ error: "requesterId is required." });
  }
  req.requesterId = requesterId;
  next();
}

function requirePlayer(req, res, next) {
  const player = req.body?.player || null;
  if (!player || !player.id) {
    return res.status(400).json({ error: "player is required." });
  }
  req.player = player;
  next();
}

/**
 * Resolves the caller's side and attaches it as req.side.
 * `action` names the operation in the 403 message.
 */
function requireParticipant(action) {
  return (req, res, next) => {
    const entry = ensureRoomEntry(req.roomCode);
    const side = resolveSide(entry, req.requesterId);
    if (!side) {
      return res.status(403).json({ error: `Join room before ${action}.` });
    }
    req.entry = entry;
    req.side = side;
    next();
  };
}

function requireDrafting(message) {
  return (req, res, next) => {
    if (String(req.entry.status || "") !== ROOM_STATUS.DRAFTING) {
      return res.status(409).json({ error: message });
    }
    next();
  };
}

const usernameOf = (entry, side) => entry[side]?.username || "User";

// ── Presence ─────────────────────────────────────────────────

/** POST body: { role: "host"|"guest", userId?, username?, stagedBans? } */
router.post("/:code/presence", withRoomCode, (req, res) => {
  const { role, userId, username, stagedBans } = req.body || {};
  if (!["host", "guest"].includes(role)) {
    return res.status(400).json({ error: "role must be host or guest." });
  }

  const entry = ensureRoomEntry(req.roomCode);
  pruneStalePresence(entry, Date.now());

  if (entry.closed && role !== "host") {
    return res.status(410).json({ error: "Room is closed.", room: serializeRoomEntry(entry) });
  }
  if (entry.closed && role === "host") {
    reopenRoom(entry);
  }

  const fallbackName = role === "host" ? "Host" : "Guest";
  const participant = {
    id: userId != null && userId !== ""
      ? String(userId)
      : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username: String(username || fallbackName).trim().slice(0, 50) || fallbackName,
    lastSeenAt: Date.now(),
  };

  const seat = role === "host" ? claimHostSeat : claimGuestSeat;
  const result = seat(entry, participant);
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  const before = presenceFingerprint(entry);
  pruneStalePresence(entry, Date.now());
  const after = presenceFingerprint(entry);

  if (result.changed || presenceChanged(before, after)) {
    entry.updatedAt = Date.now();
  }

  syncStagedBans(entry, role, stagedBans);
  roomPresence.set(req.roomCode, entry);
  sendRoom(res, entry);
});

/** Host re-entering a closed room reopens it under the same code. */
function reopenRoom(entry) {
  entry.closed = false;
  entry.closeReason = "";
  entry.kickedGuestId = "";
  entry.status = ROOM_STATUS.LOBBY;
  entry.turnIndex = 0;
  entry.turnEndsAt = null;
  entry.matchReady = { host: false, guest: false };
}

function claimHostSeat(entry, participant) {
  const activeHostId = entry.host?.id ? String(entry.host.id) : "";
  if (activeHostId && activeHostId !== participant.id) {
    return { status: 409, error: "Room already has an active host." };
  }

  const changed = activeHostId !== participant.id;
  if (changed) pushSystemChat(entry, `${participant.username} joined as host.`);
  entry.host = participant;
  return { changed };
}

function claimGuestSeat(entry, participant) {
  const activeGuestId = entry.guest?.id ? String(entry.guest.id) : "";
  if (activeGuestId && activeGuestId !== participant.id) {
    return { status: 409, error: "Room already has an active guest." };
  }
  if (entry.kickedGuestId && entry.kickedGuestId === participant.id) {
    return { status: 403, error: "You were removed from this room by host." };
  }

  const changed = activeGuestId !== participant.id;
  if (changed) {
    pushSystemChat(entry, `${participant.username} joined the room.`);
    entry.ready.guest = false;
    entry.matchReady.guest = false;
  }
  // A different guest taking the seat clears the previous kick ban.
  if (entry.kickedGuestId && entry.kickedGuestId !== participant.id) {
    entry.kickedGuestId = "";
  }
  entry.guest = participant;
  return { changed };
}

/** True when pruning removed a participant (id cleared, or last-seen reset to 0). */
function presenceChanged(before, after) {
  const [beforeHostId, beforeGuestId, beforeHostSeen, beforeGuestSeen] = before;
  const [afterHostId, afterGuestId, afterHostSeen, afterGuestSeen] = after;
  return (
    beforeHostId !== afterHostId ||
    beforeGuestId !== afterGuestId ||
    (beforeHostSeen > 0 && afterHostSeen === 0) ||
    (beforeGuestSeen > 0 && afterGuestSeen === 0)
  );
}

/** Mirrors the caller's staged (not yet confirmed) bans so the opponent can see them live. */
function syncStagedBans(entry, role, stagedBans) {
  if (!Array.isArray(stagedBans) || !entry.stagedBans) return;
  const maxBans = asCount(entry.config?.banCountPerSide);
  entry.stagedBans[role] = stagedBans
    .slice(0, maxBans || MAX_STAGED_BANS_FALLBACK)
    .map((p) => ({ id: String(p.id || ""), name: String(p.name || "") }))
    .filter((p) => p.id);
}

router.get("/:code", (req, res) => {
  const code = normalizeRoomCodeParam(req.params.code);
  const entry = roomPresence.get(code);
  if (!entry) return sendEmptyRoom(res);

  const [beforeHostId, beforeGuestId] = presenceFingerprint(entry);
  pruneStalePresence(entry);
  const [afterHostId, afterGuestId] = presenceFingerprint(entry);
  if (beforeHostId !== afterHostId || beforeGuestId !== afterGuestId) {
    entry.updatedAt = Date.now();
  }
  sendRoom(res, entry);
});

/** POST body: { requesterId } */
router.post("/:code/leave", withRoomCode, requireRequesterId, (req, res) => {
  const entry = roomPresence.get(req.roomCode);
  if (!entry) return sendEmptyRoom(res);

  if (entry.host?.id && String(entry.host.id) === req.requesterId) {
    pushSystemChat(entry, `${entry.host.username || "Host"} left the room.`);
    entry.host = null;
    entry.closed = true;
    entry.closeReason = "Host closed the room.";
    entry.status = ROOM_STATUS.LOBBY;
    entry.turnIndex = 0;
    entry.turnEndsAt = null;
    entry.guest = null;
    entry.ready.guest = false;
    entry.matchReady = { host: false, guest: false };
    entry.kickedGuestId = "";
  }
  if (entry.guest?.id && String(entry.guest.id) === req.requesterId) {
    pushSystemChat(entry, `${entry.guest.username || "Guest"} left the room.`);
    entry.guest = null;
    entry.ready.guest = false;
    entry.matchReady.guest = false;
  }

  entry.updatedAt = Date.now();
  sendRoom(res, entry);
});

// ── Draft lifecycle ──────────────────────────────────────────

/** POST body: { requesterId } — host starts the draft once the guest is ready. */
router.post("/:code/start", withRoomCode, requireRequesterId, (req, res) => {
  const entry = ensureRoomEntry(req.roomCode);

  if (resolveSide(entry, req.requesterId) !== "host") {
    return res.status(403).json({ error: "Only host can start draft." });
  }
  if (!entry.guest?.id) {
    return res.status(409).json({ error: "Guest is not connected." });
  }
  if (!entry.ready?.guest) {
    return res.status(409).json({ error: "Guest must be ready before starting." });
  }

  // With zero bans configured the draft opens straight into the pick phase.
  const startsWithBans = asCount(entry.config?.banCountPerSide) > 0;
  const durationSec = startsWithBans
    ? normalizeBanDurationSec(entry.config?.banDurationSec)
    : normalizePickDurationSec(entry.config?.pickDurationSec);

  entry.status = ROOM_STATUS.DRAFTING;
  entry.turnIndex = 0;
  entry.turnEndsAt = Date.now() + durationSec * 1000;
  entry.matchReady = { host: false, guest: false };
  entry.stagedBans = { host: [], guest: [] };
  entry.bansConfirmed = { host: false, guest: false };
  entry.updatedAt = Date.now();
  sendRoom(res, entry);
});

/**
 * POST body: { requesterId, player }
 *
 * Bans are per-side: each user bans from the opponent's squad, so both sides
 * may ban the same player. Only a repeat ban by the same user is rejected.
 */
router.post(
  "/:code/ban",
  withRoomCode,
  requireRequesterId,
  requirePlayer,
  requireParticipant("banning"),
  requireDrafting("Bans are only allowed during drafting."),
  (req, res) => {
    const { entry, side, player } = req;
    const playerId = String(player.id);
    const myBans = entry.bans[side];

    if (myBans.some((b) => String(b.id) === playerId) || entry.pickedPlayerIds.includes(playerId)) {
      return res.status(409).json({ error: "Player already banned or picked." });
    }

    const maxBans = asCount(entry.config?.banCountPerSide);
    if (maxBans && myBans.length >= maxBans) {
      return res.status(409).json({ error: "No bans remaining for your side." });
    }

    // Stored as sent — the client normalizes the player shape before posting.
    myBans.push(player);
    entry.bannedPlayerIds.push(playerId);
    entry.updatedAt = Date.now();
    pushSystemChat(entry, `${usernameOf(entry, side)} banned ${String(player.name || player.id)}`);

    sendRoom(res, entry);
  },
);

/** POST body: { requesterId } — marks a side's bans final; both sides advance the draft. */
router.post(
  "/:code/ban-confirm",
  withRoomCode,
  requireRequesterId,
  requireParticipant("confirming bans"),
  requireDrafting("Ban confirm only during drafting."),
  (req, res) => {
    const { entry, side } = req;
    entry.bansConfirmed[side] = true;
    entry.stagedBans[side] = [];

    if (entry.bansConfirmed.host && entry.bansConfirmed.guest) {
      entry.turnIndex = 1; // advance to pick phase
      entry.turnEndsAt = Date.now() + normalizePickDurationSec(entry.config?.pickDurationSec) * 1000;
      entry.bansConfirmed = { host: false, guest: false };
      entry.stagedBans = { host: [], guest: [] };
      pushSystemChat(entry, "Both players confirmed bans — pick phase starting!");
    }

    entry.updatedAt = Date.now();
    sendRoom(res, entry);
  },
);

/** POST body: { requesterId, player } — a player may be picked by one side only. */
router.post(
  "/:code/pick",
  withRoomCode,
  requireRequesterId,
  requirePlayer,
  requireParticipant("picking"),
  requireDrafting("Picks are only allowed during drafting."),
  (req, res) => {
    const { entry, side, player } = req;
    const playerId = String(player.id);

    if (entry.pickedPlayerIds.includes(playerId)) {
      return res.status(409).json({ error: "Player already picked." });
    }

    const maxPicks = asCount(entry.config?.pickCountPerSide);
    const myPicks = entry.picks[side];
    if (maxPicks && myPicks.length >= maxPicks) {
      return res.status(409).json({ error: "No picks remaining for your side." });
    }

    myPicks.push(player);
    entry.pickedPlayerIds.push(playerId);
    entry.updatedAt = Date.now();
    pushSystemChat(entry, `${usernameOf(entry, side)} picked ${String(player.name || player.id)}`);

    sendRoom(res, entry);
  },
);

// ── Room management ──────────────────────────────────────────

/** POST body: { requesterId } */
router.post("/:code/kick-guest", withRoomCode, requireRequesterId, (req, res) => {
  const entry = ensureRoomEntry(req.roomCode);

  if (resolveSide(entry, req.requesterId) !== "host") {
    return res.status(403).json({ error: "Only host can kick guest." });
  }
  if (!entry.guest?.id) {
    return res.status(409).json({ error: "No guest to kick." });
  }

  entry.kickedGuestId = String(entry.guest.id);
  pushSystemChat(entry, `${entry.guest.username || "Guest"} was removed by host.`);
  entry.guest = null;
  entry.ready.guest = false;
  entry.matchReady.guest = false;
  entry.updatedAt = Date.now();
  sendRoom(res, entry);
});

/** POST body: { requesterId, ready } — post-draft confirmation; both ready ends the room. */
router.post(
  "/:code/match-ready",
  withRoomCode,
  requireRequesterId,
  requireParticipant("updating match ready"),
  (req, res) => {
    const { entry, side } = req;
    const ready = Boolean(req.body?.ready);

    if (entry.status === ROOM_STATUS.LOBBY) {
      return res.status(409).json({ error: "Match ready is only available after drafting." });
    }
    // First match-ready call closes the draft and opens the ready phase.
    if (entry.status === ROOM_STATUS.DRAFTING) {
      entry.status = ROOM_STATUS.AWAIT_READY;
      entry.turnEndsAt = null;
      entry.matchReady = { host: false, guest: false };
    }

    entry.matchReady[side] = ready;

    if (entry.matchReady.host && entry.matchReady.guest) {
      entry.status = ROOM_STATUS.DONE;
      entry.turnEndsAt = null;
    } else if (entry.status === ROOM_STATUS.DONE) {
      entry.status = ROOM_STATUS.AWAIT_READY;
    }

    entry.updatedAt = Date.now();
    sendRoom(res, entry);
  },
);

/** POST body: { requesterId, ready } — lobby ready flag, guest only. */
router.post("/:code/ready", withRoomCode, requireRequesterId, (req, res) => {
  const entry = ensureRoomEntry(req.roomCode);

  if (resolveSide(entry, req.requesterId) !== "guest") {
    return res.status(403).json({ error: "Only guest can update ready state." });
  }

  entry.ready.guest = Boolean(req.body?.ready);
  entry.updatedAt = Date.now();
  sendRoom(res, entry);
});

/** POST body: { requesterId, clientSeq?, allowAllPlayers?, banCountPerSide?, allowance*, … } */
router.post("/:code/config", withRoomCode, (req, res) => {
  const {
    requesterId,
    clientSeq,
    allowAllPlayers,
    banCountPerSide,
    banDurationSec,
    pickDurationSec,
    revealMode,
    allowanceEnabled,
    allowance,
    allowanceCaps,
  } = req.body || {};

  const entry = ensureRoomEntry(req.roomCode);
  if (resolveSide(entry, requesterId) !== "host") {
    return res.status(403).json({ error: "Only host can update room settings." });
  }

  // Rapid edits can arrive out of order; drop anything older than the last write.
  const seq = Number(clientSeq);
  if (Number.isFinite(seq) && seq > 0) {
    if (seq < Number(entry.lastConfigSeq || 0)) return sendRoom(res, entry);
    entry.lastConfigSeq = seq;
  }

  const config = entry.config;
  if (allowAllPlayers !== undefined) config.allowAllPlayers = Boolean(allowAllPlayers);
  if (banCountPerSide !== undefined) config.banCountPerSide = asCount(banCountPerSide);
  if (banDurationSec !== undefined) config.banDurationSec = normalizeBanDurationSec(banDurationSec);
  if (pickDurationSec !== undefined) config.pickDurationSec = normalizePickDurationSec(pickDurationSec);
  if (revealMode !== undefined) config.revealMode = normalizeRevealMode(revealMode);

  // Picks are fixed for full squad completion.
  config.pickCountPerSide = PICK_COUNT_PER_SIDE;

  if (allowance && typeof allowance === "object") {
    for (const [key, value] of Object.entries(allowance)) {
      if (!ALLOWANCE_FIELDS.has(key)) continue;
      config.allowance[key] = String(value ?? "").trim().slice(0, MAX_ALLOWANCE_VALUE_LENGTH);
    }
  }

  if (allowanceCaps && typeof allowanceCaps === "object") {
    for (const [key, value] of Object.entries(allowanceCaps)) {
      if (!ALLOWANCE_FIELDS.has(key)) continue;
      config.allowanceCaps[key] = normalizeCapForField(key, value);
    }
  }

  if (Array.isArray(allowanceEnabled)) {
    config.allowanceEnabled = allowanceEnabled
      .map((k) => String(k))
      .filter((k) => ALLOWANCE_FIELDS.has(k));
  }

  entry.updatedAt = Date.now();
  sendRoom(res, entry);
});

/** POST body: { requesterId, username, message } */
router.post("/:code/chat", withRoomCode, (req, res) => {
  const { requesterId, username, message } = req.body || {};
  const text = String(message || "").trim();
  if (!text) return res.status(400).json({ error: "Message is required." });

  const entry = ensureRoomEntry(req.roomCode);
  const senderId = String(requesterId || "");
  if (!resolveSide(entry, senderId)) {
    return res.status(403).json({ error: "Join room before chatting." });
  }

  pushUserChat(entry, { senderId, username, message: text });
  entry.updatedAt = Date.now();
  sendRoom(res, entry);
});

export default router;
