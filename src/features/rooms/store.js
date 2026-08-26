/**
 * In-memory room state.
 *
 * Rooms live only in this process — nothing is persisted, so all room data is
 * lost on restart. Clients POST /presence roughly twice a second, which keeps
 * `lastSeenAt` fresh for the "connected" dot, but **a lapsed heartbeat no longer
 * removes anyone**: a seat is only ever given up by an explicit Leave, Close
 * room, or kick. See presence-and-reconnect.md.
 */

import {
  ROOM_LIST_QUIET_MS,
  createDefaultRoomConfig,
  maxBansForSquads,
  normalizeRoomConfig,
} from "./config.js";
import { buildTurnSchedule, turnAt } from "./schedule.js";

/** code -> room entry */
export const roomPresence = new Map();

const MAX_CHAT_MESSAGES = 150;

/**
 * Each side's pitch shape, so the Start Match screen can draw the opponent's
 * lineup in the formation they actually built rather than assuming this one.
 * Picks are slot-addressed and the slot numbers come from the formation's rows,
 * so guessing it does not just mislabel the shape — it lays their players out
 * in the wrong rows.
 *
 * **Not validated against a whitelist here.** The client runs every formation
 * it receives through `normalizeFormation`, which answers with this default for
 * anything outside its fifteen-row table, so an unknown string can never reach
 * a pitch or a stat cell. A third copy of the list (there are already two — see
 * CLAUDE.md) would be one more thing to keep in step for no added safety.
 */
const DEFAULT_FORMATION = "4-3-3";

/**
 * A room walks these in order and never skips one.
 *
 * The last four are all the **same screen** (Start Match); what changes is which
 * handshake is open. Each of the three handshakes needs *both* sides before the
 * room advances — same rule the draft already used for confirming squads:
 *
 *   await-ready  squads are confirmed, each side presses READY
 *   await-start  both are ready, each side presses START MATCH
 *   live         the match is being played, each side presses FINISH MATCH
 *   done         it is over: rematch or new match
 *
 * `live` is the one a reader is likely to guess wrong: it does not mean "the
 * room is alive", it means *this match is in progress*.
 */
export const ROOM_STATUS = {
  LOBBY: "lobby",
  DRAFTING: "drafting",
  AWAIT_READY: "await-ready",
  AWAIT_START: "await-start",
  LIVE: "live",
  DONE: "done",
};

/**
 * The three handshakes, in order, each a `{ host, guest }` pair of booleans.
 *
 * They are separate fields rather than one counter because either side can take
 * their own press back while the other has not answered — see `/match-step`.
 */
export const MATCH_STEP_FLAGS = ["matchReady", "matchStarted", "matchFinished"];

/** Clears every handshake, or just one side's. */
export function resetMatchSteps(entry, side = null) {
  for (const key of MATCH_STEP_FLAGS) {
    if (side) entry[key][side] = false;
    else entry[key] = { host: false, guest: false };
  }
}

export function normalizeRoomCodeParam(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
}

export function isValidRoomCode(code) {
  return Boolean(code) && code.length >= 4;
}

function createRoomEntry() {
  return {
    host: null,
    guest: null,
    status: ROOM_STATUS.LOBBY,
    turnIndex: 0,
    turnEndsAt: null,
    config: createDefaultRoomConfig(),
    lastConfigSeq: 0,
    bans: { host: [], guest: [] },
    picks: { host: [], guest: [] },
    stagedBans: { host: [], guest: [] },
    bansConfirmed: { host: false, guest: false },
    picksConfirmed: { host: false, guest: false },
    formations: { host: DEFAULT_FORMATION, guest: DEFAULT_FORMATION },
    bannedPlayerIds: [],
    ready: { guest: false },
    matchReady: { host: false, guest: false },
    matchStarted: { host: false, guest: false },
    matchFinished: { host: false, guest: false },
    rematch: null,
    /* `{ by }` once a side has left this room for a different one. The room
       stays open and the other player stays on Start Match — this is the flag
       that tells them nobody is coming back, so REMATCH has nothing to offer. */
    newMatch: null,
    chat: [],
    closed: false,
    closeReason: "",
    kickedGuestIds: [],
    updatedAt: Date.now(),
  };
}

/** Returns the room for `code`, creating it if absent, and repairs any missing fields. */
export function ensureRoomEntry(code) {
  let entry = roomPresence.get(code);
  if (!entry) {
    entry = createRoomEntry();
    roomPresence.set(code, entry);
  }

  entry.config = normalizeRoomConfig(entry.config);

  if (!Number.isFinite(Number(entry.lastConfigSeq))) entry.lastConfigSeq = 0;
  if (!entry.status) entry.status = ROOM_STATUS.LOBBY;
  if (!Number.isFinite(Number(entry.turnIndex))) entry.turnIndex = 0;
  if (entry.turnEndsAt != null && !Number.isFinite(Number(entry.turnEndsAt))) entry.turnEndsAt = null;
  if (!entry.bans) entry.bans = { host: [], guest: [] };
  if (!entry.picks) entry.picks = { host: [], guest: [] };
  if (!entry.ready) entry.ready = { guest: false };
  for (const key of MATCH_STEP_FLAGS) {
    if (!entry[key]) entry[key] = { host: false, guest: false };
  }
  if (entry.rematch === undefined) entry.rematch = null;
  if (entry.newMatch === undefined) entry.newMatch = null;
  if (!entry.stagedBans) entry.stagedBans = { host: [], guest: [] };
  if (!entry.bansConfirmed) entry.bansConfirmed = { host: false, guest: false };
  if (!entry.picksConfirmed) entry.picksConfirmed = { host: false, guest: false };
  if (!entry.formations) entry.formations = { host: DEFAULT_FORMATION, guest: DEFAULT_FORMATION };
  if (!Array.isArray(entry.bannedPlayerIds)) entry.bannedPlayerIds = [];
  if (entry.closed === undefined) entry.closed = false;
  if (entry.closeReason === undefined) entry.closeReason = "";
  if (!Array.isArray(entry.kickedGuestIds)) entry.kickedGuestIds = [];
  if (!Array.isArray(entry.chat)) entry.chat = [];

  return entry;
}

/**
 * `<millis>-<6 base36 chars>`. Sortable by creation and unique enough for ids
 * that only have to stay distinct inside one room's lifetime.
 *
 * Exported because two callers need exactly this and both used to spell it out
 * inline: chat message ids here, and the id for an anonymous seat in
 * `routes.js`. That is the duplication that drifts — the client mints its own
 * anon id in `draft/utils.js` and already slices to 10 rather than 8, across a
 * process boundary where it cannot share this.
 */
export function shortId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function appendChat(entry, message) {
  entry.chat.push(message);
  if (entry.chat.length > MAX_CHAT_MESSAGES) {
    entry.chat.splice(0, entry.chat.length - MAX_CHAT_MESSAGES);
  }
}

/**
 * A kick is permanent for the life of the room entry: nothing clears this list,
 * so a removed player cannot rejoin under any route back in — invite link,
 * room code, or a later reopen of the same code.
 */
export function isKickedFromRoom(entry, userId) {
  const id = String(userId || "");
  return Boolean(id) && (entry.kickedGuestIds || []).includes(id);
}

/* There was a `pushSystemChat` here, and ~24 calls to it: joins, leaves, every
   ban, every lineup edit, each confirm, the phase changes, the rematch replies.
   It turned the chat into an activity log, and the log crowded out the thing the
   dock is for — the two players talking to each other before they start. Every
   event it announced is already on screen in the board that owns it.

   `senderId: "system"` was its only marker, so nothing produces one now and the
   client's `chat-announce` branch went with it. Bring it back only for something
   a player cannot see any other way. */

export function pushUserChat(entry, { senderId, username, message }) {
  appendChat(entry, {
    id: shortId(),
    senderId,
    senderName: String(username || "User").trim().slice(0, 50) || "User",
    message: String(message).slice(0, 500),
    createdAt: Date.now(),
  });
}

const serializeParticipant = (p) =>
  p ? {
    id: p.id,
    username: p.username,
    lastSeenAt: p.lastSeenAt,
    hidden: Boolean(p.hidden),
    /* Squad size, or null for a seat with no account behind it. Written by
       `refreshSquadSizes` when the seat changes hands and again at START. */
    playerCount: p.playerCount ?? null,
  } : null;

export function serializeRoomEntry(entry) {
  return {
    host: serializeParticipant(entry.host),
    bans: entry.bans || { host: [], guest: [] },
    picks: entry.picks || { host: [], guest: [] },
    stagedBans: entry.stagedBans || { host: [], guest: [] },
    bansConfirmed: entry.bansConfirmed || { host: false, guest: false },
    picksConfirmed: entry.picksConfirmed || { host: false, guest: false },
    formations: entry.formations || { host: DEFAULT_FORMATION, guest: DEFAULT_FORMATION },
    guest: serializeParticipant(entry.guest),
    status: String(entry.status || ROOM_STATUS.LOBBY),
    turnIndex: Number.isFinite(Number(entry.turnIndex)) ? Number(entry.turnIndex) : 0,
    /* Whose turn it is, doing what, in order. Derived from the config rather
       than stored, so it cannot drift from the settings it describes — and read
       rather than rebuilt on the client. See `schedule.js`. */
    schedule: buildTurnSchedule(entry.config),
    turnEndsAt: entry.turnEndsAt == null ? null : Number(entry.turnEndsAt),
    bannedPlayerIds: Array.isArray(entry.bannedPlayerIds) ? entry.bannedPlayerIds : [],
    config: entry.config,
    /* The cap the lobby stepper obeys, derived here so the client needs no copy
       of the arithmetic. Null while both squad sizes are unknown. */
    maxBanCountPerSide: maxBansForSquads({
      host: entry.host?.playerCount ?? null,
      guest: entry.guest?.playerCount ?? null,
    }),
    ready: entry.ready,
    matchReady: entry.matchReady,
    matchStarted: entry.matchStarted,
    matchFinished: entry.matchFinished,
    rematch: entry.rematch || null,
    newMatch: entry.newMatch || null,
    chat: entry.chat,
    closed: Boolean(entry.closed),
    closeReason: entry.closeReason || "",
    updatedAt: entry.updatedAt,
  };
}

/** Snapshot shape returned for a room code that has no entry in memory. */
export function emptyRoomSnapshot() {
  return {
    host: null,
    guest: null,
    status: ROOM_STATUS.LOBBY,
    turnIndex: 0,
    turnEndsAt: null,
    config: createDefaultRoomConfig(),
    formations: { host: DEFAULT_FORMATION, guest: DEFAULT_FORMATION },
    ready: { guest: false },
    matchReady: { host: false, guest: false },
    matchStarted: { host: false, guest: false },
    matchFinished: { host: false, guest: false },
    rematch: null,
    newMatch: null,
    chat: [],
    closed: false,
    closeReason: "",
  };
}

/**
 * Maps internal status to the phase label the admin dashboard renders
 * (ban / pick / lobby / ready / done).
 *
 * **Asks the schedule what the current turn is**, rather than looking the index
 * up in a table. That table was `{ 0: "ban", 1: "pick" }` and said so in its own
 * comment — "0 = simultaneous bans, 1 = simultaneous picks" — which held only
 * while a ban phase was one turn. An alternating one is `2 × banCountPerSide`
 * turns, so it was wrong twice in every such room: index 1 is the *second ban*
 * and reported `pick`, and the real pick turn (index 2N) fell off the end of the
 * table and reported `ban`. The visible effects were a dashboard pill reading
 * PICK one ban into a ban phase and BAN for the whole of the pick phase, and a
 * WATCH panel that flashed the ban stage "done" — with both sides "confirmed" —
 * between the first ban and the second.
 *
 * This is the same fix `schedule.js` describes making for `turnIndex` itself:
 * the schedule is the server's own, so nothing else should be re-deriving what
 * a given index means.
 */
export function roomPhase(entry) {
  const status = String(entry.status || ROOM_STATUS.LOBBY);
  if (status === ROOM_STATUS.DRAFTING) {
    return turnAt(entry.config, Number(entry.turnIndex))?.action || "ban";
  }
  /* `await-start` is still "getting ready" as far as a dashboard cares — the
     split that matters there is whether a match is being played. */
  if (status === ROOM_STATUS.AWAIT_READY || status === ROOM_STATUS.AWAIT_START) return "ready";
  return status;
}

/** True while the room is mid-draft (used for the admin "in draft" counter). */
export function isActiveDraft(entry) {
  return String(entry.status || "") === ROOM_STATUS.DRAFTING;
}

/**
 * The room for `code`, or null — the lookup that does **not** create one.
 *
 * `ensureRoomEntry` is the players' way in and mints a room on first sight,
 * which is right for a code somebody is joining and wrong for one somebody is
 * only looking at: the console would conjure an empty room for every typo.
 */
export function findRoomEntry(code) {
  return roomPresence.get(code) || null;
}

/** Rooms are listed until they are closed or have gone quiet. Admin display only —
    this hides a stale room from the dashboard, it does not end it. */
export function listActiveRooms(now = Date.now()) {
  return [...roomPresence.entries()].filter(
    ([, entry]) => !entry.closed && now - entry.updatedAt < ROOM_LIST_QUIET_MS,
  );
}

/* There is no `pruneStalePresence`, and no presence TTL. A participant is only
   ever removed by an explicit action — Leave, Close room, or the host kicking
   the guest.

   It used to drop anyone whose heartbeat was older than 12s in the lobby or 30s
   mid-draft, and when that was the *host* it also set `closed = true`, which
   sent both clients to the "Room closed" screen and its 10s countdown. The
   heartbeat is a 500ms `setInterval`, and browsers throttle timers in
   background tabs to roughly once a minute — so switching to another tab during
   a pick killed the room about 40s later, through no fault of the players. See
   presence-and-reconnect.md. */

/**
 * Puts a room back to the pre-draft lobby, keeping its code and its host.
 *
 * Called when the guest goes — by leaving or by being kicked. A draft cannot
 * continue with one player, but **the room is fine**: the host stays put and can
 * invite somebody else, which is what the code is for. Sending the host home
 * instead abandoned a room that still existed.
 *
 * Everything the departed guest touched is cleared, so whoever joins next does
 * not inherit half a draft. Returns true if there was a draft to reset.
 */
export function resetDraftToLobby(entry) {
  const wasDrafting = String(entry.status || "") !== ROOM_STATUS.LOBBY;

  entry.status = ROOM_STATUS.LOBBY;
  entry.turnIndex = 0;
  entry.turnEndsAt = null;
  entry.bans = { host: [], guest: [] };
  entry.picks = { host: [], guest: [] };
  entry.stagedBans = { host: [], guest: [] };
  entry.bansConfirmed = { host: false, guest: false };
  entry.picksConfirmed = { host: false, guest: false };
  entry.formations = { host: DEFAULT_FORMATION, guest: DEFAULT_FORMATION };
  entry.bannedPlayerIds = [];
  resetMatchSteps(entry);
  entry.rematch = null;
  entry.newMatch = null;
  entry.ready.guest = false;

  return wasDrafting;
}

/** Returns "host", "guest", or null for the participant matching `requesterId`. */
export function resolveSide(entry, requesterId) {
  const id = String(requesterId || "");
  if (!id) return null;
  if (entry.host?.id && String(entry.host.id) === id) return "host";
  if (entry.guest?.id && String(entry.guest.id) === id) return "guest";
  return null;
}

/* `presenceFingerprint` went with the pruning. It existed so a caller could tell
   whether a prune had actually changed the seats; nothing changes the seats
   behind a request's back any more, so every caller compared a value with
   itself. */
