/* ============================================================
   Positions — grouping for colour, and the canonical display order

   `POSITION_LINE_ORDER` is the forward-first order used across the whole
   codebase (mirrored server-side in `SORT_MAP`, and in
   `public/js/features/draft/constants.js` for the draft board).
   ============================================================ */

/* The buckets behind `posClass`. Not exported — callers want the class name,
   and the only consumer that wanted a position list wanted the ordered one
   below. */
const POS_DEF = ["CB", "LB", "RB"];
const POS_MID = ["CMF", "DMF", "RMF", "LMF", "AMF"];
const POS_FWD = ["RWF", "LWF", "CF", "SS"];

/** Colour bucket for a position chip. */
export function posClass(pos) {
  if (!pos) return "pos-other";
  if (pos === "GK")          return "pos-gk";
  if (POS_DEF.includes(pos)) return "pos-def";
  if (POS_MID.includes(pos)) return "pos-mid";
  if (POS_FWD.includes(pos)) return "pos-fwd";
  return "pos-other";
}

const POSITION_LINE_ORDER = ["CF", "SS", "RWF", "LWF", "AMF", "RMF", "LMF", "CMF", "DMF", "RB", "LB", "CB", "GK"];

export function positionLineRank(pos) {
  const p = String(pos || "").toUpperCase().trim();
  const i = POSITION_LINE_ORDER.indexOf(p);
  return i === -1 ? POSITION_LINE_ORDER.length : i;
}
