/* ============================================================
   catalog — the Add Player modal and the player popup

   Reads the server-side player catalog (`/api/players`); the squad tab reads
   the user's own saved players. `catalog.js` registers `openPlayerPopup`,
   `openAddPlayerModal` and `onPlayersDeleted` in the home page's callback
   registry so squad and gamePlans can open these without an import cycle.
   ============================================================ */

export { openAddPlayerModal, initAddPlayerModal, initPlayerPopup } from "./catalog.js";
