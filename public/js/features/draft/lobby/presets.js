/**
 * The host's ban settings, remembered between rooms, plus three pace presets.
 *
 * Room creation on the home page is a room code and nothing else, so the lobby
 * is the only place these are ever set — and every room used to open on the same
 * defaults, so a host who always plays five bans re-entered it every time.
 *
 * **A preset is about pace, not taste.** The three carry the ban count and the
 * two durations and deliberately leave `revealMode` alone: QUICK/STANDARD/LONG
 * say how long the draft takes, and overwriting a host's concealment choice
 * because they wanted a shorter clock would be a surprise. What is *remembered*
 * is everything the panel holds — both reveal modes and the ban order
 * included — because that is the whole of what the host last chose.
 */

import {
  normalizeBanDurationSec,
  normalizePickDurationSec,
  normalizeRevealMode,
  normalizeBanOrder,
} from '@/features/draft/state.js';

const STORAGE_KEY = "efb_draft_settings";

/** Ban count and the two clocks. `revealMode` is not a pace, so it is not here. */
export const DRAFT_PRESETS = [
  { key: "quick",    label: "QUICK",    banCountPerSide: 3, banDurationSec: 60,  pickDurationSec: 180 },
  { key: "standard", label: "STANDARD", banCountPerSide: 3, banDurationSec: 120, pickDurationSec: 300 },
  { key: "long",     label: "LONG",     banCountPerSide: 5, banDurationSec: 300, pickDurationSec: 600 },
];

const asBanCount = (raw) => Math.max(0, Math.floor(Number(raw) || 0));

/** Which preset the current config *is*, or `""` — drives the active chip. */
export function matchingPresetKey(cfg) {
  const hit = DRAFT_PRESETS.find((p) =>
    asBanCount(cfg?.banCountPerSide) === p.banCountPerSide
    && normalizeBanDurationSec(cfg?.banDurationSec) === p.banDurationSec
    && normalizePickDurationSec(cfg?.pickDurationSec) === p.pickDurationSec);
  return hit ? hit.key : "";
}

/**
 * The last settings this host pushed, normalised on the way out.
 *
 * Everything is run back through the same normalisers the lobby and the server
 * use, so a hand-edited or stale entry cannot put a value into the panel that
 * `POST /:code/config` would then refuse.
 */
export function readRememberedSettings() {
  let raw;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { return null; }
  if (!raw) return null;

  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;

  return {
    banCountPerSide: asBanCount(parsed.banCountPerSide),
    banDurationSec: normalizeBanDurationSec(parsed.banDurationSec),
    pickDurationSec: normalizePickDurationSec(parsed.pickDurationSec),
    revealMode: normalizeRevealMode(parsed.revealMode),
    banRevealMode: normalizeRevealMode(parsed.banRevealMode),
    banOrder: normalizeBanOrder(parsed.banOrder),
  };
}

/**
 * Stores every remembered field. Host-only by convention — `pushLobbyConfig` is the
 * only caller and it has already returned unless this side is the host.
 *
 * `localStorage`, not `sessionStorage`, unlike the chat dock: the dock had to
 * move because two windows of one browser share the origin, and dragging the
 * host's bubble moved the guest's. That cannot bite here. The guest's settings
 * panel is read-only, so a guest window never seeds from this and never writes
 * to it — only the host's own preferences travel, which is the point.
 */
export function rememberSettings(cfg) {
  const payload = {
    banCountPerSide: asBanCount(cfg?.banCountPerSide),
    banDurationSec: normalizeBanDurationSec(cfg?.banDurationSec),
    pickDurationSec: normalizePickDurationSec(cfg?.pickDurationSec),
    revealMode: normalizeRevealMode(cfg?.revealMode),
    banRevealMode: normalizeRevealMode(cfg?.banRevealMode),
    banOrder: normalizeBanOrder(cfg?.banOrder),
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch { /* private mode */ }
}
