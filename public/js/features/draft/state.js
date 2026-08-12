import {
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
  ALLOWANCE_DEF_MAP,
} from './constants.js';

import {
  normalizeAllowanceRangeValue,
  normalizeClubValue,
  normalizeTextAllowanceListValue,
  normalizeFootValue,
  normalizePositionValue,
  stringifyPositionCapMap,
  stringifyClubCapMap,
  stringifyTextAllowanceCapMap,
} from './allowance.js';

import { normalizeDraftPlayer } from './players.js';
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
  openAllowancePosKey: "",
  openAllowancePosCapKey: "",
  openAllowancePosScrollTop: 0,
  openAllowanceCardTypeKey: "",
  openAllowanceCardTypeCapKey: "",
  openAllowanceRegionKey: "",
  openAllowanceRegionCapKey: "",
  openAllowancePlayingStyleKey: "",
  openAllowancePlayingStyleCapKey: "",
  openAllowanceCardTypeScrollTop: 0,
  openAllowanceRegionScrollTop: 0,
  openAllowancePlayingStyleScrollTop: 0,
  clubSearchKey: "club",
  clubSearchQuery: "",
  clubSearchOptions: [],
  clubSearchOpen: false,
  clubSearchLoading: false,
  clubSearchActiveIndex: -1,
  clubSearchReqSeq: 0,
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

export function normalizeBanDurationSec(raw) {
  const n = Math.floor(Number(raw) || DEFAULT_BAN_DURATION_SECONDS);
  return Math.max(MIN_BAN_DURATION_SECONDS, Math.min(MAX_BAN_DURATION_SECONDS, n));
}

export function normalizePickDurationSec(raw) {
  const n = Math.floor(Number(raw) || DEFAULT_PICK_DURATION_SECONDS);
  return Math.max(MIN_PICK_DURATION_SECONDS, Math.min(MAX_PICK_DURATION_SECONDS, n));
}

const REVEAL_MODES = new Set([REVEAL_MODE_INSTANT, REVEAL_MODE_BLUR, REVEAL_MODE_HIDDEN]);

export function normalizeRevealMode(raw) {
  const mode = String(raw || "").trim().toLowerCase();
  return REVEAL_MODES.has(mode) ? mode : REVEAL_MODE_INSTANT;
}

export function defaultRoomConfig() {
  return {
    allowAllPlayers: true,
    banCountPerSide: 3,
    banDurationSec: DEFAULT_BAN_DURATION_SECONDS,
    pickDurationSec: DEFAULT_PICK_DURATION_SECONDS,
    revealMode: REVEAL_MODE_INSTANT,
    pickCountPerSide: FIXED_PICKS_PER_SIDE,
    allowanceEnabled: [],
    allowanceCaps: {
      position: "",
      overall: "",
      overallMax: "",
      club: "",
      league: "",
      nationality: "",
      height: "",
      weight: "",
      age: "",
      cardType: "",
      region: "",
      foot: "",
      playingStyle: "",
    },
    allowance: {
      position: "",
      overall: "",
      overallMax: "",
      club: "",
      league: "",
      nationality: "",
      height: "",
      weight: "",
      age: "",
      cardType: "",
      region: "",
      foot: "",
      playingStyle: "",
    },
  };
}

function defaultReadyState() {
  return { guest: false };
}

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
  incomingAllowance.club = normalizeClubValue(incomingAllowance.club).join(",");
  incomingAllowance.league = normalizeTextAllowanceListValue(incomingAllowance.league).join(",");
  incomingAllowance.nationality = normalizeTextAllowanceListValue(incomingAllowance.nationality).join(",");
  incomingAllowance.foot = normalizeFootValue(incomingAllowance.foot, { defaultAll: true }).join(",");

  const normalizedEnabled = Array.isArray(rawCfg.allowanceEnabled)
    ? Array.from(new Set(rawCfg.allowanceEnabled.map((k) => {
      const key = String(k || "").trim();
      return LEGACY_ALLOWANCE_KEY_MAP[key] || key;
    }).filter((k) => ALLOWANCE_DEF_MAP.has(k))))
    : [];

  const incomingCaps = {
    ...defaults.allowanceCaps,
    ...((rawCfg && rawCfg.allowanceCaps) || {}),
  };
  incomingCaps.position = stringifyPositionCapMap(incomingCaps.position, normalizePositionValue(incomingAllowance.position || ""));
  incomingCaps.club = stringifyClubCapMap(incomingCaps.club, normalizeClubValue(incomingAllowance.club || ""));
  incomingCaps.league = stringifyTextAllowanceCapMap(incomingCaps.league, normalizeTextAllowanceListValue(incomingAllowance.league || ""));
  incomingCaps.nationality = stringifyTextAllowanceCapMap(incomingCaps.nationality, normalizeTextAllowanceListValue(incomingAllowance.nationality || ""));

  return {
    ...defaults,
    ...rawCfg,
    banDurationSec: normalizeBanDurationSec(rawCfg.banDurationSec),
    pickDurationSec: normalizePickDurationSec(rawCfg.pickDurationSec),
    revealMode: normalizeRevealMode(rawCfg.revealMode),
    allowanceEnabled: normalizedEnabled,
    allowanceCaps: incomingCaps,
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
  room.matchReady = {
    ...defaultMatchReadyState(),
    ...(sr.matchReady || {}),
  };
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
    chat: [],
    bannedPlayerIds: [],
    currentTurn: null,
  };
}
