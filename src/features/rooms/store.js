/**
 * In-memory room state.
 *
 * Rooms live only in this process — nothing is persisted, so all room data is
 * lost on restart. Presence is keep-alive based: clients POST /presence every
 * ~5s and a participant is dropped once their last heartbeat exceeds the TTL
 * for the room's current status.
 */

import {
  DRAFT_PRESENCE_TTL_MS,
  PRESENCE_TTL_MS,
  createDefaultRoomConfig,
  normalizeRoomConfig,
} from "./config.js";

/** code -> room entry */
export const roomPresence = new Map();

const MAX_CHAT_MESSAGES = 150;
const DRAFTING_STATUSES = ["drafting", "await-ready"];

export const ROOM_STATUS = {
  LOBBY: "lobby",
  DRAFTING: "drafting",
  AWAIT_READY: "await-ready",
  DONE: "done",
};

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
    bannedPlayerIds: [],
    pickedPlayerIds: [],
    ready: { guest: false },
    matchReady: { host: false, guest: false },
    chat: [],
    closed: false,
    closeReason: "",
    kickedGuestId: "",
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
  if (!entry.matchReady) entry.matchReady = { host: false, guest: false };
  if (!entry.stagedBans) entry.stagedBans = { host: [], guest: [] };
  if (!entry.bansConfirmed) entry.bansConfirmed = { host: false, guest: false };
  if (!Array.isArray(entry.bannedPlayerIds)) entry.bannedPlayerIds = [];
  if (!Array.isArray(entry.pickedPlayerIds)) entry.pickedPlayerIds = [];
  if (entry.closed === undefined) entry.closed = false;
  if (entry.closeReason === undefined) entry.closeReason = "";
  if (entry.kickedGuestId === undefined) entry.kickedGuestId = "";
  if (!Array.isArray(entry.chat)) entry.chat = [];

  return entry;
}

function makeMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function appendChat(entry, message) {
  entry.chat.push(message);
  if (entry.chat.length > MAX_CHAT_MESSAGES) {
    entry.chat.splice(0, entry.chat.length - MAX_CHAT_MESSAGES);
  }
}

export function pushSystemChat(entry, message) {
  appendChat(entry, {
    id: makeMessageId(),
    senderId: "system",
    senderName: "System",
    message: String(message || "").slice(0, 500),
    createdAt: Date.now(),
  });
}

export function pushUserChat(entry, { senderId, username, message }) {
  appendChat(entry, {
    id: makeMessageId(),
    senderId,
    senderName: String(username || "User").trim().slice(0, 50) || "User",
    message: String(message).slice(0, 500),
    createdAt: Date.now(),
  });
}

const serializeParticipant = (p) =>
  p ? { id: p.id, username: p.username, lastSeenAt: p.lastSeenAt } : null;

export function serializeRoomEntry(entry) {
  return {
    host: serializeParticipant(entry.host),
    bans: entry.bans || { host: [], guest: [] },
    picks: entry.picks || { host: [], guest: [] },
    stagedBans: entry.stagedBans || { host: [], guest: [] },
    bansConfirmed: entry.bansConfirmed || { host: false, guest: false },
    guest: serializeParticipant(entry.guest),
    status: String(entry.status || ROOM_STATUS.LOBBY),
    turnIndex: Number.isFinite(Number(entry.turnIndex)) ? Number(entry.turnIndex) : 0,
    turnEndsAt: entry.turnEndsAt == null ? null : Number(entry.turnEndsAt),
    bannedPlayerIds: Array.isArray(entry.bannedPlayerIds) ? entry.bannedPlayerIds : [],
    pickedPlayerIds: Array.isArray(entry.pickedPlayerIds) ? entry.pickedPlayerIds : [],
    config: entry.config,
    ready: entry.ready,
    matchReady: entry.matchReady,
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
    ready: { guest: false },
    matchReady: { host: false, guest: false },
    chat: [],
    closed: false,
    closeReason: "",
  };
}

function isDrafting(entry) {
  return DRAFTING_STATUSES.includes(String(entry.status || ""));
}

/** Turn index during a draft: 0 = simultaneous bans, 1 = simultaneous picks. */
const TURN_INDEX_PHASE = { 0: "ban", 1: "pick" };

/**
 * Maps internal status to the phase label the admin dashboard renders
 * (ban / pick / lobby / ready / done).
 */
export function roomPhase(entry) {
  const status = String(entry.status || ROOM_STATUS.LOBBY);
  if (status === ROOM_STATUS.DRAFTING) {
    return TURN_INDEX_PHASE[Number(entry.turnIndex)] || "ban";
  }
  if (status === ROOM_STATUS.AWAIT_READY) return "ready";
  return status;
}

/** True while the room is mid-draft (used for the admin "in draft" counter). */
export function isActiveDraft(entry) {
  return String(entry.status || "") === ROOM_STATUS.DRAFTING;
}

/** Rooms are listed until they are closed or have gone quiet for 3× the draft TTL. */
export function listActiveRooms(now = Date.now()) {
  const cutoff = DRAFT_PRESENCE_TTL_MS * 3;
  return [...roomPresence.entries()].filter(
    ([, entry]) => !entry.closed && now - entry.updatedAt < cutoff,
  );
}

/** TTL depends on status: a draft tolerates a page reload, the lobby does not. */
function presenceTtlFor(entry) {
  return isDrafting(entry) ? DRAFT_PRESENCE_TTL_MS : PRESENCE_TTL_MS;
}

/** Drops participants whose heartbeat has expired. A missing host closes the room. */
export function pruneStalePresence(entry, now = Date.now()) {
  const ttl = presenceTtlFor(entry);
  if (entry.host?.lastSeenAt && now - Number(entry.host.lastSeenAt) > ttl) {
    pushSystemChat(entry, `${entry.host.username || "Host"} left the room.`);
    entry.host = null;
    entry.closed = true;
    entry.closeReason = "Host closed the room.";
  }
  if (entry.guest?.lastSeenAt && now - Number(entry.guest.lastSeenAt) > ttl) {
    pushSystemChat(entry, `${entry.guest.username || "Guest"} left the room.`);
    entry.guest = null;
    entry.ready.guest = false;
  }
}

/** Returns "host", "guest", or null for the participant matching `requesterId`. */
export function resolveSide(entry, requesterId) {
  const id = String(requesterId || "");
  if (!id) return null;
  if (entry.host?.id && String(entry.host.id) === id) return "host";
  if (entry.guest?.id && String(entry.guest.id) === id) return "guest";
  return null;
}

/** Captures the fields that pruning can change, so callers can detect a real transition. */
export function presenceFingerprint(entry) {
  return [
    entry.host?.id ? String(entry.host.id) : "",
    entry.guest?.id ? String(entry.guest.id) : "",
    Number(entry.host?.lastSeenAt || 0),
    Number(entry.guest?.lastSeenAt || 0),
  ];
}
