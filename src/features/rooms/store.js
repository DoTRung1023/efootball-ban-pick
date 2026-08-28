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
  PICK_COUNT_PER_SIDE,
  REVEAL_MODE_HIDDEN,
  createDefaultRoomConfig,
  maxBansForSquads,
  normalizeRevealMode,
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
    /* **Who this room belongs to**, and the point of it is that it outlives the
       seat. `host` is who is sitting there now; this is who is entitled to.
       They part company whenever the chair legitimately empties — NEW MATCH, a
       close the host can walk back into — and while they are apart it is the
       only thing standing between the room and anyone else who has the code.

       Blank until the first claim, because that blank *is* room creation: a
       code nobody has ever hosted is open to whoever gets there first. It moves
       when the chair does, which is once — the guest being promoted on a host
       disconnect. See `claimHostSeat`. */
    hostId: "",
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
  if (typeof entry.hostId !== "string") entry.hostId = "";
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

/**
 * A viewer allowed to see the room whole — the admin console, and nothing else.
 *
 * `serializeRoomEntry`'s viewer defaults to `null`, which conceals **both**
 * sides. That is deliberate: a caller who forgets to say who is asking gets a
 * board that is visibly missing its own bans and picks, which is noticed in
 * seconds. The opposite default fails the other way, silently, and the whole
 * point of this pass is that a silent leak is what was already happening.
 */
export const VIEW_UNRESTRICTED = "all";

const SIDES = ["host", "guest"];

/**
 * Which of each side's bans and picks must be withheld from `viewer`.
 *
 * **`hidden` only — `blur` withholds nothing, and cannot.** That mode renders
 * the opponent's real card with a CSS blur over it, because a rung between "see
 * everything" and "see nothing" has to leave the card's colour to infer from
 * (see `ban-phase.md`). The art has to reach the client for that, and its URL
 * carries the player id, so `blur` is concealment from the player and not from
 * their devtools — by construction, not by omission. `hidden` draws nothing, so
 * it is the mode that can be made real, and this is where that happens.
 */
function concealedFrom(entry, viewer) {
  const hide = { bans: new Set(), stagedBans: new Set(), picks: new Set() };
  if (viewer === VIEW_UNRESTRICTED) return hide;

  const config = entry.config || {};
  const banHidden = normalizeRevealMode(config.banRevealMode) === REVEAL_MODE_HIDDEN;
  const pickHidden = normalizeRevealMode(config.revealMode) === REVEAL_MODE_HIDDEN;
  const drafting = String(entry.status || "") === ROOM_STATUS.DRAFTING;
  /* **Both ban buckets, for the whole phase.** Which one a ban is in depends on
     the ban order — alternating commits each as it is made, simultaneous stages
     until confirm — and concealment no longer ends at that confirm, so there is
     nothing left for this to tell apart. Bounded by the turn rather than by any
     flag: the schedule says whether a ban is still what the room is doing, and
     `enterPickTurn` is what ends it. Zero bans has no ban turn at all, so this
     is false from the first render. */
  const inBanPhase = drafting && turnAt(config, entry.turnIndex)?.action === "ban";
  /* **Picks are withheld for the draft and no longer.** Start Match draws both
     squads in full whatever the room was set to (`ready-phase.md`), so holding
     them back past `drafting` would empty the screen the draft exists for.

     They were held until `done` for one revision, while that screen honoured
     the mode. Both halves moved back together: a screen that draws the squad
     over a snapshot that withholds it is broken, and so is the reverse.

     The **ban** half reveals at the same boundary and has to — the pick board
     marks your own pool from `bans[theirSide]`, and the server does not
     validate a pick against it, so that badge is the only thing standing
     between you and fielding a banned player. */
  for (const side of SIDES) {
    if (side === viewer) continue;   // your own board is never withheld from you
    if (banHidden && inBanPhase) {
      hide.bans.add(side);
      hide.stagedBans.add(side);
    }
    if (pickHidden && drafting) hide.picks.add(side);
  }
  return hide;
}

/**
 * `pair` with every concealed side replaced by an empty list.
 *
 * Returns the original object untouched when nothing is concealed, so an
 * unconcealed snapshot is identical to what this function used to build.
 */
function withoutConcealed(pair, concealed) {
  const source = pair || { host: [], guest: [] };
  if (!concealed.size) return source;
  return {
    host: concealed.has("host") ? [] : (source.host || []),
    guest: concealed.has("guest") ? [] : (source.guest || []),
  };
}

const filledCount = (picks) => (Array.isArray(picks) ? picks.filter(Boolean).length : 0);

/**
 * Whether each side has a full lineup — the one fact `hidden` still tells you
 * about the opponent's squad ("Still picking" / "Squad complete").
 *
 * Published as the single bit it is, because withholding `picks` takes away the
 * array the client used to count. Sending a length-preserving placeholder array
 * instead would hand back the running total one poll at a time, which is
 * precisely what `hidden` exists to withhold.
 */
function squadCompleteFor(entry) {
  const target = Math.max(0, Math.floor(Number(entry.config?.pickCountPerSide) || PICK_COUNT_PER_SIDE));
  return {
    host: target > 0 && filledCount(entry.picks?.host) >= target,
    guest: target > 0 && filledCount(entry.picks?.guest) >= target,
  };
}

/**
 * The room as `viewer` is allowed to see it.
 *
 * `viewer` is `"host"`, `"guest"`, `VIEW_UNRESTRICTED`, or `null` for a caller
 * who has not identified themselves — see the constant above for why `null`
 * conceals rather than reveals.
 *
 * **This hides the draft from the opponent's devtools, not from a forged
 * request.** `viewer` is resolved from a `requesterId`/`userId` the server
 * trusts and never verifies (DECISIONS.md §1), so anyone willing to send the
 * other seat's id reads the room as that seat. Closing that is authentication,
 * which this codebase does not have and this change does not add.
 */
export function serializeRoomEntry(entry, viewer = null) {
  const hide = concealedFrom(entry, viewer);
  const bans = withoutConcealed(entry.bans, hide.bans);
  return {
    host: serializeParticipant(entry.host),
    bans,
    picks: withoutConcealed(entry.picks, hide.picks),
    stagedBans: withoutConcealed(entry.stagedBans, hide.stagedBans),
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
    /* Rebuilt from the sides that survived, not filtered — both sides may ban
       the same player, and filtering his id out because the concealed side took
       him would also erase the viewer's own ban of him. */
    bannedPlayerIds: hide.bans.size
      ? [...(bans.host || []), ...(bans.guest || [])].map((p) => String(p.id))
      : (Array.isArray(entry.bannedPlayerIds) ? entry.bannedPlayerIds : []),
    config: entry.config,
    /* See `squadCompleteFor` — the bit that survives a concealed `picks`. */
    squadComplete: squadCompleteFor(entry),
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
    squadComplete: { host: false, guest: false },
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

/**
 * Every room that exists and is not closed — **no idle cutoff**.
 *
 * There used to be one: a room quiet for `ROOM_LIST_QUIET_MS` (90 s) dropped off
 * the dashboard, on the reasoning that a list is a dashboard and quiet means
 * uninteresting. It is the opposite. Nothing expires a room — there is no
 * presence TTL, and `/leave` only fires when somebody presses a button — so a
 * pair who close their browsers mid-draft leave a room in memory for the life of
 * the process. Those are exactly the rooms an admin is looking for, and they
 * were the only ones the cutoff hid.
 *
 * It also split the console against itself: `GET /rooms/:code` deliberately
 * never hid a quiet room, so one could be inspectable and unlistable at the same
 * time, reachable only by a code the console would not show you.
 *
 * `idleSec` still rides on every row and the table still sorts by it, so a quiet
 * room sinks to the bottom rather than disappearing off it — which is what the
 * cutoff was reaching for. Closed rooms stay out: the detail route 404s them, so
 * listing one would offer a row that cannot be opened.
 *
 * `now` is still taken for the caller's `idleSec` arithmetic.
 */
export function listActiveRooms() {
  return [...roomPresence.entries()].filter(([, entry]) => !entry.closed);
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

/**
 * Ends a room from outside it — the console's CLOSE, not the host's.
 *
 * Shaped like the host's own close in `rooms/routes.js`: the entry has to
 * **outlive both seats**, because `closed` + `closeReason` is the only thing
 * that puts a player on the "Room closed" screen, and deleting the entry would
 * hand them an empty snapshot instead.
 *
 * `adminClosed` is the part the host's close does not have, and it is
 * load-bearing. A host re-entering a closed room *reopens* it (`reopenRoom`),
 * which is right when they closed it themselves and wrong here: the host's
 * heartbeat is a 500ms interval, so without this flag an admin's close would be
 * undone before the console finished repainting. Nothing clears it, so the code
 * is spent — which is the intended reading of an administrator ending a room,
 * and costs nothing, since a new room is a new code and these live in memory
 * only.
 */
export function closeRoomEntry(entry, reason) {
  entry.closed = true;
  entry.adminClosed = true;
  entry.closeReason = String(reason || "Closed by an administrator.");
  entry.host = null;
  entry.guest = null;
  entry.ready = { host: false, guest: false };
  resetDraftToLobby(entry);
  entry.updatedAt = Date.now();
  return entry;
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
