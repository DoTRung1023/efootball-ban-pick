const GREEN = "#00e676";
const RED = "#ff4444";
const TURN_SECONDS = 30;
const FIXED_PICKS_PER_SIDE = 23;
const DEFAULT_BAN_DURATION_SECONDS = 15;
const MIN_BAN_DURATION_SECONDS = 5;
const MAX_BAN_DURATION_SECONDS = 120;
const LOBBY_PRESENCE_POLL_MS = 500;
const REVEAL_MODE_INSTANT = "instant";
const REVEAL_MODE_HIDDEN = "hidden";

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

function normalizeRevealMode(raw) {
  return String(raw || "").trim().toLowerCase() === REVEAL_MODE_HIDDEN
    ? REVEAL_MODE_HIDDEN
    : REVEAL_MODE_INSTANT;
}

function getTurnDurationSec(turn, cfg = state.room?.config || defaultRoomConfig()) {
  if (turn?.action === "ban") return normalizeBanDurationSec(cfg?.banDurationSec);
  return TURN_SECONDS;
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
  actionError: "",
};

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
    banCountPerSide: 0,
    banDurationSec: DEFAULT_BAN_DURATION_SECONDS,
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
  room.chat = Array.isArray(sr.chat) ? sr.chat : [];
  room.status = String(sr.status || room.status || "lobby");
  room.turnIndex = Number.isFinite(Number(sr.turnIndex)) ? Math.max(0, Math.floor(Number(sr.turnIndex))) : Number(room.turnIndex || 0);
  room.turnEndsAt = sr.turnEndsAt ? Number(sr.turnEndsAt) : null;
  room.closed = Boolean(sr.closed);
  room.closeReason = sr.closeReason || "";
  state.lastRoomUpdatedAt = Number(sr.updatedAt || state.lastRoomUpdatedAt || Date.now());
}

function tryEnterDraftFromRoomSnapshot() {
  const room = state.room;
  if (!room || state.phase !== "lobby") return false;
  if (String(room.status || "") !== "drafting") return false;

  const bansPerSide = Math.max(0, Math.floor(Number(room.config?.banCountPerSide) || 0));
  state.schedule = buildTurnSchedule(bansPerSide, FIXED_PICKS_PER_SIDE);
  syncCurrentTurnFromIndex(room);

  state.phase = "draft";
  stopPresencePolling();
  showView("viewDraft");
  renderDraftUi();
  attachDraftGridHandlers();
  void loadDraftPlayers();
  startTurnTimer();
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
  if (state.phase !== "lobby" || !state.room?.code) return;
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

    if (tryEnterDraftFromRoomSnapshot()) return;
    if (snap.changed || presenceChanged || configChanged) renderLobby();
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
  const turns = [];
  for (let i = 0; i < bansPerSide * 2; i++) {
    turns.push({ side: i % 2 === 0 ? "host" : "guest", action: "ban" });
  }
  for (let i = 0; i < picksPerSide * 2; i++) {
    turns.push({ side: i % 2 === 0 ? "host" : "guest", action: "pick" });
  }
  return turns;
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
    const violation = getAllowanceCapViolation(room, turn.side, player);
    if (violation) {
      state.actionError = `${violation.label}: max ${violation.cap} card(s) allowed per side.`;
      showToast(state.actionError);
      return false;
    }
  }

  if (turn.action === "ban") {
    room.bans[turn.side].push(player);
    room.bannedPlayerIds.push(id);
  } else {
    room.picks[turn.side].push(player);
    room.pickedPlayerIds.push(id);
  }

  room.turnIndex += 1;
  syncCurrentTurnFromIndex(room);

  if (room.turnIndex >= state.schedule.length) {
    room.status = "done";
    state.phase = "done";
    clearTurnTimer();
    showDone();
    return true;
  }

  room.turnEndsAt = Date.now() + getTurnDurationSec(state.schedule[room.turnIndex], room.config) * 1000;
  startTurnTimer();
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
      state.actionError = "⏱ Time ran out — turn skipped (local demo).";
      const r = state.room;
      if (r && state.schedule[r.turnIndex] !== undefined) {
        r.turnIndex += 1;
        syncCurrentTurnFromIndex(r);
        if (r.turnIndex >= state.schedule.length) {
          r.status = "done";
          state.phase = "done";
          showDone();
          return;
        }
        r.turnEndsAt = Date.now() + getTurnDurationSec(state.schedule[r.turnIndex], r.config) * 1000;
        startTurnTimer();
      }
      const errEl = document.getElementById("draftActionError");
      if (errEl) {
        errEl.textContent = state.actionError;
        errEl.hidden = false;
      }
      setTimeout(() => {
        state.actionError = "";
        const e = document.getElementById("draftActionError");
        if (e) e.hidden = true;
      }, 3000);
      renderDraftUi();
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
  const revealModeEl = document.getElementById("lobbyRevealModeInput");
  const revealModeTrigger = document.getElementById("lobbyRevealModeTrigger");
  const revealModePanel = document.getElementById("lobbyRevealModePanel");
  const revealModeLabel = document.getElementById("lobbyRevealModeLabel");
  if (allowAllEl && !allowAllEl.dataset.touched) allowAllEl.checked = Boolean(cfg.allowAllPlayers);
  if (bansEl && !bansEl.dataset.touched) bansEl.value = String(cfg.banCountPerSide ?? 0);
  if (banDurationEl && !banDurationEl.dataset.touched) banDurationEl.value = String(normalizeBanDurationSec(cfg.banDurationSec));
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
  const revealModeInput = document.getElementById("lobbyRevealModeInput");
  const banDurationSec = banDurationInput
    ? normalizeBanDurationSec(banDurationInput.value)
    : normalizeBanDurationSec(cfg.banDurationSec);
  const revealMode = revealModeInput
    ? normalizeRevealMode(revealModeInput.value)
    : normalizeRevealMode(cfg.revealMode);
  const reqSeq = ++latestConfigSyncSeq;

  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.code)}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId: myId, clientSeq: reqSeq, allowAllPlayers: allowAll, banCountPerSide, banDurationSec, revealMode, allowanceEnabled, allowance, allowanceCaps }),
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
  const hidePicks = state.phase === "draft" && normalizeRevealMode(room.config?.revealMode) === REVEAL_MODE_HIDDEN;

  const head = `
    <div class="side-panel-head ${isMe ? "is-me" : ""}">
      ${isMe ? "▶ " : ""}${String(title).toUpperCase()}
      ${isMe ? '<span class="you-tag">(you)</span>' : ""}
      ${isTurn ? '<span class="turn-dot"></span>' : ""}
    </div>
    <div class="slot-section-label">BANS (${bans.length}/${bMax || "—"})</div>
    <div class="slot-list">
      ${Array.from({ length: Math.max(bMax, bans.length) }).map((_, i) => slotHtml(bans[i], "ban")).join("")}
    </div>
    <div class="slot-section-label">PICKS (${picks.length}/${pMax || "—"})</div>
    <div class="slot-list">
      ${hidePicks
    ? Array.from({ length: Math.max(pMax, picks.length) }).map((_, i) => slotHiddenHtml(Boolean(picks[i]))).join("")
    : Array.from({ length: Math.max(pMax, picks.length) }).map((_, i) => slotHtml(picks[i], "pick")).join("")}
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
  const ovr = player.overall_rating ?? "—";
  const lastName = String(player.name || "").trim().split(/\s+/).pop() || player.name;
  return `
    <div class="slot-item ${isBan ? "is-ban" : "is-pick"}">
      <div class="slot-ovr">${ovr}</div>
      <div style="min-width:0">
        <div class="slot-name">${escapeHtml(lastName)}</div>
        <div class="slot-pos">${escapeHtml(player.position || "")}</div>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDraftUi() {
  const room = state.room;
  if (!room || state.phase !== "draft") return;

  const mySide = state.mySide;
  const turn = state.schedule[room.turnIndex];
  const isMyTurn = turn?.side === mySide;
  const isBanPhase = turn?.action === "ban";
  const totalTurns = state.schedule.length || 1;
  const turnNum = room.turnIndex + 1;
  const progress = (room.turnIndex / totalTurns) * 100;

  const pill = document.getElementById("turnPill");
  const kicker = document.getElementById("turnPillKicker");
  const main = document.getElementById("turnPillMain");
  if (kicker)
    kicker.textContent = `${isBanPhase ? "BAN" : "PICK"} ${turnNum}/${totalTurns}`;
  if (main) {
    const name =
      turn?.side === "host"
        ? room.host?.username || "Host"
        : room.guest?.username || "Guest";
    main.textContent = isMyTurn ? "YOUR TURN" : `${name}'s turn`;
  }
  if (pill) {
    pill.classList.toggle("is-mine", isMyTurn);
    pill.classList.toggle("is-ban", isBanPhase);
    pill.classList.toggle("is-pick", !isBanPhase);
  }

  document.getElementById("progressFill").style.width = `${progress}%`;

  const hint = document.getElementById("draftHintBanner");
  if (isMyTurn) {
    hint.hidden = false;
    hint.classList.toggle("is-ban", isBanPhase);
    hint.classList.toggle("is-pick", !isBanPhase);
    hint.textContent = isBanPhase
      ? "Click a player to BAN — banned players cannot be picked by either side."
      : "Click a player to add them to your squad.";
  } else {
    hint.hidden = true;
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

  renderSidePanel("sidePanelHost", "host", room, mySide);
  renderSidePanel("sidePanelGuest", "guest", room, mySide);

  const grid = document.getElementById("draftGrid");
  const hidePicks = normalizeRevealMode(room.config?.revealMode) === REVEAL_MODE_HIDDEN;
  grid.innerHTML = state.players
    .map((p) => {
      const id = String(p.id);
      const banned = room.bannedPlayerIds.includes(id);
      const pickedTaken = room.pickedPlayerIds.includes(id);
      const picked = hidePicks ? false : pickedTaken;
      const unavailable = banned || pickedTaken;
      const clickable = isMyTurn && !unavailable;
      return miniCardHtml(p, { banned, picked, clickable, isBanPhase });
    })
    .join("");
}

function miniCardHtml(player, o) {
  const { banned, picked, clickable, isBanPhase } = o;
  const unavailable = banned || picked;
  const phaseClass = isBanPhase ? "is-ban-phase" : "is-pick-phase";
  return `
    <div class="mini-card ${unavailable ? (banned ? "is-ban" : "is-pick") : ""} ${clickable ? "is-clickable" : ""}"
         data-player-id="${escapeHtml(player.id)}"
         tabindex="${clickable ? 0 : -1}">
      ${banned ? '<div class="mini-overlay" aria-hidden="true">🚫</div>' : ""}
      ${picked ? '<div class="mini-overlay" aria-hidden="true">✅</div>' : ""}
      <div class="mini-row">
        <div class="mini-ovr">${player.overall_rating}</div>
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
    </div>
  `;
}

/* delegated hover + click on grid */
function attachDraftGridHandlers() {
  const grid = document.getElementById("draftGrid");
  if (!grid || grid._bound) return;
  grid._bound = true;

  grid.addEventListener("mouseover", (e) => {
    const card = e.target.closest(".mini-card.is-clickable");
    grid.querySelectorAll(".mini-card.is-hovered").forEach((c) => c.classList.remove("is-hovered"));
    if (card) card.classList.add("is-hovered");
  });
  grid.addEventListener("mouseout", (e) => {
    const card = e.target.closest(".mini-card");
    if (card) card.classList.remove("is-hovered");
  });

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".mini-card.is-clickable");
    if (!card) return;
    const id = card.dataset.playerId;
    const player = state.players.find((p) => String(p.id) === id);
    if (!player) return;

    state.actionError = "";
    const errEl = document.getElementById("draftActionError");
    if (errEl) errEl.hidden = true;

    applyLocalAction(state.room, player);
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
    if (loading) loading.hidden = true;
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
  const typedDuration = Number(banDurationInput?.value);
  if (!Number.isFinite(typedDuration) || typedDuration <= 0 || typedDuration > 120) {
    showToast("Ban duration must be between 1 and 120 seconds.", "warn");
    if (banDurationInput) banDurationInput.focus();
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
  document.getElementById("lobbyBansInput")?.addEventListener("input", (e) => {
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
