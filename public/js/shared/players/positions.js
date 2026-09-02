/* ============================================================
   Positions — the canonical display order

   `POSITION_LINE_ORDER` is the forward-first order used across the whole
   codebase (mirrored server-side in `SORT_MAP`, and in
   `public/js/features/draft/constants.js` for the draft board).

   This file used to also hold `posClass`, which bucketed a position into a
   colour class for the chip on each Add Players row. That chip is gone, and
   with it the only caller — so the buckets, the function and the `.pos-*`
   rules in `features/catalog/catalog.css` went together. Note the `dead-css`
   check could not have found those rules on its own: `posClass` still held
   their names as strings, so dead JS was keeping dead CSS alive.
   ============================================================ */

const POSITION_LINE_ORDER = ["CF", "SS", "RWF", "LWF", "AMF", "RMF", "LMF", "CMF", "DMF", "RB", "LB", "CB", "GK"];

export function positionLineRank(pos) {
  const p = String(pos || "").toUpperCase().trim();
  const i = POSITION_LINE_ORDER.indexOf(p);
  return i === -1 ? POSITION_LINE_ORDER.length : i;
}
