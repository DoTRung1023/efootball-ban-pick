/** Terminal screens: room closed, opponent left, and the final draft summary. */

import { escapeHtml, showView } from '@/features/draft/utils.js';
import { state } from '@/features/draft/state.js';
import { paintErrorView } from '@/features/draft/errorView.js';
import { clearRoomPhaseCache } from '@/features/draft/engine/presence.js';
import { clearTurnTimer } from '@/features/draft/engine/draftFlow.js';
import { updateStageTabs } from './stageTabs.js';

const EXIT_COUNTDOWN_SECONDS = 10;

/**
 * Shows #viewError with a countdown that returns the user to the home page.
 * `message(secs)` renders the body text for each remaining second.
 * `icon` is a glyph, or `true` to keep whatever the markup already shows.
 */
function showExitCountdown({ title, icon, message }) {
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

export function showOpponentLeft() {
  clearTurnTimer();
  showExitCountdown({
    title: "Opponent left",
    icon: "🚪",
    message: (secs) => `Your opponent has left the draft. Returning to home in ${secs}s…`,
  });
}

/** Final side-by-side squad summary once both players are ready. */
export function showDone() {
  clearRoomPhaseCache(state.room?.code);
  showView("viewDone");
  updateStageTabs();

  const room = state.room;
  if (!room) return;

  const codeEl = document.getElementById("doneRoomCode");
  if (codeEl) codeEl.textContent = `Room ${room.code}`;

  const mySide = state.mySide;
  const theirSide = mySide === "host" ? "guest" : "host";

  const columns = document.getElementById("doneColumns");
  if (columns) {
    columns.innerHTML =
      doneColumnHtml(room, mySide, true) + doneColumnHtml(room, theirSide, false);
  }
}

function doneColumnHtml(room, side, isMe) {
  const name = room[side]?.username || side;
  const picks = room.picks[side] || [];
  return `
    <div>
      <div class="done-col-title ${isMe ? "is-me" : ""}">${escapeHtml(name)}${isMe ? " (YOU)" : ""}</div>
      ${picks.map(donePickRowHtml).join("")}
    </div>
  `;
}

function donePickRowHtml(player) {
  return `
    <div class="done-pick-row">
      <div class="done-pick-ovr">${escapeHtml(String(player.overall_rating ?? "—"))}</div>
      <div>
        <div class="done-pick-name">${escapeHtml(player.name ?? "—")}</div>
        <div class="done-pick-sub">${escapeHtml(player.position ?? "—")} · ${escapeHtml(player.nation ?? "—")}</div>
      </div>
    </div>`;
}
