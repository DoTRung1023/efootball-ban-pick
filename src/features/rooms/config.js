/**
 * Room configuration: defaults, bounds, and normalization.
 *
 * The client mirrors this logic in public/js/features/draft/allowance.js — the
 * two must stay in agreement. The server is authoritative: every value written
 * through POST /api/rooms/:code/config passes through the normalizers here.
 */

/* There is no presence TTL. `PRESENCE_TTL_MS` (12s) and `DRAFT_PRESENCE_TTL_MS`
   (30s) used to expire a participant whose heartbeat had lapsed, and expiring the
   *host* closed the room outright — which a backgrounded browser tab was enough
   to trigger. A seat is now only given up deliberately.

   This one is unrelated: it is how long a quiet room stays on the admin
   dashboard, and it ends nothing. */
export const ROOM_LIST_QUIET_MS = 90000;

/**
 * **0 means unlimited**, and it is the only value outside the range below that
 * survives normalisation. The host can turn either clock off entirely from the
 * lobby; the room then runs that phase with no deadline and it ends when both
 * players confirm, which is the only other way a phase has ever ended.
 *
 * A sentinel rather than `null` because this value round-trips through a
 * `<input type="number">`, a JSON body and a `Number()` on the way back, and
 * `null` comes out of that chain as 0 anyway. Naming it stops the 0 reading as
 * "no time at all" at its call sites.
 */
export const UNLIMITED_DURATION_SEC = 0;

export const DEFAULT_BAN_DURATION_SECONDS = 120;
export const MIN_BAN_DURATION_SECONDS = 5;
export const MAX_BAN_DURATION_SECONDS = 900;

export const DEFAULT_PICK_DURATION_SECONDS = 300;
export const MIN_PICK_DURATION_SECONDS = 5;
export const MAX_PICK_DURATION_SECONDS = 1200;

/* Three rungs of concealment, in order: see everything → see the shape but not
   who → see nothing but whether they are done. `blur` is the middle one and is
   what `hidden` used to do on the pick board. */
export const REVEAL_MODE_INSTANT = "instant";
export const REVEAL_MODE_BLUR = "blur";
export const REVEAL_MODE_HIDDEN = "hidden";

const REVEAL_MODES = new Set([REVEAL_MODE_INSTANT, REVEAL_MODE_BLUR, REVEAL_MODE_HIDDEN]);

/** Picks are fixed at a full squad. */
export const PICK_COUNT_PER_SIDE = 23;

/** A seat with no account behind it has no squad to count; `null` says so. */
const isUnknownSize = (size) => size == null;

/**
 * The most bans per side these two squads can absorb, or `null` when neither
 * size is known.
 *
 * You pick from your **own** squad and your opponent bans out of it, so a side
 * ends the ban phase with `size - banCountPerSide` players and still owes a full
 * `PICK_COUNT_PER_SIDE`. The binding constraint is therefore the smaller squad,
 * and the answer is the same number for both sides. Negative means the smaller
 * squad cannot field a draft at all — the caller reports that as its own
 * problem rather than as a ban count.
 *
 * Published on the room snapshot as `maxBanCountPerSide` so the lobby can cap
 * its stepper without a second copy of this arithmetic.
 */
export function maxBansForSquads(sizes) {
  const known = Object.values(sizes || {}).filter((size) => !isUnknownSize(size));
  if (!known.length) return null;
  return Math.min(...known) - PICK_COUNT_PER_SIDE;
}

const ROLE_LABEL = { host: "Host", guest: "Guest" };

/**
 * Why a draft cannot start with these squad sizes and this ban count, or `""`.
 *
 * Checked at START rather than on every config write: a squad can grow or shrink
 * in another tab while its owner sits in the lobby, so the only count that can
 * be trusted is the one taken at the moment the draft begins.
 */
export function squadStartProblem(sizes, banCountPerSide) {
  for (const [role, size] of Object.entries(sizes || {})) {
    if (isUnknownSize(size)) continue;
    if (size < PICK_COUNT_PER_SIDE) {
      return `${ROLE_LABEL[role] || role} has ${size} player${size === 1 ? "" : "s"}.`
        + ` A draft needs a full squad of ${PICK_COUNT_PER_SIDE} on both sides.`;
    }
  }

  const allowed = maxBansForSquads(sizes);
  if (allowed == null) return "";

  const bans = Math.max(0, Math.floor(Number(banCountPerSide) || 0));
  if (bans > allowed) {
    return `${bans} ban${bans === 1 ? "" : "s"} per side would leave fewer than ${PICK_COUNT_PER_SIDE} players to pick from.`
      + ` The smaller squad allows at most ${allowed} ban${allowed === 1 ? "" : "s"} per side.`;
  }
  return "";
}

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

/**
 * The categories whose counts are **one number for the whole category**.
 *
 * Everything else carries a Min and a Max per selected value and stores both as
 * a `{value: count}` JSON map — see `ALLOWANCE_CATEGORY_DEFS` in
 * `public/js/features/draft/constants.js`, which this mirrors. The five here
 * are the ones whose value is a numeric span rather than a list.
 */
const RANGE_COUNT_FIELDS = new Set(["overall", "overallMax", "height", "weight", "age"]);

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

/** True for the sentinel, and only for it — not for null, "" or nonsense. */
export function isUnlimitedDuration(raw) {
  return Number(raw) === UNLIMITED_DURATION_SEC && String(raw ?? "").trim() !== "";
}

/* `0` has to be caught before the `||`, which reads it as "absent" and hands
   back the default — the one value that must not be clamped is the one that
   means "do not clamp me". */
export function normalizeBanDurationSec(raw) {
  if (isUnlimitedDuration(raw)) return UNLIMITED_DURATION_SEC;
  const n = Math.floor(Number(raw) || DEFAULT_BAN_DURATION_SECONDS);
  return clamp(n, MIN_BAN_DURATION_SECONDS, MAX_BAN_DURATION_SECONDS);
}

export function normalizePickDurationSec(raw) {
  if (isUnlimitedDuration(raw)) return UNLIMITED_DURATION_SEC;
  const n = Math.floor(Number(raw) || DEFAULT_PICK_DURATION_SECONDS);
  return clamp(n, MIN_PICK_DURATION_SECONDS, MAX_PICK_DURATION_SECONDS);
}

/**
 * When a turn of `sec` seconds, started now, runs out — or `null` if it never
 * does. Every `turnEndsAt` the server writes for a live turn goes through here,
 * so "unlimited" is expressed once, as the absence of a deadline, and every
 * reader already handles a null `turnEndsAt`.
 */
export function turnDeadline(sec) {
  return isUnlimitedDuration(sec) ? null : Date.now() + Number(sec) * 1000;
}

export function normalizeRevealMode(raw) {
  const mode = String(raw || "").trim().toLowerCase();
  return REVEAL_MODES.has(mode) ? mode : REVEAL_MODE_INSTANT;
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

/**
 * Applies the right normalizer for one end of an allowance count.
 *
 * The same function for the floor and the ceiling, because they are the same
 * shape: a per-value category's minimum is a `{value: count}` map exactly as
 * its maximum is. `allowanceMins` used to be a plain count for every category,
 * which is why the caller once had two of these.
 */
export function normalizeCountForField(field, value) {
  if (RANGE_COUNT_FIELDS.has(field)) return normalizeAllowanceCapValue(value);
  if (field === "position") return normalizePositionCaps(value);
  return normalizeNamedCaps(value);
}

/**
 * A category's floor and ceiling, stored in order.
 *
 * "At least 23, at most 22" refuses every possible squad, so an inverted pair
 * is swapped whoever sent it. Per-value categories are swapped **per value**:
 * their two maps are keyed the same way, so the pair for each key is compared
 * on its own and a value with only one end set is left alone.
 */
export function orderAllowanceCounts(minRaw, capRaw) {
  const minObj = coerceCapObject(minRaw);
  const capObj = coerceCapObject(capRaw);

  if (minObj || capObj) {
    const mins = { ...(minObj || {}) };
    const caps = { ...(capObj || {}) };
    for (const key of Object.keys(mins)) {
      const min = Number(mins[key]);
      const cap = Number(caps[key]);
      if (Number.isFinite(min) && Number.isFinite(cap) && min > 0 && cap > 0 && min > cap) {
        mins[key] = String(cap);
        caps[key] = String(min);
      }
    }
    return {
      min: Object.keys(mins).length ? JSON.stringify(mins) : "",
      cap: Object.keys(caps).length ? JSON.stringify(caps) : "",
    };
  }

  const min = Number(minRaw);
  const cap = Number(capRaw);
  if (Number.isFinite(min) && Number.isFinite(cap) && min > 0 && cap > 0 && min > cap) {
    return { min: String(cap), cap: String(min) };
  }
  return { min: String(minRaw ?? ""), cap: String(capRaw ?? "") };
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
    /* How few of a category a squad must contain — the floor to
       `allowanceCaps`' ceiling, and the same shape as it in every category.
       See `allowance.md`. */
    allowanceMins: emptyAllowanceMap(),
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
    allowanceMins: { ...defaults.allowanceMins, ...(config?.allowanceMins || {}) },
    allowance: { ...defaults.allowance, ...(config?.allowance || {}) },
  };
  merged.banDurationSec = normalizeBanDurationSec(merged.banDurationSec);
  merged.pickDurationSec = normalizePickDurationSec(merged.pickDurationSec);
  merged.revealMode = normalizeRevealMode(merged.revealMode);
  return merged;
}
