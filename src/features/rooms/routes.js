import { Router } from "express";
import { asyncHandler } from "#lib/http.js";
import { readSquad } from "#features/players/index.js";
import { maybeRefreshSquadSizes, refreshSquadSizes } from "./squads.js";
import { isSoloBanTurn, normalizeBanOrder, turnAt } from "./schedule.js";
import { advanceBanTurnIfSolo, enterPickTurn, maybeResolveExpiredBanTurn } from "./turns.js";
import {
  PICK_COUNT_PER_SIDE,
  squadStartProblem,
  normalizeBanDurationSec,
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

/**
 * The caller's seat, or `null` for a stranger — `serializeRoomEntry` conceals a
 * draft in flight from anyone it is not being played by.
 *
 * `req.side` is set by `requireParticipant`; the rest resolve from
 * `req.requesterId`, which is `req.identityId` — the id in the caller's own
 * signed cookie, never one the request asked to be. Sending the other seat's id
 * used to be all it took to read a concealed board.
 */
const viewerOf = (req, entry) => req.side || resolveSide(entry, req.requesterId);

/**
 * Takes `req`, and that is the point: the viewer is derived here rather than
 * passed, so a route cannot leak a concealed room by forgetting an argument.
 */
const sendRoom = (req, res, entry) =>
  res.json({ room: serializeRoomEntry(entry, viewerOf(req, entry), req.requesterId) });
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

/**
 * Who is acting, from the cookie `attachIdentity` put on the request.
 *
 * The body may still carry a `requesterId` — every client before this change
 * sent one — and it is ignored. That parameter was the draft's way in: the room
 * conceals each side's board from the other, and a caller who could name the
 * other seat could read it, or confirm its bans, or hand it a lineup.
 */
function attachRequester(req, res, next) {
  req.requesterId = String(req.identityId || "");
  if (!req.requesterId) {
    return res.status(401).json({ error: "No session. Reload the page." });
  }
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


// ── Presence ─────────────────────────────────────────────────

/**
 * POST body: { role: "host"|"guest", username?, stagedBans?, hidden? }
 *
 * `userId` in the body is ignored: the seat belongs to whoever's cookie made
 * the request. `username` is not — it is a display name, and an anonymous
 * player has no other way to offer one.
 */
router.post("/:code/presence", withRoomCode, asyncHandler(async (req, res) => {
  const { role, username, stagedBans, hidden } = req.body || {};
  const userId = req.identityId;
  if (!["host", "guest"].includes(role)) {
    return res.status(400).json({ error: "role must be host or guest." });
  }

  const entry = ensureRoomEntry(req.roomCode);

  if (isKickedFromRoom(entry, userId)) {
    return res.status(403).json({ error: "You were removed from this room by host." });
  }

  /* An admin's close is not the host's, and only the host's is undone by walking
     back in. `adminClosed` is what tells the two apart — see `closeRoomEntry`.
     Without it the host's next 500ms heartbeat would reopen the room the console
     just ended.

     `isRoomHost` is the other half, and it is about *which* host: a deliberate
     close empties the seat, so `role === "host"` alone let anyone with the code
     reopen somebody else's room and be its host. `hostId` outlives that seat and
     is the only thing left that knows whose room it was. A closed room has
     always had a host, so there is no blank case to allow through here. */
  const reopenable = role === "host" && !entry.adminClosed && isRoomHost(entry, userId);
  if (entry.closed && !reopenable) {
    return res.status(410).json({
      error: "Room is closed.",
      room: serializeRoomEntry(entry, resolveSide(entry, userId), userId),
    });
  }
  if (entry.closed) reopenRoom(entry);

  const fallbackName = role === "host" ? "Host" : "Guest";
  const participant = {
    id: String(userId),
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
  /* The only thing that notices an alternating ban turn has timed out: there
     are no server-side timers here, so it is resolved on read. See `turns.js`. */
  maybeResolveExpiredBanTurn(entry);

  syncStagedBans(entry, role, stagedBans);
  roomPresence.set(req.roomCode, entry);
  /* `viewerOf` has nothing to resolve from until we say who called. The seat
     claim above has already succeeded, so this id is in a chair. */
  req.requesterId = participant.id;
  sendRoom(req, res, entry);
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

/** Whether `userId` is the id this room's host chair belongs to. */
const isRoomHost = (entry, userId) => {
  const id = String(userId ?? "");
  return Boolean(id) && String(entry.hostId || "") === id;
};

function claimHostSeat(entry, participant) {
  const activeHostId = entry.host?.id ? String(entry.host.id) : "";
  if (activeHostId && activeHostId !== participant.id) {
    return { status: 409, error: "Room already has an active host." };
  }
  /* **An empty chair is not a free one.** A host who steps out — NEW MATCH, or a
     close they can walk back into — leaves `host` null while `hostId` still
     names them, and without this anyone holding the code could post
     `role: "host"` and take over a room that is not theirs, in front of a guest
     still sitting in it.

     This is not what a dropped connection looks like: there is no presence TTL,
     so a lapsed heartbeat leaves the seat exactly where it was and the branch
     above lets its owner straight back in on an id match. This case is the
     chair genuinely standing empty. */
  if (!activeHostId && entry.hostId && entry.hostId !== participant.id) {
    return { status: 403, error: "This room belongs to another host." };
  }

  const changed = activeHostId !== participant.id;
  /* The heartbeat rebuilds this object every 500 ms, so anything cached on the
     seat rather than sent with the beat has to be carried across — the squad
     size was being wiped a beat after it was looked up. */
  participant.playerCount = changed ? null : (entry.host?.playerCount ?? null);
  entry.host = participant;
  entry.hostId = participant.id;
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
  const userId = String(req.identityId || "");
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

/**
 * The room as *your seat* sees it.
 *
 * **This is the draft's main read path** — `fetchRoomSnapshot` polls it twice a
 * second — so it is also where concealment is won or lost. The viewer is the
 * cookie's identity: a caller holding no seat gets both sides concealed, which
 * is right for the home page's join check (it reads `room.host` and nothing
 * else), and `?userId=` no longer buys anybody the other seat's view. See
 * `serializeRoomEntry`.
 */
router.get("/:code", (req, res) => {
  const code = normalizeRoomCodeParam(req.params.code);
  const entry = roomPresence.get(code);
  if (!entry) return sendEmptyRoom(res);

  req.requesterId = String(req.identityId || "");
  // A plain read: nothing here can change the seats, so `updatedAt` stands.
  sendRoom(req, res, entry);
});

/**
 * The other seat's collection — what this side bans out of.
 *
 * The ban board used to load it straight from `/api/my-players?userId=<them>`,
 * reading the id off the room snapshot. That worked because that route served
 * any account's squad to anybody who named it; it is a room's question, so the
 * room answers it now, and only for somebody sitting in the other chair.
 *
 * An anonymous opponent has no account and therefore no squad: `players: []`
 * with `anonymous: true`, which is the client's cue to fall back to the demo
 * pool exactly as it always has.
 */
router.get("/:code/opponent-squad", withRoomCode, attachRequester, asyncHandler(async (req, res) => {
  const entry = roomPresence.get(req.roomCode);
  const side = entry && resolveSide(entry, req.requesterId);
  if (!side) return res.status(403).json({ error: "Join room before loading the opponent squad." });

  const opponent = entry[side === "host" ? "guest" : "host"];
  const opponentId = Number(opponent?.id);
  if (!Number.isFinite(opponentId) || opponentId <= 0) {
    return res.json({ players: [], anonymous: true });
  }
  res.json({ players: await readSquad(opponentId) });
}));

/**
 * POST body: { reason? }
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
router.post("/:code/leave", withRoomCode, attachRequester, (req, res) => {
  const entry = roomPresence.get(req.roomCode);
  if (!entry) return sendEmptyRoom(res);

  const disconnected = String(req.body?.reason || "") === "disconnect";
  const side = resolveSide(entry, req.requesterId);
  if (!side) return sendRoom(req, res, entry);

  /* The other side already left for a new match, and `post-match` vacated their
     seat when they did — so there is nothing to clear here any more, only the
     flag, whose only reader was the screen this player is now leaving.

     The vacating used to happen here instead, deferred until somebody else
     moved. That is what made the room look occupied in the meantime, and it is
     why the branches below could find an heir who had already gone: the host
     path would hand the room to a guest who was not in it. */
  const other = side === "host" ? "guest" : "host";
  if (entry.newMatch?.by === other) entry.newMatch = null;

  if (side === "host") {
    const heir = entry.guest;
    entry.host = null;

    if (disconnected && heir?.id) {
      /* Promotion. The guest's client discovers this from the next snapshot —
         see `adoptSeat` in presence.js; without that it would keep claiming the
         guest seat and end up sitting in both.

         `hostId` moves with the chair, or the room would still be held for the
         host who dropped out of it: the new one would be locked out the moment
         their own seat emptied, and the old one could take it back. */
      entry.host = heir;
      entry.hostId = String(heir.id);
      entry.guest = null;
      entry.ready.guest = false;
      if (resetDraftToLobby(entry)) {
      }
    } else if (!disconnected) {
      /* **A deliberate close is a close, with or without a guest in the room.**
         The entry has to outlive both seats — `closed` + `closeReason` is the
         only thing that puts the guest on the "Room closed" screen, and deleting
         it would hand them an empty snapshot instead. It is also what
         `reopenRoom` comes back to.

         This used to require an heir (`else if (heir?.id)`), on the reasoning
         that a lone host closing has nobody to tell, so the room could simply be
         deleted below. That is false while the **console** is watching: a guest
         who left first, then a host who closed, took the entry with them and the
         WATCH panel fell back to its 404 — "not in memory — it ended, or the
         server restarted" — for a room whose host had just closed it in front of
         the admin. The room now says how it ended, which is the one thing only
         the entry can say.

         A lone host whose *tab died* still falls through to the delete: nobody
         chose to end anything there, so there is no close to report. */
      entry.closed = true;
      entry.closeReason = "Host closed the room.";
      entry.status = ROOM_STATUS.LOBBY;
      entry.turnIndex = 0;
      entry.turnEndsAt = null;
      entry.guest = null;
      entry.ready.guest = false;
      resetMatchSteps(entry);
    }
  } else {
    entry.guest = null;
    /* The room survives its guest: the host drops back to the lobby with the
       code intact and can invite somebody else. */
    if (resetDraftToLobby(entry)) {
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
  sendRoom(req, res, entry);
});

// ── Draft lifecycle ──────────────────────────────────────────

/** POST body: {} — host starts the draft once the guest is ready. */
router.post("/:code/start", withRoomCode, attachRequester, asyncHandler(async (req, res) => {
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
  if (problem) return res.status(409).json({ error: problem, room: serializeRoomEntry(entry, viewerOf(req, entry)) });

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
  sendRoom(req, res, entry);
}));

/**
 * POST body: { player }
 *
 * Bans are per-side: each user bans from the opponent's squad, so both sides
 * may ban the same player. Only a repeat ban by the same user is rejected.
 */
router.post(
  "/:code/ban",
  withRoomCode,
  attachRequester,
  requirePlayer,
  requireParticipant("banning"),
  requireDrafting("Bans are only allowed during drafting."),
  (req, res) => {
    const { entry, side, player } = req;
    if (entry.bansConfirmed?.[side]) {
      return res.status(409).json({ error: "Un-confirm your bans before changing them." });
    }
    /* An alternating ban phase hands the turn to one side at a time, and the
       client gates on the same thing — but a stale tab that missed a turn
       change would otherwise ban straight through the other player's slot. */
    if (isSoloBanTurn(entry.config, entry.turnIndex)
        && turnAt(entry.config, entry.turnIndex)?.side !== side) {
      return res.status(409).json({ error: "It is not your turn to ban." });
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
    advanceBanTurnIfSolo(entry);
    entry.updatedAt = Date.now();

    sendRoom(req, res, entry);
  },
);

/** POST body: {} — marks a side's bans final; both sides advance the draft. */
router.post(
  "/:code/ban-confirm",
  withRoomCode,
  attachRequester,
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
      entry.updatedAt = Date.now();
      return sendRoom(req, res, entry);
    }

    entry.bansConfirmed[side] = true;
    entry.stagedBans[side] = [];

    if (entry.bansConfirmed.host && entry.bansConfirmed.guest) {
      /* `turnIndex = 1` until the schedule moved here — true only while it was
         a two-entry constant, and wrong the moment a ban phase has more than
         one turn in it. */
      enterPickTurn(entry);
    }

    entry.updatedAt = Date.now();
    sendRoom(req, res, entry);
  },
);

/**
 * POST body: { confirmed } — this side's lineup is final, or is not.
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
  attachRequester,
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

    if (entry.picksConfirmed.host && entry.picksConfirmed.guest) {
      entry.status = ROOM_STATUS.AWAIT_READY;
      entry.turnEndsAt = null;
      entry.picksConfirmed = { host: false, guest: false };
      resetMatchSteps(entry);
    }

    entry.updatedAt = Date.now();
    sendRoom(req, res, entry);
  },
);

/**
 * POST body: { players } — replaces this side's lineup wholesale.
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
  attachRequester,
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

    sendRoom(req, res, entry);
  },
);

// ── Room management ──────────────────────────────────────────

/** POST body: {} */
router.post("/:code/kick-guest", withRoomCode, attachRequester, (req, res) => {
  const entry = ensureRoomEntry(req.roomCode);

  if (resolveSide(entry, req.requesterId) !== "host") {
    return res.status(403).json({ error: "Only host can kick guest." });
  }
  if (!entry.guest?.id) {
    return res.status(409).json({ error: "No guest to kick." });
  }

  const kickedId = String(entry.guest.id);
  if (!isKickedFromRoom(entry, kickedId)) entry.kickedGuestIds.push(kickedId);
  entry.guest = null;
  // Same as a guest leaving — see resetDraftToLobby.
  if (resetDraftToLobby(entry)) {
  }
  entry.updatedAt = Date.now();
  sendRoom(req, res, entry);
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

/** POST body: { step, value } — one side's answer to one handshake. */
router.post(
  "/:code/match-step",
  withRoomCode,
  attachRequester,
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
    } else if (entry.status === step.to) {
      entry.status = step.from;
    }

    entry.updatedAt = Date.now();
    sendRoom(req, res, entry);
  },
);

/**
 * POST body: { action } — what happens once the match is over.
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
  attachRequester,
  requireParticipant("ending the match"),
  (req, res) => {
    const { entry, side } = req;
    const action = String(req.body?.action || "");
    const other = side === "host" ? "guest" : "host";

    if (entry.status !== ROOM_STATUS.DONE) {
      return res.status(409).json({ error: "The match is not over yet." });
    }

    if (action === "new-match") {
      /* **The seat goes, because you are leaving.** It used to be kept, and the
         flag was deliberately all this did — but the seat was held purely so
         the other player's screen could keep your name on it, and the price was
         that everyone outside the room saw one nobody had left: the admin
         console listed a live two-player room whose host was already hosting
         somewhere else, and it stayed that way for as long as the remaining
         player kept it warm with heartbeats.

         The name moves onto the flag, which is where both the other player's
         screen and the console read it from now. Everything else still stands
         still: no `closed`, no seat reset, no draft reset. They are staying on
         this screen and are meant to. Any pending offer goes, because the side
         it was aimed at has just left. */
      entry.newMatch = { by: side, username: entry[side]?.username || "" };
      entry[side] = null;
      if (side === "guest") entry.ready.guest = false;
      entry.rematch = null;

      /* Same rule as `/leave`: the last one out takes the room with them. Only
         reachable when the other seat was already empty — their opponent left
         first — and without it that room sits in memory with nobody in it and
         no heartbeat left to age it out of the console's list. */
      if (!entry.host?.id && !entry.guest?.id) {
        roomPresence.delete(req.roomCode);
        return sendEmptyRoom(res);
      }

      entry.updatedAt = Date.now();
      return sendRoom(req, res, entry);
    }

    if (action === "rematch-propose") {
      entry.rematch = { by: side };
      entry.updatedAt = Date.now();
      return sendRoom(req, res, entry);
    }

    if (action === "rematch-cancel") {
      if (entry.rematch?.by !== side) {
        return res.status(409).json({ error: "You have no rematch offer to cancel." });
      }
      entry.rematch = null;
      entry.updatedAt = Date.now();
      return sendRoom(req, res, entry);
    }

    if (action === "rematch-accept") {
      if (entry.rematch?.by !== other) {
        return res.status(409).json({ error: "There is no rematch to accept." });
      }
      entry.rematch = null;
      resetDraftToLobby(entry);   // also clears matchReady and the offer
      entry.updatedAt = Date.now();
      return sendRoom(req, res, entry);
    }

    if (action === "rematch-decline") {
      entry.rematch = null;
      entry.updatedAt = Date.now();
      return sendRoom(req, res, entry);
    }

    return res.status(400).json({ error: "Unknown post-match action." });
  },
);

/** POST body: { ready } — lobby ready flag, guest only. */
router.post("/:code/ready", withRoomCode, attachRequester, (req, res) => {
  const entry = ensureRoomEntry(req.roomCode);

  if (resolveSide(entry, req.requesterId) !== "guest") {
    return res.status(403).json({ error: "Only guest can update ready state." });
  }

  entry.ready.guest = Boolean(req.body?.ready);
  entry.updatedAt = Date.now();
  sendRoom(req, res, entry);
});

/** POST body: { clientSeq?, banCountPerSide?, banDurationSec?, … } */
router.post("/:code/config", withRoomCode, attachRequester, (req, res) => {
  const {
    clientSeq,
    banCountPerSide,
    banDurationSec,
    pickDurationSec,
    revealMode,
    banRevealMode,
    banOrder,
  } = req.body || {};

  const entry = ensureRoomEntry(req.roomCode);
  if (resolveSide(entry, req.requesterId) !== "host") {
    return res.status(403).json({ error: "Only host can update room settings." });
  }

  // Rapid edits can arrive out of order; drop anything older than the last write.
  const seq = Number(clientSeq);
  if (Number.isFinite(seq) && seq > 0) {
    if (seq < Number(entry.lastConfigSeq || 0)) return sendRoom(req, res, entry);
    entry.lastConfigSeq = seq;
  }

  const config = entry.config;
  if (banCountPerSide !== undefined) config.banCountPerSide = asCount(banCountPerSide);
  if (banDurationSec !== undefined) config.banDurationSec = normalizeBanDurationSec(banDurationSec);
  if (pickDurationSec !== undefined) config.pickDurationSec = normalizePickDurationSec(pickDurationSec);
  if (revealMode !== undefined) config.revealMode = normalizeRevealMode(revealMode);
  if (banRevealMode !== undefined) config.banRevealMode = normalizeRevealMode(banRevealMode);
  if (banOrder !== undefined) config.banOrder = normalizeBanOrder(banOrder);

  // Picks are fixed for full squad completion.
  config.pickCountPerSide = PICK_COUNT_PER_SIDE;

  entry.updatedAt = Date.now();
  sendRoom(req, res, entry);
});

/** POST body: { username, message } */
router.post("/:code/chat", withRoomCode, attachRequester, (req, res) => {
  const { username, message } = req.body || {};
  const text = String(message || "").trim();
  if (!text) return res.status(400).json({ error: "Message is required." });

  const entry = ensureRoomEntry(req.roomCode);
  const senderId = req.requesterId;
  if (!resolveSide(entry, senderId)) {
    return res.status(403).json({ error: "Join room before chatting." });
  }

  pushUserChat(entry, { senderId, username, message: text });
  entry.updatedAt = Date.now();
  sendRoom(req, res, entry);
});

export default router;
