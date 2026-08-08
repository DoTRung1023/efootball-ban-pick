/**
 * Room configuration: defaults, bounds, and normalization.
 *
 * The client mirrors this logic in public/js/features/draft/allowance.js — the
 * two must stay in agreement. The server is authoritative: every value written
 * through POST /api/rooms/:code/config passes through the normalizers here.
 */

export const PRESENCE_TTL_MS = 12000;
export const DRAFT_PRESENCE_TTL_MS = 30000; // longer window so reload during draft doesn't expire

export const DEFAULT_BAN_DURATION_SECONDS = 120;
export const MIN_BAN_DURATION_SECONDS = 5;
export const MAX_BAN_DURATION_SECONDS = 900;

export const DEFAULT_PICK_DURATION_SECONDS = 300;
export const MIN_PICK_DURATION_SECONDS = 5;
export const MAX_PICK_DURATION_SECONDS = 1200;

export const REVEAL_MODE_INSTANT = "instant";
export const REVEAL_MODE_HIDDEN = "hidden";

/** Picks are fixed at a full squad. */
export const PICK_COUNT_PER_SIDE = 23;

export const POSITION_OPTIONS = new Set([
  "GK", "CB", "LB", "RB", "DMF", "CMF", "LMF", "RMF", "AMF", "LWF", "RWF", "SS", "CF",
]);

/** Allowance categories accepted on config writes. Legacy min/max keys are kept for older clients. */
export const ALLOWANCE_FIELDS = new Set([
  "position",
  "overall", "overallMax",
  "height", "weight", "age",
  // Legacy keys kept for backward compatibility.
  "overallMin",
  "overallMaxMin", "overallMaxMax",
  "club", "league", "nationality",
  "heightMin", "heightMax",
  "weightMin", "weightMax",
  "ageMin", "ageMax",
  "cardType", "region", "foot", "playingStyle",
]);

/** Allowance categories whose caps are keyed by an arbitrary name rather than a fixed enum. */
const NAMED_CAP_FIELDS = new Set(["club", "cardType", "region", "playingStyle"]);

const ALLOWANCE_KEYS = [
  "position",
  "overall", "overallMin", "overallMax", "overallMaxMin", "overallMaxMax",
  "club", "league", "nationality",
  "height", "heightMin", "heightMax",
  "weight", "weightMin", "weightMax",
  "age", "ageMin", "ageMax",
  "cardType", "region", "foot", "playingStyle",
];

function emptyAllowanceMap() {
  return Object.fromEntries(ALLOWANCE_KEYS.map((key) => [key, ""]));
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/** Caps are whole player counts in 1..23; anything else clears the cap. */
export function normalizeAllowanceCapValue(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? String(Math.min(23, Math.floor(n))) : "";
}

export function normalizeBanDurationSec(raw) {
  const n = Math.floor(Number(raw) || DEFAULT_BAN_DURATION_SECONDS);
  return clamp(n, MIN_BAN_DURATION_SECONDS, MAX_BAN_DURATION_SECONDS);
}

export function normalizePickDurationSec(raw) {
  const n = Math.floor(Number(raw) || DEFAULT_PICK_DURATION_SECONDS);
  return clamp(n, MIN_PICK_DURATION_SECONDS, MAX_PICK_DURATION_SECONDS);
}

export function normalizeRevealMode(raw) {
  return String(raw || "").trim().toLowerCase() === REVEAL_MODE_HIDDEN
    ? REVEAL_MODE_HIDDEN
    : REVEAL_MODE_INSTANT;
}

/** Accepts an object or a JSON string; returns a JSON string of {POSITION: cap} or "". */
function normalizePositionCaps(raw) {
  const obj = coerceCapObject(raw);
  if (!obj) return "";

  const normalized = {};
  for (const [k, v] of Object.entries(obj)) {
    const pos = String(k || "").trim().toUpperCase();
    if (!POSITION_OPTIONS.has(pos)) continue;
    const cap = normalizeAllowanceCapValue(v);
    if (cap) normalized[pos] = cap;
  }
  return Object.keys(normalized).length ? JSON.stringify(normalized) : "";
}

/**
 * Accepts an object, a JSON string, or a bare number (legacy single-cap form).
 * Returns a JSON string of {name: cap}, a bare cap string, or "".
 */
function normalizeNamedCaps(raw) {
  if (raw && typeof raw === "object") {
    const normalized = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = String(k || "").replace(/\s+/g, " ").trim().slice(0, 60);
      if (!key) continue;
      const cap = normalizeAllowanceCapValue(v);
      if (cap) normalized[key] = cap;
    }
    return Object.keys(normalized).length ? JSON.stringify(normalized) : "";
  }

  const text = String(raw || "").trim();
  if (!text) return "";

  const legacyCap = normalizeAllowanceCapValue(text);
  if (legacyCap) return legacyCap;

  const parsed = coerceCapObject(text);
  return parsed ? normalizeNamedCaps(parsed) : "";
}

/** Returns a plain object from an object or JSON string, else null. */
function coerceCapObject(raw) {
  if (raw && typeof raw === "object") return raw;
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Applies the right normalizer for an allowance cap category. */
export function normalizeCapForField(field, value) {
  if (field === "position") return normalizePositionCaps(value);
  if (NAMED_CAP_FIELDS.has(field)) return normalizeNamedCaps(value);
  return normalizeAllowanceCapValue(value);
}

export function createDefaultRoomConfig() {
  return {
    allowAllPlayers: true,
    banCountPerSide: 3,
    banDurationSec: DEFAULT_BAN_DURATION_SECONDS,
    pickDurationSec: DEFAULT_PICK_DURATION_SECONDS,
    revealMode: REVEAL_MODE_INSTANT,
    pickCountPerSide: PICK_COUNT_PER_SIDE,
    allowanceEnabled: [],
    allowanceCaps: emptyAllowanceMap(),
    allowance: emptyAllowanceMap(),
  };
}

/** Fills in missing keys from defaults and clamps the duration/reveal fields. */
export function normalizeRoomConfig(config) {
  const defaults = createDefaultRoomConfig();
  const merged = {
    ...defaults,
    ...(config || {}),
    allowanceCaps: { ...defaults.allowanceCaps, ...(config?.allowanceCaps || {}) },
    allowance: { ...defaults.allowance, ...(config?.allowance || {}) },
  };
  merged.banDurationSec = normalizeBanDurationSec(merged.banDurationSec);
  merged.pickDurationSec = normalizePickDurationSec(merged.pickDurationSec);
  merged.revealMode = normalizeRevealMode(merged.revealMode);
  return merged;
}
