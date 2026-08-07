/* ============================================================
   gamePlans — the Game Plans tab

   A plan is a formation plus eleven slot assignments drawn from the user's
   squad. `plans.js` owns the plan list, the pitch view, the player picker and
   slot assignment; the room page has its own read-only view of the same data
   in `room/gamePlans.js`.
   ============================================================ */

export { loadGamePlans, initGamePlans } from "./plans.js";
