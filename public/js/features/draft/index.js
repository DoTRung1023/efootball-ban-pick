/* ============================================================
   draft — the whole room page

   Folder layout:

     (root)   state, api, callbacks, constants, players, gamePlans,
              allowance, utils — the things every phase needs
     engine/  what the draft *does*: turn schedule and timers (draftFlow),
              the server writes (draftActions), joining and entering a draft
              (draftSession), the presence heartbeat (presence)
     shell/   the frame around whichever phase is live: draftView,
              draftControls, stageTabs, exitScreens
     lobby/ ban/ pick/ ready/ — one folder per phase

   Unlike the other feature barrels, this one is broad: the room page is a
   single feature, so its entry legitimately needs the whole surface.
   ============================================================ */

export { cb } from "./callbacks.js";
export { showToast, getRoomCodeFromUrl } from "./utils.js";

export { isBothMatchReady } from "./engine/draftFlow.js";
export { flushAndSubmitStagedBans } from "./engine/draftActions.js";
export { startDraftFromLobby, tryEnterDraftFromRoomSnapshot } from "./engine/draftSession.js";

export { renderDraftUi } from "./shell/draftView.js";
export { initDraftControls } from "./shell/draftControls.js";
export { updateStageTabs } from "./shell/stageTabs.js";
export { showDone, showOpponentLeft, showRoomClosed } from "./shell/exitScreens.js";

export { initLobby } from "./lobby/lobby.js";
