import { Router } from "express";
import { asyncHandler } from "#lib/http.js";
import { maybeRefreshSquadSizes, refreshSquadSizes } from "./squads.js";
import {
  ALLOWANCE_FIELDS,
  PICK_COUNT_PER_SIDE,
  squadStartProblem,
  normalizeBanDurationSec,
  normalizeCountForField,
  orderAllowanceCounts,
  normalizePickDurationSec,
  turnDeadline,
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
  resetMatchSteps,
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
router.post("/:code/presence", withRoomCode, asyncHandler(async (req, res) => {
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
    /* Awaited, but only on the beat that claims a seat — once per join, not on
       the 500 ms heartbeat behind it. Fired and forgotten, the lobby rendered a
       seat with no squad line until the count landed a poll or two later. */
    await refreshSquadSizes(entry);
  } else if (entry.status === ROOM_STATUS.LOBBY) {
    /* Not awaited and heavily throttled: this only has to notice a squad that
       changed somewhere else, and the lobby is the only phase it can matter in. */
    maybeRefreshSquadSizes(entry);
  }

  syncStagedBans(entry, role, stagedBans);
  roomPresence.set(req.roomCode, entry);
  sendRoom(res, entry);
}));

/** Host re-entering a closed room reopens it under the same code. */
function reopenRoom(entry) {
  entry.closed = false;
  entry.closeReason = "";
  entry.status = ROOM_STATUS.LOBBY;
  entry.turnIndex = 0;
  entry.turnEndsAt = null;
  resetMatchSteps(entry);
}

function claimHostSeat(entry, participant) {
  const activeHostId = entry.host?.id ? String(entry.host.id) : "";
  if (activeHostId && activeHostId !== participant.id) {
    return { status: 409, error: "Room already has an active host." };
  }

  const changed = activeHostId !== participant.id;
  if (changed) pushSystemChat(entry, `${participant.username} joined as host.`);
  /* The heartbeat rebuilds this object every 500 ms, so anything cached on the
     seat rather than sent with the beat has to be carried across — the squad
     size was being wiped a beat after it was looked up. */
  participant.playerCount = changed ? null : (entry.host?.playerCount ?? null);
  entry.host = participant;
  return { changed };
}

function claimGuestSeat(entry, participant) {
  const activeGuestId = entry.guest?.id ? String(entry.guest.id) : "";
  if (activeGuestId && activeGuestId !== participant.id) {
    return { status: 409, error: "Room already has an active guest." };
  }

  const changed = activeGuestId !== participant.id;
  participant.playerCount = changed ? null : (entry.guest?.playerCount ?? null);
  if (changed) {
    pushSystemChat(entry, `${participant.username} joined the room.`);
    entry.ready.guest = false;
    resetMatchSteps(entry, "guest");
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
/**
 * The room this user is currently *in*, if any. The home page asks on boot and
 * sends them straight back to it (`redirectToActiveRoom`), so anything answered
 * here is somewhere the user cannot get out of by going home.
 *
 * Two kinds of room are therefore not an answer, and both are seats that still
 * exist:
 *
 * - `closed` — the seat outlives the close so the *other* player gets told;
 * - **left for a new match.** `new-match` deliberately does not clear the
 *   initiator's seat: the room stays open for the player left behind, and their
 *   screen still needs the departed player's name on it. But the departed
 *   player has gone somewhere else, and without this they would be dragged back
 *   into the room they just left the moment they went home from the new one —
 *   which is exactly what "close room takes you to My Players" stops being true
 *   for.
 */
router.get("/mine", (req, res) => {
  const userId = String(req.query?.userId || "");
  if (!userId) return res.json({ room: null });

  for (const [code, entry] of roomPresence.entries()) {
    if (entry.closed) continue;
    const side = resolveSide(entry, userId);
    if (!side) continue;
    if (entry.newMatch?.by === side) continue;
    return res.json({ room: { code, side, phase: roomPhase(entry) } });
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

  /* The other side already left for a new match. Their seat was kept only so
     this player's screen could keep their name on it — and this player is now
     leaving too, so there is nobody left to read it. Vacating it here is what
     lets everything below see the room as it really is: the host branch finds
     no heir and takes the lone-host path, and the "last one out" delete at the
     bottom fires instead of leaving a lobby with a seat nobody is sitting in.
     Without this the departed player was handed their old seat back by
     `resetDraftToLobby` and dragged into it the next time they went home. */
  const other = side === "host" ? "guest" : "host";
  if (entry.newMatch?.by === other) {
    entry[other] = null;
    entry.newMatch = null;
  }

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
      resetMatchSteps(entry);
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
router.post("/:code/start", withRoomCode, requireRequesterId, asyncHandler(async (req, res) => {
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

  /* Counted here rather than trusted from the lobby: a squad can change in
     another tab while its owner waits, and this is the moment it has to be
     right. Anonymous seats count as unknown and are skipped — see squads.js. */
  const problem = squadStartProblem(
    await refreshSquadSizes(entry),
    entry.config?.banCountPerSide,
  );
  if (problem) return res.status(409).json({ error: problem, room: serializeRoomEntry(entry) });

  // With zero bans configured the draft opens straight into the pick phase.
  const startsWithBans = asCount(entry.config?.banCountPerSide) > 0;
  const durationSec = startsWithBans
    ? normalizeBanDurationSec(entry.config?.banDurationSec)
    : normalizePickDurationSec(entry.config?.pickDurationSec);

  entry.status = ROOM_STATUS.DRAFTING;
  entry.turnIndex = 0;
  /* `null` when the host set this phase to unlimited — no deadline, so nothing
     expires and the phase ends the way it otherwise would, on both sides
     confirming. */
  entry.turnEndsAt = turnDeadline(durationSec);
  resetMatchSteps(entry);
  entry.stagedBans = { host: [], guest: [] };
  entry.bansConfirmed = { host: false, guest: false };
  entry.updatedAt = Date.now();
  sendRoom(res, entry);
}));

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
      entry.turnEndsAt = turnDeadline(normalizePickDurationSec(entry.config?.pickDurationSec));
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

    /* The formation rides along with the confirmation because *this* is the
       moment the squad becomes final — changing the shape on the pick board
       does not repost the lineup, so the last `/picks` write is not a reliable
       carrier. Length-capped only; see `formations` in store.js for why there
       is no whitelist on this side. */
    const formation = String(req.body?.formation || "").slice(0, 20);
    if (formation) entry.formations[side] = formation;

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
      resetMatchSteps(entry);
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

/**
 * The three post-draft handshakes, in the order a room walks them. Each names
 * the status it is open in and the status *both* presses lead to.
 *
 * `undoable` is whether a side may take its press back once the room has
 * already moved on. Ready and start may: the other player simply gets walked
 * back a stage with them, and nothing has happened yet. **Finish may not.**
 * Walking `done` back would look exactly like a rematch-accept to the other
 * client — it sits in the `done` phase watching for the status to leave `done`,
 * and that is the signal it reloads on.
 */
const MATCH_STEPS = {
  ready:  { flag: "matchReady",    from: ROOM_STATUS.AWAIT_READY, to: ROOM_STATUS.AWAIT_START, undoable: true },
  start:  { flag: "matchStarted",  from: ROOM_STATUS.AWAIT_START, to: ROOM_STATUS.LIVE,        undoable: true },
  finish: { flag: "matchFinished", from: ROOM_STATUS.LIVE,        to: ROOM_STATUS.DONE,        undoable: false },
};

/** POST body: { requesterId, step, value } — one side's answer to one handshake. */
router.post(
  "/:code/match-step",
  withRoomCode,
  requireRequesterId,
  requireParticipant("updating the match"),
  (req, res) => {
    const { entry, side } = req;
    const step = MATCH_STEPS[String(req.body?.step || "")];
    if (!step) {
      return res.status(400).json({ error: "Unknown match step." });
    }

    /* A step is only answerable in its own status. This matters more than it
       looks: the ancestor of this route promoted a **drafting** room to
       `await-ready` on the first call, which meant either player could post it
       mid-ban and skip the rest of the draft for both of them. Nothing in the
       UI does that — the button is not on screen — but the endpoint was the only
       thing standing between a stale tab and a cancelled pick phase. The
       legitimate route into `await-ready` is both sides confirming their squads
       in `/picks-confirm`; every status after it is reached from the one before
       it, by both sides, through here. */
    const open = entry.status === step.from || (step.undoable && entry.status === step.to);
    if (!open) {
      return res.status(409).json({ error: "That is not the step this room is on." });
    }

    entry[step.flag][side] = Boolean(req.body?.value);

    if (entry[step.flag].host && entry[step.flag].guest) {
      entry.status = step.to;
      entry.turnEndsAt = null;
      if (step.to === ROOM_STATUS.LIVE) pushSystemChat(entry, "Both sides kicked off — match in progress.");
      if (step.to === ROOM_STATUS.DONE) pushSystemChat(entry, "Match finished.");
    } else if (entry.status === step.to) {
      entry.status = step.from;
    }

    entry.updatedAt = Date.now();
    sendRoom(res, entry);
  },
);

/**
 * POST body: { requesterId, action } — what happens once the match is over.
 *
 * Two ways out of a finished room. **Neither ends it for the other player** —
 * that is what the header's Close room / Leave is for, and it is on screen here
 * like everywhere else:
 *
 * - `new-match` says "I have gone to play someone else". It records
 *   `newMatch = { by }` and nothing more: the room stays open, the status stays
 *   `done`, both seats stay put, and the other player stays exactly where they
 *   were — on Start Match, looking at the squads, now told that nobody is coming
 *   back and with REMATCH disabled because there is no longer anyone to offer it
 *   to. It used to set `closed` and clear both seats, which threw the other
 *   player onto a "Room closed" countdown and out to the home page for the
 *   crime of having been left behind.
 *
 *   There used to be a `close` action beside it — the same transition with a
 *   different chat line. Its button is gone from the post-match footer, because
 *   the header already carries that action. With no caller left the branch went.
 * - `rematch-propose` / `-cancel` / `-accept` / `-decline` keep both seats. An
 *   offer is held on the entry so the other side's next poll finds it; accepting
 *   is the only thing that resets the draft, and **only the other side can
 *   accept** — without that check a player could propose and accept their own
 *   rematch and drag the opponent back into a ban phase they never agreed to.
 *   By the same logic **only the proposer can cancel**: cancelling somebody
 *   else's offer is declining it, and that is what decline is for.
 *
 * Restricted to a finished room. Mid-draft these would be a way to wipe the
 * other player's picks.
 */
router.post(
  "/:code/post-match",
  withRoomCode,
  requireRequesterId,
  requireParticipant("ending the match"),
  (req, res) => {
    const { entry, side } = req;
    const action = String(req.body?.action || "");
    const other = side === "host" ? "guest" : "host";
    const who = entry[side]?.username || side;

    if (entry.status !== ROOM_STATUS.DONE) {
      return res.status(409).json({ error: "The match is not over yet." });
    }

    if (action === "new-match") {
      /* A flag, and that is deliberately all. Closing the room, clearing the
         seats or resetting the draft would each take the screen out from under
         the other player; they are staying on it. Any pending offer goes,
         because the side it was aimed at has just left. */
      entry.newMatch = { by: side };
      entry.rematch = null;
      pushSystemChat(entry, `${who} started a different match.`);
      entry.updatedAt = Date.now();
      return sendRoom(res, entry);
    }

    if (action === "rematch-propose") {
      entry.rematch = { by: side };
      pushSystemChat(entry, `${who} wants a rematch.`);
      entry.updatedAt = Date.now();
      return sendRoom(res, entry);
    }

    if (action === "rematch-cancel") {
      if (entry.rematch?.by !== side) {
        return res.status(409).json({ error: "You have no rematch offer to cancel." });
      }
      entry.rematch = null;
      pushSystemChat(entry, `${who} cancelled the rematch offer.`);
      entry.updatedAt = Date.now();
      return sendRoom(res, entry);
    }

    if (action === "rematch-accept") {
      if (entry.rematch?.by !== other) {
        return res.status(409).json({ error: "There is no rematch to accept." });
      }
      entry.rematch = null;
      resetDraftToLobby(entry);   // also clears matchReady and the offer
      pushSystemChat(entry, `${who} accepted the rematch — back to ban settings.`);
      entry.updatedAt = Date.now();
      return sendRoom(res, entry);
    }

    if (action === "rematch-decline") {
      entry.rematch = null;
      pushSystemChat(entry, `${who} declined the rematch.`);
      entry.updatedAt = Date.now();
      return sendRoom(res, entry);
    }

    return res.status(400).json({ error: "Unknown post-match action." });
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
    allowanceMins,
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

  /* The floor and the ceiling take the same normaliser, because a per-value
     category carries a Min per value exactly as it carries a Max. */
  for (const [field, incoming] of [["allowanceCaps", allowanceCaps], ["allowanceMins", allowanceMins]]) {
    if (!incoming || typeof incoming !== "object") continue;
    for (const [key, value] of Object.entries(incoming)) {
      if (!ALLOWANCE_FIELDS.has(key)) continue;
      config[field][key] = normalizeCountForField(key, value);
    }
  }

  /* A floor above its ceiling — "at least 23, at most 22" — is a rule no squad
     can satisfy, so the pair is stored in order whoever sent it. */
  for (const key of Object.keys(config.allowanceMins)) {
    const ordered = orderAllowanceCounts(config.allowanceMins[key], config.allowanceCaps[key]);
    config.allowanceMins[key] = ordered.min;
    config.allowanceCaps[key] = ordered.cap;
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
