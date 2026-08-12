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
  isKickedFromRoom,
  isValidRoomCode,
  normalizeRoomCodeParam,
  pushSystemChat,
  resetDraftToLobby,
  pushUserChat,
  resolveSide,
  roomPhase,
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

/** POST body: { role: "host"|"guest", userId?, username?, stagedBans?, hidden? } */
router.post("/:code/presence", withRoomCode, (req, res) => {
  const { role, userId, username, stagedBans, hidden } = req.body || {};
  if (!["host", "guest"].includes(role)) {
    return res.status(400).json({ error: "role must be host or guest." });
  }

  const entry = ensureRoomEntry(req.roomCode);

  if (isKickedFromRoom(entry, userId)) {
    return res.status(403).json({ error: "You were removed from this room by host." });
  }

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
    /* Whether that heartbeat came from a backgrounded tab. It expires nobody —
       it is what lets the opponent's badge say "tabbed away" instead of
       "reconnecting", because a hidden tab's 500ms interval is throttled to
       roughly once a minute and its `lastSeenAt` is legitimately stale. */
    hidden: Boolean(hidden),
  };

  const seat = role === "host" ? claimHostSeat : claimGuestSeat;
  const result = seat(entry, participant);
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  if (result.changed) {
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

  const changed = activeGuestId !== participant.id;
  if (changed) {
    pushSystemChat(entry, `${participant.username} joined the room.`);
    entry.ready.guest = false;
    entry.matchReady.guest = false;
  }
  entry.guest = participant;
  return { changed };
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

/**
 * GET ?userId= — the room this user is still seated in, if any.
 *
 * Closing a tab does not give up a seat, so on the way back in the app has to
 * be able to ask "where was I?". The client cannot answer that itself: the
 * phase cache is per-tab `sessionStorage`, which dies with the tab, and it is
 * keyed by a code the home page does not know.
 *
 * Declared **before** `/:code` — Express matches in order, and "mine" is a
 * valid room code as far as that route is concerned.
 */
router.get("/mine", (req, res) => {
  const userId = String(req.query?.userId || "");
  if (!userId) return res.json({ room: null });

  for (const [code, entry] of roomPresence.entries()) {
    if (entry.closed) continue;
    const side = resolveSide(entry, userId);
    if (side) return res.json({ room: { code, side, phase: roomPhase(entry) } });
  }
  return res.json({ room: null });
});

router.get("/:code", (req, res) => {
  const code = normalizeRoomCodeParam(req.params.code);
  const entry = roomPresence.get(code);
  if (!entry) return sendEmptyRoom(res);

  // A plain read: nothing here can change the seats, so `updatedAt` stands.
  sendRoom(res, entry);
});

/**
 * POST body: { requesterId, reason? }
 *
 * `reason: "disconnect"` marks a departure the user did **not** choose — the
 * `pagehide` beacon, sent only from the lobby. It is the difference between
 * closing a room and falling out of one, and the two deserve opposite answers:
 *
 * - **Deliberate** (the Leave button, which has already asked "close room for
 *   everyone?"): a host closing takes the room down, exactly as before.
 * - **Disconnect**: the host's seat passes to the guest. Nobody chose to end
 *   anything, and ending a room because a tab crashed is the harsher reading.
 *
 * Either way, **a room nobody is left in is deleted**. Nothing else in this
 * process ever removed an entry, so every code ever visited stayed in memory
 * until a restart.
 */
router.post("/:code/leave", withRoomCode, requireRequesterId, (req, res) => {
  const entry = roomPresence.get(req.roomCode);
  if (!entry) return sendEmptyRoom(res);

  const disconnected = String(req.body?.reason || "") === "disconnect";
  const side = resolveSide(entry, req.requesterId);
  if (!side) return sendRoom(res, entry);

  if (side === "host") {
    const heir = entry.guest;
    pushSystemChat(entry, `${entry.host.username || "Host"} left the room.`);
    entry.host = null;

    if (disconnected && heir?.id) {
      /* Promotion. The guest's client discovers this from the next snapshot —
         see `adoptSeat` in presence.js; without that it would keep claiming the
         guest seat and end up sitting in both. */
      entry.host = heir;
      entry.guest = null;
      entry.ready.guest = false;
      if (resetDraftToLobby(entry)) {
        pushSystemChat(entry, "Draft cancelled — the host disconnected.");
      }
      pushSystemChat(entry, `${heir.username || "Guest"} is the host now.`);
    } else if (heir?.id) {
      /* Deliberate close, with somebody to tell. The entry has to outlive both
         seats here — `closed` + `closeReason` is the only thing that puts the
         guest on the "Room closed" screen, and deleting it would hand them an
         empty snapshot instead. It is also what `reopenRoom` comes back to. */
      entry.closed = true;
      entry.closeReason = "Host closed the room.";
      entry.status = ROOM_STATUS.LOBBY;
      entry.turnIndex = 0;
      entry.turnEndsAt = null;
      entry.guest = null;
      entry.ready.guest = false;
      entry.matchReady = { host: false, guest: false };
    }
    /* A lone host leaving deliberately sets no `closed` flag at all: there is
       nobody to show it to, so the room is simply deleted below. Reopening the
       same code makes a fresh lobby, which is what `reopenRoom` would have
       produced anyway. */
  } else {
    pushSystemChat(entry, `${entry.guest.username || "Guest"} left the room.`);
    entry.guest = null;
    /* The room survives its guest: the host drops back to the lobby with the
       code intact and can invite somebody else. */
    if (resetDraftToLobby(entry)) {
      pushSystemChat(entry, "Draft cancelled — waiting for a new player.");
    }
  }

  /* The last player out takes the room with them. Safe precisely because it is
     the last: `ensureRoomEntry` would recreate the entry on the next heartbeat,
     and there is nobody left to send one. A **closed** room is the exception —
     it has no seats by definition and still has a message to deliver. */
  if (!entry.host?.id && !entry.guest?.id && !entry.closed) {
    roomPresence.delete(req.roomCode);
    return sendEmptyRoom(res);
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
    if (entry.bansConfirmed?.[side]) {
      return res.status(409).json({ error: "Un-confirm your bans before changing them." });
    }
    const playerId = String(player.id);
    const myBans = entry.bans[side];

    if (myBans.some((b) => String(b.id) === playerId)) {
      return res.status(409).json({ error: "Player already banned." });
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
    // Absent means confirm — older clients send no body at all.
    const confirmed = req.body?.confirmed !== false;

    if (!confirmed) {
      /* Un-confirming hands this side's bans back as *staged* ones, which is
         what makes them editable again: the staged strip already has the × and
         the counter, so nothing new is needed to change your mind. The client
         mirrors the same move into `state.stagedBans`, because its heartbeat
         overwrites `entry.stagedBans[side]` on the next poll either way. */
      entry.bansConfirmed[side] = false;
      entry.stagedBans[side] = (entry.bans[side] || [])
        .map((p) => ({ id: String(p.id), name: String(p.name || "") }));
      entry.bans[side] = [];
      entry.bannedPlayerIds = [...entry.bans.host, ...entry.bans.guest].map((p) => String(p.id));
      pushSystemChat(entry, `${usernameOf(entry, side)} un-confirmed their bans.`);
      entry.updatedAt = Date.now();
      return sendRoom(res, entry);
    }

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

/**
 * POST body: { requesterId, confirmed } — this side's lineup is final, or is not.
 *
 * The pick-phase twin of `/ban-confirm`, and it exists for the same reason: a
 * side confirming must **not** move that player on alone. The draft advances to
 * `await-ready` only once both have confirmed, and until then either can come
 * back and change their mind — `/picks` refuses a write while your own flag is
 * set, so "unconfirm first" is enforced here and not just in the UI.
 */
router.post(
  "/:code/picks-confirm",
  withRoomCode,
  requireRequesterId,
  requireParticipant("confirming picks"),
  requireDrafting("Pick confirm only during drafting."),
  (req, res) => {
    const { entry, side } = req;
    const confirmed = req.body?.confirmed !== false;

    entry.picksConfirmed[side] = confirmed;
    pushSystemChat(
      entry,
      confirmed
        ? `${usernameOf(entry, side)} confirmed their squad.`
        : `${usernameOf(entry, side)} un-confirmed their squad.`,
    );

    if (entry.picksConfirmed.host && entry.picksConfirmed.guest) {
      entry.status = ROOM_STATUS.AWAIT_READY;
      entry.turnEndsAt = null;
      entry.picksConfirmed = { host: false, guest: false };
      entry.matchReady = { host: false, guest: false };
      pushSystemChat(entry, "Both squads confirmed — on to the match!");
    }

    entry.updatedAt = Date.now();
    sendRoom(res, entry);
  },
);

/**
 * POST body: { requesterId, players } — replaces this side's lineup wholesale.
 *
 * **This is the only way a pick is written.** There was a `/:code/pick` beside
 * it that appended one player into the first free slot, but nothing that
 * *removed* or *moved* a pick could persist through it — the client changed the
 * lineup locally and the next presence poll handed the server's copy straight
 * back. Once every pick named its slot on the client (see
 * `.claude/rules/room/pick-phase.md`) that route had no caller at all. Picking a
 * player, changing one, swapping two, CLEAR ALL and LOAD GAME PLAN are all the
 * same write: send the whole lineup.
 *
 * **Picks are per-side and independent**, exactly like bans: each player drafts
 * from their *own* squad, so both sides owning the same player is normal and
 * neither blocks the other. The only conflict is a duplicate within this side's
 * own lineup, and the later copy is dropped.
 *
 * `players` is **slot-addressed** — index is the pitch slot, `null` is an empty
 * slot — and holes are preserved exactly as sent, which is what lets a removed
 * player leave his slot empty instead of sliding everyone after him along.
 * Trailing holes are trimmed so the array does not grow without bound.
 */
router.post(
  "/:code/picks",
  withRoomCode,
  requireRequesterId,
  requireParticipant("picking"),
  requireDrafting("Picks are only allowed during drafting."),
  (req, res) => {
    const { entry, side } = req;
    const incoming = req.body?.players;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: "players must be an array." });
    }
    // Confirmed means final until you say otherwise — see /picks-confirm.
    if (entry.picksConfirmed?.[side]) {
      return res.status(409).json({ error: "Un-confirm your squad before changing it." });
    }

    const maxPicks = asCount(entry.config?.pickCountPerSide);
    if (maxPicks && incoming.length > maxPicks) {
      return res.status(409).json({ error: "Too many picks for your side." });
    }

    const slots = [];
    const seen = new Set();
    for (const player of incoming) {
      const id = String(player?.id || "");
      // anything without a usable id becomes a hole, which is also how null arrives
      if (!id || seen.has(id)) {
        slots.push(null);
        continue;
      }
      seen.add(id);
      slots.push(player);
    }
    while (slots.length && slots[slots.length - 1] === null) slots.pop();

    entry.picks[side] = slots;
    entry.updatedAt = Date.now();
    pushSystemChat(
      entry,
      seen.size
        ? `${usernameOf(entry, side)} updated their lineup (${seen.size})`
        : `${usernameOf(entry, side)} cleared their lineup`,
    );

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

  const kickedId = String(entry.guest.id);
  if (!isKickedFromRoom(entry, kickedId)) entry.kickedGuestIds.push(kickedId);
  pushSystemChat(entry, `${entry.guest.username || "Guest"} was removed by host.`);
  entry.guest = null;
  // Same as a guest leaving — see resetDraftToLobby.
  if (resetDraftToLobby(entry)) {
    pushSystemChat(entry, "Draft cancelled — waiting for a new player.");
  }
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

    /* Only from the ready screen onward. This used to promote a **drafting**
       room to `await-ready` on the first call, which meant either player could
       post match-ready mid-ban or mid-pick and skip the rest of the draft for
       both of them. Nothing in the UI does that — `initReadyControls` returns
       unless `state.phase === "ready"` — but the endpoint was the only thing
       standing between a stale tab and a cancelled pick phase. The legitimate
       route into `await-ready` is both sides confirming in `/picks-confirm`. */
    if (entry.status !== ROOM_STATUS.AWAIT_READY && entry.status !== ROOM_STATUS.DONE) {
      return res.status(409).json({ error: "Match ready is only available after both squads are confirmed." });
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
