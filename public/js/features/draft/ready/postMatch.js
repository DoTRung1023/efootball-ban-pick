/**
 * The ways out of a finished match, in the footer of the Start Match screen's
 * `post` stage.
 *
 *   REMATCH     same two players, back to ban settings — needs the other side
 *               to accept, so it is an offer rather than an action
 *   NEW MATCH   this room ends; you land in a fresh one as host
 *
 * **There is no CLOSE ROOM button.** The stage header carries Close room (host)
 * / Leave (guest) on every screen of the room including this one, so the footer
 * was a second door into an action that already had one. The server's `close`
 * action went with it — `/leave` is what the header button posts.
 *
 * `data-rematch` on the row (`none` / `pending` / `incoming`) is the only thing
 * that changes between the three shapes of this footer — `ready.css` owns which
 * buttons each state shows. That is one attribute instead of toggling `hidden`
 * on five buttons from here.
 *
 * This lived on a separate `#viewDone` screen until Start Match absorbed it.
 */

import { askConfirm, showToast } from '@/features/draft/utils.js';
import { state } from '@/features/draft/state.js';
import { postMatchAction } from '@/features/draft/engine/draftActions.js';
import { clearRoomPhaseCache } from '@/features/draft/engine/presence.js';
import { allowLeave } from '@/features/draft/shell/leaveGuard.js';
import { genRoomCode } from '@/shared/lib/roomCode.js';

/* Bound once per page, not once per render: `renderPostMatch` runs on every
   presence poll, and binding in there would stack a listener per tick. */
let bound = false;

const on = (id, handler) => document.getElementById(id)?.addEventListener("click", handler);

export function bindPostMatchOnce() {
  if (bound) return;
  bound = true;

  on("pmRematchBtn", async () => {
    if (await postMatchAction("rematch-propose")) renderPostMatch();
  });

  on("pmAcceptBtn", async () => {
    /* No navigation here: accepting resets the room to the lobby server-side,
       and `onRematchAccepted` is what moves this client there. */
    if (await postMatchAction("rematch-accept")) onRematchAccepted();
  });

  on("pmDeclineBtn", async () => {
    if (await postMatchAction("rematch-decline")) renderPostMatch();
  });

  /* This ends the room for the *other* player too and cannot be taken back —
     the same reason Leave and Close room ask on every other screen. */
  on("pmNewMatchBtn", async () => {
    const ok = await askConfirm({
      title: "New match",
      message: "This closes the room for both of you and opens a fresh one with you as host.",
      okText: "New match",
    });
    if (!ok) return;
    /* The code is minted here for the same reason the Rooms tab mints one:
       there is no create-room endpoint, a room exists as soon as somebody sends
       presence for its code. */
    if (await postMatchAction("new-match")) leaveTo(`/room/${genRoomCode()}?mode=host`);
  });
}

/** Leaves the room for `url` without tripping the unload guard on the way. */
function leaveTo(url) {
  allowLeave();
  clearRoomPhaseCache(state.room?.code);
  window.location.href = url;
}

/**
 * Repaints the footer for the current rematch state. Called on every poll, so
 * it must be idempotent and must not bind anything.
 *
 * Three states: nobody has asked, I have asked and am waiting, they have asked
 * and I can accept or decline.
 */
export function renderPostMatch() {
  bindPostMatchOnce();

  const row = document.getElementById("postMatchActions");
  if (!row) return;

  const by = state.room?.rematch?.by || null;
  const mine = Boolean(by) && by === state.mySide;
  const theirs = Boolean(by) && by !== state.mySide;
  const stage = theirs ? "incoming" : mine ? "pending" : "none";
  if (row.dataset.rematch !== stage) row.dataset.rematch = stage;

  const them = state.room?.[state.mySide === "host" ? "guest" : "host"]?.username || "Your opponent";
  const status = document.getElementById("pmStatus");
  const text = theirs
    ? `${them} wants a rematch — same players, back to ban settings.`
    : mine
      ? `Rematch offered. Waiting for ${them} to accept…`
      : "Played it out? Pick what happens next.";
  if (status && status.textContent !== text) status.textContent = text;
}

/** The room went back to the lobby under us — both sides return to ban settings. */
export function onRematchAccepted() {
  showToast("Rematch on — back to ban settings.");
  clearRoomPhaseCache(state.room?.code);
  window.location.reload();
}
