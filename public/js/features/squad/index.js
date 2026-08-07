/* ============================================================
   squad — the My Players tab

   `squad.js` also registers the squad-side entries in the home page's callback
   registry (`getSquadPlayers`, `addToSquadState`, `removeFromSquadState`,
   `renderSquad`), which is how catalog and gamePlans reach it without an
   import cycle.
   ============================================================ */

export { loadSquad, initSquadSearchSortFilter, initSquadControls } from "./squad.js";
