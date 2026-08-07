/* ============================================================
   Positions — grouping for colour, and the canonical display order

   `POSITION_LINE_ORDER` is the forward-first order used across the whole
   codebase (mirrored server-side in `SORT_MAP`, and in
   `room/constants.js` for the draft board).
   ============================================================ */

export const POS_DEF = ["CB", "LB", "RB"];
export const POS_MID = ["CMF", "DMF", "RMF", "LMF", "AMF"];
export const POS_FWD = ["RWF", "LWF", "CF", "SS"];

/** Colour bucket for a position chip. */
export function posClass(pos) {
  if (!pos) return "pos-other";
  if (pos === "GK")          return "pos-gk";
  if (POS_DEF.includes(pos)) return "pos-def";
  if (POS_MID.includes(pos)) return "pos-mid";
  if (POS_FWD.includes(pos)) return "pos-fwd";
  return "pos-other";
}

export const POSITION_LINE_ORDER = ["CF", "SS", "RWF", "LWF", "AMF", "RMF", "LMF", "CMF", "DMF", "RB", "LB", "CB", "GK"];

export function positionLineRank(pos) {
  const p = String(pos || "").toUpperCase().trim();
  const i = POSITION_LINE_ORDER.indexOf(p);
  return i === -1 ? POSITION_LINE_ORDER.length : i;
}
