/* ============================================================
   draft — the whole room page

   Folder layout:

     (root)   state, api, callbacks, constants, players, gamePlans,
              utils — the things every phase needs
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
export { showToast, announce, getRoomCodeFromUrl } from "./utils.js";

/* `room.js` is the only consumer of this barrel, and it takes exactly the two
   the timer expiry reaches through `cb`. The buttons import their own actions
   from `draftActions.js` directly. */
export { autoFillAndConfirmPicks, confirmStagedBans } from "@/features/draft/engine/draftActions.js";
export { startDraftFromLobby, tryEnterDraftFromRoomSnapshot } from "@/features/draft/engine/draftSession.js";

export { renderDraftUi, enterPostMatch } from "@/features/draft/shell/draftView.js";
export { initDraftControls } from "@/features/draft/shell/draftControls.js";
export { updateStageTabs } from "@/features/draft/shell/stageTabs.js";
export { showRoomClosed } from "@/features/draft/shell/exitScreens.js";
export { onRematchAccepted } from "@/features/draft/ready/postMatch.js";

export { initLobby } from "@/features/draft/lobby/lobby.js";
export { initRoomChat, renderRoomChat } from "@/features/draft/chat.js";
