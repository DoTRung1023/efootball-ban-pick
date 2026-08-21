/* ============================================================
   #viewError — one painter for every way the room can fail

   Three modules put the user on this screen: `presence.js` (409 host-lock /
   room-full, 403 kicked), `lobby.js` (a malformed room code) and
   `shell/exitScreens.js` (room closed, opponent left). They used to reach into
   the same five elements independently, and drifted — `lobby.js` cleared three
   of the four modifier classes, so a "room full" state could survive into the
   next error.

   `paintErrorView` therefore writes *every* field on every call: all four
   modifiers come off before one goes on, and title/icon/button are set or
   hidden explicitly. A caller cannot inherit the previous error's appearance.

   It lives at the draft root rather than in `shell/` because `exitScreens.js`
   already imports `engine/presence.js`; putting it there would make
   `presence.js -> exitScreens.js` a cycle.
   ============================================================ */

import { showView } from "./utils.js";

/** The mutually exclusive state modifiers `shell.css` themes `#viewError` with. */
const ERROR_VIEW_MODIFIERS = [
  "is-room-closed",
  "is-host-lock",
  "is-room-full",
  "is-access-denied",
];

/**
 * @param {object}  o
 * @param {string?} o.modifier  one of ERROR_VIEW_MODIFIERS, or null for none
 * @param {string?} o.title     heading text; null hides the heading
 * @param {string}  o.leaveText button label
 * @param {string?} o.message   body text; null leaves it untouched
 * @param {boolean} o.show      call showView("viewError") — default true
 */
export function paintErrorView({ modifier = null, title = null, leaveText, message = null, show = true }) {
  const view = document.getElementById("viewError");
  if (view) {
    view.classList.remove(...ERROR_VIEW_MODIFIERS);
    if (modifier) view.classList.add(modifier);
  }

  const titleEl = document.getElementById("errorTitle");
  if (titleEl) {
    if (title) titleEl.textContent = title;
    titleEl.hidden = !title;
  }

  const btn = document.getElementById("errorLeaveBtn");
  if (btn && leaveText) btn.textContent = leaveText;

  const msgEl = document.getElementById("errorMessage");
  if (msgEl && message != null) msgEl.textContent = message;

  if (show) showView("viewError");
}
