/** Terminal screens: room closed, opponent left, and the final draft summary. */

import { escapeHtml, showView } from './utils.js';
import { state } from './state.js';
import { clearRoomPhaseCache } from './presence.js';
import { clearTurnTimer } from './draftFlow.js';
import { updateStageTabs } from './stageTabs.js';

const EXIT_COUNTDOWN_SECONDS = 10;
const ERROR_STATE_CLASSES = ["is-host-lock", "is-room-full", "is-access-denied"];

/**
 * Shows #viewError with a countdown that returns the user to the home page.
 * `message(secs)` renders the body text for each remaining second.
 */
function showExitCountdown({ title, icon, message }) {
  clearRoomPhaseCache(state.room?.code);

  const view = document.getElementById("viewError");
  const msgEl = document.getElementById("errorMessage");
  const titleEl = document.getElementById("errorTitle");
  const iconEl = document.getElementById("errorStateIcon");
  const btn = document.getElementById("errorLeaveBtn");

  if (btn) btn.textContent = "Back to home";
  if (titleEl) {
    titleEl.textContent = title;
    titleEl.hidden = false;
  }
  if (iconEl) {
    if (icon) iconEl.textContent = icon;
    iconEl.hidden = false;
  }
  if (view) {
    view.classList.remove(...ERROR_STATE_CLASSES);
    view.classList.add("is-room-closed");
  }

  let secs = EXIT_COUNTDOWN_SECONDS;
  const paint = () => {
    if (msgEl) msgEl.textContent = message(secs);
  };

  paint();
  showView("viewError");
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
    icon: null,
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
