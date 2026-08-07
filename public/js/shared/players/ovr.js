/* ============================================================
   Overall rating display — the "level 1 / max" pair
   ============================================================ */

import { escapeHtml } from "./playerMeta.js";

/** Both ratings known — show level 1 and max side by side (compact layout in catalog rows). */
export function hasFullOvrPair(p) {
  return p?.overall != null && p?.overall_max != null;
}

/** HTML snippet: Level 1 and max OVR (uses overall + overall_max from API). */
export function ovrPairInnerHtml(p) {
  if (p?.overall == null && p?.overall_max == null) return "—";
  if (hasFullOvrPair(p)) {
    return (
      `<span class="ovr-pair" title="Level 1 / Max level">` +
      `<span class="ovr-l1">${escapeHtml(String(p.overall))}</span>` +
      `<span class="ovr-slash">/</span>` +
      `<span class="ovr-max">${escapeHtml(String(p.overall_max))}</span>` +
      `</span>`
    );
  }
  if (p?.overall != null) return escapeHtml(String(p.overall));
  return escapeHtml(String(p.overall_max ?? ""));
}
