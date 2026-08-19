import {
  UNLIMITED_DURATION_SEC,
  DEFAULT_BAN_DURATION_SECONDS,
  MIN_BAN_DURATION_SECONDS,
  MAX_BAN_DURATION_SECONDS,
  DEFAULT_PICK_DURATION_SECONDS,
  MIN_PICK_DURATION_SECONDS,
  MAX_PICK_DURATION_SECONDS,
  REVEAL_MODE_BLUR,
  REVEAL_MODE_HIDDEN,
  REVEAL_MODE_INSTANT,
  FIXED_PICKS_PER_SIDE,
  LEGACY_ALLOWANCE_KEY_MAP,
  ALLOWANCE_CATEGORY_DEFS,
  ALLOWANCE_DEF_MAP,
  ALLOWANCE_VALUE_LIST_KEYS,
} from './constants.js';

import {
  normalizeAllowanceRangeValue,
  normalizeAllowanceListValue,
  stringifyAllowanceCountMap,
} from './allowance.js';

import { DEFAULT_FORMATION } from './constants.js';
import { normalizeDraftPlayer, normalizeFormation } from './players.js';
import { createDraftFilterState } from './playerFilters.js';

/** @type {{ phase: string, room: object | null, schedule: object[], mySide: string, search: string, position: string, players: object[], loadingPlayers: boolean, turnTimer: ReturnType<typeof setInterval> | null, presencePollId: ReturnType<typeof setInterval> | null, actionError: string }} */
export const state = {
  phase: "loading",
  room: null,
  schedule: [],
  mySide: "host",
  search: "",
  position: "",
  players: [],
  loadingPlayers: false,
  turnTimer: null,
  presencePollId: null,
  lastRoomUpdatedAt: 0,
  lobbyConfigDirty: false,
  /* One allowance value-picker is open at a time — a click on any of them
     closes the last — so this is one set of fields, not a map per category. */
  allowancePickerKey: "",
  allowancePickerQuery: "",
  allowancePickerOptions: [],
  allowancePickerOpen: false,
  allowancePickerLoading: false,
  allowancePickerActiveIndex: -1,
  allowancePickerReqSeq: 0,
  opponentBanPlayers: [],
  loadingOpponentBanPlayers: false,
  opponentBanPlayersLoaded: false,
  opponentBanPlayersLoadSource: "",
  banSearch: "",
  banSort: "overall_max_desc",
  ...createDraftFilterState("ban"),
  stagedBans: [],
  opponentStagedBans: [],
  banUiBound: false,
  pickSearch: "",
  pickSort: "overall_max_desc",
  ...createDraftFilterState("pick"),
  pickManualFormation: "4-3-3",
  /* The two halves of the pitch's click-pair model, same as the game-plan pitch.
     One of them is set at a time: whichever you click first, the second click
     completes the action. `pickActiveSlot` is a pitch/bench slot index selected
     for a swap or a fill; `pickPendingPlayerId` is a pool card chosen and
     waiting for a destination. */
  pickActiveSlot: null,
  pickPendingPlayerId: null,
  pickUiBound: false,
  mySquadPlayers: [],
  draftGamePlans: [],
  draftGamePlansLoading: false,
  actionError: "",
  presenceError: false,
};

/* Mirrors `src/features/rooms/config.js`, 0 case included: it has to be caught
   before the `||` reads it as absent and returns the default. */
export function isUnlimitedDuration(raw) {
  return Number(raw) === UNLIMITED_DURATION_SEC && String(raw ?? "").trim() !== "";
}

export function normalizeBanDurationSec(raw) {
  if (isUnlimitedDuration(raw)) return UNLIMITED_DURATION_SEC;
  const n = Math.floor(Number(raw) || DEFAULT_BAN_DURATION_SECONDS);
  return Math.max(MIN_BAN_DURATION_SECONDS, Math.min(MAX_BAN_DURATION_SECONDS, n));
}

export function normalizePickDurationSec(raw) {
  if (isUnlimitedDuration(raw)) return UNLIMITED_DURATION_SEC;
  const n = Math.floor(Number(raw) || DEFAULT_PICK_DURATION_SECONDS);
  return Math.max(MIN_PICK_DURATION_SECONDS, Math.min(MAX_PICK_DURATION_SECONDS, n));
}

const REVEAL_MODES = new Set([REVEAL_MODE_INSTANT, REVEAL_MODE_BLUR, REVEAL_MODE_HIDDEN]);

export function normalizeRevealMode(raw) {
  const mode = String(raw || "").trim().toLowerCase();
  return REVEAL_MODES.has(mode) ? mode : REVEAL_MODE_INSTANT;
}

/** One blank slot per category, for each of the three allowance maps. */
const emptyAllowanceMap = () =>
  Object.fromEntries(ALLOWANCE_CATEGORY_DEFS.map((d) => [d.key, ""]));

export function defaultRoomConfig() {
  return {
    allowAllPlayers: true,
    banCountPerSide: 3,
    banDurationSec: DEFAULT_BAN_DURATION_SECONDS,
    pickDurationSec: DEFAULT_PICK_DURATION_SECONDS,
    revealMode: REVEAL_MODE_INSTANT,
    pickCountPerSide: FIXED_PICKS_PER_SIDE,
    allowanceEnabled: [],
    allowanceMins: emptyAllowanceMap(),
    allowanceCaps: emptyAllowanceMap(),
    allowance: emptyAllowanceMap(),
  };
}

function defaultReadyState() {
  return { guest: false };
}

/** The three handshake fields on a room, in the order they are answered. */
const MATCH_STEP_FLAGS = ["matchReady", "matchStarted", "matchFinished"];

function defaultMatchReadyState() {
  return { host: false, guest: false };
}

export function normalizeRoomConfig(raw) {
  const defaults = defaultRoomConfig();
  const rawCfg = raw || {};
  const incomingAllowance = { ...(rawCfg.allowance || {}) };

  // Migrate legacy split min/max fields to range fields.
  if (!String(incomingAllowance.overall || "").trim()) {
    incomingAllowance.overall = normalizeAllowanceRangeValue(incomingAllowance.overallMin, incomingAllowance.overallMax);
  }
  if (
    String(incomingAllowance.overallMaxMin || "").trim() ||
    String(incomingAllowance.overallMaxMax || "").trim() ||
    !String(incomingAllowance.overallMax || "").trim()
  ) {
    incomingAllowance.overallMax = normalizeAllowanceRangeValue(incomingAllowance.overallMaxMin, incomingAllowance.overallMaxMax);
  }
  // Legacy format used overallMax as overall upper-bound; move it into overall range if needed.
  if (!String(incomingAllowance.overall || "").trim() && String(incomingAllowance.overallMax || "").trim() && !String(incomingAllowance.overallMax || "").includes(",")) {
    incomingAllowance.overall = normalizeAllowanceRangeValue("", incomingAllowance.overallMax);
    incomingAllowance.overallMax = "";
  }
  if (!String(incomingAllowance.height || "").trim()) {
    incomingAllowance.height = normalizeAllowanceRangeValue(incomingAllowance.heightMin, incomingAllowance.heightMax);
  }
  if (!String(incomingAllowance.weight || "").trim()) {
    incomingAllowance.weight = normalizeAllowanceRangeValue(incomingAllowance.weightMin, incomingAllowance.weightMax);
  }
  if (!String(incomingAllowance.age || "").trim()) {
    incomingAllowance.age = normalizeAllowanceRangeValue(incomingAllowance.ageMin, incomingAllowance.ageMax);
  }
  for (const key of ALLOWANCE_VALUE_LIST_KEYS) {
    incomingAllowance[key] = normalizeAllowanceListValue(key, incomingAllowance[key]).join(",");
  }

  const normalizedEnabled = Array.isArray(rawCfg.allowanceEnabled)
    ? Array.from(new Set(rawCfg.allowanceEnabled.map((k) => {
      const key = String(k || "").trim();
      return LEGACY_ALLOWANCE_KEY_MAP[key] || key;
    }).filter((k) => ALLOWANCE_DEF_MAP.has(k))))
    : [];

  /* Both count maps get the same pass, because both are one now: a per-value
     category carries a Min per value as well as a Max, so `allowanceMins` is no
     longer the plain-count-only field it started as. */
  const incomingCaps = { ...defaults.allowanceCaps, ...(rawCfg.allowanceCaps || {}) };
  const incomingMins = { ...defaults.allowanceMins, ...(rawCfg.allowanceMins || {}) };
  for (const key of ALLOWANCE_VALUE_LIST_KEYS) {
    const values = normalizeAllowanceListValue(key, incomingAllowance[key]);
    incomingCaps[key] = stringifyAllowanceCountMap(incomingCaps[key], values);
    incomingMins[key] = stringifyAllowanceCountMap(incomingMins[key], values);
  }

  return {
    ...defaults,
    ...rawCfg,
    banDurationSec: normalizeBanDurationSec(rawCfg.banDurationSec),
    pickDurationSec: normalizePickDurationSec(rawCfg.pickDurationSec),
    revealMode: normalizeRevealMode(rawCfg.revealMode),
    allowanceEnabled: normalizedEnabled,
    allowanceCaps: incomingCaps,
    allowanceMins: incomingMins,
    allowance: {
      ...defaults.allowance,
      ...incomingAllowance,
    },
  };
}

const participantFromSnapshot = (p) => ({
  id: String(p.id),
  username: p.username,
  lastSeenAt: Number(p.lastSeenAt) || 0,
  hidden: Boolean(p.hidden),
  /* Squad size, or null for a seat with no account behind it. The lobby prints
     it and the START gate reads it — and, like `lastSeenAt` above, it is dropped
     unless this whitelist names it. */
  playerCount: p.playerCount == null ? null : Number(p.playerCount),
});

/** Merge server-reported host/guest/config/chat into local room. */
export function applyPresenceSnapshot(sr) {
  if (!state.room || !sr) return;
  const room = state.room;
  // Ensure arrays exist to avoid render-time exceptions
  if (!room.bans) room.bans = { host: [], guest: [] };
  if (!room.picks) room.picks = { host: [], guest: [] };
  if (!Array.isArray(room.bannedPlayerIds)) room.bannedPlayerIds = [];
  /* `lastSeenAt` and `hidden` are what the opponent badge reads to tell
     connected from reconnecting from gone. Both come down on every snapshot and
     used to be dropped here, which is why an opponent who closed their browser
     read as "· is choosing…" forever. See `opponentLiveness` in presence.js. */
  if (sr.host?.username) {
    room.host = participantFromSnapshot(sr.host);
  }
  room.guest = sr.guest?.username ? participantFromSnapshot(sr.guest) : null;
  const incomingConfig = normalizeRoomConfig(sr.config);
  // While host is actively editing, do not let polling snapshots override local draft values.
  if (!(state.mySide === "host" && state.phase === "lobby" && state.lobbyConfigDirty)) {
    room.config = incomingConfig;
  }
  room.ready = {
    ...defaultReadyState(),
    ...(sr.ready || {}),
  };
  /* All three Start Match handshakes. Each has to be read off **every**
     snapshot, including the ones that clear it — this is the only way one
     side's press reaches the other's screen, and the only way an undo takes it
     back off. `rematch` below is here for the same reason, and was missing for
     the same reason. */
  for (const key of MATCH_STEP_FLAGS) {
    room[key] = { ...defaultMatchReadyState(), ...(sr[key] || {}) };
  }
  /* The pending rematch offer, `{ by: "host" | "guest" }` or null. It has to be
     read off **every** snapshot, including the ones that clear it: this is how
     an offer reaches the other player at all, and how a decline takes it back
     off both screens. */
  room.rematch = sr.rematch?.by === "host" || sr.rematch?.by === "guest"
    ? { by: sr.rematch.by }
    : null;
  /* Which side, if either, has left this room for a different one. Same
     every-snapshot rule as `rematch` above. */
  room.newMatch = sr.newMatch?.by === "host" || sr.newMatch?.by === "guest"
    ? { by: sr.newMatch.by }
    : null;
  /* The ban ceiling both squads can absorb, computed server-side so the lobby
     needs no copy of the arithmetic. Null while the sizes are unknown. */
  room.maxBanCountPerSide = sr.maxBanCountPerSide == null ? null : Number(sr.maxBanCountPerSide);
  room.chat = Array.isArray(sr.chat) ? sr.chat : [];
  room.status = String(sr.status || room.status || "lobby");
  room.turnIndex = Number.isFinite(Number(sr.turnIndex)) ? Math.max(0, Math.floor(Number(sr.turnIndex))) : Number(room.turnIndex || 0);
  room.turnEndsAt = sr.turnEndsAt ? Number(sr.turnEndsAt) : null;
  // Merge bans/picks if provided by server snapshot
  if (sr.bans && typeof sr.bans === "object") {
    room.bans = {
      host: Array.isArray(sr.bans.host) ? sr.bans.host.map(normalizeDraftPlayer) : (room.bans?.host || []),
      guest: Array.isArray(sr.bans.guest) ? sr.bans.guest.map(normalizeDraftPlayer) : (room.bans?.guest || []),
    };
  }
  if (sr.picks && typeof sr.picks === "object") {
    room.picks = {
      // `null` is an empty pitch slot and must stay null, not become a blank player
      host: Array.isArray(sr.picks.host) ? sr.picks.host.map((p) => (p ? normalizeDraftPlayer(p) : null)) : (room.picks?.host || []),
      guest: Array.isArray(sr.picks.guest) ? sr.picks.guest.map((p) => (p ? normalizeDraftPlayer(p) : null)) : (room.picks?.guest || []),
    };
  }
  room.bannedPlayerIds = Array.isArray(sr.bannedPlayerIds) ? sr.bannedPlayerIds.map(String) : (room.bannedPlayerIds || []);
  room.closed = Boolean(sr.closed);
  room.closeReason = sr.closeReason || "";
  if (sr.bansConfirmed && typeof sr.bansConfirmed === "object") {
    room.bansConfirmed = { host: Boolean(sr.bansConfirmed.host), guest: Boolean(sr.bansConfirmed.guest) };
  }
  if (sr.picksConfirmed && typeof sr.picksConfirmed === "object") {
    room.picksConfirmed = { host: Boolean(sr.picksConfirmed.host), guest: Boolean(sr.picksConfirmed.guest) };
  }
  /* Both sides' pitch shape, sent on picks-confirm. `normalizeFormation` is the
     gate — anything the fifteen-row table does not know becomes the default —
     so this stores whatever arrives and lets the reader decide. */
  if (sr.formations && typeof sr.formations === "object") {
    room.formations = {
      host: normalizeFormation(sr.formations.host),
      guest: normalizeFormation(sr.formations.guest),
    };
  }
  const theirSide = state.mySide === "host" ? "guest" : "host";
  if (sr.stagedBans && typeof sr.stagedBans === "object") {
    const raw = sr.stagedBans[theirSide];
    state.opponentStagedBans = Array.isArray(raw)
      ? raw.map((p) => ({ id: String(p.id || ""), name: String(p.name || "") })).filter((p) => p.id)
      : [];
  }
  state.lastRoomUpdatedAt = Number(sr.updatedAt || state.lastRoomUpdatedAt || Date.now());
}

export function buildTurnSchedule(bansPerSide, picksPerSide) {
  // Phase-based flow:
  // - Ban phase: both users ban simultaneously within total banDurationSec.
  // - Pick phase: both users pick simultaneously within total pickDurationSec.
  // Note: pick phase UI is still WIP, but timers/transitions are handled.
  void bansPerSide;
  void picksPerSide;
  return [
    { side: "both", action: "ban" },
    { side: "both", action: "pick" },
  ];
}

export function emptyRoom(code, host, guest) {
  return {
    code,
    host: host || null,
    guest: guest || null,
    status: "lobby",
    turnIndex: 0,
    turnEndsAt: null,
    bans: { host: [], guest: [] },
    picks: { host: [], guest: [] },
    config: defaultRoomConfig(),
    ready: defaultReadyState(),
    matchReady: defaultMatchReadyState(),
    matchStarted: defaultMatchReadyState(),
    matchFinished: defaultMatchReadyState(),
    formations: { host: DEFAULT_FORMATION, guest: DEFAULT_FORMATION },
    chat: [],
    bannedPlayerIds: [],
    currentTurn: null,
  };
}
