import {
  POSITION_OPTIONS,
  FOOT_OPTIONS,
  CARD_TYPE_OPTIONS,
  REGION_OPTIONS,
  PLAYING_STYLE_OPTIONS,
  ALLOWANCE_DEF_MAP,
  ALLOWANCE_RANGE_KEYS,
  TEXT_ALLOWANCE_LIST_KEYS,
  FIXED_PICKS_PER_SIDE,
} from './constants.js';

export function normalizePositionValue(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i && POSITION_OPTIONS.includes(v));
}

export function normalizeFootValue(raw, { defaultAll = false } = {}) {
  const normalized = String(raw || "")
    .split(",")
    .map((v) => String(v || "").trim().toLowerCase())
    .map((v) => (v === "left" ? "Left" : v === "right" ? "Right" : ""))
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);
  if (normalized.length) return normalized;
  return defaultAll ? [...FOOT_OPTIONS] : [];
}

export function normalizeCardTypeValue(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i && CARD_TYPE_OPTIONS.includes(v));
}

export function normalizeRegionValue(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i && REGION_OPTIONS.includes(v));
}

export function normalizePlayingStyleValue(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i && PLAYING_STYLE_OPTIONS.includes(v));
}

export function normalizeClubValue(raw) {
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

export function normalizeTextAllowanceListValue(raw) {
  return normalizeClubValue(raw);
}

export function dedupeCaseInsensitive(values) {
  const seen = new Set();
  return values.filter((v) => {
    const key = String(v || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function positionSummaryText(selected) {
  if (!selected.length) return "All positions";
  if (selected.length <= 7) return selected.join(", ");
  return `${selected.length} selected`;
}

export function cardTypeSummaryText(selected) {
  if (!selected.length) return "All card types";
  if (selected.length <= 3) return selected.join(", ");
  return `${selected.length} selected`;
}

export function regionSummaryText(selected) {
  if (!selected.length) return "All regions";
  if (selected.length <= 3) return selected.join(", ");
  return `${selected.length} selected`;
}

export function playingStyleSummaryText(selected) {
  if (!selected.length) return "All styles";
  if (selected.length <= 3) return selected.join(", ");
  return `${selected.length} selected`;
}

export function normalizeAllowanceCapValue(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.min(FIXED_PICKS_PER_SIDE, Math.floor(n)));
}

export function parsePositionCapMap(raw, selectedPositions = []) {
  const selectedSet = new Set(normalizePositionValue(selectedPositions.join(",")));
  let parsed = {};

  if (raw && typeof raw === "object") {
    parsed = raw;
  } else {
    const text = String(raw || "").trim();
    if (text) {
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

export function stringifyPositionCapMap(map, selectedPositions = []) {
  const normalized = parsePositionCapMap(map, selectedPositions);
  const keys = Object.keys(normalized);
  if (!keys.length) return "";
  return JSON.stringify(normalized);
}

export function positionCapSummaryText(capMap, selectedPositions) {
  const selected = normalizePositionValue(selectedPositions.join(","));
  const effective = selected.length ? selected : POSITION_OPTIONS;
  const active = effective.filter((pos) => normalizeAllowanceCapValue(capMap[pos]));
  if (!active.length) return "No caps";
  if (active.length <= 2) return active.map((pos) => `${pos}:${capMap[pos]}`).join(" / ");
  return `${active.length} capped`;
}

export function parseCardTypeCapMap(raw, selectedCardTypes = []) {
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

export function stringifyCardTypeCapMap(map, selectedCardTypes = []) {
  const normalized = parseCardTypeCapMap(map, selectedCardTypes);
  const keys = Object.keys(normalized);
  if (!keys.length) return "";
  return JSON.stringify(normalized);
}

export function cardTypeCapSummaryText(capMap, selectedCardTypes) {
  const selected = normalizeCardTypeValue(selectedCardTypes.join(","));
  const effective = selected.length ? selected : CARD_TYPE_OPTIONS;
  const active = effective.filter((ct) => normalizeAllowanceCapValue(capMap[ct]));
  if (!active.length) return "No caps";
  if (active.length <= 2) return active.map((ct) => `${ct}:${capMap[ct]}`).join(" / ");
  return `${active.length} capped`;
}

export function parseRegionCapMap(raw, selectedRegions = []) {
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

export function stringifyRegionCapMap(map, selectedRegions = []) {
  const normalized = parseRegionCapMap(map, selectedRegions);
  const keys = Object.keys(normalized);
  if (!keys.length) return "";
  return JSON.stringify(normalized);
}

export function regionCapSummaryText(capMap, selectedRegions) {
  const selected = normalizeRegionValue(selectedRegions.join(","));
  const effective = selected.length ? selected : REGION_OPTIONS;
  const active = effective.filter((r) => normalizeAllowanceCapValue(capMap[r]));
  if (!active.length) return "No caps";
  if (active.length <= 2) return active.map((r) => `${r}:${capMap[r]}`).join(" / ");
  return `${active.length} capped`;
}

export function parsePlayingStyleCapMap(raw, selectedPlayingStyles = []) {
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

export function stringifyPlayingStyleCapMap(map, selectedPlayingStyles = []) {
  const normalized = parsePlayingStyleCapMap(map, selectedPlayingStyles);
  const keys = Object.keys(normalized);
  if (!keys.length) return "";
  return JSON.stringify(normalized);
}

export function playingStyleCapSummaryText(capMap, selectedPlayingStyles) {
  const selected = normalizePlayingStyleValue(selectedPlayingStyles.join(","));
  const effective = selected.length ? selected : PLAYING_STYLE_OPTIONS;
  const active = effective.filter((ps) => normalizeAllowanceCapValue(capMap[ps]));
  if (!active.length) return "No caps";
  if (active.length <= 2) return active.map((ps) => `${ps}:${capMap[ps]}`).join(" / ");
  return `${active.length} capped`;
}

export function parseClubCapMap(raw, selectedClubs = []) {
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

export function stringifyClubCapMap(map, selectedClubs = []) {
  const normalized = parseClubCapMap(map, selectedClubs);
  const keys = Object.keys(normalized);
  if (!keys.length) return "";
  return JSON.stringify(normalized);
}

export function parseTextAllowanceCapMap(raw, selectedValues = []) {
  return parseClubCapMap(raw, selectedValues);
}

export function stringifyTextAllowanceCapMap(map, selectedValues = []) {
  return stringifyClubCapMap(map, selectedValues);
}

export function splitCsvValue(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function parseNumberOrNull(raw) {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function normalizeAllowanceRangeValue(minRaw, maxRaw) {
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

export function parseAllowanceRangeValue(raw) {
  const [minRaw = "", maxRaw = ""] = String(raw || "").split(",");
  return {
    min: String(minRaw).trim(),
    max: String(maxRaw).trim(),
  };
}

export function parseAllowanceRangeNumbers(raw) {
  const { min, max } = parseAllowanceRangeValue(raw);
  return {
    min: parseNumberOrNull(min),
    max: parseNumberOrNull(max),
  };
}

export function isWithinOptionalRange(value, min, max) {
  if (value == null) return false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return min != null || max != null;
}

export function matchesAnyIncludes(fieldValue, queryRaw) {
  const hay = String(fieldValue || "").toLowerCase();
  const needles = splitCsvValue(queryRaw).map((v) => v.toLowerCase());
  if (!needles.length) return false;
  return needles.some((q) => hay.includes(q));
}

export function matchesAnyEquals(fieldValue, queryRaw) {
  const hay = String(fieldValue || "").toLowerCase();
  const needles = splitCsvValue(queryRaw).map((v) => v.toLowerCase());
  if (!needles.length) return false;
  return needles.includes(hay);
}

export function playerMatchesAllowanceCategory(player, key, valueRaw) {
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

export function getAllowanceCapViolation(room, side, player) {
  const cfg = room?.config || {};
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
