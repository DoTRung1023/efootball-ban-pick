/**
 * The allowance model: what a category's stored value means, and whether a
 * squad satisfies it.
 *
 * A category answers two questions — *which players* it describes, and *how
 * many* of them a squad may hold. The five `range` categories answer the second
 * once for the whole category; every other shape answers it **per value**, as a
 * `{value: count}` map in `allowanceCaps` and the matching one in
 * `allowanceMins`. See `ALLOWANCE_CATEGORY_DEFS` in `constants.js`.
 *
 * The normalisers here are duplicated in `src/features/rooms/config.js` — the
 * client/server boundary has no shared module, so a change to one is a change
 * to both.
 */

import {
  POSITION_OPTIONS,
  FOOT_OPTIONS,
  ALLOWANCE_DEF_MAP,
  ALLOWANCE_VALUE_LIST_KEYS,
  FIXED_PICKS_PER_SIDE,
} from './constants.js';

const collapseSpaces = (raw) => String(raw || "").replace(/\s+/g, " ").trim();

function splitCsvValue(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
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

export function normalizePositionValue(raw) {
  return dedupeCaseInsensitive(
    splitCsvValue(raw).map((v) => v.toUpperCase()),
  ).filter((v) => POSITION_OPTIONS.includes(v));
}

/**
 * Trimmed, space-collapsed, case-insensitively deduped — and **not** checked
 * against any option list.
 *
 * The option lists for league, card type, region and playing style are fetched
 * at runtime and are empty until `/api/players/filter-options` answers.
 * Validating against one would silently erase a host's categories on any render
 * that beat the fetch, and club and nationality accept free text anyway: their
 * matcher is a substring, so "Barcelona" is a deliberate half of "FC Barcelona".
 */
function normalizeFreeTextList(raw) {
  return dedupeCaseInsensitive(splitCsvValue(raw).map(collapseSpaces));
}

/**
 * The selected values of a per-value category, in stored order.
 *
 * Foot is the exception it looks like: it is a `fixed` shape, so both options
 * are always on the row and the *counts* are what say whether either is
 * constrained. There is nothing to select.
 */
export function normalizeAllowanceListValue(key, raw) {
  if (key === "foot") return [...FOOT_OPTIONS];
  if (key === "position") return normalizePositionValue(raw);
  return normalizeFreeTextList(raw);
}

/** A whole player count in 1..23; `0` and `""` both mean "no rule". */
export function normalizeAllowanceCapValue(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.min(FIXED_PICKS_PER_SIDE, Math.floor(n)));
}

/**
 * A `{value: count}` map, narrowed to the values the category actually holds.
 *
 * Accepts the map as an object, as its JSON string, or as a bare number — the
 * last being a pre-per-value config, which is read as that count applying to
 * every selected value. Keys are matched case-insensitively but stored under
 * the selection's own casing, so a map written against "Real Madrid" still
 * answers for a value re-added as "real madrid".
 */
export function parseAllowanceCountMap(raw, selectedValues = []) {
  let parsed = {};

  if (raw && typeof raw === "object") {
    parsed = raw;
  } else {
    const text = String(raw || "").trim();
    if (text) {
      const legacyCount = normalizeAllowanceCapValue(text);
      if (legacyCount) {
        selectedValues.forEach((value) => { parsed[value] = legacyCount; });
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

  const byLowerKey = {};
  for (const [nameRaw, countRaw] of Object.entries(parsed)) {
    const name = collapseSpaces(nameRaw);
    const count = normalizeAllowanceCapValue(countRaw);
    if (name && count) byLowerKey[name.toLowerCase()] = count;
  }

  const effective = selectedValues.length
    ? selectedValues
    : Object.keys(parsed).map(collapseSpaces).filter(Boolean);

  const normalized = {};
  effective.forEach((value) => {
    const count = byLowerKey[String(value).toLowerCase()];
    if (count) normalized[value] = count;
  });
  return normalized;
}

export function stringifyAllowanceCountMap(map, selectedValues = []) {
  const normalized = parseAllowanceCountMap(map, selectedValues);
  return Object.keys(normalized).length ? JSON.stringify(normalized) : "";
}

/**
 * Both ends of one value's rule, in order.
 *
 * "At least 5, at most 3" refuses every possible squad, so an inverted pair is
 * swapped rather than stored — the same treatment the value range beside it
 * gets, and the server repeats it in `POST /:code/config` so no client can
 * store the unsatisfiable version.
 */
export function orderAllowanceCountPair(minRaw, capRaw) {
  let min = normalizeAllowanceCapValue(minRaw);
  let cap = normalizeAllowanceCapValue(capRaw);
  if (min && cap && Number(min) > Number(cap)) [min, cap] = [cap, min];
  return { min, cap };
}

function parseNumberOrNull(raw) {
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

/**
 * The two bounds exactly as typed, in the stored `"min,max"` shape.
 *
 * Deliberately does **not** clamp or reorder: this is what a keystroke writes,
 * and `normalizeAllowanceRangeValue` — which swaps an inverted pair — cannot run
 * until the field is left. With min 30 in place, typing the "3" of "35" into max
 * made `30 > 3` true, so the two swapped, both boxes were rewritten under the
 * cursor, and the rest of the number landed in the wrong field.
 */
export function rawAllowanceRangeValue(minRaw, maxRaw) {
  const min = String(minRaw ?? "").trim();
  const max = String(maxRaw ?? "").trim();
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

/**
 * One player attribute, whichever of the two shapes the object is in.
 *
 * The draft carries players in three normalisations and only **one** of them
 * has a `_raw`: `normalizeApiPlayer` (the catalog, behind the ban board) keeps
 * the row under `_raw`, while `normalizeMySquadPlayerForDraft` (your pool) and
 * `normalizeDraftPlayer` (everything that round-trips through the room) hoist
 * the fields flat.
 *
 * This file used to read `player._raw` and nothing else, so against a squad or
 * a lineup every attribute came back `undefined`: no cap was ever reached, no
 * minimum was ever met, and the pick board's counters sat at `0/2` for the
 * whole draft. Flat-first with a `_raw` fallback is the same reader
 * `playerFilters.js` uses on the same objects.
 */
const attr = (player, name) => player?.[name] ?? player?._raw?.[name] ?? "";

const equalsCI = (fieldValue, value) =>
  String(fieldValue || "").trim().toLowerCase() === String(value || "").trim().toLowerCase();

const includesCI = (fieldValue, value) =>
  String(fieldValue || "").toLowerCase().includes(String(value || "").trim().toLowerCase());

/**
 * Whether a player is one of the players a single selected value describes.
 *
 * Club, nationality and region match on a **substring** because their values
 * can legitimately be typed as a fragment; the rest are a closed set of exact
 * names, where a substring would let "CF" catch nothing useful and "Left" catch
 * a hypothetical "Left/Right".
 */
export function playerMatchesAllowanceValue(key, player, value) {
  if (!String(value || "").trim()) return false;

  switch (key) {
    case "position":     return equalsCI(attr(player, "position"), value);
    case "club":         return includesCI(attr(player, "club"), value);
    case "league":       return equalsCI(attr(player, "league"), value);
    case "nationality":  return includesCI(playerNationality(player), value);
    case "cardType":     return equalsCI(attr(player, "card_type"), value);
    case "region":       return includesCI(attr(player, "region"), value);
    case "foot":         return equalsCI(attr(player, "foot"), value);
    case "playingStyle": return equalsCI(attr(player, "playing_style"), value);
    default:             return false;
  }
}

/* `normalizeDraftPlayer` writes the country to `nation` and copies it to
   `nationality`; `normalizeApiPlayer` leaves it in `_raw.nationality` only. */
const playerNationality = (player) =>
  player?.nationality ?? player?.nation ?? player?._raw?.nationality ?? "";

/** Whether a player falls in a category at all — any one of its values. */
export function playerMatchesAllowanceCategory(player, key, valueRaw) {
  const value = String(valueRaw || "").trim();
  if (!value) return false;

  if (ALLOWANCE_VALUE_LIST_KEYS.has(key)) {
    return normalizeAllowanceListValue(key, value)
      .some((item) => playerMatchesAllowanceValue(key, player, item));
  }

  const { min, max } = parseAllowanceRangeNumbers(value);
  const within = (name) => isWithinOptionalRange(parseNumberOrNull(attr(player, name)), min, max);
  switch (key) {
    case "overall":    return within("overall");
    case "overallMax": return within("overall_max");
    case "height":     return within("height");
    case "weight":     return within("weight");
    case "age":        return within("age");
    default:           return false;
  }
}

const categoryLabel = (key) => ALLOWANCE_DEF_MAP.get(key)?.label || key;

/** The enabled categories, their selected values, and both count maps. */
function* activeAllowanceRules(cfg) {
  const enabled = Array.isArray(cfg.allowanceEnabled) ? cfg.allowanceEnabled : [];
  for (const key of enabled) {
    if (!ALLOWANCE_VALUE_LIST_KEYS.has(key)) {
      yield { key, value: String(cfg.allowance?.[key] || "").trim() };
      continue;
    }
    const values = normalizeAllowanceListValue(key, cfg.allowance?.[key]);
    if (!values.length) continue;
    yield {
      key,
      values,
      caps: parseAllowanceCountMap(cfg.allowanceCaps?.[key], values),
      mins: parseAllowanceCountMap(cfg.allowanceMins?.[key], values),
    };
  }
}

const sidePicksOf = (room, side) =>
  // slot-addressed: skip the holes, they are empty pitch slots
  (Array.isArray(room?.picks?.[side]) ? room.picks[side] : []).filter(Boolean);

/**
 * The maximums a side is currently up against, as a reusable test.
 *
 * One rule per *number*, not per category: a per-value category contributes one
 * check per capped value. Each carries how many of that side's picks already
 * count toward it, so testing a player is a match test and a comparison — no
 * re-walking the lineup. That is what lets the pick pool run this over every
 * card on every render.
 *
 * Pass a room whose `picks[side]` already reflects the write you are about to
 * make: `placePickInSlot` empties the target slot first, because overwriting a
 * filled one hands back whatever was in it, and the pick grid does the same for
 * the slot the player has armed.
 */
export function buildAllowanceGate(room, side) {
  const cfg = room?.config || {};
  /* The checkbox reads "ignore category filters" and now does: it used to grey
     out the editor and leave every previously-set cap in force. */
  if (cfg.allowAllPlayers) return () => null;

  const sidePicks = sidePicksOf(room, side);
  const checks = [];

  for (const rule of activeAllowanceRules(cfg)) {
    if (rule.values) {
      for (const value of rule.values) {
        const cap = Number(normalizeAllowanceCapValue(rule.caps[value]));
        if (!cap) continue;
        checks.push({
          key: rule.key,
          label: `${categoryLabel(rule.key)} ${value}`,
          cap,
          used: sidePicks.filter((p) => playerMatchesAllowanceValue(rule.key, p, value)).length,
          matches: (player) => playerMatchesAllowanceValue(rule.key, player, value),
        });
      }
      continue;
    }

    const cap = Number(normalizeAllowanceCapValue(cfg.allowanceCaps?.[rule.key]));
    if (!cap || !rule.value) continue;
    checks.push({
      key: rule.key,
      label: categoryLabel(rule.key),
      cap,
      used: sidePicks.filter((p) => playerMatchesAllowanceCategory(p, rule.key, rule.value)).length,
      matches: (player) => playerMatchesAllowanceCategory(player, rule.key, rule.value),
    });
  }

  /* A player who does not fall in the rule can never breach it — even when
     `used` already exceeds `cap`, which a config edited mid-draft can produce.
     Reporting that against every card would empty the pool over a rule none of
     them belong to. */
  return (player) => {
    for (const check of checks) {
      if (!check.matches(player)) continue;
      if (check.used + 1 > check.cap) {
        return { key: check.key, label: check.label, cap: check.cap };
      }
    }
    return null;
  };
}

/** Which maximum the incoming player would break, or `null`. */
export function getAllowanceCapViolation(room, side, player) {
  return buildAllowanceGate(room, side)(player);
}

/**
 * Which minimums a squad falls short of, as an array (empty when it is fine).
 *
 * A minimum is the one allowance rule that **cannot** be checked while picking:
 * an empty board breaks every one of them, and a half-full board breaks most.
 * So it is checked once, against the finished squad, at CONFIRM — which is also
 * the last moment the player can still do anything about it.
 */
export function getAllowanceMinViolations(room, side) {
  const cfg = room?.config || {};
  if (cfg.allowAllPlayers) return [];
  const sidePicks = sidePicksOf(room, side);

  const violations = [];
  for (const rule of activeAllowanceRules(cfg)) {
    if (rule.values) {
      for (const value of rule.values) {
        const min = Number(normalizeAllowanceCapValue(rule.mins[value]));
        if (!min) continue;
        const have = sidePicks
          .filter((p) => playerMatchesAllowanceValue(rule.key, p, value)).length;
        if (have < min) {
          violations.push({ key: rule.key, label: `${categoryLabel(rule.key)} ${value}`, min, have });
        }
      }
      continue;
    }

    const min = Number(normalizeAllowanceCapValue(cfg.allowanceMins?.[rule.key]));
    if (!min || !rule.value) continue;
    const have = sidePicks
      .filter((p) => playerMatchesAllowanceCategory(p, rule.key, rule.value)).length;
    if (have < min) {
      violations.push({ key: rule.key, label: categoryLabel(rule.key), min, have });
    }
  }
  return violations;
}
