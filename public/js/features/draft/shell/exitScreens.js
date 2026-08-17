/** The room-closed exit screen and its countdown. */

import { state } from '@/features/draft/state.js';
import { paintErrorView } from '@/features/draft/errorView.js';
import { clearRoomPhaseCache } from '@/features/draft/engine/presence.js';
import { updateStageTabs } from './stageTabs.js';
import { allowLeave } from './leaveGuard.js';

const EXIT_COUNTDOWN_SECONDS = 10;

/**
 * Shows #viewError with a countdown that returns the user to the home page.
 * `message(secs)` renders the body text for each remaining second.
 * `icon` is a glyph, or `true` to keep whatever the markup already shows.
 */
function showExitCountdown({ title, icon, message }) {
  /* The room is over and the countdown is already walking the user out — both
     it and "Back to home" would otherwise trip the unload guard, which still
     sees the phase the room was in when it ended. */
  allowLeave();
  clearRoomPhaseCache(state.room?.code);

  let secs = EXIT_COUNTDOWN_SECONDS;
  const msgEl = document.getElementById("errorMessage");
  const paint = () => {
    if (msgEl) msgEl.textContent = message(secs);
  };

  paintErrorView({
    modifier: "is-room-closed",
    title,
    icon,
    leaveText: "Back to home",
    message: message(secs),
  });
  updateStageTabs();

  const timer = setInterval(() => {
    secs -= 1;
    if (secs <= 0) {
      clearInterval(timer);
      window.location.href = "/";
      return;
    }
    paint();
  }, 1000);
}

export function showRoomClosed(message = "Room is closed.") {
  showExitCountdown({
    title: "Room closed",
    icon: true, // keep the glyph the markup already carries
    message: (secs) => `${message} Returning to home in ${secs}s…`,
  });
}

/* There is no `showOpponentLeft`, and no `showDone` either.

   A guest walking out no longer ends anything: the host drops back to the lobby
   with the room intact and can invite someone else — see `returnToLobby` in
   presence.js.

   `showDone` painted a second screen once both players were READY, re-listing
   as plain text the two squads Start Match had just drawn as cards. Start Match
   swaps its own footer instead (`enterPostMatch` in shell/draftView.js), so the
   room being *closed* is the only genuinely terminal screen left. */
