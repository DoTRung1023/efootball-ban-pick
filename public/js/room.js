const GREEN = "#00e676";
const RED = "#ff4444";
const FIXED_PICKS_PER_SIDE = 23;
const DEFAULT_BAN_DURATION_SECONDS = 120;
const MIN_BAN_DURATION_SECONDS = 5;
const MAX_BAN_DURATION_SECONDS = 900;
const DEFAULT_PICK_DURATION_SECONDS = 300;
const MIN_PICK_DURATION_SECONDS = 5;
const MAX_PICK_DURATION_SECONDS = 1200;
const LOBBY_PRESENCE_POLL_MS = 500;
const REVEAL_MODE_INSTANT = "instant";
const REVEAL_MODE_HIDDEN = "hidden";
const CARD_IMG = (id) => `/img/card/${id}.png`;
const ANON_PLAYER_IMG = "/img/anonymous_player.jpeg";

// Global handler for unhandled promise rejections to surface friendly messages
window.addEventListener("unhandledrejection", (ev) => {
  try {
    const reason = ev.reason;
    console.error("Unhandled promise rejection:", reason);
    if (typeof showToast === "function") {
      const msg = reason && reason.message ? reason.message : String(reason ?? "Unexpected error");
      showToast(msg, "warn");
    }
  } catch (err) {
    console.error("Error in unhandledrejection handler:", err);
  }
  // Prevent the browser from also logging an uncaught rejection message
  try { ev.preventDefault && ev.preventDefault(); } catch (e) {}
});

// Global catch for runtime errors to ensure they surface consistently
window.addEventListener("error", (ev) => {
  try {
    console.error("Runtime error:", ev.error || ev.message, ev);
    if (typeof showToast === "function") {
      const m = ev.message || (ev.error && ev.error.message) || "An unexpected error occurred";
      showToast(String(m), "warn");
    }
  } catch (e) {
    console.error("Error in window.onerror handler:", e);
  }
});

const DEFAULT_FORMATION = "4-3-3";
const FORMATION_LAYOUTS = {
  "4-3-3": [
    { id: "pitchRowFwd", slots: [9, 10, 11] },
    { id: "pitchRowMid", slots: [6, 7, 8] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "4-4-2": [
    { id: "pitchRowFwd", slots: [10, 11] },
    { id: "pitchRowMid", slots: [6, 7, 8, 9] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "4-5-1": [
    { id: "pitchRowFwd", slots: [11] },
    { id: "pitchRowMid", slots: [6, 7, 8, 9, 10] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "3-6-1": [
    { id: "pitchRowFwd", slots: [11] },
    { id: "pitchRowMid", slots: [5, 6, 7, 8, 9, 10] },
    { id: "pitchRowDef", slots: [2, 3, 4] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "3-4-3": [
    { id: "pitchRowFwd", slots: [9, 10, 11] },
    { id: "pitchRowMid", slots: [5, 6, 7, 8] },
    { id: "pitchRowDef", slots: [2, 3, 4] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "3-5-2": [
    { id: "pitchRowFwd", slots: [10, 11] },
    { id: "pitchRowMid", slots: [5, 6, 7, 8, 9] },
    { id: "pitchRowDef", slots: [2, 3, 4] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "5-2-3": [
    { id: "pitchRowFwd", slots: [9, 10, 11] },
    { id: "pitchRowMid", slots: [7, 8] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5, 6] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "5-3-2": [
    { id: "pitchRowFwd", slots: [10, 11] },
    { id: "pitchRowMid", slots: [7, 8, 9] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5, 6] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "5-4-1": [
    { id: "pitchRowFwd", slots: [11] },
    { id: "pitchRowMid", slots: [7, 8, 9, 10] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5, 6] },
    { id: "pitchRowGk", slots: [1] },
  ],
};

const ALLOWANCE_CATEGORY_DEFS = [
  { key: "position", label: "Position", placeholder: "CF,SS,RWF", type: "text" },
  { key: "overall", label: "Overall", type: "range", minPlaceholder: "", maxPlaceholder: "" },
  { key: "overallMax", label: "Overall max", type: "range", minPlaceholder: "", maxPlaceholder: "" },
  { key: "club", label: "Club", placeholder: "Barcelona", type: "text" },
  { key: "league", label: "League", placeholder: "La Liga", type: "text" },
  { key: "nationality", label: "Nationality", placeholder: "France", type: "text" },
  { key: "height", label: "Height", type: "range", minPlaceholder: "", maxPlaceholder: "" },
  { key: "weight", label: "Weight", type: "range", minPlaceholder: "", maxPlaceholder: "" },
  { key: "age", label: "Age", type: "range", minPlaceholder: "", maxPlaceholder: "" },
  { key: "cardType", label: "Card type", placeholder: "Epic,Highlight", type: "text" },
  { key: "region", label: "Region", placeholder: "Europe", type: "text" },
  { key: "foot", label: "Foot", placeholder: "Left,Right", type: "text" },
  { key: "playingStyle", label: "Playing style", placeholder: "Goal Poacher", type: "text" },
];
const ALLOWANCE_DEF_MAP = new Map(ALLOWANCE_CATEGORY_DEFS.map((d) => [d.key, d]));
const ALLOWANCE_RANGE_KEYS = new Set(["overall", "overallMax", "height", "weight", "age"]);
const LEGACY_ALLOWANCE_KEY_MAP = {
  overallMin: "overall",
  overallMaxMin: "overallMax",
  heightMin: "height",
  weightMin: "weight",
  ageMin: "age",
};
const ALLOWANCE_CAP_OPTIONS = Array.from({ length: FIXED_PICKS_PER_SIDE }, (_, i) => i + 1);
const POSITION_OPTIONS = ["GK","CB","LB","RB","DMF","CMF","LMF","RMF","AMF","LWF","RWF","SS","CF"];
const FOOT_OPTIONS = ["Left", "Right"];
const TEXT_ALLOWANCE_LIST_KEYS = new Set(["club", "league", "nationality"]);

// Filter options fetched from server
let CARD_TYPE_OPTIONS = [];
let REGION_OPTIONS = [];
let PLAYING_STYLE_OPTIONS = [];

function makePlayerImg(src, alt = "Player image") {
  const img = document.createElement("img");
  img.src = src || ANON_PLAYER_IMG;
  img.alt = alt;
  img.loading = "lazy";
  img.addEventListener("error", () => {
    if (img.dataset.fallbackApplied === "1") return;
    img.dataset.fallbackApplied = "1";
    img.src = ANON_PLAYER_IMG;
  });
  return img;
}

function normalizeFormation(f) {
  const s = String(f || "").trim();
  return FORMATION_LAYOUTS[s] ? s : DEFAULT_FORMATION;
}

function getFormationLayout(formation) {
  return FORMATION_LAYOUTS[normalizeFormation(formation)] || FORMATION_LAYOUTS[DEFAULT_FORMATION];
}

function getPlayerCardValue(player) {
  return player?.overall_rating ?? player?.overall_max ?? player?.overall ?? "—";
}

function getPlayerImageSrc(player) {
  const id = player?.pesdb_id ?? player?.id;
  return id ? CARD_IMG(id) : ANON_PLAYER_IMG;
}

function normalizeDraftPlayer(player) {
  return {
    id: String(player?.player_id ?? player?.id ?? ""),
    name: String(player?.name || ""),
    position: String(player?.position || "—"),
    overall_rating: player?.overall_rating ?? player?.overall_max ?? player?.overall ?? "—",
    nation: String(player?.nation || player?.nationality || "—"),
    club: String(player?.club || ""),
    pesdb_id: player?.pesdb_id ?? player?.player_id ?? player?.id ?? null,
    speed: player?.speed ?? "—",
    finishing: player?.finishing ?? "—",
    passing: player?.passing ?? "—",
  };
}

function normalizeMySquadPlayerForDraft(player) {
  const catalogId = String(player?.pesdb_id || player?.id || "");
  return {
    id: catalogId,
    name: String(player?.name || ""),
    position: String(player?.position || "—"),
    overall_rating: player?.overall_max ?? player?.overall ?? "—",
    nation: String(player?.nationality || "—"),
    club: String(player?.club || ""),
    pesdb_id: player?.pesdb_id ?? player?.id ?? null,
    speed: "—",
    finishing: "—",
    passing: "—",
  };
}

function mapPlayersBySlot(rows) {
  const map = {};
  (rows || []).forEach((row) => {
    const slot = Number(row?.slot);
    if (!Number.isFinite(slot) || slot < 1 || slot > FIXED_PICKS_PER_SIDE) return;
    map[slot] = normalizeDraftPlayer(row);
  });
  return map;
}

function buildOrderedSlotMap(players) {
  const map = {};
  (players || []).forEach((player, idx) => {
    map[idx + 1] = normalizeDraftPlayer(player);
  });
  return map;
}

function slotCardsSummary(players) {
  const count = Array.isArray(players) ? players.length : 0;
  return `${count}/${FIXED_PICKS_PER_SIDE}`;
}

function getDraftDisplayPlayers(room = state.room) {
  if (!room) return [];
  const turn = state.schedule[room.turnIndex];
  const isBanPhase = turn?.action === "ban";
  const isReadyPhase = state.phase === "ready" || String(room.status || "") === "await-ready";
  if (isReadyPhase) return state.players;
  return isBanPhase ? getBanListPlayers() : state.players;
}

function readAllowanceFieldValue(input) {
  if (!input) return "";
  if (input.tagName === "SELECT" && input.multiple) {
    return Array.from(input.selectedOptions)
      .map((opt) => String(opt.value || "").trim())
      .filter(Boolean)
      .join(",");
  }
  return String(input.value || "").trim();
}

function normalizePositionValue(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i && POSITION_OPTIONS.includes(v));
}

function normalizeFootValue(raw, { defaultAll = false } = {}) {
  const normalized = String(raw || "")
    .split(",")
    .map((v) => String(v || "").trim().toLowerCase())
    .map((v) => (v === "left" ? "Left" : v === "right" ? "Right" : ""))
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);
  if (normalized.length) return normalized;
  return defaultAll ? [...FOOT_OPTIONS] : [];
}

function normalizeCardTypeValue(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i && CARD_TYPE_OPTIONS.includes(v));
}

function normalizeRegionValue(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i && REGION_OPTIONS.includes(v));
}

function normalizePlayingStyleValue(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i && PLAYING_STYLE_OPTIONS.includes(v));
}

function normalizeClubValue(raw) {
  const seen = new Set();
  return String(raw || "")
    .split(",")
    .map((v) => String(v || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((v) => {
      const key = v.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeTextAllowanceListValue(raw) {
  return normalizeClubValue(raw);
}

function dedupeCaseInsensitive(values) {
  const seen = new Set();
  return values.filter((v) => {
    const key = String(v || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function positionSummaryText(selected) {
  if (!selected.length) return "All positions";
  if (selected.length <= 7) return selected.join(", ");
  return `${selected.length} selected`;
}

function cardTypeSummaryText(selected) {
  if (!selected.length) return "All card types";
  if (selected.length <= 3) return selected.join(", ");
  return `${selected.length} selected`;
}

function regionSummaryText(selected) {
  if (!selected.length) return "All regions";
  if (selected.length <= 3) return selected.join(", ");
  return `${selected.length} selected`;
}

function playingStyleSummaryText(selected) {
  if (!selected.length) return "All styles";
  if (selected.length <= 3) return selected.join(", ");
  return `${selected.length} selected`;
}

function normalizeAllowanceCapValue(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.min(FIXED_PICKS_PER_SIDE, Math.floor(n)));
}

function normalizeBanDurationSec(raw) {
  const n = Math.floor(Number(raw) || DEFAULT_BAN_DURATION_SECONDS);
  return Math.max(MIN_BAN_DURATION_SECONDS, Math.min(MAX_BAN_DURATION_SECONDS, n));
}

function normalizePickDurationSec(raw) {
  const n = Math.floor(Number(raw) || DEFAULT_PICK_DURATION_SECONDS);
  return Math.max(MIN_PICK_DURATION_SECONDS, Math.min(MAX_PICK_DURATION_SECONDS, n));
}

function normalizeRevealMode(raw) {
  return String(raw || "").trim().toLowerCase() === REVEAL_MODE_HIDDEN
    ? REVEAL_MODE_HIDDEN
    : REVEAL_MODE_INSTANT;
}

function getTurnDurationSec(turn, cfg = state.room?.config || defaultRoomConfig()) {
  if (turn?.action === "ban") return normalizeBanDurationSec(cfg?.banDurationSec);
  if (turn?.action === "pick") return normalizePickDurationSec(cfg?.pickDurationSec);
  return DEFAULT_PICK_DURATION_SECONDS;
}

function getDraftStage(room = state.room) {
  const t = room ? state.schedule[room.turnIndex] : null;
  return String(t?.action || "");
}

function ensureDraftTimer(room = state.room) {
  if (!room || room.turnEndsAt) return;
  const stage = getDraftStage(room);
  const durationSec = getTurnDurationSec({ action: stage }, room.config);
  room.turnEndsAt = Date.now() + durationSec * 1000;
}

function advanceDraftStage(room, nextAction) {
  if (!room) return;
  const next = String(nextAction || "");
  const nextIdx = state.schedule.findIndex((t) => String(t?.action || "") === next);
  if (nextIdx < 0) return;
  room.turnIndex = nextIdx;
  syncCurrentTurnFromIndex(room);
  room.turnEndsAt = Date.now() + getTurnDurationSec(state.schedule[room.turnIndex], room.config) * 1000;
  startTurnTimer();
}

function maybeAutoAdvanceFromBan(room = state.room) {
  if (!room) return;
  if (getDraftStage(room) !== "ban") return;
  const cfg = room.config || defaultRoomConfig();
  const target = Math.max(0, Math.floor(Number(cfg.banCountPerSide) || 0));
  if (!target) return;
  const doneHost = (room.bans?.host || []).length >= target;
  const doneGuest = (room.bans?.guest || []).length >= target;
  if (doneHost && doneGuest) {
    advanceDraftStage(room, "pick");
  }
}

function parsePositionCapMap(raw, selectedPositions = []) {
  const selectedSet = new Set(normalizePositionValue(selectedPositions.join(",")));
  let parsed = {};

  if (raw && typeof raw === "object") {
    parsed = raw;
  } else {
    const text = String(raw || "").trim();
    if (text) {
      // Legacy support: a single cap value applied to every selected position.
      const legacyCap = normalizeAllowanceCapValue(text);
      if (legacyCap) {
        selectedSet.forEach((pos) => {
          parsed[pos] = legacyCap;
        });
      } else {
        try {
          const obj = JSON.parse(text);
          if (obj && typeof obj === "object") parsed = obj;
        } catch {
          parsed = {};
        }
      }
    }
  }

  const normalized = {};
  POSITION_OPTIONS.forEach((pos) => {
    if (selectedSet.size && !selectedSet.has(pos)) return;
    const cap = normalizeAllowanceCapValue(parsed[pos]);
    if (cap) normalized[pos] = cap;
  });
  return normalized;
}

function stringifyPositionCapMap(map, selectedPositions = []) {
  const normalized = parsePositionCapMap(map, selectedPositions);
  const keys = Object.keys(normalized);
  if (!keys.length) return "";
  return JSON.stringify(normalized);
}

function positionCapSummaryText(capMap, selectedPositions) {
  const selected = normalizePositionValue(selectedPositions.join(","));
  const effective = selected.length ? selected : POSITION_OPTIONS;
  const active = effective.filter((pos) => normalizeAllowanceCapValue(capMap[pos]));
  if (!active.length) return "No caps";
  if (active.length <= 2) return active.map((pos) => `${pos}:${capMap[pos]}`).join(" / ");
  return `${active.length} capped`;
}

function parseCardTypeCapMap(raw, selectedCardTypes = []) {
  const selectedSet = new Set(normalizeCardTypeValue(selectedCardTypes.join(",")));
  let parsed = {};

  if (raw && typeof raw === "object") {
    parsed = raw;
  } else {
    const text = String(raw || "").trim();
    if (text) {
      const legacyCap = normalizeAllowanceCapValue(text);
      if (legacyCap) {
        selectedSet.forEach((ct) => {
          parsed[ct] = legacyCap;
        });
      } else {
        try {
          const obj = JSON.parse(text);
          if (obj && typeof obj === "object") parsed = obj;
        } catch {
          parsed = {};
        }
      }
    }
  }

  const normalized = {};
  CARD_TYPE_OPTIONS.forEach((ct) => {
    if (selectedSet.size && !selectedSet.has(ct)) return;
    const cap = normalizeAllowanceCapValue(parsed[ct]);
    if (cap) normalized[ct] = cap;
  });
  return normalized;
}

function stringifyCardTypeCapMap(map, selectedCardTypes = []) {
  const normalized = parseCardTypeCapMap(map, selectedCardTypes);
  const keys = Object.keys(normalized);
  if (!keys.length) return "";
  return JSON.stringify(normalized);
}

function cardTypeCapSummaryText(capMap, selectedCardTypes) {
  const selected = normalizeCardTypeValue(selectedCardTypes.join(","));
  const effective = selected.length ? selected : CARD_TYPE_OPTIONS;
  const active = effective.filter((ct) => normalizeAllowanceCapValue(capMap[ct]));
  if (!active.length) return "No caps";
  if (active.length <= 2) return active.map((ct) => `${ct}:${capMap[ct]}`).join(" / ");
  return `${active.length} capped`;
}

function parseRegionCapMap(raw, selectedRegions = []) {
  const selectedSet = new Set(normalizeRegionValue(selectedRegions.join(",")));
  let parsed = {};

  if (raw && typeof raw === "object") {
    parsed = raw;
  } else {
    const text = String(raw || "").trim();
    if (text) {
      const legacyCap = normalizeAllowanceCapValue(text);
      if (legacyCap) {
        selectedSet.forEach((r) => {
          parsed[r] = legacyCap;
        });
      } else {
        try {
          const obj = JSON.parse(text);
          if (obj && typeof obj === "object") parsed = obj;
        } catch {
          parsed = {};
        }
      }
    }
  }

  const normalized = {};
  REGION_OPTIONS.forEach((r) => {
    if (selectedSet.size && !selectedSet.has(r)) return;
    const cap = normalizeAllowanceCapValue(parsed[r]);
    if (cap) normalized[r] = cap;
  });
  return normalized;
}

function stringifyRegionCapMap(map, selectedRegions = []) {
  const normalized = parseRegionCapMap(map, selectedRegions);
  const keys = Object.keys(normalized);
  if (!keys.length) return "";
  return JSON.stringify(normalized);
}

function regionCapSummaryText(capMap, selectedRegions) {
  const selected = normalizeRegionValue(selectedRegions.join(","));
  const effective = selected.length ? selected : REGION_OPTIONS;
  const active = effective.filter((r) => normalizeAllowanceCapValue(capMap[r]));
  if (!active.length) return "No caps";
  if (active.length <= 2) return active.map((r) => `${r}:${capMap[r]}`).join(" / ");
  return `${active.length} capped`;
}

function parsePlayingStyleCapMap(raw, selectedPlayingStyles = []) {
  const selectedSet = new Set(normalizePlayingStyleValue(selectedPlayingStyles.join(",")));
  let parsed = {};

  if (raw && typeof raw === "object") {
    parsed = raw;
  } else {
    const text = String(raw || "").trim();
    if (text) {
      const legacyCap = normalizeAllowanceCapValue(text);
      if (legacyCap) {
        selectedSet.forEach((ps) => {
          parsed[ps] = legacyCap;
        });
      } else {
        try {
          const obj = JSON.parse(text);
          if (obj && typeof obj === "object") parsed = obj;
        } catch {
          parsed = {};
        }
      }
    }
  }

  const normalized = {};
  PLAYING_STYLE_OPTIONS.forEach((ps) => {
    if (selectedSet.size && !selectedSet.has(ps)) return;
    const cap = normalizeAllowanceCapValue(parsed[ps]);
    if (cap) normalized[ps] = cap;
  });
  return normalized;
}

function stringifyPlayingStyleCapMap(map, selectedPlayingStyles = []) {
  const normalized = parsePlayingStyleCapMap(map, selectedPlayingStyles);
  const keys = Object.keys(normalized);
  if (!keys.length) return "";
  return JSON.stringify(normalized);
}

function playingStyleCapSummaryText(capMap, selectedPlayingStyles) {
  const selected = normalizePlayingStyleValue(selectedPlayingStyles.join(","));
  const effective = selected.length ? selected : PLAYING_STYLE_OPTIONS;
  const active = effective.filter((ps) => normalizeAllowanceCapValue(capMap[ps]));
  if (!active.length) return "No caps";
  if (active.length <= 2) return active.map((ps) => `${ps}:${capMap[ps]}`).join(" / ");
  return `${active.length} capped`;
}

function parseClubCapMap(raw, selectedClubs = []) {
  let parsed = {};

  if (raw && typeof raw === "object") {
    parsed = raw;
  } else {
    const text = String(raw || "").trim();
    if (text) {
      const legacyCap = normalizeAllowanceCapValue(text);
      if (legacyCap) {
        normalizeClubValue(selectedClubs.join(",")).forEach((club) => {
          parsed[club] = legacyCap;
        });
      } else {
        try {
          const obj = JSON.parse(text);
          if (obj && typeof obj === "object") parsed = obj;
        } catch {
          parsed = {};
        }
      }
    }
  }

  const normalizedParsed = {};
  for (const [clubRaw, capRaw] of Object.entries(parsed)) {
    const club = String(clubRaw || "").replace(/\s+/g, " ").trim();
    if (!club) continue;
    const cap = normalizeAllowanceCapValue(capRaw);
    if (!cap) continue;
    normalizedParsed[club.toLowerCase()] = { club, cap };
  }

  const normalizedSelection = normalizeClubValue(selectedClubs.join(","));
  const effectiveSelection = normalizedSelection.length
    ? normalizedSelection
    : Object.values(normalizedParsed).map((entry) => entry.club);

  const normalized = {};
  effectiveSelection.forEach((club) => {
    const hit = normalizedParsed[club.toLowerCase()];
    if (hit?.cap) normalized[club] = hit.cap;
  });
  return normalized;
}

function stringifyClubCapMap(map, selectedClubs = []) {
  const normalized = parseClubCapMap(map, selectedClubs);
  const keys = Object.keys(normalized);
  if (!keys.length) return "";
  return JSON.stringify(normalized);
}

function parseTextAllowanceCapMap(raw, selectedValues = []) {
  return parseClubCapMap(raw, selectedValues);
}

function stringifyTextAllowanceCapMap(map, selectedValues = []) {
  return stringifyClubCapMap(map, selectedValues);
}

function splitCsvValue(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseNumberOrNull(raw) {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeAllowanceRangeValue(minRaw, maxRaw) {
  let minN = parseNumberOrNull(minRaw);
  let maxN = parseNumberOrNull(maxRaw);

  if (minN != null) minN = Math.max(0, Math.floor(minN));
  if (maxN != null) maxN = Math.max(0, Math.floor(maxN));

  // Guarantee range ordering whenever both bounds are provided.
  if (minN != null && maxN != null && minN > maxN) {
    [minN, maxN] = [maxN, minN];
  }

  const min = minN == null ? "" : String(minN);
  const max = maxN == null ? "" : String(maxN);
  if (!min && !max) return "";
  return `${min},${max}`;
}

function parseAllowanceRangeValue(raw) {
  const [minRaw = "", maxRaw = ""] = String(raw || "").split(",");
  return {
    min: String(minRaw).trim(),
    max: String(maxRaw).trim(),
  };
}

function parseAllowanceRangeNumbers(raw) {
  const { min, max } = parseAllowanceRangeValue(raw);
  return {
    min: parseNumberOrNull(min),
    max: parseNumberOrNull(max),
  };
}

function isWithinOptionalRange(value, min, max) {
  if (value == null) return false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return min != null || max != null;
}

function matchesAnyIncludes(fieldValue, queryRaw) {
  const hay = String(fieldValue || "").toLowerCase();
  const needles = splitCsvValue(queryRaw).map((v) => v.toLowerCase());
  if (!needles.length) return false;
  return needles.some((q) => hay.includes(q));
}

function matchesAnyEquals(fieldValue, queryRaw) {
  const hay = String(fieldValue || "").toLowerCase();
  const needles = splitCsvValue(queryRaw).map((v) => v.toLowerCase());
  if (!needles.length) return false;
  return needles.includes(hay);
}

function playerMatchesAllowanceCategory(player, key, valueRaw) {
  const raw = player?._raw || {};
  const value = String(valueRaw || "").trim();
  if (!value) return false;

  switch (key) {
    case "position": {
      const selected = normalizePositionValue(value);
      if (!selected.length) return false;
      return selected.includes(String(raw.position || "").trim().toUpperCase());
    }
    case "overall": {
      const ovr = parseNumberOrNull(raw.overall);
      const { min, max } = parseAllowanceRangeNumbers(value);
      return isWithinOptionalRange(ovr, min, max);
    }
    case "overallMax": {
      const ovrMax = parseNumberOrNull(raw.overall_max);
      const { min, max } = parseAllowanceRangeNumbers(value);
      return isWithinOptionalRange(ovrMax, min, max);
    }
    case "height": {
      const h = parseNumberOrNull(raw.height);
      const { min, max } = parseAllowanceRangeNumbers(value);
      return isWithinOptionalRange(h, min, max);
    }
    case "weight": {
      const w = parseNumberOrNull(raw.weight);
      const { min, max } = parseAllowanceRangeNumbers(value);
      return isWithinOptionalRange(w, min, max);
    }
    case "age": {
      const age = parseNumberOrNull(raw.age);
      const { min, max } = parseAllowanceRangeNumbers(value);
      return isWithinOptionalRange(age, min, max);
    }
    // Legacy keys kept for backward compatibility with existing room snapshots.
    case "overallMin": {
      const min = parseNumberOrNull(value);
      const ovr = parseNumberOrNull(raw.overall);
      return min != null && ovr != null && ovr >= min;
    }
    case "overallMax": {
      const max = parseNumberOrNull(value);
      const ovr = parseNumberOrNull(raw.overall);
      return max != null && ovr != null && ovr <= max;
    }
    case "overallMaxMin": {
      const min = parseNumberOrNull(value);
      const ovrMax = parseNumberOrNull(raw.overall_max);
      return min != null && ovrMax != null && ovrMax >= min;
    }
    case "overallMaxMax": {
      const max = parseNumberOrNull(value);
      const ovrMax = parseNumberOrNull(raw.overall_max);
      return max != null && ovrMax != null && ovrMax <= max;
    }
    case "heightMin": {
      const min = parseNumberOrNull(value);
      const h = parseNumberOrNull(raw.height);
      return min != null && h != null && h >= min;
    }
    case "heightMax": {
      const max = parseNumberOrNull(value);
      const h = parseNumberOrNull(raw.height);
      return max != null && h != null && h <= max;
    }
    case "weightMin": {
      const min = parseNumberOrNull(value);
      const w = parseNumberOrNull(raw.weight);
      return min != null && w != null && w >= min;
    }
    case "weightMax": {
      const max = parseNumberOrNull(value);
      const w = parseNumberOrNull(raw.weight);
      return max != null && w != null && w <= max;
    }
    case "ageMin": {
      const min = parseNumberOrNull(value);
      const age = parseNumberOrNull(raw.age);
      return min != null && age != null && age >= min;
    }
    case "ageMax": {
      const max = parseNumberOrNull(value);
      const age = parseNumberOrNull(raw.age);
      return max != null && age != null && age <= max;
    }
    case "club": {
      const clubs = normalizeClubValue(value);
      if (!clubs.length) return false;
      return clubs.some((club) => matchesAnyIncludes(raw.club, club));
    }
    case "league": {
      const leagues = normalizeTextAllowanceListValue(value);
      if (!leagues.length) return false;
      return leagues.some((league) => matchesAnyEquals(raw.league, league));
    }
    case "nationality": {
      const nationalities = normalizeTextAllowanceListValue(value);
      if (!nationalities.length) return false;
      return nationalities.some((nation) => matchesAnyIncludes(raw.nationality, nation));
    }
    case "cardType":
      return matchesAnyEquals(raw.card_type, value);
    case "region":
      return matchesAnyIncludes(raw.region, value);
    case "foot":
      return matchesAnyEquals(raw.foot, value);
    case "playingStyle":
      return matchesAnyEquals(raw.playing_style, value);
    default:
      return false;
  }
}

function getAllowanceCapViolation(room, side, player) {
  const cfg = room?.config || defaultRoomConfig();
  const enabled = Array.isArray(cfg.allowanceEnabled) ? cfg.allowanceEnabled : [];
  const allowance = cfg.allowance || {};
  const caps = cfg.allowanceCaps || {};
  const sidePicks = Array.isArray(room?.picks?.[side]) ? room.picks[side] : [];

  for (const key of enabled) {
    if (key === "position") {
      const selected = normalizePositionValue(allowance.position || "");
      const effectivePositions = selected.length ? selected : POSITION_OPTIONS;
      const capMap = parsePositionCapMap(caps.position, effectivePositions);
      const playerPos = String(player?._raw?.position || "").trim().toUpperCase();
      if (!effectivePositions.includes(playerPos)) continue;
      const cap = Number(normalizeAllowanceCapValue(capMap[playerPos]));
      if (!Number.isFinite(cap) || cap <= 0) continue;
      const already = sidePicks.reduce((acc, p) => {
        const pos = String(p?._raw?.position || "").trim().toUpperCase();
        return acc + (pos === playerPos ? 1 : 0);
      }, 0);
      if (already + 1 > cap) {
        return { key, label: `Position ${playerPos}`, cap };
      }
      continue;
    }

    if (ALLOWANCE_RANGE_KEYS.has(key) || key === "foot") continue;
    if (TEXT_ALLOWANCE_LIST_KEYS.has(key)) {
      const values = normalizeTextAllowanceListValue(allowance[key] || "");
      if (!values.length) continue;
      const capMap = parseTextAllowanceCapMap(caps[key], values);
      const matchedValues = values.filter((valueItem) => {
        if (key === "club") return matchesAnyIncludes(player?._raw?.club, valueItem);
        if (key === "league") return matchesAnyEquals(player?._raw?.league, valueItem);
        return matchesAnyIncludes(player?._raw?.nationality, valueItem);
      });
      for (const valueItem of matchedValues) {
        const cap = Number(normalizeAllowanceCapValue(capMap[valueItem]));
        if (!Number.isFinite(cap) || cap <= 0) continue;
        const already = sidePicks.reduce((acc, p) => {
          if (key === "club") return acc + (matchesAnyIncludes(p?._raw?.club, valueItem) ? 1 : 0);
          if (key === "league") return acc + (matchesAnyEquals(p?._raw?.league, valueItem) ? 1 : 0);
          return acc + (matchesAnyIncludes(p?._raw?.nationality, valueItem) ? 1 : 0);
        }, 0);
        if (already + 1 > cap) {
          return { key, label: `${ALLOWANCE_DEF_MAP.get(key)?.label || key} ${valueItem}`, cap };
        }
      }
      continue;
    }
    const cap = Number(normalizeAllowanceCapValue(caps[key]));
    if (!Number.isFinite(cap) || cap <= 0) continue;
    const value = String(allowance[key] || "").trim();
    if (!value) continue;
    const already = sidePicks.reduce((acc, p) => acc + (playerMatchesAllowanceCategory(p, key, value) ? 1 : 0), 0);
    const addsOne = playerMatchesAllowanceCategory(player, key, value) ? 1 : 0;
    if (already + addsOne > cap) {
      const label = ALLOWANCE_DEF_MAP.get(key)?.label || key;
      return { key, label, cap };
    }
  }
  return null;
}

/** @type {{ phase: string, room: object | null, schedule: object[], mySide: string, search: string, position: string, players: object[], loadingPlayers: boolean, turnTimer: ReturnType<typeof setInterval> | null, presencePollId: ReturnType<typeof setInterval> | null, actionError: string }} */
const state = {
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
  openRevealModeMenu: false,
  opponentBanPlayers: [],
  loadingOpponentBanPlayers: false,
  opponentBanPlayersLoaded: false,
  opponentBanPlayersLoadSource: "",
  banSearch: "",
  banSort: "overall_max_desc",
  banFilterPositions: [],
  pendingBanPlayerId: "",
  banUiBound: false,
  draftGamePlans: [],
  draftGamePlanPlayers: [],
  draftGamePlanSelectedId: null,
  draftGamePlansLoading: false,
  draftGamePlanPlayersLoading: false,
  actionError: "",
};

function normalizeBanSortValue(raw) {
  const v = String(raw || "").trim();
  const ok = new Set([
    "overall_max_desc", "overall_max_asc",
    "overall_desc", "overall_asc",
    "name_desc", "name_asc",
    "position_desc", "position_asc",
    "height_desc", "height_asc",
    "weight_desc", "weight_asc",
    "age_desc", "age_asc",
  ]);
  return ok.has(v) ? v : "overall_max_desc";
}

function normalizeBanPositionValue(raw) {
  const v = String(raw || "").trim().toUpperCase();
  return POSITION_OPTIONS.includes(v) ? v : "";
}

function comparePlayersByBanSort(a, b, sortKey) {
  const sa = String(a?.name || "");
  const sb = String(b?.name || "");
  const key = String(sortKey || "overall_max_desc");
  const dir = key.endsWith("_asc") ? "asc" : "desc";
  const baseKey = key.replace(/_(asc|desc)$/, "");
  const overallMaxA = Number(getPlayerCardValue(a)) || 0;
  const overallMaxB = Number(getPlayerCardValue(b)) || 0;
  const overallA = Number(a?._raw?.overall ?? a?.overall_rating ?? 0) || 0;
  const overallB = Number(b?._raw?.overall ?? b?.overall_rating ?? 0) || 0;
  const posA = String(a?.position || "");
  const posB = String(b?.position || "");
  const heightA = Number(a?._raw?.height ?? 0) || 0;
  const heightB = Number(b?._raw?.height ?? 0) || 0;
  const weightA = Number(a?._raw?.weight ?? 0) || 0;
  const weightB = Number(b?._raw?.weight ?? 0) || 0;
  const ageA = Number(a?._raw?.age ?? 0) || 0;
  const ageB = Number(b?._raw?.age ?? 0) || 0;

  let cmp = 0;
  if (baseKey === "overall") cmp = overallA - overallB || sa.localeCompare(sb);
  else if (baseKey === "name") cmp = sb.localeCompare(sa) || overallMaxB - overallMaxA;
  else if (baseKey === "position") cmp = posA.localeCompare(posB) || overallMaxB - overallMaxA;
  else if (baseKey === "height") cmp = heightA - heightB || overallMaxB - overallMaxA;
  else if (baseKey === "weight") cmp = weightA - weightB || overallMaxB - overallMaxA;
  else if (baseKey === "age") cmp = ageA - ageB || overallMaxB - overallMaxA;
  else cmp = overallMaxA - overallMaxB || sa.localeCompare(sb);

  return dir === "asc" ? cmp : -cmp;
}

function getBanListPlayers() {
  const base = Array.isArray(state.opponentBanPlayers) ? state.opponentBanPlayers : [];
  const q = String(state.banSearch || "").trim().toLowerCase();
  const sortKey = normalizeBanSortValue(state.banSort);
  const selectedPositions = Array.isArray(state.banFilterPositions)
    ? state.banFilterPositions.map(normalizeBanPositionValue).filter(Boolean)
    : [];
  const posSet = new Set(selectedPositions);
  let rows = base;
  if (q) rows = rows.filter((p) => String(p?.name || "").toLowerCase().includes(q));
  if (posSet.size) rows = rows.filter((p) => posSet.has(String(p?.position || "").toUpperCase()));
  return [...rows].sort((a, b) => comparePlayersByBanSort(a, b, sortKey));
}

function imageOnlyThumbHtml(player, size = "md") {
  if (!player) return "";
  return `
    <div class="ban-phase-thumb ban-phase-thumb--${escapeHtml(size)}" data-player-id="${escapeHtml(player.id)}">
      <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
    </div>
  `;
}

let clubSearchDebounceTimer = null;
let readonlySettingsToastAt = 0;

function getUser() {
  try {
    return JSON.parse(localStorage.getItem("efb_user") || "null");
  } catch {
    return null;
  }
}

/** Stable id for signed-out users so server presence does not churn every request */
function getAnonId() {
  try {
    let id = sessionStorage.getItem("efb_room_anon_id");
    if (!id) {
      id = `anon-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
      sessionStorage.setItem("efb_room_anon_id", id);
    }
    return id;
  } catch {
    return `anon-${Date.now()}`;
  }
}

function getCurrentIdentity() {
  const user = getUser();
  if (user?.id) return { id: String(user.id), username: user.username || "User" };
  return { id: getAnonId(), username: state.mySide === "host" ? "Host" : "Guest" };
}

function defaultRoomConfig() {
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

function normalizeRoomConfig(raw) {
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

/** Merge server-reported host/guest/config/chat into local room. */
function applyPresenceSnapshot(sr) {
  if (!state.room || !sr) return;
  const room = state.room;
  // Ensure arrays exist to avoid render-time exceptions
  if (!room.bans) room.bans = { host: [], guest: [] };
  if (!room.picks) room.picks = { host: [], guest: [] };
  if (!Array.isArray(room.bannedPlayerIds)) room.bannedPlayerIds = [];
  if (!Array.isArray(room.pickedPlayerIds)) room.pickedPlayerIds = [];
  if (sr.host?.username) {
    room.host = { id: String(sr.host.id), username: sr.host.username };
  }
  if (sr.guest?.username) {
    room.guest = { id: String(sr.guest.id), username: sr.guest.username };
  } else {
    room.guest = null;
  }
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
      host: Array.isArray(sr.picks.host) ? sr.picks.host.map(normalizeDraftPlayer) : (room.picks?.host || []),
      guest: Array.isArray(sr.picks.guest) ? sr.picks.guest.map(normalizeDraftPlayer) : (room.picks?.guest || []),
    };
  }
  room.bannedPlayerIds = Array.isArray(sr.bannedPlayerIds) ? sr.bannedPlayerIds.map(String) : (room.bannedPlayerIds || []);
  room.pickedPlayerIds = Array.isArray(sr.pickedPlayerIds) ? sr.pickedPlayerIds.map(String) : (room.pickedPlayerIds || []);
  room.closed = Boolean(sr.closed);
  room.closeReason = sr.closeReason || "";
  state.lastRoomUpdatedAt = Number(sr.updatedAt || state.lastRoomUpdatedAt || Date.now());
}

function tryEnterDraftFromRoomSnapshot() {
  const room = state.room;
  if (!room || state.phase !== "lobby") return false;
  const status = String(room.status || "");
  if (!["drafting", "await-ready", "done"].includes(status)) return false;

  if (status === "done") {
    state.phase = "done";
    stopPresencePolling();
    showDone();
    return true;
  }

  const bansPerSide = Math.max(0, Math.floor(Number(room.config?.banCountPerSide) || 0));
  state.schedule = buildTurnSchedule(bansPerSide, FIXED_PICKS_PER_SIDE);
  syncCurrentTurnFromIndex(room);
  if (bansPerSide <= 0) {
    // No bans configured: start directly in pick phase.
    room.turnIndex = Math.max(0, state.schedule.findIndex((t) => t.action === "pick"));
    syncCurrentTurnFromIndex(room);
  }
  ensureDraftTimer(room);

  state.phase = status === "await-ready" ? "ready" : "draft";
  stopPresencePolling();
  showView("viewDraft");
  resetOpponentBanPlayers();
  void loadDraftGamePlans();
  renderDraftUi();
  attachDraftGridHandlers();
  void loadDraftPlayers();
  void loadOpponentBanPlayers();
  if (state.phase === "draft") {
    startTurnTimer();
  } else {
    state.presencePollId = setInterval(pollPresence, LOBBY_PRESENCE_POLL_MS);
  }
  return true;
}

function clearClubSearchState() {
  state.clubSearchQuery = "";
  state.clubSearchOptions = [];
  state.clubSearchOpen = false;
  state.clubSearchLoading = false;
  state.clubSearchActiveIndex = -1;
}

function addClubAllowanceValue(rawClub) {
  const typed = String(rawClub || "").replace(/\s+/g, " ").trim();
  if (!typed) return false;
  const clubs = normalizeClubValue(state.room?.config?.allowance?.club || "");
  if (clubs.some((club) => club.toLowerCase() === typed.toLowerCase())) {
    showToast("Club already added.");
    return false;
  }
  clubs.push(typed);
  state.room.config.allowance.club = clubs.join(",");
  state.room.config.allowanceCaps.club = stringifyClubCapMap(state.room.config.allowanceCaps.club, clubs);
  clearClubSearchState();
  return true;
}

function addTextAllowanceValue(key, rawValue) {
  const typed = String(rawValue || "").replace(/\s+/g, " ").trim();
  if (!typed || !TEXT_ALLOWANCE_LIST_KEYS.has(key)) return false;
  const values = normalizeTextAllowanceListValue(state.room?.config?.allowance?.[key] || "");
  if (values.some((v) => v.toLowerCase() === typed.toLowerCase())) {
    showToast(`${ALLOWANCE_DEF_MAP.get(key)?.label || key} already added.`);
    return false;
  }
  values.push(typed);
  state.room.config.allowance[key] = values.join(",");
  state.room.config.allowanceCaps[key] = stringifyTextAllowanceCapMap(state.room.config.allowanceCaps[key], values);
  clearClubSearchState();
  return true;
}

async function fetchClubSuggestions(query) {
  const key = String(state.clubSearchKey || "club").trim();
  const q = String(query || "").replace(/\s+/g, " ").trim();
  if (!q) {
    state.clubSearchOptions = [];
    state.clubSearchOpen = false;
    state.clubSearchLoading = false;
    state.clubSearchActiveIndex = -1;
    renderClubSuggestionPanel();
    return;
  }

  const reqSeq = ++state.clubSearchReqSeq;
  state.clubSearchLoading = true;
  state.clubSearchOpen = true;
  renderClubSuggestionPanel();

  try {
    const res = await fetch(`/api/players/distinct?field=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}`);
    const rows = res.ok ? await res.json() : [];
    if (reqSeq !== state.clubSearchReqSeq) return;
    const selected = normalizeTextAllowanceListValue(state.room?.config?.allowance?.[key] || "");
    const selectedSet = new Set(selected.map((v) => v.toLowerCase()));
    const options = dedupeCaseInsensitive(
      Array.isArray(rows)
        ? rows.map((row) => String(row || "").replace(/\s+/g, " ").trim()).filter(Boolean)
        : [],
    ).filter((v) => !selectedSet.has(v.toLowerCase()));
    state.clubSearchOptions = options.slice(0, 10);
    state.clubSearchLoading = false;
    state.clubSearchOpen = true;
    state.clubSearchActiveIndex = state.clubSearchOptions.length ? 0 : -1;
    renderClubSuggestionPanel();
  } catch {
    if (reqSeq !== state.clubSearchReqSeq) return;
    state.clubSearchOptions = [];
    state.clubSearchLoading = false;
    state.clubSearchOpen = true;
    state.clubSearchActiveIndex = -1;
    renderClubSuggestionPanel();
  }
}

function scheduleClubSuggestions(key, query) {
  clearTimeout(clubSearchDebounceTimer);
  state.clubSearchKey = String(key || "club");
  state.clubSearchQuery = String(query || "");
  if (!state.clubSearchQuery.trim()) {
    state.clubSearchOptions = [];
    state.clubSearchOpen = false;
    state.clubSearchLoading = false;
    state.clubSearchActiveIndex = -1;
    renderClubSuggestionPanel();
    return;
  }
  state.clubSearchLoading = true;
  state.clubSearchOpen = true;
  state.clubSearchActiveIndex = -1;
  renderClubSuggestionPanel();
  clubSearchDebounceTimer = setTimeout(() => {
    void fetchClubSuggestions(state.clubSearchQuery);
  }, 150);
}

function renderClubSuggestionPanel() {
  const key = String(state.clubSearchKey || "club").trim();
  const input = document.querySelector(`.allowance-club-search[data-allowance-club-search="${key}"]`);
  const panel = document.querySelector(`[data-allowance-club-suggest-panel="${key}"]`);
  if (!input || !panel) return;

  input.value = state.clubSearchQuery || "";
  panel.classList.toggle("is-open", Boolean(state.clubSearchOpen));
  if (!state.clubSearchOpen) {
    panel.innerHTML = "";
    return;
  }
  if (state.clubSearchLoading) {
    panel.innerHTML = '<div class="allowance-club-suggest-empty">Searching...</div>';
    return;
  }

  if (!state.clubSearchOptions.length) {
    const singularLabel = String(ALLOWANCE_DEF_MAP.get(key)?.label || key).toLowerCase();
    panel.innerHTML = state.clubSearchQuery.trim()
      ? `<div class="allowance-club-suggest-empty">No ${escapeHtml(singularLabel)} found.</div>`
      : "";
    return;
  }

  panel.innerHTML = state.clubSearchOptions.map((club, idx) => `
    <button
      type="button"
      class="allowance-club-suggest-option ${idx === state.clubSearchActiveIndex ? "is-active" : ""}"
      data-allowance-club-suggestion="${escapeHtml(club)}"
    >${escapeHtml(club)}</button>
  `).join("");
}

function showRoomClosed(message = "Room is closed.") {
  const view = document.getElementById("viewError");
  const msg = document.getElementById("errorMessage");
  const title = document.getElementById("errorTitle");
  const icon = document.getElementById("errorStateIcon");
  if (msg) msg.textContent = message;
  const btn = document.getElementById("errorLeaveBtn");
  if (btn) btn.textContent = "Back to home";
  if (title) title.hidden = false;
  if (icon) icon.hidden = false;
  if (title) title.textContent = "Room closed";
  if (view) {
    view.classList.remove("is-host-lock");
    view.classList.add("is-room-closed");
  }
  showView("viewError");
}

async function registerPresence() {
  const code = state.room?.code;
  if (!code) return;
  const user = getUser();
  const userId = user?.id ?? getAnonId();
  const username = user?.username ?? (state.mySide === "host" ? "You" : "Guest");
  const role = state.mySide === "host" ? "host" : "guest";
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/presence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, userId, username }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 410 && data.room) {
      applyPresenceSnapshot(data.room);
      if (state.room?.closed) showRoomClosed(state.room.closeReason || "Host closed the room.");
      stopPresencePolling();
      state.phase = "error";
      return;
    }
    if (res.status === 409 || res.status === 403) {
      const errorView = document.getElementById("viewError");
      const errorTitle = document.getElementById("errorTitle");
      const errorIcon = document.getElementById("errorStateIcon");
      const errorBtn = document.getElementById("errorLeaveBtn");
      if (errorView) {
        errorView.classList.remove("is-room-closed");
        errorView.classList.remove("is-access-denied");
      }
      const isHostLock = state.mySide === "host";
      if (errorView) {
        errorView.classList.toggle("is-host-lock", isHostLock);
        errorView.classList.toggle("is-access-denied", !isHostLock);
      }
      if (errorTitle) {
        errorTitle.hidden = false;
        errorTitle.textContent = isHostLock ? "Host slot unavailable" : "Access denied";
      }
      if (errorIcon) errorIcon.hidden = true;
      if (errorBtn) errorBtn.textContent = "Back to home";
      const msg = document.getElementById("errorMessage");
      if (msg) {
        msg.textContent = isHostLock
          ? "This room already has an active host."
          : (data.error || "You cannot join this room right now.");
      }
      showView("viewError");
      stopPresencePolling();
      state.phase = "error";
      return;
    }
    return;
  }
  if (data.room) applyPresenceSnapshot(data.room);
  return data.room || null;
}

async function fetchRoomSnapshot() {
  const code = state.room?.code;
  if (!code) return { changed: false };
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
  if (!res.ok) return { changed: false };
  const data = await res.json().catch(() => ({}));
  const room = data.room;
  if (!room) return { changed: false };
  const nextUpdatedAt = Number(room.updatedAt || 0);
  const changed = nextUpdatedAt > Number(state.lastRoomUpdatedAt || 0);
  if (changed || !state.room?.host || !state.room?.guest) {
    applyPresenceSnapshot(room);
  }
  return { changed: changed || !state.room };
}

async function leavePresence() {
  const code = state.room?.code;
  if (!code) return;
  const me = getCurrentIdentity();
  try {
    await fetch(`/api/rooms/${encodeURIComponent(code)}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId: me.id }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

function stopPresencePolling() {
  if (state.presencePollId) {
    clearInterval(state.presencePollId);
    state.presencePollId = null;
  }
}

async function pollPresence() {
  if (!state.room?.code) return;
  // Allow presence polling during lobby, ready, and draft so clients stay in sync
  if (state.phase !== "lobby" && state.phase !== "ready" && state.phase !== "draft") return;
  try {
    const prevUpdatedAt = Number(state.lastRoomUpdatedAt || 0);
    const prevHostId = String(state.room?.host?.id || "");
    const prevGuestId = String(state.room?.guest?.id || "");
    const prevGuestReady = Boolean(state.room?.ready?.guest);
    const prevClosed = Boolean(state.room?.closed);
    const prevChatLen = Array.isArray(state.room?.chat) ? state.room.chat.length : 0;

    await registerPresence(); // heartbeat
    const snap = await fetchRoomSnapshot();
    if (state.room?.closed) {
      stopPresencePolling();
      showRoomClosed(state.room.closeReason || "Host closed the room.");
      return;
    }
    const nextHostId = String(state.room?.host?.id || "");
    const nextGuestId = String(state.room?.guest?.id || "");
    const nextGuestReady = Boolean(state.room?.ready?.guest);
    const nextClosed = Boolean(state.room?.closed);
    const nextChatLen = Array.isArray(state.room?.chat) ? state.room.chat.length : 0;
    const nextUpdatedAt = Number(state.lastRoomUpdatedAt || 0);
    const presenceChanged =
      prevHostId !== nextHostId ||
      prevGuestId !== nextGuestId ||
      prevGuestReady !== nextGuestReady ||
      prevClosed !== nextClosed ||
      prevChatLen !== nextChatLen;
    const configChanged = nextUpdatedAt > prevUpdatedAt;

    if (state.phase === "lobby") {
      if (tryEnterDraftFromRoomSnapshot()) return;
      if (snap.changed || presenceChanged || configChanged) renderLobby();
      return;
    }

    if (String(state.room?.status || "") === "done" && isBothMatchReady()) {
      stopPresencePolling();
      state.phase = "done";
      showDone();
      return;
    }

    if (snap.changed || presenceChanged || configChanged) renderDraftUi();
  } catch {
    /* ignore */
  }
}

async function registerAndPollPresence() {
  try {
    const room = await registerPresence();
    if (!room) return;
    await fetchRoomSnapshot();
  } catch (e) {
    console.warn("Room presence register failed", e);
    return;
  }
  if (tryEnterDraftFromRoomSnapshot()) return;
  stopPresencePolling();
  state.presencePollId = setInterval(pollPresence, LOBBY_PRESENCE_POLL_MS);
  renderLobby();
}

function getRoomCodeFromUrl() {
  const path = window.location.pathname || "";
  const m = path.match(/\/room\/([^/]+)$/);
  if (m?.[1]) return decodeURIComponent(m[1]).toUpperCase();
  const q = new URLSearchParams(window.location.search);
  return (q.get("code") || "").toUpperCase();
}

function parseQuery() {
  const q = new URLSearchParams(window.location.search);
  return {
    mode: (q.get("mode") || "").toLowerCase(),
  };
}

function showToast(message, variant = "default") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("toast--warn");
  if (variant === "warn") el.classList.add("toast--warn");
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.classList.remove("show");
    el.classList.remove("toast--warn");
  }, 2400);
}

function askConfirm({ title = "Confirm", message = "Are you sure?", okText = "OK", cancelText = "Cancel" }) {
  const overlay = document.getElementById("confirmOverlay");
  const titleEl = document.getElementById("confirmTitle");
  const msgEl = document.getElementById("confirmMessage");
  const okBtn = document.getElementById("confirmOkBtn");
  const cancelBtn = document.getElementById("confirmCancelBtn");
  if (!overlay || !titleEl || !msgEl || !okBtn || !cancelBtn) {
    return Promise.resolve(window.confirm(message));
  }

  titleEl.textContent = title;
  msgEl.textContent = message;
  okBtn.textContent = okText;
  cancelBtn.textContent = cancelText;
  overlay.removeAttribute("hidden");

  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      overlay.setAttribute("hidden", "");
      overlay.removeEventListener("click", onBackdrop);
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKey);
      resolve(v);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onBackdrop = (e) => { if (e.target === overlay) finish(false); };
    const onKey = (e) => {
      if (e.key === "Escape") finish(false);
      if (e.key === "Enter") finish(true);
    };
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
    okBtn.focus();
  });
}

function showView(id) {
  ["viewError", "viewAbandoned", "viewLobby", "viewDraft", "viewDone"].forEach((vid) => {
    const el = document.getElementById(vid);
    if (!el) return;
    if (vid === id) {
      el.removeAttribute("hidden");
      el.classList.add("is-active");
    } else {
      el.setAttribute("hidden", "");
      el.classList.remove("is-active");
    }
  });
}

/**
 * Build alternating ban then pick turns (host starts each phase).
 * @param {number} bansPerSide
 * @param {number} picksPerSide
 */
function buildTurnSchedule(bansPerSide, picksPerSide) {
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

function emptyRoom(code, host, guest) {
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
    pickedPlayerIds: [],
    currentTurn: null,
  };
}

async function setGuestReady(ready) {
  if (!state.room?.code) return;
  const me = getCurrentIdentity();
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/ready`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId: me.id, ready: Boolean(ready) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || "Could not update ready.");
      return;
    }
    if (data.room) {
      applyPresenceSnapshot(data.room);
      renderLobby();
    }
  } catch {
    showToast("Could not update ready.");
  }
}

function isBothMatchReady(room = state.room) {
  return Boolean(room?.matchReady?.host) && Boolean(room?.matchReady?.guest);
}

function beginPostDraftReadyPhase(room = state.room) {
  if (!room) return;
  room.status = "await-ready";
  room.turnEndsAt = null;
  room.currentTurn = null;
  room.matchReady = defaultMatchReadyState();
  state.phase = "ready";
  clearTurnTimer();
  stopPresencePolling();
  state.presencePollId = setInterval(pollPresence, LOBBY_PRESENCE_POLL_MS);
}

async function setMatchReady(ready) {
  if (!state.room?.code) return;
  const me = getCurrentIdentity();
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/match-ready`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId: me.id, ready: Boolean(ready) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || "Could not update match ready.");
      return;
    }
    if (data.room) applyPresenceSnapshot(data.room);
    if (isBothMatchReady()) {
      stopPresencePolling();
      state.phase = "done";
      showDone();
      return;
    }
    renderDraftUi();
  } catch {
    showToast("Could not update match ready.");
  }
}

function syncCurrentTurnFromIndex(room) {
  const t = state.schedule[room.turnIndex];
  room.currentTurn = t || null;
}

function getTakenIds(room) {
  return new Set([...(room.bannedPlayerIds || []), ...(room.pickedPlayerIds || [])]);
}

function normalizeApiPlayer(p) {
  const ovr = p.overall_max ?? p.overall ?? "—";
  return {
    id: String(p.id),
    name: p.name,
    position: p.position || "—",
    overall_rating: ovr,
    nation: p.nationality || "—",
    speed: "—",
    finishing: "—",
    passing: "—",
    _raw: p,
  };
}

let searchDebounceTimer = null;

async function fetchPlayers() {
  const params = new URLSearchParams({ limit: "30", sortBy: "overall_max_desc" });
  if (state.search.trim()) params.set("q", state.search.trim());
  if (state.position) params.set("position", state.position);
  const cfg = state.room?.config || defaultRoomConfig();
  const a = cfg.allowance || {};
  const enabled = new Set(cfg.allowanceEnabled || []);
  if (!cfg.allowAllPlayers) {
    if (enabled.has("position") && a.position) params.set("positions", a.position);
    if (enabled.has("overallMin") && a.overallMin) params.set("overallMin", a.overallMin);
    if (enabled.has("overallMax") && a.overallMax) params.set("overallMax", a.overallMax);
    if (enabled.has("overallMaxMin") && a.overallMaxMin) params.set("maxOverallMin", a.overallMaxMin);
    if (enabled.has("overallMaxMax") && a.overallMaxMax) params.set("maxOverallMax", a.overallMaxMax);
    if (enabled.has("club") && a.club) {
      const clubs = normalizeClubValue(a.club);
      if (clubs.length === 1) params.set("club", clubs[0]);
    }
    if (enabled.has("league") && a.league) params.set("league", a.league);
    if (enabled.has("nationality") && a.nationality) params.set("nationality", a.nationality);
    if (enabled.has("heightMin") && a.heightMin) params.set("heightMin", a.heightMin);
    if (enabled.has("heightMax") && a.heightMax) params.set("heightMax", a.heightMax);
    if (enabled.has("weightMin") && a.weightMin) params.set("weightMin", a.weightMin);
    if (enabled.has("weightMax") && a.weightMax) params.set("weightMax", a.weightMax);
    if (enabled.has("ageMin") && a.ageMin) params.set("ageMin", a.ageMin);
    if (enabled.has("ageMax") && a.ageMax) params.set("ageMax", a.ageMax);
    if (enabled.has("cardType") && a.cardType) params.set("cardType", a.cardType);
    if (enabled.has("foot") && a.foot) params.set("foot", a.foot);
    if (enabled.has("playingStyle") && a.playingStyle) params.set("playingStyle", a.playingStyle);
  }
  const res = await fetch(`/api/players?${params}`);
  if (!res.ok) throw new Error("Players unavailable");
  const data = await res.json();
  let rows = data.players || [];
  if (!cfg.allowAllPlayers && enabled.has("club") && a.club) {
    rows = rows.filter((p) => playerMatchesAllowanceCategory({ _raw: p }, "club", a.club));
  }
  if (!cfg.allowAllPlayers && enabled.has("region") && a.region) {
    const regionQ = String(a.region).toLowerCase();
    rows = rows.filter((p) => String(p.region || "").toLowerCase().includes(regionQ));
  }
  return rows.map(normalizeApiPlayer);
}

function applyLocalAction(room, player) {
  const turn = state.schedule[room.turnIndex];
  if (!turn) return false;

  const id = String(player.id);
  if (room.bannedPlayerIds.includes(id) || room.pickedPlayerIds.includes(id)) return false;

  if (turn.action === "pick") {
    const mySide = state.mySide;
    const violation = getAllowanceCapViolation(room, mySide, player);
    if (violation) {
      state.actionError = `${violation.label}: max ${violation.cap} card(s) allowed per side.`;
      showToast(state.actionError);
      return false;
    }
  }

  if (turn.action === "ban") {
    const cfg = room.config || defaultRoomConfig();
    const maxBans = Math.max(0, Math.floor(Number(cfg.banCountPerSide) || 0));
    const mySide = state.mySide;
    if (!mySide) return false;
    const myBans = room.bans?.[mySide] || [];
    if (maxBans && myBans.length >= maxBans) {
      showToast("You already used all bans for your side.");
      return false;
    }
    room.bans[mySide].push(player);
    room.bannedPlayerIds.push(id);
  } else {
    const mySide = state.mySide;
    if (!mySide) return false;
    room.picks[mySide].push(player);
    room.pickedPlayerIds.push(id);
  }
  if (turn.action === "ban") {
    maybeAutoAdvanceFromBan(room);
  }
  return true;
}

function clearTurnTimer() {
  if (state.turnTimer) {
    clearInterval(state.turnTimer);
    state.turnTimer = null;
  }
}

function startTurnTimer() {
  clearTurnTimer();
  const tick = () => {
    const room = state.room;
    if (!room?.turnEndsAt || state.phase !== "draft") return;

    const left = Math.max(0, Math.ceil((room.turnEndsAt - Date.now()) / 1000));
    const el = document.getElementById("timerInner");
    const ring = document.getElementById("timerRing");
    if (el) {
      el.textContent = String(left);
      el.style.color = left <= 5 ? RED : "#fff";
    }
    if (ring) {
      const durationSec = getTurnDurationSec(state.schedule[room.turnIndex], room.config);
      const pct = Math.min(1, left / durationSec);
      const deg = pct * 360;
      const color = left <= 5 ? RED : GREEN;
      ring.classList.toggle("is-low", left <= 5);
      ring.style.background = `conic-gradient(${color} ${deg}deg, #1a1a2a 0deg)`;
    }

    if (left <= 0) {
      clearTurnTimer();
      const r = state.room;
      if (!r) return;
      const stage = getDraftStage(r);
      if (stage === "ban") {
        advanceDraftStage(r, "pick");
        renderDraftUi();
        return;
      }
      if (stage === "pick") {
        beginPostDraftReadyPhase(r);
        renderDraftUi();
        return;
      }
    }
  };
  tick();
  state.turnTimer = setInterval(tick, 250);
}

/* ── Render lobby ─────────────────────────────────────────── */
function renderLobby() {
  const room = state.room;
  const isHost = state.mySide === "host";
  const cfg = room.config || defaultRoomConfig();
  const allowance = cfg.allowance || {};
  const allowanceEnabled = Array.isArray(cfg.allowanceEnabled) ? cfg.allowanceEnabled : [];

  document.getElementById("lobbyCodeDisplay").textContent = room.code;
  document.getElementById("lobbyHostName").textContent = room.host?.username || "—";
  document.getElementById("lobbyGuestName").textContent = room.guest?.username || "Waiting…";

  const hostSlot = document.getElementById("lobbyHostSlot");
  const guestSlot = document.getElementById("lobbyGuestSlot");
  hostSlot.classList.toggle("is-ready", !!room.host);
  guestSlot.classList.toggle("is-ready", !!room.guest);

  document.getElementById("lobbyGuestStatus").textContent = room.guest ? "● Connected" : "";
  if (room.guest && room.ready?.guest) {
    document.getElementById("lobbyGuestStatus").textContent = "● Ready";
  }
  document.getElementById("lobbyGuestStatus").classList.toggle("player-slot-status--ok", !!room.guest);

  const hint = document.getElementById("lobbyHint");
  if (isHost) {
    hint.textContent = "Share code, agree settings in chat, then start.";
  } else {
    hint.textContent = "Waiting for host to finalize rules and start…";
  }

  const allowAllEl = document.getElementById("allowAllPlayersInput");
  const bansEl = document.getElementById("lobbyBansInput");
  const banDurationEl = document.getElementById("lobbyBanDurationInput");
  const pickDurationEl = document.getElementById("lobbyPickDurationInput");
  const revealModeEl = document.getElementById("lobbyRevealModeInput");
  const revealModeTrigger = document.getElementById("lobbyRevealModeTrigger");
  const revealModePanel = document.getElementById("lobbyRevealModePanel");
  const revealModeLabel = document.getElementById("lobbyRevealModeLabel");
  if (!isHost) state.openRevealModeMenu = false;
  if (allowAllEl && !allowAllEl.dataset.touched) allowAllEl.checked = Boolean(cfg.allowAllPlayers);
  if (bansEl && !bansEl.dataset.touched) bansEl.value = String(cfg.banCountPerSide ?? 0);
  if (banDurationEl && !banDurationEl.dataset.touched) banDurationEl.value = String(normalizeBanDurationSec(cfg.banDurationSec));
  if (pickDurationEl && !pickDurationEl.dataset.touched) pickDurationEl.value = String(normalizePickDurationSec(cfg.pickDurationSec));
  if (revealModeEl && !revealModeEl.dataset.touched) revealModeEl.value = normalizeRevealMode(cfg.revealMode);
  const revealModeValue = normalizeRevealMode(revealModeEl?.value || cfg.revealMode);
  if (revealModeLabel) {
    revealModeLabel.textContent = revealModeValue === REVEAL_MODE_HIDDEN
      ? "Hide picks, reveal squad later"
      : "Show picks after each turn";
  }
  if (revealModePanel) {
    revealModePanel.querySelectorAll("[data-lobby-reveal-mode-option]").forEach((opt) => {
      const mode = String(opt.dataset.lobbyRevealModeOption || "").trim();
      opt.classList.toggle("is-selected", mode === revealModeValue);
    });
    revealModePanel.classList.toggle("is-open", Boolean(state.openRevealModeMenu));
  }
  if (revealModeTrigger) {
    revealModeTrigger.disabled = !isHost;
    revealModeTrigger.title = isHost ? "" : "Only the host can change Mode";
    revealModeTrigger.classList.toggle("open", Boolean(state.openRevealModeMenu));
    revealModeTrigger.setAttribute("aria-expanded", String(Boolean(state.openRevealModeMenu)));
  }

  const meta = document.getElementById("lobbyMeta");
  if (meta) {
    meta.textContent = "";
    meta.hidden = true;
  }

  const startBtn = document.getElementById("startDraftBtn");
  const lobbyLeaveBtn = document.getElementById("lobbyLeaveBtn");
  const kickGuestBtn = document.getElementById("kickGuestBtn");
  const settings = document.getElementById("lobbySettings");
  const settingsPanel = document.querySelector(".prep-col--settings");
  const guestReady = Boolean(room.ready?.guest);
  if (settingsPanel) settingsPanel.classList.toggle("is-readonly", !isHost);

  if (isHost) {
    if (lobbyLeaveBtn) {
      lobbyLeaveBtn.textContent = "Close room";
      lobbyLeaveBtn.classList.add("is-close-room");
    }
    startBtn.hidden = false;
    settings.hidden = false;

    const canStart = room.guest && guestReady;
    startBtn.disabled = !canStart;
    startBtn.textContent = !room.guest
      ? "Waiting for opponent…"
      : !guestReady
        ? "Waiting for opponent ready…"
        : "START DRAFT";
    startBtn.classList.toggle("btn--primary", canStart);
    startBtn.classList.toggle("btn--ghost", !canStart);
    if (kickGuestBtn) {
      const showKick = Boolean(room.guest);
      kickGuestBtn.hidden = !showKick;
      kickGuestBtn.disabled = !showKick;
      kickGuestBtn.style.display = showKick ? "inline-flex" : "none";
    }
  } else {
    if (lobbyLeaveBtn) {
      lobbyLeaveBtn.textContent = "Leave";
      lobbyLeaveBtn.classList.remove("is-close-room");
    }
    startBtn.hidden = false;
    startBtn.disabled = !room.host || !room.guest;
    startBtn.textContent = guestReady ? "UNREADY" : "READY";
    startBtn.classList.add("btn--primary");
    startBtn.classList.remove("btn--ghost");
    settings.hidden = false;
    if (kickGuestBtn) {
      kickGuestBtn.hidden = true;
      kickGuestBtn.disabled = true;
      kickGuestBtn.style.display = "none";
    }
  }

  if (allowAllEl) allowAllEl.disabled = !isHost;
  if (bansEl) bansEl.disabled = !isHost;
  if (banDurationEl) banDurationEl.disabled = !isHost;
  if (pickDurationEl) pickDurationEl.disabled = !isHost;
  if (revealModeTrigger) revealModeTrigger.disabled = !isHost;
  if (!isHost) state.openRevealModeMenu = false;
  renderAllowanceList({ isHost, cfg });

  const chatInput = document.getElementById("chatInput");
  const chatFormBtn = document.querySelector("#chatForm button[type='submit']");
  const canChat = Boolean(room.host && room.guest);
  if (chatInput) chatInput.disabled = !canChat;
  if (chatFormBtn) chatFormBtn.disabled = !canChat;
  if (chatInput && !canChat) {
    chatInput.placeholder = "Chat unlocks when both users are connected...";
  }

  renderClubSuggestionPanel();
  renderLobbyChat();
}

function renderAllowanceList({ isHost, cfg }) {
  const dropdown = document.getElementById("allowanceCategoryDd");
  const trigger = document.getElementById("allowanceCategoryTrigger");
  const label = document.getElementById("allowanceCategoryLabel");
  const panel = document.getElementById("allowanceCategoryPanel");
  const addBtn = document.getElementById("addAllowanceBtn");
  const list = document.getElementById("allowanceList");
  const controls = document.getElementById("allowanceControls");
  if (!dropdown || !trigger || !label || !panel || !addBtn || !list || !controls) return;

  const enabled = Array.isArray(cfg.allowanceEnabled) ? cfg.allowanceEnabled : [];
  const enabledSet = new Set(enabled);
  const canEdit = isHost && !cfg.allowAllPlayers;
  controls.classList.toggle("is-disabled", !canEdit);

  if (!canEdit) {
    state.openAllowancePosKey = "";
    state.openAllowancePosCapKey = "";
    state.openAllowancePosScrollTop = 0;
    state.openAllowanceCardTypeCapKey = "";
    state.openAllowanceRegionCapKey = "";
    state.openAllowancePlayingStyleCapKey = "";
  } else if (state.openAllowancePosKey && !enabledSet.has(state.openAllowancePosKey)) {
    state.openAllowancePosKey = "";
    state.openAllowancePosCapKey = "";
    state.openAllowancePosScrollTop = 0;
    if (state.openAllowancePosKey === "cardType") state.openAllowanceCardTypeCapKey = "";
    if (state.openAllowancePosKey === "region") state.openAllowanceRegionCapKey = "";
    if (state.openAllowancePosKey === "playingStyle") state.openAllowancePlayingStyleCapKey = "";
  }

  const openPosKey = state.openAllowancePosKey;
  const openPosScrollTop = state.openAllowancePosScrollTop;
  if (openPosKey) {
    const existingOpenDropdown = document.querySelector(`[data-allowance-pos-dropdown][data-allowance-pos-key="${openPosKey}"] .allowance-pos-panel`);
    if (existingOpenDropdown) {
      state.openAllowancePosScrollTop = existingOpenDropdown.scrollTop;
    }
  }

  if (!canEdit) {
    panel.classList.remove("is-open");
    trigger.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  }

  const selectedKey = dropdown.dataset.selectedKey || "";
  addBtn.disabled = !canEdit || !selectedKey;

  const available = ALLOWANCE_CATEGORY_DEFS
    .filter((d) => !enabledSet.has(d.key))
    .sort((a, b) => a.label.localeCompare(b.label));
  const nextSelected = available.some((d) => d.key === selectedKey) ? selectedKey : "";

  dropdown.dataset.selectedKey = nextSelected;
  trigger.disabled = !canEdit || !available.length;
  trigger.classList.toggle("is-placeholder", !nextSelected);
  trigger.classList.toggle("open", panel.classList.contains("is-open"));
  label.textContent = available.find((d) => d.key === nextSelected)?.label || (available.length ? "Choose a category" : "All categories added");

  panel.innerHTML = available.length
    ? available.map((d) => `
      <button type="button" class="allowance-category-option ${d.key === nextSelected ? "is-selected" : ""}" data-allowance-category-option="${d.key}" ${canEdit ? "" : "disabled"}>
        <span>${escapeHtml(d.label)}</span>
        <span class="allowance-category-check" aria-hidden="true">✓</span>
      </button>
    `).join("")
    : '<div class="allowance-category-option is-selected" role="presentation"><span>All categories added</span></div>';

  panel.classList.toggle("is-disabled", !canEdit);

  if (!enabled.length) {
    list.innerHTML = '<div class="allowance-empty">No categories added. All players are allowed.</div>';
    return;
  }

  list.innerHTML = enabled.map((key) => {
    const def = ALLOWANCE_DEF_MAP.get(key);
    if (!def) return "";
    const value = cfg.allowance?.[key] ?? "";
    const capValue = normalizeAllowanceCapValue(cfg.allowanceCaps?.[key]);
    const isPosition = key === "position";
    const isFoot = key === "foot";
    const isCardType = key === "cardType";
    const isRegion = key === "region";
    const isPlayingStyle = key === "playingStyle";
    const isTextList = TEXT_ALLOWANCE_LIST_KEYS.has(key);
    const isMultiSelect = isPosition || isFoot || isCardType || isRegion || isPlayingStyle;
    const isRange = def.type === "range";
    const showCap = !isRange && !isFoot && !isCardType && !isRegion && !isPlayingStyle && !isTextList;
    
    const selectedPositions = normalizePositionValue(value);
    const effectivePositions = selectedPositions.length ? selectedPositions : POSITION_OPTIONS;
    const selectedSet = new Set(selectedPositions);
    const positionCapMap = parsePositionCapMap(cfg.allowanceCaps?.position, effectivePositions);
    
    const selectedCardTypes = normalizeCardTypeValue(value);
    const selectedCardTypeSet = new Set(selectedCardTypes);
    
    const selectedRegions = normalizeRegionValue(value);
    const selectedRegionSet = new Set(selectedRegions);
    
    const selectedPlayingStyles = normalizePlayingStyleValue(value);
    const selectedPlayingStyleSet = new Set(selectedPlayingStyles);
    
    const positionSelectHtml = `
      <div class="allowance-pos-dropdown ${canEdit ? "" : "is-disabled"} ${canEdit && state.openAllowancePosKey === key ? "is-open" : ""}" data-allowance-pos-dropdown data-allowance-pos-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-pos-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(selectedPositions.join(","))}"
        />
        <button
          type="button"
          class="allowance-pos-trigger"
          data-allowance-pos-trigger
          ${canEdit ? "" : "disabled"}
        >
          <span class="allowance-pos-summary">${escapeHtml(positionSummaryText(selectedPositions))}</span>
          <span class="allowance-pos-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-pos-panel" data-allowance-pos-panel>
          ${POSITION_OPTIONS.map((pos) => `
            <button
              type="button"
              class="allowance-pos-option ${selectedSet.has(pos) ? "is-selected" : ""}"
              data-allowance-pos-option="${pos}"
            >
              <span class="allowance-pos-check" aria-hidden="true"></span>
              <span>${pos}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
    
    const cardTypeSelectHtml = `
      <div class="allowance-multi-dropdown ${canEdit ? "" : "is-disabled"} ${canEdit && state.openAllowanceCardTypeKey === key ? "is-open" : ""}" data-allowance-multi-dropdown="cardType" data-allowance-multi-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-multi-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(selectedCardTypes.join(","))}"
        />
        <button
          type="button"
          class="allowance-multi-trigger"
          data-allowance-multi-trigger="cardType"
          ${canEdit ? "" : "disabled"}
        >
          <span class="allowance-multi-summary">${escapeHtml(cardTypeSummaryText(selectedCardTypes))}</span>
          <span class="allowance-multi-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-multi-panel allowance-multi-panel--single-column" data-allowance-multi-panel="cardType">
          ${CARD_TYPE_OPTIONS.map((ct) => `
            <button
              type="button"
              class="allowance-multi-option ${selectedCardTypeSet.has(ct) ? "is-selected" : ""}"
              data-allowance-multi-option="cardType"
              data-allowance-multi-value="${escapeHtml(ct)}"
            >
              <span class="allowance-multi-check" aria-hidden="true"></span>
              <span>${escapeHtml(ct)}</span>
            </button>
          `).join("")}
          ${CARD_TYPE_OPTIONS.length === 0 ? '<div class="allowance-multi-empty">No options available</div>' : ''}
        </div>
      </div>
    `;
    
    const regionSelectHtml = `
      <div class="allowance-multi-dropdown ${canEdit ? "" : "is-disabled"} ${canEdit && state.openAllowanceRegionKey === key ? "is-open" : ""}" data-allowance-multi-dropdown="region" data-allowance-multi-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-multi-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(selectedRegions.join(","))}"
        />
        <button
          type="button"
          class="allowance-multi-trigger"
          data-allowance-multi-trigger="region"
          ${canEdit ? "" : "disabled"}
        >
          <span class="allowance-multi-summary">${escapeHtml(regionSummaryText(selectedRegions))}</span>
          <span class="allowance-multi-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-multi-panel" data-allowance-multi-panel="region">
          ${REGION_OPTIONS.map((r) => `
            <button
              type="button"
              class="allowance-multi-option ${selectedRegionSet.has(r) ? "is-selected" : ""}"
              data-allowance-multi-option="region"
              data-allowance-multi-value="${escapeHtml(r)}"
            >
              <span class="allowance-multi-check" aria-hidden="true"></span>
              <span>${escapeHtml(r)}</span>
            </button>
          `).join("")}
          ${REGION_OPTIONS.length === 0 ? '<div class="allowance-multi-empty">No options available</div>' : ''}
        </div>
      </div>
    `;
    
    const playingStyleSelectHtml = `
      <div class="allowance-multi-dropdown ${canEdit ? "" : "is-disabled"} ${canEdit && state.openAllowancePlayingStyleKey === key ? "is-open" : ""}" data-allowance-multi-dropdown="playingStyle" data-allowance-multi-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-multi-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(selectedPlayingStyles.join(","))}"
        />
        <button
          type="button"
          class="allowance-multi-trigger"
          data-allowance-multi-trigger="playingStyle"
          ${canEdit ? "" : "disabled"}
        >
          <span class="allowance-multi-summary">${escapeHtml(playingStyleSummaryText(selectedPlayingStyles))}</span>
          <span class="allowance-multi-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-multi-panel" data-allowance-multi-panel="playingStyle">
          ${PLAYING_STYLE_OPTIONS.map((ps) => `
            <button
              type="button"
              class="allowance-multi-option ${selectedPlayingStyleSet.has(ps) ? "is-selected" : ""}"
              data-allowance-multi-option="playingStyle"
              data-allowance-multi-value="${escapeHtml(ps)}"
            >
              <span class="allowance-multi-check" aria-hidden="true"></span>
              <span>${escapeHtml(ps)}</span>
            </button>
          `).join("")}
          ${PLAYING_STYLE_OPTIONS.length === 0 ? '<div class="allowance-multi-empty">No options available</div>' : ''}
        </div>
      </div>
    `;
    
    const regularInputHtml = `
      <input
        class="allowance-item-input"
        data-allowance-key="${key}"
        type="${def.type}"
        placeholder="${escapeHtml(def.placeholder)}"
        value="${escapeHtml(value)}"
        ${canEdit ? "" : "disabled"}
      />
    `;
    const selectedFoot = normalizeFootValue(value, { defaultAll: true });
    const selectedFootSet = new Set(selectedFoot);
    const footChecklistHtml = `
      <div class="allowance-foot-list" data-allowance-foot-list data-allowance-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-foot-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(selectedFoot.join(","))}"
        />
        ${FOOT_OPTIONS.map((foot) => `
          <button
            type="button"
            class="allowance-foot-option ${selectedFootSet.has(foot) ? "is-selected" : ""}"
            data-allowance-foot-option="${foot}"
            ${canEdit ? "" : "disabled"}
          >
            <span class="allowance-foot-check" aria-hidden="true"></span>
            <span>${foot}</span>
          </button>
        `).join("")}
      </div>
    `;
    const rangeValue = parseAllowanceRangeValue(value);
    const rangeInputHtml = `
      <div class="allowance-item-range-grid">
        <label class="allowance-item-range-col">
          <span class="allowance-item-range-label">Min</span>
          <input
            class="allowance-item-input allowance-item-range"
            data-allowance-key="${key}"
            data-allowance-range-bound="min"
            type="number"
            inputmode="numeric"
            step="1"
            placeholder="${escapeHtml(def.minPlaceholder || "-")}" 
            value="${escapeHtml(rangeValue.min)}"
            ${canEdit ? "" : "disabled"}
          />
        </label>
        <label class="allowance-item-range-col">
          <span class="allowance-item-range-label">Max</span>
          <input
            class="allowance-item-input allowance-item-range"
            data-allowance-key="${key}"
            data-allowance-range-bound="max"
            type="number"
            inputmode="numeric"
            step="1"
            placeholder="${escapeHtml(def.maxPlaceholder || "-")}" 
            value="${escapeHtml(rangeValue.max)}"
            ${canEdit ? "" : "disabled"}
          />
        </label>
      </div>
    `;
    const positionCapHtml = `
      <div class="allowance-pos-cap-wrap ${canEdit ? "" : "is-disabled"} ${canEdit && state.openAllowancePosCapKey === key ? "is-open" : ""}" data-allowance-pos-cap-wrap data-allowance-pos-cap-key="${key}">
        <span class="allowance-cap-label">Max cards</span>
        <button
          type="button"
          class="allowance-pos-cap-trigger"
          data-allowance-pos-cap-trigger
          ${canEdit ? "" : "disabled"}
        >
          <span class="allowance-pos-cap-summary">${escapeHtml(positionCapSummaryText(positionCapMap, selectedPositions))}</span>
          <span class="allowance-pos-cap-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-pos-cap-panel" data-allowance-pos-cap-panel>
          ${effectivePositions.length
            ? effectivePositions.map((pos) => `
              <label class="allowance-pos-cap-row">
                <span class="allowance-pos-cap-pos">${pos}</span>
                <input
                  class="allowance-pos-cap-input"
                  data-allowance-pos-cap-input
                  data-allowance-cap-key="position"
                  data-allowance-pos="${pos}"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="23"
                  step="1"
                  value="${escapeHtml(positionCapMap[pos] || "")}"
                  placeholder="-"
                  ${canEdit ? "" : "disabled"}
                />
              </label>
            `).join("")
            : '<div class="allowance-pos-cap-empty">No positions available</div>'}
        </div>
      </div>
    `;
    
    const cardTypeCapMap = parseCardTypeCapMap(cfg.allowanceCaps?.cardType, selectedCardTypes);
    const effectiveCardTypes = selectedCardTypes.length ? selectedCardTypes : CARD_TYPE_OPTIONS;
    const cardTypeCapHtml = `
      <div class="allowance-cap-wrap ${canEdit ? "" : "is-disabled"} ${canEdit && state.openAllowanceCardTypeCapKey === key ? "is-open" : ""}" data-allowance-cap-wrap data-allowance-cap-key="${key}">
        <span class="allowance-cap-label">Max cards</span>
        <button
          type="button"
          class="allowance-cap-trigger"
          data-allowance-cap-trigger="cardType"
          ${canEdit ? "" : "disabled"}
        >
          <span class="allowance-cap-summary">${escapeHtml(cardTypeCapSummaryText(cardTypeCapMap, selectedCardTypes))}</span>
          <span class="allowance-cap-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-cap-panel" data-allowance-cap-panel>
          ${effectiveCardTypes.length
            ? effectiveCardTypes.map((ct) => `
              <label class="allowance-cap-row">
                <span class="allowance-cap-item">${escapeHtml(ct)}</span>
                <input
                  class="allowance-cap-input"
                  data-allowance-cap-input
                  data-allowance-cap-key="cardType"
                  data-allowance-cap-value="${escapeHtml(ct)}"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="23"
                  step="1"
                  value="${escapeHtml(cardTypeCapMap[ct] || "")}"
                  placeholder="-"
                  ${canEdit ? "" : "disabled"}
                />
              </label>
            `).join("")
            : '<div class="allowance-cap-empty">No card types available</div>'}
        </div>
      </div>
    `;
    
    const regionCapMap = parseRegionCapMap(cfg.allowanceCaps?.region, selectedRegions);
    const effectiveRegions = selectedRegions.length ? selectedRegions : REGION_OPTIONS;
    const regionCapHtml = `
      <div class="allowance-cap-wrap allowance-cap-wrap--region ${canEdit ? "" : "is-disabled"} ${canEdit && state.openAllowanceRegionCapKey === key ? "is-open" : ""}" data-allowance-cap-wrap data-allowance-cap-key="${key}">
        <span class="allowance-cap-label">Max cards</span>
        <button
          type="button"
          class="allowance-cap-trigger"
          data-allowance-cap-trigger="region"
          ${canEdit ? "" : "disabled"}
        >
          <span class="allowance-cap-summary">${escapeHtml(regionCapSummaryText(regionCapMap, selectedRegions))}</span>
          <span class="allowance-cap-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-cap-panel" data-allowance-cap-panel>
          ${effectiveRegions.length
            ? effectiveRegions.map((r) => `
              <label class="allowance-cap-row">
                <span class="allowance-cap-item">${escapeHtml(r)}</span>
                <input
                  class="allowance-cap-input"
                  data-allowance-cap-input
                  data-allowance-cap-key="region"
                  data-allowance-cap-value="${escapeHtml(r)}"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="23"
                  step="1"
                  value="${escapeHtml(regionCapMap[r] || "")}"
                  placeholder="-"
                  ${canEdit ? "" : "disabled"}
                />
              </label>
            `).join("")
            : '<div class="allowance-cap-empty">No regions available</div>'}
        </div>
      </div>
    `;
    
    const playingStyleCapMap = parsePlayingStyleCapMap(cfg.allowanceCaps?.playingStyle, selectedPlayingStyles);
    const effectivePlayingStyles = selectedPlayingStyles.length ? selectedPlayingStyles : PLAYING_STYLE_OPTIONS;
    const playingStyleCapHtml = `
      <div class="allowance-cap-wrap allowance-cap-wrap--playing-style ${canEdit ? "" : "is-disabled"} ${canEdit && state.openAllowancePlayingStyleCapKey === key ? "is-open" : ""}" data-allowance-cap-wrap data-allowance-cap-key="${key}">
        <span class="allowance-cap-label">Max cards</span>
        <button
          type="button"
          class="allowance-cap-trigger"
          data-allowance-cap-trigger="playingStyle"
          ${canEdit ? "" : "disabled"}
        >
          <span class="allowance-cap-summary">${escapeHtml(playingStyleCapSummaryText(playingStyleCapMap, selectedPlayingStyles))}</span>
          <span class="allowance-cap-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-cap-panel" data-allowance-cap-panel>
          ${effectivePlayingStyles.length
            ? effectivePlayingStyles.map((ps) => `
              <label class="allowance-cap-row">
                <span class="allowance-cap-item">${escapeHtml(ps)}</span>
                <input
                  class="allowance-cap-input"
                  data-allowance-cap-input
                  data-allowance-cap-key="playingStyle"
                  data-allowance-cap-value="${escapeHtml(ps)}"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="23"
                  step="1"
                  value="${escapeHtml(playingStyleCapMap[ps] || "")}"
                  placeholder="-"
                  ${canEdit ? "" : "disabled"}
                />
              </label>
            `).join("")
            : '<div class="allowance-cap-empty">No playing styles available</div>'}
        </div>
      </div>
    `;

    const selectedClubs = normalizeTextAllowanceListValue(value);
    const clubCapMap = parseTextAllowanceCapMap(cfg.allowanceCaps?.[key], selectedClubs);
    const effectiveClubs = selectedClubs.length ? selectedClubs : Object.keys(clubCapMap);
    const clubCapMapString = stringifyTextAllowanceCapMap(clubCapMap, effectiveClubs);
    const singularLabel = String(def.label || key).toLowerCase();
    const isSearchActiveForKey = state.clubSearchKey === key;
    const clubBuilderHtml = `
      <div class="allowance-club-builder" data-allowance-club-builder data-allowance-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-club-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(effectiveClubs.join(","))}"
        />
        <input
          type="hidden"
          class="allowance-club-cap-hidden"
          data-allowance-cap-key="${key}"
          value="${escapeHtml(clubCapMapString)}"
        />
        <div class="allowance-club-add-row">
          <div class="allowance-club-search-wrap" data-allowance-club-search-wrap>
            <input
              class="allowance-item-input allowance-club-search"
              data-allowance-club-search="${key}"
              type="text"
              placeholder="Search ${escapeHtml(singularLabel)} and add"
              value="${escapeHtml(isSearchActiveForKey ? (state.clubSearchQuery || "") : "")}"
              autocomplete="off"
              ${canEdit ? "" : "disabled"}
            />
            <div class="allowance-club-suggest-panel ${isSearchActiveForKey && state.clubSearchOpen ? "is-open" : ""}" data-allowance-club-suggest-panel="${key}">
              ${isSearchActiveForKey && state.clubSearchLoading
                ? '<div class="allowance-club-suggest-empty">Searching...</div>'
                : (isSearchActiveForKey && state.clubSearchOptions.length
                  ? state.clubSearchOptions.map((club, idx) => `
                    <button
                      type="button"
                      class="allowance-club-suggest-option ${idx === state.clubSearchActiveIndex ? "is-active" : ""}"
                      data-allowance-club-suggestion="${escapeHtml(club)}"
                    >${escapeHtml(club)}</button>
                  `).join("")
                  : (isSearchActiveForKey && state.clubSearchQuery.trim()
                    ? `<div class="allowance-club-suggest-empty">No ${escapeHtml(singularLabel)} found.</div>`
                    : ""))}
            </div>
          </div>
          <button
            type="button"
            class="allowance-club-add-btn"
            data-allowance-club-add="${key}"
            ${canEdit ? "" : "disabled"}
          >
            Add ${escapeHtml(singularLabel)}
          </button>
          <button
            type="button"
            class="allowance-remove-btn allowance-club-remove-category"
            data-allowance-remove="${key}"
            ${canEdit ? "" : "disabled"}
          >
            Remove
          </button>
        </div>
        <div class="allowance-club-list" data-allowance-club-list="${key}">
          ${effectiveClubs.length
            ? effectiveClubs.map((club) => `
              <div class="allowance-club-row" data-allowance-club-item="${escapeHtml(club)}">
                <span class="allowance-club-name" title="${escapeHtml(club)}">${escapeHtml(club)}</span>
                <label class="allowance-club-cap-col">
                  <span class="allowance-club-cap-label">Max cards</span>
                  <input
                    class="allowance-club-cap-input"
                    data-allowance-club-cap="${escapeHtml(club)}"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    max="23"
                    step="1"
                    value="${escapeHtml(clubCapMap[club] || "")}"
                    placeholder="-"
                    ${canEdit ? "" : "disabled"}
                  />
                </label>
                <button
                  type="button"
                  class="allowance-club-row-remove"
                  data-allowance-club-remove="${escapeHtml(club)}"
                  ${canEdit ? "" : "disabled"}
                >
                  Remove
                </button>
              </div>
            `).join("")
            : `<div class="allowance-club-empty">No ${escapeHtml(singularLabel)} added yet.</div>`}
        </div>
      </div>
    `;
    
    const mainHtml = isPosition 
      ? positionSelectHtml 
      : isCardType 
        ? cardTypeSelectHtml 
        : isRegion 
          ? regionSelectHtml 
          : isPlayingStyle 
            ? playingStyleSelectHtml 
            : isTextList
              ? clubBuilderHtml
            : (isRange ? rangeInputHtml : (isFoot ? footChecklistHtml : regularInputHtml));
    
    const capHtmlForCategory = isPosition 
      ? positionCapHtml 
      : isCardType 
        ? cardTypeCapHtml
        : isRegion 
          ? regionCapHtml
          : isPlayingStyle 
            ? playingStyleCapHtml
            : null;
    const hasCapColumn = !isTextList && Boolean(capHtmlForCategory || showCap);
    
    return `
      <div class="allowance-item" data-allowance-key="${key}">
        <label>${escapeHtml(def.label)}</label>
        <div class="allowance-item-row ${hasCapColumn ? "" : "allowance-item-row--no-cap"}">
          <div class="allowance-item-main">${mainHtml}</div>
          ${capHtmlForCategory ? capHtmlForCategory : (showCap ? `
          <label class="allowance-cap-wrap" title="Maximum cards per side for this category">
            <span class="allowance-cap-label">Max cards</span>
            <input
              class="allowance-item-cap"
              data-allowance-cap-key="${key}"
              type="number"
              inputmode="numeric"
              min="1"
              max="23"
              step="1"
              value="${escapeHtml(capValue)}"
              ${canEdit ? "" : "disabled"}
            />
          </label>
          ` : "")}
          ${isTextList ? "" : `<button type="button" class="allowance-remove-btn" data-allowance-remove="${key}" ${canEdit ? "" : "disabled"}>Remove</button>`}
        </div>
      </div>
    `;
  }).join("");

  if (openPosKey) {
    const openPanel = document.querySelector(`[data-allowance-pos-dropdown][data-allowance-pos-key="${openPosKey}"] .allowance-pos-panel`);
    if (openPanel) {
      openPanel.scrollTop = openPosScrollTop;
    }
  }
}

function renderLobbyChat() {
  const room = state.room;
  const log = document.getElementById("chatLog");
  if (!log || !room) return;

  const myId = getCurrentIdentity().id;
  const messages = Array.isArray(room.chat) ? room.chat : [];
  if (!messages.length) {
    log.innerHTML = '<div class="chat-empty">No messages yet. Agree rules here before starting.</div>';
    return;
  }

  log.innerHTML = messages.map((m) => {
    if (String(m.senderId || "") === "system") {
      return `<div class="chat-announce">${escapeHtml(m.message || "")}</div>`;
    }
    const mine = String(m.senderId) === String(myId);
    const dt = new Date(m.createdAt || Date.now());
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    return `
      <div class="chat-item ${mine ? "is-mine" : ""}">
        <div class="chat-head">
          <span class="chat-name">${escapeHtml(m.senderName || "User")}</span>
          <span class="chat-time">${hh}:${mm}</span>
        </div>
        <div class="chat-msg">${escapeHtml(m.message || "")}</div>
      </div>
    `;
  }).join("");
  log.scrollTop = log.scrollHeight;
}

let configSyncDebounce = null;
let latestConfigSyncSeq = 0;
let latestConfigAckSeq = 0;
async function pushLobbyConfig() {
  if (state.mySide !== "host" || !state.room?.code) return;
  const myId = getCurrentIdentity().id;
  // Build payload from DOM first so unsynced typing/spam cannot be overwritten by polling.
  const allowAllInput = document.getElementById("allowAllPlayersInput");
  const bansInput = document.getElementById("lobbyBansInput");
  const allowanceInputs = Array.from(document.querySelectorAll(".allowance-item-input"));
  const allowanceRangeInputs = Array.from(document.querySelectorAll(".allowance-item-range"));
  const allowanceCapInputs = Array.from(document.querySelectorAll(".allowance-item-cap"));
  const allowancePosCapInputs = Array.from(document.querySelectorAll(".allowance-pos-cap-input"));
  const allowanceClubCapHiddens = Array.from(document.querySelectorAll(".allowance-club-cap-hidden[data-allowance-cap-key]"));

  const allowAllFromDom = allowAllInput ? Boolean(allowAllInput.checked) : null;
  const bansFromDom = bansInput ? Math.max(0, Math.floor(Number(bansInput.value) || 0)) : null;
  const allowanceEnabledFromDom = Array.from(new Set(allowanceInputs.map((input) => input.dataset.allowanceKey).filter(Boolean)));
  const allowanceFromDom = {};
  const allowanceCapsFromDom = {};
  allowanceInputs.forEach((input) => {
    const key = input.dataset.allowanceKey;
    if (!key) return;
    if (input.classList.contains("allowance-item-range")) return;
    allowanceFromDom[key] = readAllowanceFieldValue(input);
  });
  Array.from(new Set(allowanceRangeInputs.map((input) => input.dataset.allowanceKey).filter(Boolean))).forEach((key) => {
    const minInput = document.querySelector(`.allowance-item-range[data-allowance-key="${key}"][data-allowance-range-bound="min"]`);
    const maxInput = document.querySelector(`.allowance-item-range[data-allowance-key="${key}"][data-allowance-range-bound="max"]`);
    allowanceFromDom[key] = normalizeAllowanceRangeValue(minInput?.value, maxInput?.value);
  });
  allowanceCapInputs.forEach((input) => {
    const key = input.dataset.allowanceCapKey;
    if (!key) return;
    if (TEXT_ALLOWANCE_LIST_KEYS.has(key)) return;
    allowanceCapsFromDom[key] = normalizeAllowanceCapValue(input.value);
  });
  if (allowancePosCapInputs.length) {
    const posCaps = {};
    allowancePosCapInputs.forEach((input) => {
      const pos = String(input.dataset.allowancePos || "").trim().toUpperCase();
      if (!POSITION_OPTIONS.includes(pos)) return;
      const cap = normalizeAllowanceCapValue(input.value);
      if (cap) posCaps[pos] = cap;
    });
    allowanceCapsFromDom.position = Object.keys(posCaps).length ? JSON.stringify(posCaps) : "";
  }
  allowanceClubCapHiddens.forEach((hidden) => {
    const capKey = String(hidden.dataset.allowanceCapKey || "").trim();
    if (!TEXT_ALLOWANCE_LIST_KEYS.has(capKey)) return;
    const values = normalizeTextAllowanceListValue(allowanceFromDom[capKey] || "");
    allowanceCapsFromDom[capKey] = stringifyTextAllowanceCapMap(hidden.value, values);
  });

  const cfg = state.room.config || defaultRoomConfig();
  const allowAll = allowAllFromDom == null ? Boolean(cfg.allowAllPlayers) : allowAllFromDom;
  const banCountPerSide = bansFromDom == null ? Number(cfg.banCountPerSide) || 0 : bansFromDom;
  const allowanceEnabled =
    allowanceEnabledFromDom.length
      ? allowanceEnabledFromDom
      : (Array.isArray(cfg.allowanceEnabled) ? [...cfg.allowanceEnabled] : []);
  const allowance = Object.keys(allowanceFromDom).length
    ? allowanceFromDom
    : { ...(cfg.allowance || {}) };
  const allowanceCaps = Object.keys(allowanceCapsFromDom).length
    ? allowanceCapsFromDom
    : { ...(cfg.allowanceCaps || {}) };
  const banDurationInput = document.getElementById("lobbyBanDurationInput");
  const pickDurationInput = document.getElementById("lobbyPickDurationInput");
  const revealModeInput = document.getElementById("lobbyRevealModeInput");
  const banDurationSec = banDurationInput
    ? normalizeBanDurationSec(banDurationInput.value)
    : normalizeBanDurationSec(cfg.banDurationSec);
  const pickDurationSec = pickDurationInput
    ? normalizePickDurationSec(pickDurationInput.value)
    : normalizePickDurationSec(cfg.pickDurationSec);
  const revealMode = revealModeInput
    ? normalizeRevealMode(revealModeInput.value)
    : normalizeRevealMode(cfg.revealMode);
  const reqSeq = ++latestConfigSyncSeq;

  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId: myId, clientSeq: reqSeq, allowAllPlayers: allowAll, banCountPerSide, banDurationSec, pickDurationSec, revealMode, allowanceEnabled, allowance, allowanceCaps }),
    });
    if (!res.ok) return;
    const data = await res.json();
    // Ignore stale responses when rapid changes trigger overlapping requests.
    if (reqSeq < latestConfigAckSeq || reqSeq !== latestConfigSyncSeq) return;
    latestConfigAckSeq = reqSeq;
    state.lobbyConfigDirty = false;
    if (data.room) {
      applyPresenceSnapshot(data.room);
      renderLobby();
    }
  } catch {
    /* ignore */
  }
}

function scheduleLobbyConfigPush() {
  clearTimeout(configSyncDebounce);
  state.lobbyConfigDirty = true;
  configSyncDebounce = setTimeout(pushLobbyConfig, 300);
}

async function sendLobbyChatMessage(raw) {
  const message = String(raw || "").trim();
  if (!message || !state.room?.code) return;
  const me = getCurrentIdentity();
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId: me.id, username: me.username, message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || "Could not send message.");
      return;
    }
    if (data.room) {
      applyPresenceSnapshot(data.room);
      renderLobby();
    }
  } catch {
    showToast("Could not send message.");
  }
}

/* ── Side panels ──────────────────────────────────────────── */
function renderSidePanel(containerId, side, room, mySide) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const title = side === "host" ? room.host?.username || "HOST" : room.guest?.username || "Waiting…";
  const isMe = side === mySide;
  const isTurn = room.currentTurn?.side === side;
  const bMax = Math.max(state.schedule.filter((t) => t.action === "ban" && t.side === side).length, 0);
  const pMax = Math.max(state.schedule.filter((t) => t.action === "pick" && t.side === side).length, 0);
  const bans = room.bans[side] || [];
  const picks = room.picks[side] || [];
  const latestBan = bans[bans.length - 1] || null;
  const latestPick = picks[picks.length - 1] || null;

  const head = `
    <div class="side-panel-head ${isMe ? "is-me" : ""}">
      ${isMe ? "▶ " : ""}${String(title).toUpperCase()}
      ${isMe ? '<span class="you-tag">(you)</span>' : ""}
      ${isTurn ? '<span class="turn-dot"></span>' : ""}
    </div>
    <div class="side-panel-focus">
      ${sidePanelCardHtml({ title: "Latest ban", player: latestBan, phase: "ban" })}
      ${sidePanelCardHtml({ title: "Latest pick", player: latestPick, phase: "pick" })}
    </div>
    <div class="slot-section-label">BANS (${bans.length}/${bMax || "—"})</div>
    <div class="slot-list">
      ${Array.from({ length: Math.max(bMax, bans.length) }).map((_, i) => slotHtml(bans[i], "ban")).join("")}
    </div>
    <div class="slot-section-label">PICKS (${picks.length}/${pMax || "—"})</div>
    <div class="slot-list">
      ${Array.from({ length: Math.max(pMax, picks.length) }).map((_, i) => slotHtml(picks[i], "pick")).join("")}
    </div>
  `;
  el.innerHTML = head;
}

function slotHiddenHtml(filled) {
  return `<div class="slot-item is-pick is-hidden ${filled ? "is-filled" : ""}"><div class="slot-empty">${filled ? "Hidden" : "—"}</div></div>`;
}

function slotHtml(player, type) {
  const isBan = type === "ban";
  if (!player) {
    return `<div class="slot-item ${isBan ? "is-ban" : "is-pick"}"><div class="slot-empty">—</div></div>`;
  }
  const ovr = getPlayerCardValue(player);
  const lastName = String(player.name || "").trim().split(/\s+/).pop() || player.name;
  return `
    <div class="slot-item ${isBan ? "is-ban" : "is-pick"}">
      <div class="slot-thumb">
        <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
      </div>
      <div class="slot-ovr">${ovr}</div>
      <div style="min-width:0">
        <div class="slot-name">${escapeHtml(lastName)}</div>
        <div class="slot-pos">${escapeHtml(player.position || "")}</div>
      </div>
    </div>
  `;
}

function sidePanelCardHtml({ title, player, phase }) {
  if (!player) {
    return `
      <div class="side-panel-card side-panel-card--empty">
        <div class="side-panel-card-k">${escapeHtml(title)}</div>
        <div class="side-panel-card-empty">Waiting for a ${phase}…</div>
      </div>
    `;
  }
  return `
    <div class="side-panel-card side-panel-card--${phase}">
      <div class="side-panel-card-k">${escapeHtml(title)}</div>
      <div class="side-panel-card-body">
        <div class="side-panel-card-thumb">
          <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
        </div>
        <div class="side-panel-card-text">
          <div class="side-panel-card-name">${escapeHtml(player.name || "—")}</div>
          <div class="side-panel-card-meta">${escapeHtml(player.position || "—")} · ${escapeHtml(player.nation || player.nationality || "—")}</div>
          <div class="side-panel-card-ovr">OVR ${escapeHtml(getPlayerCardValue(player))}</div>
        </div>
      </div>
    </div>
  `;
}

function renderSlotMapPreview(title, slotMap, formation, options = {}) {
  const layout = getFormationLayout(formation);
  const benchSlots = Array.from({ length: 12 }, (_, i) => i + 12);
  const bench = benchSlots.map((slot) => slotMap[slot] || null);
  const isCompact = Boolean(options.compact);
  return `
    <div class="formation-preview ${isCompact ? "formation-preview--compact" : ""}">
      <div class="formation-preview-head">
        <div>
          <div class="formation-preview-k">${escapeHtml(title)}</div>
          <div class="formation-preview-sub">${escapeHtml(normalizeFormation(formation))} formation</div>
        </div>
        <div class="formation-preview-count">${slotCardsSummary(Object.values(slotMap).filter(Boolean))}</div>
      </div>
      <div class="formation-pitch">
        ${layout.map((row) => `
          <div class="formation-row" data-row="${escapeHtml(row.id)}">
            ${row.slots.map((slot) => formationSlotHtml(slot, slotMap[slot] || null)).join("")}
          </div>
        `).join("")}
      </div>
      <div class="formation-bench">
        ${bench.map((player, idx) => formationBenchSlotHtml(idx + 12, player)).join("")}
      </div>
    </div>
  `;
}

function formationSlotHtml(slot, player) {
  if (!player) {
    return `
      <div class="formation-slot formation-slot--empty">
        <div class="formation-slot-num">${slot}</div>
        <div class="formation-slot-empty">Empty</div>
      </div>
    `;
  }
  return `
    <div class="formation-slot formation-slot--filled">
      <div class="formation-slot-num">${slot}</div>
      <div class="formation-slot-card">
        <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
        <div class="formation-slot-card-body">
          <div class="formation-slot-name">${escapeHtml(player.name || "—")}</div>
          <div class="formation-slot-meta">${escapeHtml(player.position || "—")} · ${escapeHtml(player.nation || player.nationality || "—")}</div>
        </div>
        <div class="formation-slot-ovr">${escapeHtml(getPlayerCardValue(player))}</div>
      </div>
    </div>
  `;
}

function formationBenchSlotHtml(slot, player) {
  if (!player) {
    return `
      <div class="formation-bench-slot">
        <div class="formation-bench-slot-num">${slot}</div>
        <div class="formation-bench-slot-empty">Open</div>
      </div>
    `;
  }
  return `
    <div class="formation-bench-slot is-filled">
      <div class="formation-bench-slot-num">${slot}</div>
      <div class="formation-bench-slot-name">${escapeHtml(player.name || "—")}</div>
      <div class="formation-bench-slot-meta">${escapeHtml(player.position || "—")}</div>
    </div>
  `;
}

function renderDraftPlanControls() {
  const select = document.getElementById("draftGamePlanSelect");
  const meta = document.getElementById("draftGamePlanMeta");
  const preview = document.getElementById("draftGamePlanPreview");
  if (!select || !meta || !preview) return;

  if (state.draftGamePlansLoading) {
    select.innerHTML = `<option value="">Loading game plans…</option>`;
    select.disabled = true;
    meta.textContent = "Fetching your saved plans…";
    preview.innerHTML = `<div class="draft-empty-panel">Loading game plans…</div>`;
    return;
  }

  if (!state.draftGamePlans.length) {
    select.innerHTML = `<option value="">No game plans found</option>`;
    select.disabled = true;
    meta.textContent = "Create a game plan on the home page to use it as a draft reference.";
    preview.innerHTML = `<div class="draft-empty-panel">No saved game plans yet.</div>`;
    return;
  }

  select.disabled = false;
  select.innerHTML = state.draftGamePlans.map((plan) => {
    const formation = normalizeFormation(plan.formation);
    const suffix = `${Number(plan.lineup_count || 0)}/11 lineup · ${Number(plan.sub_count || 0)}/12 subs`;
    return `<option value="${escapeHtml(String(plan.id))}">${escapeHtml(plan.name || "Plan")} · ${escapeHtml(formation)} · ${escapeHtml(suffix)}</option>`;
  }).join("");

  const selectedPlan = state.draftGamePlans.find((plan) => String(plan.id) === String(state.draftGamePlanSelectedId)) || state.draftGamePlans[0];
  if (!selectedPlan) return;
  state.draftGamePlanSelectedId = selectedPlan.id;
  select.value = String(selectedPlan.id);
  const formation = normalizeFormation(selectedPlan.formation);
  meta.textContent = `${selectedPlan.name || "Plan"} · ${formation} · ${Number(selectedPlan.lineup_count || 0)}/11 starters`;
  preview.innerHTML = renderSlotMapPreview("Consult this plan", mapPlayersBySlot(state.draftGamePlanPlayers), formation, { compact: true });
}

async function loadDraftGamePlans() {
  const user = getUser();
  if (!user?.id) return;
  state.draftGamePlansLoading = true;
  renderDraftPlanControls();
  try {
    const res = await fetch(`/api/game-plans?userId=${encodeURIComponent(user.id)}`);
    const data = await res.json().catch(() => ({}));
    state.draftGamePlans = Array.isArray(data.plans) ? data.plans : [];
    if (!state.draftGamePlans.some((plan) => String(plan.id) === String(state.draftGamePlanSelectedId))) {
      state.draftGamePlanSelectedId = state.draftGamePlans[0]?.id || null;
    }
    if (state.draftGamePlanSelectedId) {
      await loadDraftGamePlanPlayers(state.draftGamePlanSelectedId);
    } else {
      state.draftGamePlanPlayers = [];
    }
  } catch {
    state.draftGamePlans = [];
    state.draftGamePlanPlayers = [];
    state.draftGamePlanSelectedId = null;
  } finally {
    state.draftGamePlansLoading = false;
    renderDraftPlanControls();
    renderDraftUi();
  }
}

async function loadDraftGamePlanPlayers(planId) {
  const user = getUser();
  if (!user?.id || !planId) return;
  state.draftGamePlanPlayersLoading = true;
  try {
    const res = await fetch(`/api/game-plans/${encodeURIComponent(planId)}/players?userId=${encodeURIComponent(user.id)}`);
    const data = await res.json().catch(() => ({}));
    state.draftGamePlanPlayers = Array.isArray(data.players) ? data.players : [];
  } catch {
    state.draftGamePlanPlayers = [];
  } finally {
    state.draftGamePlanPlayersLoading = false;
    renderDraftPlanControls();
    if (state.phase === "draft") renderDraftUi();
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resetOpponentBanPlayers() {
  state.opponentBanPlayers = [];
  state.loadingOpponentBanPlayers = false;
  state.opponentBanPlayersLoaded = false;
}

async function loadOpponentBanPlayers() {
  const room = state.room;
  if (!room) return;
  const loading = document.getElementById("draftLoading");
  const mySide = state.mySide;
  const theirSide = mySide === "host" ? "guest" : "host";
  let opponentUserId = Number(room?.[theirSide]?.id);

  if (!Number.isFinite(opponentUserId) || opponentUserId <= 0) {
    // In some flows, draft starts before presence polling fully hydrates numeric ids.
    // Attempt a one-time presence refresh, then retry extracting opponent id.
    try {
      const code = String(room.code || "").trim();
      if (code) {
        const pres = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
        const data = await pres.json().catch(() => ({}));
        if (pres.ok && data?.room) applyPresenceSnapshot(data.room);
      }
    } catch {
      /* ignore */
    }
    opponentUserId = Number(state.room?.[theirSide]?.id);
    if (!Number.isFinite(opponentUserId) || opponentUserId <= 0) {
      // Fallback: if opponent is not signed in (anon ids), we can't load /api/my-players.
      // Provide a small demo pool so ban UI is usable in single-browser testing.
      try {
        const res = await fetch("/api/top-players");
        const data = await res.json().catch(() => ({}));
        const rows = Array.isArray(data.players) ? data.players : [];
        state.opponentBanPlayers = rows.map((p) =>
          normalizeApiPlayer({
            id: p.id,
            name: p.name,
            position: p.position,
            overall_max: p.overall,
            nationality: p.nationality,
          }),
        );
        state.opponentBanPlayersLoadSource = "top-players";
      } catch {
        state.opponentBanPlayers = [];
      } finally {
        state.opponentBanPlayersLoaded = true;
        renderDraftUi();
      }
      return;
    }
  }

  state.loadingOpponentBanPlayers = true;
  if (loading) loading.hidden = false;
  renderDraftUi();
  try {
    const res = await fetch(`/api/my-players?userId=${encodeURIComponent(opponentUserId)}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error || `Failed to load opponent squad (${res.status})`);
    }
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data.players) ? data.players : [];
    const dedup = new Map();
    rows.forEach((row) => {
      const normalized = normalizeMySquadPlayerForDraft(row);
      if (!normalized.id) return;
      if (!dedup.has(normalized.id)) dedup.set(normalized.id, normalized);
    });
    state.opponentBanPlayers = Array.from(dedup.values());
    state.opponentBanPlayersLoadSource = "my-players";

    // If opponent has no saved squad, fall back to a small demo pool so the ban UI isn't empty/stuck.
    if (!state.opponentBanPlayers.length) {
      try {
        const demoRes = await fetch("/api/top-players");
        const demoData = await demoRes.json().catch(() => ({}));
        const demoRows = Array.isArray(demoData.players) ? demoData.players : [];
        state.opponentBanPlayers = demoRows.map((p) =>
          normalizeApiPlayer({
            id: p.id,
            name: p.name,
            position: p.position,
            overall_max: p.overall,
            nationality: p.nationality,
          }),
        );
        state.opponentBanPlayersLoadSource = "top-players";
      } catch {
        /* ignore */
      }
    }
  } catch {
    state.opponentBanPlayers = [];
  } finally {
    state.loadingOpponentBanPlayers = false;
    state.opponentBanPlayersLoaded = true;
    if (loading) loading.hidden = state.loadingPlayers;
    renderDraftUi();
  }
}

function banHistoryCardHtml(player) {
  return `
    <div class="ban-history-card">
      <div class="ban-history-thumb">
        <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
      </div>
      <div class="ban-history-text">
        <div class="ban-history-name">${escapeHtml(player.name || "—")}</div>
        <div class="ban-history-meta">${escapeHtml(player.position || "—")} · OVR ${escapeHtml(getPlayerCardValue(player))}</div>
      </div>
    </div>
  `;
}

// Ban phase uses the 3-row board (legacy ban-only mode was removed, keep these as safe no-ops).
function enterBanOnlyDomMode() {}
function exitBanOnlyDomMode() {}

function renderDraftUi() {
  const room = state.room;
  if (!room || (state.phase !== "draft" && state.phase !== "ready")) return;

  const mySide = state.mySide;
  const turn = state.schedule[room.turnIndex];
  const isReadyPhase = state.phase === "ready" || String(room.status || "") === "await-ready";
  const isMyTurn = String(turn?.side || "") === "both" ? true : turn?.side === mySide;
  const isBanPhase = turn?.action === "ban";
  const totalTurns = state.schedule.length || 1;
  const turnNum = room.turnIndex + 1;
  const progress = (room.turnIndex / totalTurns) * 100;
  const showBanOnly = Boolean(isBanPhase && !isReadyPhase);
  if (showBanOnly) enterBanOnlyDomMode();
  else exitBanOnlyDomMode();

  const pill = document.getElementById("turnPill");
  const kicker = document.getElementById("turnPillKicker");
  const main = document.getElementById("turnPillMain");
  if (kicker) {
    kicker.textContent = isReadyPhase
      ? `READY ${totalTurns}/${totalTurns}`
      : `${isBanPhase ? "BAN" : "PICK"} ${turnNum}/${totalTurns}`;
  }
  if (main) {
    const name =
      turn?.side === "host"
        ? room.host?.username || "Host"
        : room.guest?.username || "Guest";
    if (isReadyPhase) {
      main.textContent = "CONFIRM MATCH READY";
    } else if (isBanPhase) {
      const target = Math.max(0, Math.floor(Number(room.config?.banCountPerSide) || 0));
      const theirSide = mySide === "host" ? "guest" : "host";
      const myBans = room.bans?.[mySide] || [];
      const theirBans = room.bans?.[theirSide] || [];
      const myReady = target <= 0 ? true : myBans.length >= target;
      const theirReady = target <= 0 ? true : theirBans.length >= target;
      main.textContent = `${myReady ? "READY" : "NOT READY"} • ${theirReady ? "OPP READY" : "OPP NOT READY"}`;
    } else {
      main.textContent = String(turn?.side || "") === "both"
        ? "PICK PHASE"
        : (isMyTurn ? "YOUR TURN" : `${name}'s turn`);
    }
  }
  if (pill) {
    // Ban phase is simultaneous; avoid implying a "turn owner".
    pill.classList.toggle("is-mine", !isBanPhase && isMyTurn);
    pill.classList.toggle("is-ban", isBanPhase);
    pill.classList.toggle("is-pick", !isBanPhase);
  }

  document.getElementById("progressFill").style.width = `${progress}%`;

  const hint = document.getElementById("draftHintBanner");
  if (isMyTurn && !isReadyPhase) {
    hint.hidden = false;
    hint.classList.toggle("is-ban", isBanPhase);
    hint.classList.toggle("is-pick", !isBanPhase);
    hint.textContent = isBanPhase
      ? "Ban an opponent card — your opponent cannot use that card, but you still can."
      : "Click a player to add them to your squad.";
  } else {
    hint.hidden = true;
  }

  if (isBanPhase && !state.opponentBanPlayersLoaded && !state.loadingOpponentBanPlayers) {
    void loadOpponentBanPlayers();
  }

  const topReadyBtn = document.getElementById("draftTopReadyBtn");
  if (topReadyBtn) {
    if (isReadyPhase) {
      const myReady = Boolean(room.matchReady?.[mySide]);
      topReadyBtn.textContent = myReady ? "UNREADY" : "READY";
      topReadyBtn.disabled = false;
      topReadyBtn.title = "";
    } else {
      topReadyBtn.textContent = "READY";
      topReadyBtn.disabled = true;
      topReadyBtn.title = "Available after pick phase completes";
    }
  }

  const errEl = document.getElementById("draftActionError");
  if (errEl) {
    if (state.actionError) {
      errEl.textContent = state.actionError;
      errEl.hidden = false;
    } else {
      errEl.hidden = true;
    }
  }

  const myPicks = room.picks[mySide] || [];
  const theirSide = mySide === "host" ? "guest" : "host";
  const theirPicks = room.picks[theirSide] || [];
  const myBans = room.bans[mySide] || [];
  const bannedOnMe = room.bans[theirSide] || [];
  const formation = normalizeFormation(state.draftGamePlans.find((plan) => String(plan.id) === String(state.draftGamePlanSelectedId))?.formation || DEFAULT_FORMATION);

  const pickWip = document.getElementById("draftPickWip");

  const showBanBoard = Boolean(isBanPhase && !isReadyPhase);
  const banBoard = document.getElementById("draftBanPhaseBoard");
  const myBansStrip = document.getElementById("draftMyBansStrip");
  const bannedOnMeStrip = document.getElementById("draftBannedOnMeStrip");
  const pendingStrip = document.getElementById("draftPendingBanStrip");
  const banSearch = document.getElementById("banSearch");
  const banSort = document.getElementById("banSort");
  const banPos = document.getElementById("banPosition");
  const banGrid = document.getElementById("banGrid");
  const clearBtn = document.getElementById("banClearBtn");
  const confirmBtn = document.getElementById("banConfirmBtn");
  if (banBoard && myBansStrip && bannedOnMeStrip && pendingStrip && banSearch && banSort && banPos && banGrid && clearBtn && confirmBtn) {
    banBoard.hidden = !showBanBoard;
    if (showBanBoard) {
      bindBanPhaseUiOnce();
      banSearch.value = state.banSearch || "";
      banSort.value = normalizeBanSortValue(state.banSort);
      // Legacy hidden select kept for compatibility; actual filter state is multi-select.
      banPos.value = "";
      renderBanToolbar();

      // Update ban counters (e.g., "0/3") if present in DOM
      const myCountEl = document.getElementById("draftMyBansCount");
      const bannedOnMeCountEl = document.getElementById("draftBannedOnMeCount");
      const maxBans = Math.max(0, Math.floor(Number(room.config?.banCountPerSide) || 0));
      if (myCountEl) myCountEl.textContent = `${myBans.length}/${maxBans}`;
      if (bannedOnMeCountEl) bannedOnMeCountEl.textContent = `${bannedOnMe.length}/${maxBans}`;

      myBansStrip.innerHTML = myBans.length
        ? myBans.map((p) => imageOnlyThumbHtml(p, "md")).join("")
        : "";

      bannedOnMeStrip.innerHTML = bannedOnMe.length
        ? bannedOnMe.map((p) => imageOnlyThumbHtml(p, "md")).join("")
        : "";

      const pending = state.pendingBanPlayerId
        ? (Array.isArray(state.opponentBanPlayers) ? state.opponentBanPlayers : []).find((p) => String(p.id) === String(state.pendingBanPlayerId))
        : null;
      pendingStrip.innerHTML = pending ? imageOnlyThumbHtml(pending, "lg") : "";

      const rows = getBanListPlayers();
      banGrid.innerHTML = rows.length
        ? rows.map((p) => {
            const id = String(p.id);
            const banned = room.bannedPlayerIds.includes(id);
            const pickedTaken = room.pickedPlayerIds.includes(id);
            const unavailable = banned || pickedTaken;
            const myBanCount = (room.bans?.[mySide] || []).length;
            const canStillBan = !maxBans || myBanCount < maxBans;
            const clickable = isMyTurn && canStillBan && !unavailable && !isReadyPhase;
            return banPlayerCardHtml(p, { banned, picked: pickedTaken, clickable });
          }).join("")
        : `<div class="ban-phase-empty ban-phase-empty--panel">${
            escapeHtml(
              state.loadingOpponentBanPlayers
                ? "Loading opponent squad cards..."
                : (state.opponentBanPlayersLoaded
                    ? (state.opponentBanPlayers.length
                        ? "Opponent squad loaded."
                        : "No opponent players to show yet.")
                    : "Loading opponent squad cards..."),
            )
          }</div>`;

      const myBanCount = (room.bans?.[mySide] || []).length;
      const canStillBan = !maxBans || myBanCount < maxBans;
      const canConfirm = Boolean(
        isMyTurn &&
        canStillBan &&
        pending &&
        !room.bannedPlayerIds.includes(String(pending.id)) &&
        !room.pickedPlayerIds.includes(String(pending.id)),
      );
      clearBtn.disabled = !pending;
      confirmBtn.disabled = !canConfirm;
    } else {
      state.pendingBanPlayerId = "";
    }
  }

  if (pickWip) pickWip.hidden = Boolean(showBanBoard || isReadyPhase);
}

function miniCardHtml(player, o) {
  const { banned, picked, clickable, isBanPhase } = o;
  const unavailable = banned || picked;
  return `
    <div class="mini-card ${isBanPhase ? "is-ban-phase" : "is-pick-phase"} ${unavailable ? (banned ? "is-ban" : "is-pick") : ""} ${clickable ? "is-clickable" : ""}"
         data-player-id="${escapeHtml(player.id)}"
         tabindex="${clickable ? 0 : -1}">
      <div class="mini-thumb">
        <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
      </div>
      ${isBanPhase ? "" : `
        <div class="mini-row">
          <div class="mini-ovr">${getPlayerCardValue(player)}</div>
          <div style="min-width:0">
            <div class="mini-name">${escapeHtml(player.name)}</div>
            <div class="mini-sub">${escapeHtml(player.position)} · ${escapeHtml(player.nation)}</div>
          </div>
        </div>
        <div class="mini-stats">
          ${["SPD", "FIN", "PAS"]
            .map((l, i) => {
              const vals = [player.speed, player.finishing, player.passing];
              return `<div class="mini-stat"><div class="mini-stat-l">${l}</div><div class="mini-stat-v">${vals[i] ?? "—"}</div></div>`;
            })
            .join("")}
        </div>
        <div class="mini-cta ${isBanPhase ? "is-ban" : "is-pick"} mini-cta-hover" style="display:none"></div>
      `}
    </div>
  `;
}

function banPlayerCardHtml(player, o) {
  const { banned, picked, clickable } = o;
  const unavailable = banned || picked;
  const cls = [
    "player-card",
    clickable ? "is-clickable" : "",
    unavailable ? "is-unavailable" : "",
    state.pendingBanPlayerId && String(state.pendingBanPlayerId) === String(player.id) ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div class="${cls}" data-player-id="${escapeHtml(player.id)}" tabindex="${clickable ? 0 : -1}">
      <div class="pc-img-wrap">
        <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
      </div>
    </div>
  `;
}

/* delegated hover + click on grid */
function attachMiniCardGridHandlers(grid) {
  if (!grid || grid._bound) return;
  grid._bound = true;

  grid.addEventListener("mouseover", (e) => {
    const card = e.target.closest(".mini-card.is-clickable, .player-card.is-clickable");
    grid.querySelectorAll(".mini-card.is-hovered, .player-card.is-hovered").forEach((c) => c.classList.remove("is-hovered"));
    if (card) card.classList.add("is-hovered");
  });
  grid.addEventListener("mouseout", (e) => {
    const card = e.target.closest(".mini-card, .player-card");
    if (card) card.classList.remove("is-hovered");
  });

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".mini-card.is-clickable, .player-card.is-clickable");
    if (!card) return;
    const id = card.dataset.playerId;
    const room = state.room;
    const turn = room ? state.schedule[room.turnIndex] : null;
    const isReadyPhase = state.phase === "ready" || String(room?.status || "") === "await-ready";
    const isBanPhase = turn?.action === "ban";
    const source = isBanPhase
      ? (Array.isArray(state.opponentBanPlayers) ? state.opponentBanPlayers : [])
      : getDraftDisplayPlayers(room);
    const player = source.find((p) => String(p.id) === id);
    if (!player) return;

    state.actionError = "";
    const errEl = document.getElementById("draftActionError");
    if (errEl) errEl.hidden = true;
    if (isBanPhase && !isReadyPhase) {
      state.pendingBanPlayerId = String(player.id);
      renderDraftUi();
      return;
    }
    applyLocalAction(room, player);
    renderDraftUi();
  });
}

function attachDraftGridHandlers() {
  // Pick grid (if present)
  attachMiniCardGridHandlers(document.getElementById("draftGrid"));
  // Ban grid (present in room.html)
  attachMiniCardGridHandlers(document.getElementById("banGrid"));
}

function renderBanToolbar() {
  const sortSelect = document.getElementById("banSort");
  const posSelect = document.getElementById("banPosition");
  const sortLabel = document.getElementById("banSortLabel");
  const sortPanel = document.getElementById("banSortPanel");
  const posPanel = document.getElementById("banPosPanel");
  const posDot = document.getElementById("banPosDot");
  const sortDirIcon = document.getElementById("banSortDirIcon");
  if (!sortSelect || !posSelect || !sortLabel || !sortPanel || !posPanel) return;

  const sortVal = normalizeBanSortValue(state.banSort);
  const posVal = "";
  sortSelect.value = sortVal;
  posSelect.value = posVal;

  // Home-style: sort category + direction toggle
  const dir = sortVal.endsWith("_asc") ? "asc" : "desc";
  const baseKey = sortVal.replace(/_(asc|desc)$/, "");
  const labelMap = {
    overall_max: "Overall Max",
    overall: "Overall Level 1",
    name: "Player Name",
    position: "Position",
    height: "Height",
    weight: "Weight",
    age: "Age",
  };
  sortLabel.textContent = labelMap[baseKey] || "Overall Max";
  if (sortDirIcon) sortDirIcon.textContent = dir === "asc" ? "↑" : "↓";

  const sortCats = [
    { key: "overall_max", label: "Overall Max" },
    { key: "overall", label: "Overall Level 1" },
    { key: "name", label: "Player Name" },
    { key: "position", label: "Position" },
    { key: "height", label: "Height" },
    { key: "weight", label: "Weight" },
    { key: "age", label: "Age" },
  ];
  sortPanel.innerHTML = sortCats
    .map((c) => {
      const active = c.key === baseKey;
      return `
        <div class="sort-option ${active ? "active" : ""}" data-ban-sort-cat="${escapeHtml(c.key)}">
          <span>${escapeHtml(c.label)}</span>
          <span class="sort-check">✓</span>
        </div>
      `;
    })
    .join("");

  // Filter panel: same style as home (position multiselect + clear)
  const selected = Array.isArray(state.banFilterPositions) ? state.banFilterPositions : [];
  const cleanSelected = selected.map(normalizeBanPositionValue).filter(Boolean);
  const labelText = !cleanSelected.length
    ? "All positions"
    : cleanSelected.length <= 7
      ? cleanSelected.join(", ")
      : `${cleanSelected.slice(0, 7).join(", ")} +${cleanSelected.length - 7}`;

  posPanel.innerHTML = `
    <div class="filter-section">
      <div class="filter-section-label">POSITION</div>
      <div class="pos-multiselect" id="banPosMultiselect">
        <button class="pos-ms-btn ${cleanSelected.length ? "has-pos-filter" : ""}" id="banPosMsBtn" type="button">
          <span id="banPosMsLabel">${escapeHtml(labelText)}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="banPosMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <button class="filter-clear-btn" id="banClearFiltersBtn">CLEAR ALL FILTERS</button>
    </div>
  `;

  const msPanel = document.getElementById("banPosMsPanel");
  if (msPanel) {
    msPanel.innerHTML = POSITION_OPTIONS.map((pos) => {
      const checked = cleanSelected.includes(pos);
      return `
        <div class="pos-ms-item ${checked ? "checked" : ""}" data-ban-pos-ms="${escapeHtml(pos)}">
          <span class="pos-ms-check"></span><span>${escapeHtml(pos)}</span>
        </div>
      `;
    }).join("");
  }

  if (posDot) {
    posDot.style.display = cleanSelected.length ? "inline-block" : "none";
  }
}

function bindBanPhaseUiOnce() {
  if (state.banUiBound) return;
  const search = document.getElementById("banSearch");
  const sort = document.getElementById("banSort");
  const pos = document.getElementById("banPosition");
  const sortBtn = document.getElementById("banSortBtn");
  const sortWrap = document.getElementById("banSortWrap");
  const sortPanel = document.getElementById("banSortPanel");
  const sortDirBtn = document.getElementById("banSortDirBtn");
  const posBtn = document.getElementById("banPosBtn");
  const posWrap = document.getElementById("banPosWrap");
  const posPanel = document.getElementById("banPosPanel");
  const clearBtn = document.getElementById("banClearBtn");
  const confirmBtn = document.getElementById("banConfirmBtn");
  if (!search || !sort || !pos || !clearBtn || !confirmBtn) return;
  state.banUiBound = true;

  search.addEventListener("input", (e) => {
    state.banSearch = String(e.target.value || "");
    renderDraftUi();
  });
  sort.addEventListener("change", (e) => {
    state.banSort = normalizeBanSortValue(e.target.value);
    renderDraftUi();
  });
  pos.addEventListener("change", () => {
    // kept for compatibility; filtering is driven by state.banFilterPositions
    renderDraftUi();
  });

  const closeAll = () => {
    sortBtn?.classList.remove("open");
    posBtn?.classList.remove("open");
    sortPanel?.classList.remove("open");
    posPanel?.classList.remove("open");
    sortBtn?.setAttribute("aria-expanded", "false");
    posBtn?.setAttribute("aria-expanded", "false");
  };

  document.addEventListener("click", (e) => {
    const t = e.target;
    const insideSort = sortWrap && t instanceof Element ? Boolean(t.closest("#banSortWrap")) : false;
    const insidePos = posWrap && t instanceof Element ? Boolean(t.closest("#banPosWrap")) : false;
    if (!insideSort && !insidePos) closeAll();
  });

  sortBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const open = !Boolean(sortPanel?.classList.contains("open"));
    closeAll();
    if (open) {
      renderBanToolbar();
      sortBtn.classList.add("open");
      sortPanel?.classList.add("open");
      sortBtn.setAttribute("aria-expanded", "true");
    }
  });

  sortDirBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const cur = normalizeBanSortValue(state.banSort);
    const baseKey = cur.replace(/_(asc|desc)$/, "");
    const next = cur.endsWith("_asc") ? `${baseKey}_desc` : `${baseKey}_asc`;
    sort.value = normalizeBanSortValue(next);
    sort.dispatchEvent(new Event("change", { bubbles: true }));
  });

  posBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const open = !Boolean(posPanel?.classList.contains("open"));
    closeAll();
    if (open) {
      renderBanToolbar();
      posBtn.classList.add("open");
      posPanel?.classList.add("open");
      posBtn.setAttribute("aria-expanded", "true");
    }
  });

  sortPanel?.addEventListener("click", (e) => {
    const opt = e.target instanceof Element ? e.target.closest("[data-ban-sort-cat]") : null;
    if (!opt) return;
    const cat = String(opt.getAttribute("data-ban-sort-cat") || "");
    const cur = normalizeBanSortValue(state.banSort);
    const dir = cur.endsWith("_asc") ? "asc" : "desc";
    const v = `${cat}_${dir}`;
    sort.value = normalizeBanSortValue(v);
    sort.dispatchEvent(new Event("change", { bubbles: true }));
    closeAll();
  });

  posPanel?.addEventListener("click", (e) => {
    const msBtn = e.target instanceof Element ? e.target.closest("#banPosMsBtn") : null;
    const msItem = e.target instanceof Element ? e.target.closest("[data-ban-pos-ms]") : null;
    const clear = e.target instanceof Element ? e.target.closest("#banClearFiltersBtn") : null;
    const msPanel = document.getElementById("banPosMsPanel");
    const msBtnEl = document.getElementById("banPosMsBtn");
    if (msBtn && msPanel && msBtnEl) {
      const open = !msPanel.classList.contains("open");
      msPanel.classList.toggle("open", open);
      msBtnEl.classList.toggle("open", open);
      return;
    }
    if (clear) {
      state.banFilterPositions = [];
      renderDraftUi();
      return;
    }
    if (msItem) {
      const v = normalizeBanPositionValue(msItem.getAttribute("data-ban-pos-ms") || "");
      const cur = new Set((Array.isArray(state.banFilterPositions) ? state.banFilterPositions : []).map(normalizeBanPositionValue).filter(Boolean));
      if (v) {
        cur.has(v) ? cur.delete(v) : cur.add(v);
        state.banFilterPositions = [...cur];
        renderDraftUi();
      }
    }
  });

  clearBtn.addEventListener("click", () => {
    state.pendingBanPlayerId = "";
    renderDraftUi();
  });
  confirmBtn.addEventListener("click", async () => {
    const room = state.room;
    if (!room) return;
    const turn = state.schedule[room.turnIndex];
    const isReadyPhase = state.phase === "ready" || String(room.status || "") === "await-ready";
    const isMyTurn = String(turn?.side || "") === "both" ? true : turn?.side === state.mySide;
    if (turn?.action !== "ban" || isReadyPhase || !isMyTurn) return;
    const player = (Array.isArray(state.opponentBanPlayers) ? state.opponentBanPlayers : []).find((p) => String(p.id) === String(state.pendingBanPlayerId));
    if (!player) return;
    state.pendingBanPlayerId = "";
    try {
      const me = getCurrentIdentity();
      // send minimal player shape to server (server only needs id/name for validation/storage)
      const payloadPlayer = { id: String(player.id), name: player.name };
      const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId: me.id, player: payloadPlayer }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data?.error || "Could not confirm ban.");
        return;
      }
      if (data.room) applyPresenceSnapshot(data.room);
    } catch (err) {
      console.error("ban confirm error:", err);
      showToast("Could not confirm ban.");
    }
    renderDraftUi();
  });
}

async function loadDraftPlayers() {
  const loading = document.getElementById("draftLoading");
  state.loadingPlayers = true;
  if (loading) loading.hidden = false;
  try {
    state.players = await fetchPlayers();
  } catch {
    state.players = [];
    showToast("Could not load players.");
  } finally {
    state.loadingPlayers = false;
    if (loading) loading.hidden = state.loadingOpponentBanPlayers;
    renderDraftUi();
  }
}

function showDone() {
  showView("viewDone");
  const room = state.room;
  document.getElementById("doneRoomCode").textContent = `Room ${room.code}`;

  const mySide = state.mySide;
  const theirSide = mySide === "host" ? "guest" : "host";
  const myName = room[mySide]?.username || mySide;
  const theirName = room[theirSide]?.username || theirSide;
  const myPicks = room.picks[mySide] || [];
  const theirPicks = room.picks[theirSide] || [];

  const col = (name, picks, side, isMe) => `
    <div>
      <div class="done-col-title ${isMe ? "is-me" : ""}">${escapeHtml(name)}${isMe ? " (YOU)" : ""}</div>
      ${picks
        .map(
          (p) => `
        <div class="done-pick-row">
          <div class="done-pick-ovr">${p.overall_rating}</div>
          <div>
            <div class="done-pick-name">${escapeHtml(p.name)}</div>
            <div class="done-pick-sub">${escapeHtml(p.position)} · ${escapeHtml(p.nation)}</div>
          </div>
        </div>`,
        )
        .join("")}
    </div>
  `;

  document.getElementById("doneColumns").innerHTML =
    col(myName, myPicks, mySide, true) + col(theirName, theirPicks, theirSide, false);
}

function startDraftFromLobby() {
  if (state.mySide !== "host") {
    const guestReady = Boolean(state.room?.ready?.guest);
    void setGuestReady(!guestReady);
    return;
  }
  const cfg = state.room?.config || defaultRoomConfig();
  if (!state.room?.ready?.guest) {
    showToast("Guest must be ready before starting.");
    return;
  }
  const banDurationInput = document.getElementById("lobbyBanDurationInput");
  const pickDurationInput = document.getElementById("lobbyPickDurationInput");
  const typedDuration = Number(banDurationInput?.value);
  if (!Number.isFinite(typedDuration) || typedDuration < MIN_BAN_DURATION_SECONDS || typedDuration > MAX_BAN_DURATION_SECONDS) {
    showToast(`Ban duration must be between ${MIN_BAN_DURATION_SECONDS} and ${MAX_BAN_DURATION_SECONDS} seconds.`, "warn");
    if (banDurationInput) banDurationInput.focus();
    return;
  }
  const typedPickDuration = Number(pickDurationInput?.value);
  if (!Number.isFinite(typedPickDuration) || typedPickDuration < MIN_PICK_DURATION_SECONDS || typedPickDuration > MAX_PICK_DURATION_SECONDS) {
    showToast(`Pick duration must be between ${MIN_PICK_DURATION_SECONDS} and ${MAX_PICK_DURATION_SECONDS} seconds.`, "warn");
    if (pickDurationInput) pickDurationInput.focus();
    return;
  }
  const b = Math.max(0, Math.floor(Number(cfg.banCountPerSide) || 0));
  const p = 23;

  if (b === 0 && p === 0) {
    showToast("Set at least one ban or pick per side.");
    return;
  }

  const me = getCurrentIdentity();
  void (async () => {
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId: me.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Could not start draft.", "warn");
        return;
      }
      if (data.room) applyPresenceSnapshot(data.room);
      if (!tryEnterDraftFromRoomSnapshot()) {
        showToast("Draft started. Waiting for room sync...", "warn");
      }
    } catch {
      showToast("Could not start draft.", "warn");
    }
  })();
}

async function fetchFilterOptions() {
  try {
    const res = await fetch("/api/players/filter-options");
    if (res.ok) {
      const data = await res.json();
      CARD_TYPE_OPTIONS = data.card_type || [];
      REGION_OPTIONS = data.region || [];
      PLAYING_STYLE_OPTIONS = data.playing_style || [];
    }
  } catch (err) {
    console.warn("Could not fetch filter options:", err);
  }
}

function initLobby() {
  const q = parseQuery();
  const user = getUser();
  const code = getRoomCodeFromUrl();

  if (!code || code.length < 4) {
    const errorView = document.getElementById("viewError");
    const errorTitle = document.getElementById("errorTitle");
    const errorIcon = document.getElementById("errorStateIcon");
    const errorBtn = document.getElementById("errorLeaveBtn");
    if (errorView) {
      errorView.classList.remove("is-room-closed");
      errorView.classList.remove("is-host-lock");
      errorView.classList.remove("is-access-denied");
    }
    if (errorTitle) errorTitle.hidden = true;
    if (errorIcon) errorIcon.hidden = true;
    if (errorBtn) errorBtn.textContent = "Leave room";
    showView("viewError");
    document.getElementById("errorMessage").textContent = "Invalid room code.";
    return;
  }

  const settingsPanel = document.querySelector(".prep-col--settings");
  if (settingsPanel && !settingsPanel.dataset.readonlyGuardBound) {
    settingsPanel.dataset.readonlyGuardBound = "1";
    settingsPanel.addEventListener("click", (e) => {
      if (state.mySide === "host" || !settingsPanel.classList.contains("is-readonly")) return;
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - readonlySettingsToastAt < 1200) return;
      readonlySettingsToastAt = now;
      showToast("Only host can edit ban settings.");
    });
  }

  // Fetch filter options from server
  void fetchFilterOptions();

  const isJoin = q.mode === "join";
  const isHost = !isJoin;

  let host;
  let guest;
  if (isJoin) {
    host = { id: "remote-host", username: "Host" };
    guest = user
      ? { id: user.id, username: user.username }
      : { id: "guest-anon", username: "Guest" };
  } else {
    host = user
      ? { id: user.id, username: user.username }
      : { id: "local-host", username: "You" };
    guest = null;
  }

  state.room = emptyRoom(code, host, guest);
  state.mySide = isJoin ? "guest" : "host";
  state.phase = "lobby";

  showView("viewLobby");
  renderLobby();

  void registerAndPollPresence();

  document.getElementById("startDraftBtn")?.addEventListener("click", () => startDraftFromLobby());

  document.getElementById("allowAllPlayersInput")?.addEventListener("change", (e) => {
    e.target.dataset.touched = "1";
    state.room.config.allowAllPlayers = Boolean(e.target.checked);
    renderLobby();
    scheduleLobbyConfigPush();
  });
  // Let user type freely; normalize only on commit (change/blur).
  document.getElementById("lobbyBansInput")?.addEventListener("input", (e) => {
    e.target.dataset.touched = "1";
    const raw = String(e.target.value ?? "");
    // Keep local config in sync when user enters a valid number,
    // but don't overwrite the input while typing.
    const n = Number(raw);
    if (Number.isFinite(n)) {
      state.room.config.banCountPerSide = Math.max(0, Math.floor(n));
      renderLobby();
      scheduleLobbyConfigPush();
    }
  });
  document.getElementById("lobbyBansInput")?.addEventListener("change", (e) => {
    e.target.dataset.touched = "1";
    const normalized = Math.max(0, Math.floor(Number(e.target.value) || 0));
    e.target.value = String(normalized);
    state.room.config.banCountPerSide = normalized;
    renderLobby();
    scheduleLobbyConfigPush();
  });
  document.getElementById("lobbyBanDurationInput")?.addEventListener("input", (e) => {
    e.target.dataset.touched = "1";
    const typed = String(e.target.value ?? "").trim();
    if (!typed) return;
    const n = Math.floor(Number(typed));
    if (!Number.isFinite(n)) return;
    state.room.config.banDurationSec = n;
  });
  document.getElementById("lobbyBanDurationInput")?.addEventListener("change", (e) => {
    e.target.dataset.touched = "1";
    const normalized = normalizeBanDurationSec(e.target.value);
    e.target.value = String(normalized);
    state.room.config.banDurationSec = normalized;
    scheduleLobbyConfigPush();
  });
  document.getElementById("lobbyPickDurationInput")?.addEventListener("input", (e) => {
    e.target.dataset.touched = "1";
    const typed = String(e.target.value ?? "").trim();
    if (!typed) return;
    const n = Math.floor(Number(typed));
    if (!Number.isFinite(n)) return;
    state.room.config.pickDurationSec = n;
  });
  document.getElementById("lobbyPickDurationInput")?.addEventListener("change", (e) => {
    e.target.dataset.touched = "1";
    const normalized = normalizePickDurationSec(e.target.value);
    e.target.value = String(normalized);
    state.room.config.pickDurationSec = normalized;
    scheduleLobbyConfigPush();
  });

  const closeAllLobbyDropdowns = () => {
    const categoryPanel = document.getElementById("allowanceCategoryPanel");
    const categoryTrigger = document.getElementById("allowanceCategoryTrigger");
    const modePanel = document.getElementById("lobbyRevealModePanel");
    const modeTrigger = document.getElementById("lobbyRevealModeTrigger");
    if (categoryPanel) categoryPanel.classList.remove("is-open");
    if (categoryTrigger) {
      categoryTrigger.classList.remove("open");
      categoryTrigger.setAttribute("aria-expanded", "false");
    }
    if (modePanel) modePanel.classList.remove("is-open");
    if (modeTrigger) {
      modeTrigger.classList.remove("open");
      modeTrigger.setAttribute("aria-expanded", "false");
    }

    state.openRevealModeMenu = false;

    document.querySelectorAll("[data-allowance-pos-dropdown].is-open").forEach((el) => {
      el.classList.remove("is-open");
    });
    document.querySelectorAll("[data-allowance-pos-cap-wrap].is-open").forEach((el) => {
      el.classList.remove("is-open");
    });
    document.querySelectorAll("[data-allowance-cap-wrap].is-open").forEach((el) => {
      el.classList.remove("is-open");
    });
    document.querySelectorAll("[data-allowance-multi-dropdown].is-open").forEach((el) => {
      el.classList.remove("is-open");
    });

    state.openAllowancePosKey = "";
    state.openAllowancePosCapKey = "";
    state.openAllowanceCardTypeKey = "";
    state.openAllowanceCardTypeCapKey = "";
    state.openAllowanceRegionKey = "";
    state.openAllowanceRegionCapKey = "";
    state.openAllowancePlayingStyleKey = "";
    state.openAllowancePlayingStyleCapKey = "";
    state.clubSearchOpen = false;
    state.clubSearchActiveIndex = -1;
  };

  document.getElementById("lobbyRevealModeTrigger")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (state.mySide !== "host" || e.currentTarget.disabled) return;
    const willOpen = !state.openRevealModeMenu;
    closeAllLobbyDropdowns();
    state.openRevealModeMenu = willOpen;
    renderLobby();
  });
  document.getElementById("lobbyRevealModePanel")?.addEventListener("click", (e) => {
    const option = e.target.closest("[data-lobby-reveal-mode-option]");
    if (!option || state.mySide !== "host") return;
    const mode = normalizeRevealMode(option.dataset.lobbyRevealModeOption);
    const input = document.getElementById("lobbyRevealModeInput");
    if (input) {
      input.value = mode;
      input.dataset.touched = "1";
    }
    state.room.config.revealMode = mode;
    state.openRevealModeMenu = false;
    renderLobby();
    scheduleLobbyConfigPush();
  });

  document.getElementById("addAllowanceBtn")?.addEventListener("click", () => {
    if (state.mySide !== "host") return;
    const dropdown = document.getElementById("allowanceCategoryDd");
    const key = dropdown?.dataset.selectedKey || "";
    if (!key) return;
    const cfg = state.room.config || defaultRoomConfig();
    const enabled = new Set(cfg.allowanceEnabled || []);
    if (enabled.has(key)) return;
    enabled.add(key);
    state.room.config.allowanceEnabled = [...enabled];
    if (key === "foot") {
      state.room.config.allowance[key] = normalizeFootValue(state.room.config.allowance[key], { defaultAll: true }).join(",");
    } else if (TEXT_ALLOWANCE_LIST_KEYS.has(key)) {
      state.room.config.allowance[key] = normalizeTextAllowanceListValue(state.room.config.allowance[key]).join(",");
    } else {
      state.room.config.allowance[key] = state.room.config.allowance[key] || "";
    }
    if (TEXT_ALLOWANCE_LIST_KEYS.has(key)) {
      state.room.config.allowanceCaps[key] = stringifyTextAllowanceCapMap(
        state.room.config.allowanceCaps[key],
        normalizeTextAllowanceListValue(state.room.config.allowance[key]),
      );
    } else {
      state.room.config.allowanceCaps[key] = normalizeAllowanceCapValue(state.room.config.allowanceCaps[key]);
    }
    renderLobby();
    const node = document.querySelector(`[data-allowance-key="${key}"]`);
    if (node) {
      node.classList.add("is-added");
      setTimeout(() => node.classList.remove("is-added"), 220);
    }

    if (dropdown) dropdown.dataset.selectedKey = "";
    const trigger = document.getElementById("allowanceCategoryTrigger");
    const label = document.getElementById("allowanceCategoryLabel");
    const panel = document.getElementById("allowanceCategoryPanel");
    if (trigger) trigger.classList.remove("open");
    if (trigger) trigger.classList.add("is-placeholder");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (panel) panel.classList.remove("is-open");
    if (label) label.textContent = "Choose a category";

    scheduleLobbyConfigPush();
  });

  document.getElementById("allowanceList")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-allowance-remove]");
    if (btn && state.mySide === "host") {
      const key = btn.dataset.allowanceRemove;
      const cfg = state.room.config || defaultRoomConfig();
      cfg.allowanceEnabled = (cfg.allowanceEnabled || []).filter((k) => k !== key);
      cfg.allowance[key] = "";
      cfg.allowanceCaps[key] = "";
      if (TEXT_ALLOWANCE_LIST_KEYS.has(key)) clearClubSearchState();
      if (state.openAllowancePosKey === key) state.openAllowancePosKey = "";
      if (state.openAllowancePosCapKey === key) state.openAllowancePosCapKey = "";
      if (state.openAllowanceCardTypeCapKey === key) state.openAllowanceCardTypeCapKey = "";
      if (state.openAllowanceRegionCapKey === key) state.openAllowanceRegionCapKey = "";
      if (state.openAllowancePlayingStyleCapKey === key) state.openAllowancePlayingStyleCapKey = "";
      renderLobby();
      scheduleLobbyConfigPush();
      return;
    }

    const trigger = e.target.closest("[data-allowance-pos-trigger]");
    if (trigger && state.mySide === "host") {
      if (trigger.disabled) return;
      const dropdown = trigger.closest("[data-allowance-pos-dropdown]");
      if (!dropdown) return;
      const key = String(dropdown.dataset.allowancePosKey || "").trim();
      const willOpen = !dropdown.classList.contains("is-open");
      closeAllLobbyDropdowns();
      if (willOpen) {
        dropdown.classList.add("is-open");
        state.openAllowancePosKey = key;
      }
      return;
    }

    const option = e.target.closest("[data-allowance-pos-option]");
    if (option && state.mySide === "host") {
      const dropdown = option.closest("[data-allowance-pos-dropdown]");
      if (!dropdown) return;
      const key = String(dropdown.dataset.allowancePosKey || "").trim();
      const panel = dropdown.querySelector(".allowance-pos-panel");
      if (panel) state.openAllowancePosScrollTop = panel.scrollTop;
      option.classList.toggle("is-selected");
      const selected = Array.from(dropdown.querySelectorAll("[data-allowance-pos-option].is-selected"))
        .map((el) => String(el.dataset.allowancePosOption || "").trim())
        .filter(Boolean);
      const normalized = normalizePositionValue(selected.join(","));
      const hiddenInput = dropdown.querySelector(".allowance-pos-hidden");
      if (hiddenInput) hiddenInput.value = normalized.join(",");
      const summary = dropdown.querySelector(".allowance-pos-summary");
      if (summary) summary.textContent = positionSummaryText(normalized);
      state.room.config.allowance.position = normalized.join(",");
      state.room.config.allowanceCaps.position = stringifyPositionCapMap(state.room.config.allowanceCaps.position, normalized);
      renderLobby();
      scheduleLobbyConfigPush();
      return;
    }

    const footOption = e.target.closest("[data-allowance-foot-option]");
    if (footOption && state.mySide === "host") {
      const listWrap = footOption.closest("[data-allowance-foot-list]");
      if (!listWrap || footOption.disabled) return;
      if (footOption.classList.contains("is-selected")) {
        const selectedCount = listWrap.querySelectorAll("[data-allowance-foot-option].is-selected").length;
        if (selectedCount <= 1) {
          showToast("You have to select at least 1 option.");
          return;
        }
      }
      footOption.classList.toggle("is-selected");
      const selected = Array.from(listWrap.querySelectorAll("[data-allowance-foot-option].is-selected"))
        .map((el) => String(el.dataset.allowanceFootOption || "").trim())
        .filter((v) => FOOT_OPTIONS.includes(v));
      const normalized = normalizeFootValue(selected.join(","));
      const hiddenInput = listWrap.querySelector(".allowance-foot-hidden");
      if (hiddenInput) hiddenInput.value = normalized.join(",");
      state.room.config.allowance.foot = normalized.join(",");
      scheduleLobbyConfigPush();
      return;
    }

    const clubAddBtn = e.target.closest("[data-allowance-club-add]");
    if (clubAddBtn && state.mySide === "host") {
      if (clubAddBtn.disabled) return;
      const key = String(clubAddBtn.dataset.allowanceClubAdd || "").trim();
      if (!TEXT_ALLOWANCE_LIST_KEYS.has(key)) return;
      const item = clubAddBtn.closest(".allowance-item");
      const searchInput = item?.querySelector(".allowance-club-search");
      if (!searchInput) return;

      const typed = String(searchInput.value || "").replace(/\s+/g, " ").trim();
      if (!typed) return;
      if (!addTextAllowanceValue(key, typed)) return;
      renderLobby();
      const nextSearchInput = document.querySelector(`.allowance-club-search[data-allowance-club-search="${key}"]`);
      if (nextSearchInput) nextSearchInput.focus();
      scheduleLobbyConfigPush();
      return;
    }

    const clubSuggestion = e.target.closest("[data-allowance-club-suggestion]");
    if (clubSuggestion && state.mySide === "host") {
      const value = String(clubSuggestion.dataset.allowanceClubSuggestion || "").replace(/\s+/g, " ").trim();
      if (!value) return;
      const key = String(clubSuggestion.closest(".allowance-item")?.dataset.allowanceKey || state.clubSearchKey || "club").trim();
      state.clubSearchKey = key;
      state.clubSearchQuery = value;
      state.clubSearchOpen = false;
      state.clubSearchActiveIndex = -1;
      renderClubSuggestionPanel();
      const searchInput = document.querySelector(`.allowance-club-search[data-allowance-club-search="${key}"]`);
      if (searchInput) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }
      return;
    }

    const clubRemoveBtn = e.target.closest("[data-allowance-club-remove]");
    if (clubRemoveBtn && state.mySide === "host") {
      if (clubRemoveBtn.disabled) return;
      const key = String(clubRemoveBtn.closest(".allowance-item")?.dataset.allowanceKey || "").trim();
      if (!TEXT_ALLOWANCE_LIST_KEYS.has(key)) return;
      const club = String(clubRemoveBtn.dataset.allowanceClubRemove || "").replace(/\s+/g, " ").trim();
      if (!club) return;
      const clubs = normalizeTextAllowanceListValue(state.room.config.allowance[key] || "").filter((c) => c.toLowerCase() !== club.toLowerCase());
      const capMap = parseTextAllowanceCapMap(
        state.room.config.allowanceCaps[key],
        normalizeTextAllowanceListValue(state.room.config.allowance[key] || ""),
      );
      Object.keys(capMap).forEach((name) => {
        if (name.toLowerCase() === club.toLowerCase()) delete capMap[name];
      });
      state.room.config.allowance[key] = clubs.join(",");
      state.room.config.allowanceCaps[key] = stringifyTextAllowanceCapMap(capMap, clubs);
      renderLobby();
      scheduleLobbyConfigPush();
      return;
    }

    const multiTrigger = e.target.closest("[data-allowance-multi-trigger]");
    if (multiTrigger && state.mySide === "host") {
      if (multiTrigger.disabled) return;
      const dropdown = multiTrigger.closest("[data-allowance-multi-dropdown]");
      if (!dropdown) return;
      const multiType = String(multiTrigger.dataset.allowanceMultiTrigger || "").trim();
      const key = String(dropdown.dataset.allowanceMultiKey || "").trim();
      if (!multiType || !key) return;
      const willOpen = !dropdown.classList.contains("is-open");
      closeAllLobbyDropdowns();
      if (willOpen) {
        dropdown.classList.add("is-open");
        if (multiType === "cardType") {
          state.openAllowanceCardTypeKey = key;
        } else if (multiType === "region") {
          state.openAllowanceRegionKey = key;
        } else if (multiType === "playingStyle") {
          state.openAllowancePlayingStyleKey = key;
        }
      }
      return;
    }

    const multiOption = e.target.closest("[data-allowance-multi-option]");
    if (multiOption && state.mySide === "host") {
      const dropdown = multiOption.closest("[data-allowance-multi-dropdown]");
      if (!dropdown || multiOption.disabled) return;
      const multiType = String(multiOption.dataset.allowanceMultiOption || "").trim();
      const key = String(dropdown.dataset.allowanceMultiKey || "").trim();
      if (!key) return;
      multiOption.classList.toggle("is-selected");
      const selected = Array.from(dropdown.querySelectorAll("[data-allowance-multi-option].is-selected"))
        .map((el) => String(el.dataset.allowanceMultiValue || "").trim())
        .filter(Boolean);
      let normalized = [];
      let summaryText = "";
      if (multiType === "cardType") {
        normalized = normalizeCardTypeValue(selected.join(","));
        summaryText = cardTypeSummaryText(normalized);
      } else if (multiType === "region") {
        normalized = normalizeRegionValue(selected.join(","));
        summaryText = regionSummaryText(normalized);
      } else if (multiType === "playingStyle") {
        normalized = normalizePlayingStyleValue(selected.join(","));
        summaryText = playingStyleSummaryText(normalized);
      }
      const hiddenInput = dropdown.querySelector(".allowance-multi-hidden");
      if (hiddenInput) hiddenInput.value = normalized.join(",");
      const summary = dropdown.querySelector(".allowance-multi-summary");
      if (summary) summary.textContent = summaryText;
      state.room.config.allowance[key] = normalized.join(",");
      renderLobby();
      scheduleLobbyConfigPush();
      return;
    }

    const capTrigger = e.target.closest("[data-allowance-pos-cap-trigger]");
    if (capTrigger && state.mySide === "host") {
      const wrap = capTrigger.closest("[data-allowance-pos-cap-wrap]");
      if (!wrap || capTrigger.disabled) return;
      const key = String(wrap.dataset.allowancePosCapKey || "").trim();
      const willOpen = !wrap.classList.contains("is-open");
      closeAllLobbyDropdowns();
      if (willOpen) {
        wrap.classList.add("is-open");
        state.openAllowancePosCapKey = key;
      }
      return;
    }

    const multiCapTrigger = e.target.closest("[data-allowance-cap-trigger]");
    if (multiCapTrigger && state.mySide === "host") {
      const wrap = multiCapTrigger.closest("[data-allowance-cap-wrap]");
      if (!wrap || multiCapTrigger.disabled) return;
      const key = String(wrap.dataset.allowanceCapKey || "").trim();
      const capType = String(multiCapTrigger.dataset.allowanceCapTrigger || "").trim();
      const willOpen = !wrap.classList.contains("is-open");
      closeAllLobbyDropdowns();
      if (willOpen) {
        wrap.classList.add("is-open");
        if (capType === "cardType") {
          state.openAllowanceCardTypeCapKey = key;
        } else if (capType === "region") {
          state.openAllowanceRegionCapKey = key;
        } else if (capType === "playingStyle") {
          state.openAllowancePlayingStyleCapKey = key;
        }
      }
      return;
    }
  });

  document.getElementById("allowanceList")?.addEventListener("change", (e) => {
    const capInput = e.target.closest(".allowance-cap-input");
    if (capInput && state.mySide === "host") {
      const capType = String(capInput.dataset.allowanceCapKey || "").trim();
      const capValue = String(capInput.dataset.allowanceCapValue || "").trim();
      const key = capInput.closest("[data-allowance-cap-wrap]")?.dataset.allowanceCapKey;
      if (!capType || !capValue || !key) return;

      const n = Number(capInput.value);
      if (Number.isFinite(n) && n > FIXED_PICKS_PER_SIDE) {
        capInput.value = String(FIXED_PICKS_PER_SIDE);
      }
      if (Number.isFinite(n) && n < 1) {
        capInput.value = "";
      }

      let capMap = {};
      let normalizedCap = normalizeAllowanceCapValue(capInput.value);
      
      if (capType === "cardType") {
        const selected = normalizeCardTypeValue(state.room.config.allowance.cardType || "");
        capMap = parseCardTypeCapMap(state.room.config.allowanceCaps.cardType, selected);
      } else if (capType === "region") {
        const selected = normalizeRegionValue(state.room.config.allowance.region || "");
        capMap = parseRegionCapMap(state.room.config.allowanceCaps.region, selected);
      } else if (capType === "playingStyle") {
        const selected = normalizePlayingStyleValue(state.room.config.allowance.playingStyle || "");
        capMap = parsePlayingStyleCapMap(state.room.config.allowanceCaps.playingStyle, selected);
      } else {
        return;
      }

      if (normalizedCap) capMap[capValue] = normalizedCap;
      else delete capMap[capValue];

      if (capType === "cardType") {
        const selected = normalizeCardTypeValue(state.room.config.allowance.cardType || "");
        state.room.config.allowanceCaps.cardType = stringifyCardTypeCapMap(capMap, selected);
      } else if (capType === "region") {
        const selected = normalizeRegionValue(state.room.config.allowance.region || "");
        state.room.config.allowanceCaps.region = stringifyRegionCapMap(capMap, selected);
      } else if (capType === "playingStyle") {
        const selected = normalizePlayingStyleValue(state.room.config.allowance.playingStyle || "");
        state.room.config.allowanceCaps.playingStyle = stringifyPlayingStyleCapMap(capMap, selected);
      }

      scheduleLobbyConfigPush();
      return;
    }
  });

  const allowanceDropdown = document.getElementById("allowanceCategoryDd");
  const allowanceTrigger = document.getElementById("allowanceCategoryTrigger");
  const allowancePanel = document.getElementById("allowanceCategoryPanel");
  const allowanceLabel = document.getElementById("allowanceCategoryLabel");

  allowanceTrigger?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (state.mySide !== "host" || allowanceTrigger.disabled || !allowanceDropdown || !allowancePanel) return;
    const willOpen = !allowancePanel.classList.contains("is-open");
    closeAllLobbyDropdowns();
    if (willOpen) {
      allowancePanel.classList.add("is-open");
      allowanceTrigger.classList.add("open");
      allowanceTrigger.setAttribute("aria-expanded", "true");
    }
  });

  allowancePanel?.addEventListener("click", (e) => {
    const option = e.target.closest("[data-allowance-category-option]");
    if (!option || state.mySide !== "host" || !allowanceDropdown || !allowanceTrigger || !allowanceLabel || !allowancePanel) return;
    const key = String(option.dataset.allowanceCategoryOption || "").trim();
    if (!key) return;
    allowanceDropdown.dataset.selectedKey = key;
    allowanceLabel.textContent = ALLOWANCE_DEF_MAP.get(key)?.label || key;
    allowancePanel.classList.remove("is-open");
    allowanceTrigger.classList.remove("open");
    allowanceTrigger.setAttribute("aria-expanded", "false");
    renderLobby();
  });

  document.getElementById("allowanceList")?.addEventListener("input", (e) => {
    const searchInput = e.target.closest(".allowance-club-search");
    if (searchInput && state.mySide === "host") {
      const key = String(searchInput.dataset.allowanceClubSearch || "club").trim();
      scheduleClubSuggestions(key, searchInput.value);
      return;
    }

    const input = e.target.closest(".allowance-item-input");
    if (!input || state.mySide !== "host") return;
    const key = input.dataset.allowanceKey;
    if (!key) return;
    if (input.classList.contains("allowance-item-range")) {
      const item = input.closest(".allowance-item");
      const minInput = item?.querySelector(`.allowance-item-range[data-allowance-key="${key}"][data-allowance-range-bound="min"]`);
      const maxInput = item?.querySelector(`.allowance-item-range[data-allowance-key="${key}"][data-allowance-range-bound="max"]`);
      const normalizedRange = normalizeAllowanceRangeValue(minInput?.value, maxInput?.value);
      const parsedRange = parseAllowanceRangeValue(normalizedRange);
      if (minInput) minInput.value = parsedRange.min;
      if (maxInput) maxInput.value = parsedRange.max;
      state.room.config.allowance[key] = normalizedRange;
    } else {
      state.room.config.allowance[key] = readAllowanceFieldValue(input);
    }
    scheduleLobbyConfigPush();
  });
  document.getElementById("allowanceList")?.addEventListener("change", (e) => {
    const clubCapInput = e.target.closest(".allowance-club-cap-input");
    if (clubCapInput && state.mySide === "host") {
      const key = String(clubCapInput.closest(".allowance-item")?.dataset.allowanceKey || "").trim();
      if (!TEXT_ALLOWANCE_LIST_KEYS.has(key)) return;
      const club = String(clubCapInput.dataset.allowanceClubCap || "").replace(/\s+/g, " ").trim();
      if (!club) return;
      const clubs = normalizeTextAllowanceListValue(state.room.config.allowance[key] || "");
      const capMap = parseTextAllowanceCapMap(state.room.config.allowanceCaps[key], clubs);
      const normalizedCap = normalizeAllowanceCapValue(clubCapInput.value);
      clubCapInput.value = normalizedCap;
      if (normalizedCap) capMap[club] = normalizedCap;
      else delete capMap[club];
      state.room.config.allowanceCaps[key] = stringifyTextAllowanceCapMap(capMap, clubs);
      scheduleLobbyConfigPush();
      return;
    }

    const capInput = e.target.closest(".allowance-item-cap");
    if (capInput && state.mySide === "host") {
      const key = capInput.dataset.allowanceCapKey;
      if (!key) return;
      const normalizedCap = normalizeAllowanceCapValue(capInput.value);
      capInput.value = normalizedCap;
      state.room.config.allowanceCaps[key] = normalizedCap;
      scheduleLobbyConfigPush();
      return;
    }
    const input = e.target.closest(".allowance-item-input");
    if (!input || state.mySide !== "host") return;
    const key = input.dataset.allowanceKey;
    if (!key) return;
    if (input.classList.contains("allowance-item-range")) {
      const item = input.closest(".allowance-item");
      const minInput = item?.querySelector(`.allowance-item-range[data-allowance-key="${key}"][data-allowance-range-bound="min"]`);
      const maxInput = item?.querySelector(`.allowance-item-range[data-allowance-key="${key}"][data-allowance-range-bound="max"]`);
      const normalizedRange = normalizeAllowanceRangeValue(minInput?.value, maxInput?.value);
      const parsedRange = parseAllowanceRangeValue(normalizedRange);
      if (minInput) minInput.value = parsedRange.min;
      if (maxInput) maxInput.value = parsedRange.max;
      state.room.config.allowance[key] = normalizedRange;
    } else {
      state.room.config.allowance[key] = readAllowanceFieldValue(input);
    }
    scheduleLobbyConfigPush();
  });
  document.getElementById("allowanceList")?.addEventListener("change", (e) => {
    const capInput = e.target.closest(".allowance-pos-cap-input");
    if (!capInput || state.mySide !== "host") return;
    const pos = String(capInput.dataset.allowancePos || "").trim().toUpperCase();
    if (!POSITION_OPTIONS.includes(pos)) return;
    const selected = normalizePositionValue(state.room.config.allowance.position || "");
    const capMap = parsePositionCapMap(state.room.config.allowanceCaps.position, selected);
    const normalizedCap = normalizeAllowanceCapValue(capInput.value);
    capInput.value = normalizedCap;
    if (normalizedCap) capMap[pos] = normalizedCap;
    else delete capMap[pos];
    state.room.config.allowanceCaps.position = stringifyPositionCapMap(capMap, selected);
    scheduleLobbyConfigPush();
  });
  document.getElementById("allowanceList")?.addEventListener("input", (e) => {
    const clubCapInput = e.target.closest(".allowance-club-cap-input");
    if (clubCapInput && state.mySide === "host") {
      const key = String(clubCapInput.closest(".allowance-item")?.dataset.allowanceKey || "").trim();
      if (!TEXT_ALLOWANCE_LIST_KEYS.has(key)) return;
      const club = String(clubCapInput.dataset.allowanceClubCap || "").replace(/\s+/g, " ").trim();
      if (!club) return;
      const clubs = normalizeTextAllowanceListValue(state.room.config.allowance[key] || "");
      const capMap = parseTextAllowanceCapMap(state.room.config.allowanceCaps[key], clubs);
      if (clubCapInput.value === "") {
        delete capMap[club];
        state.room.config.allowanceCaps[key] = stringifyTextAllowanceCapMap(capMap, clubs);
        scheduleLobbyConfigPush();
        return;
      }
      const n = Number(clubCapInput.value);
      if (Number.isFinite(n) && n > FIXED_PICKS_PER_SIDE) {
        clubCapInput.value = String(FIXED_PICKS_PER_SIDE);
      }
      if (Number.isFinite(n) && n < 1) {
        clubCapInput.value = "";
      }
      const normalizedCap = normalizeAllowanceCapValue(clubCapInput.value);
      if (normalizedCap) capMap[club] = normalizedCap;
      else delete capMap[club];
      state.room.config.allowanceCaps[key] = stringifyTextAllowanceCapMap(capMap, clubs);
      scheduleLobbyConfigPush();
      return;
    }

    const capInput = e.target.closest(".allowance-item-cap");
    if (capInput && state.mySide === "host") {
      const key = capInput.dataset.allowanceCapKey;
      if (!key) return;
      if (capInput.value === "") {
        state.room.config.allowanceCaps[key] = "";
        scheduleLobbyConfigPush();
        return;
      }
      const n = Number(capInput.value);
      if (Number.isFinite(n) && n > FIXED_PICKS_PER_SIDE) {
        capInput.value = String(FIXED_PICKS_PER_SIDE);
      }
      if (Number.isFinite(n) && n < 1) {
        capInput.value = "";
      }
      state.room.config.allowanceCaps[key] = normalizeAllowanceCapValue(capInput.value);
      scheduleLobbyConfigPush();
      return;
    }

    const posCapInput = e.target.closest(".allowance-pos-cap-input");
    if (posCapInput && state.mySide === "host") {
      const pos = String(posCapInput.dataset.allowancePos || "").trim().toUpperCase();
      if (!POSITION_OPTIONS.includes(pos)) return;
      if (posCapInput.value === "") {
        const selected = normalizePositionValue(state.room.config.allowance.position || "");
        const capMap = parsePositionCapMap(state.room.config.allowanceCaps.position, selected);
        delete capMap[pos];
        state.room.config.allowanceCaps.position = stringifyPositionCapMap(capMap, selected);
        scheduleLobbyConfigPush();
        return;
      }
      const n = Number(posCapInput.value);
      if (Number.isFinite(n) && n > FIXED_PICKS_PER_SIDE) {
        posCapInput.value = String(FIXED_PICKS_PER_SIDE);
      }
      if (Number.isFinite(n) && n < 1) {
        posCapInput.value = "";
      }
      const selected = normalizePositionValue(state.room.config.allowance.position || "");
      const capMap = parsePositionCapMap(state.room.config.allowanceCaps.position, selected);
      const normalizedCap = normalizeAllowanceCapValue(posCapInput.value);
      if (normalizedCap) capMap[pos] = normalizedCap;
      else delete capMap[pos];
      state.room.config.allowanceCaps.position = stringifyPositionCapMap(capMap, selected);
      scheduleLobbyConfigPush();
      return;
    }
  });
  document.getElementById("allowanceList")?.addEventListener("keydown", (e) => {
    const searchInput = e.target.closest(".allowance-club-search");
    if (!searchInput || state.mySide !== "host") return;
    const key = String(searchInput.dataset.allowanceClubSearch || "club").trim();
    state.clubSearchKey = key;
    if (e.key === "ArrowDown") {
      if (!state.clubSearchOptions.length) return;
      e.preventDefault();
      const next = state.clubSearchActiveIndex < 0
        ? 0
        : Math.min(state.clubSearchOptions.length - 1, state.clubSearchActiveIndex + 1);
      state.clubSearchActiveIndex = next;
      state.clubSearchOpen = true;
      renderClubSuggestionPanel();
      return;
    }
    if (e.key === "ArrowUp") {
      if (!state.clubSearchOptions.length) return;
      e.preventDefault();
      const next = state.clubSearchActiveIndex <= 0
        ? 0
        : state.clubSearchActiveIndex - 1;
      state.clubSearchActiveIndex = next;
      state.clubSearchOpen = true;
      renderClubSuggestionPanel();
      return;
    }
    if (e.key === "Escape") {
      if (!state.clubSearchOpen) return;
      e.preventDefault();
      state.clubSearchOpen = false;
      state.clubSearchActiveIndex = -1;
      renderClubSuggestionPanel();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (state.clubSearchOpen && state.clubSearchActiveIndex >= 0 && state.clubSearchOptions[state.clubSearchActiveIndex]) {
      state.clubSearchQuery = state.clubSearchOptions[state.clubSearchActiveIndex];
      state.clubSearchOpen = false;
      state.clubSearchActiveIndex = -1;
      renderClubSuggestionPanel();
      const nextSearchInput = document.querySelector(`.allowance-club-search[data-allowance-club-search="${key}"]`);
      if (nextSearchInput) {
        nextSearchInput.focus();
        nextSearchInput.setSelectionRange(nextSearchInput.value.length, nextSearchInput.value.length);
      }
      return;
    }
    const addBtn = searchInput.closest(".allowance-item")?.querySelector(`[data-allowance-club-add='${key}']`);
    if (addBtn && !addBtn.disabled) addBtn.click();
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("#allowanceCategoryDd")) return;
    if (e.target.closest("#allowanceCategoryPanel")) return;
    if (e.target.closest("[data-allowance-pos-dropdown]")) return;
    if (e.target.closest("[data-allowance-pos-cap-wrap]")) return;
    if (e.target.closest("[data-allowance-cap-wrap]")) return;
    if (e.target.closest("[data-allowance-multi-dropdown]")) return;
    if (e.target.closest("[data-allowance-club-search-wrap]")) return;
    if (e.target.closest("#lobbyRevealModeDd")) return;
    closeAllLobbyDropdowns();
    if (state.clubSearchOpen) {
      state.clubSearchOpen = false;
      state.clubSearchActiveIndex = -1;
      renderClubSuggestionPanel();
    }
  });

  document.getElementById("chatForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chatInput");
    const value = input?.value || "";
    if (!value.trim()) return;
    await sendLobbyChatMessage(value);
    input.value = "";
  });

  document.getElementById("lobbyLeaveBtn")?.addEventListener("click", async () => {
    if (state.mySide === "host") {
      const ok = await askConfirm({
        title: "Close Room",
        message: "Close room for everyone?",
        okText: "Close room",
      });
      if (!ok) return;
    } else if (state.phase === "draft") {
      const ok = await askConfirm({
        title: "Leave Draft",
        message: "Leaving will exit the draft. Continue?",
        okText: "Leave",
      });
      if (!ok) return;
    }
    stopPresencePolling();
    await leavePresence();
    window.location.href = "/";
  });
  document.getElementById("kickGuestBtn")?.addEventListener("click", async () => {
    if (state.mySide !== "host" || !state.room?.guest) return;
    const yes = await askConfirm({
      title: "Kick guest",
      message: `Remove ${state.room.guest.username || "guest"} from this room?`,
      okText: "Kick",
      cancelText: "Cancel",
    });
    if (!yes) return;
    const me = getCurrentIdentity();
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/kick-guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId: me.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Could not kick guest.");
        return;
      }
      if (data.room) {
        applyPresenceSnapshot(data.room);
        renderLobby();
      }
      showToast("Guest removed.");
    } catch {
      showToast("Could not kick guest.");
    }
  });
}

function initDraftControls() {
  document.getElementById("draftSearch")?.addEventListener("input", (e) => {
    state.search = e.target.value;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => loadDraftPlayers(), 300);
  });
  document.getElementById("draftPosition")?.addEventListener("change", (e) => {
    state.position = e.target.value;
    loadDraftPlayers();
  });
  document.getElementById("draftGamePlanSelect")?.addEventListener("change", (e) => {
    state.draftGamePlanSelectedId = e.target.value || null;
    void loadDraftGamePlanPlayers(state.draftGamePlanSelectedId).then(() => renderDraftUi());
  });
  document.getElementById("draftTopReadyBtn")?.addEventListener("click", () => {
    if (state.phase !== "ready" || !state.room) return;
    const me = state.mySide;
    const nextReady = !Boolean(state.room.matchReady?.[me]);
    void setMatchReady(nextReady);
  });
  document.getElementById("draftLeaveBtn")?.addEventListener("click", async () => {
    if (state.mySide === "host") {
      const ok = await askConfirm({
        title: "Close Room",
        message: "Close room for everyone?",
        okText: "Close room",
      });
      if (!ok) return;
    } else {
      const ok = await askConfirm({
        title: "Leave Draft",
        message: "Leave the draft?",
        okText: "Leave",
      });
      if (!ok) return;
    }
    clearTurnTimer();
    await leavePresence();
    window.location.href = "/";
  });
}

/* SOCKET HOOKS (future): replace initLobby local room with:
 *   socket.emit('room:rejoin', { code }, cb)
 *   socket.on('room:updated', setRoom)
 *   socket.on('room:done', ...)
 *   emit('room:action', { code, playerId }) instead of applyLocalAction
 * ───────────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  initDraftControls();

  const code = getRoomCodeFromUrl();
  document.getElementById("copyInviteBtn")?.addEventListener("click", () => {
    const inviteUrl = new URL(window.location.origin + `/room/${encodeURIComponent(code)}`);
    inviteUrl.searchParams.set("mode", "join");
    navigator.clipboard.writeText(inviteUrl.toString()).then(
      () => showToast("Invite link copied!"),
      () => showToast(inviteUrl.toString()),
    );
  });
  document.getElementById("copyCodeBtn")?.addEventListener("click", () => {
    if (!code) return showToast("No room code.");
    navigator.clipboard.writeText(code).then(
      () => showToast("Code copied!"),
      () => showToast(code),
    );
  });

  window.addEventListener("beforeunload", (e) => {
    if (state.phase === "draft") {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  window.requestAnimationFrame(() => {
    initLobby();
  });
});
