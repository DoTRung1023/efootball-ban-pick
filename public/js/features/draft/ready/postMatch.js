/**
 * The ways out of a finished match, in the footer of the Start Match screen's
 * `post` stage.
 *
 *   REMATCH     same two players, back to the lobby — needs the other side
 *               to accept, so it is an offer rather than an action, and an offer
 *               can be withdrawn (CANCEL REMATCH) as well as answered
 *   NEW MATCH   *you* leave for a fresh room. The room you are in stays open and
 *               the other player stays on this screen — see `newMatch` below
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
import { clearRoomPhaseCache, stopPresencePolling } from '@/features/draft/engine/presence.js';
import { allowLeave } from '@/features/draft/shell/leaveGuard.js';
import { genRoomCode } from '@/shared/lib/roomCode.js';
import { setPendingToast } from '@/shared/ui/pendingToast.js';

/* Bound once per page, not once per render: `renderPostMatch` runs on every
   presence poll, and binding in there would stack a listener per tick. */
let bound = false;

/* The last footer shape this client painted. A decline reaches the player who
   offered only as their offer *disappearing* — the server clears `rematch` and
   the footer drops back to its resting state, which on its own is silent: you
   would be left looking at a REMATCH button with no idea anybody had answered.
   Comparing against the previous shape is what turns that into news.

   `pending → none` is the only transition that means it. `incoming → none` is
   me declining, and I do not need telling; an accept never reaches here at all,
   because it puts the room back in the lobby and the poll routes it to
   `onRematchAccepted`. */
let lastStage = null;

/* Set just before I answer or withdraw an offer myself, and consumed by the
   next render. Both of those clear `rematch` exactly like the other side's
   answer does, and the announcement below reads the clearing — without this it
   would tell me my own news. */
let iAnswered = false;

/* One announcement per departure, not one per poll (~2 Hz). */
let announcedNewMatch = false;

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
    iAnswered = true;
    if (await postMatchAction("rematch-decline")) renderPostMatch();
  });

  /* Withdrawing is not declining: it takes back an offer the other side has not
     answered, and only the proposer may do it. Waiting with no way out was the
     one state on this screen you could not leave without leaving the room. */
  on("pmCancelBtn", async () => {
    iAnswered = true;
    if (await postMatchAction("rematch-cancel")) renderPostMatch();
  });

  /* This ends the room for the *other* player too and cannot be taken back —
     the same reason Leave and Close room ask on every other screen. */
  on("pmNewMatchBtn", async () => {
    const ok = await askConfirm({
      title: "New match",
      message: "You leave for a fresh room as host. This room stays open for your opponent.",
      okText: "New match",
    });
    if (!ok) return;
    /* The code is minted here for the same reason the Rooms tab mints one:
       there is no create-room endpoint, a room exists as soon as somebody sends
       presence for its code. */
    const them = state.room?.[state.mySide === "host" ? "guest" : "host"]?.username;
    if (await postMatchAction("new-match")) {
      leaveTo(
        `/room/${genRoomCode()}?mode=host`,
        `New room opened. You are the host.${them ? ` ${them} stays in the old one.` : ""} Share the code to invite someone.`,
      );
    }
  });
}

/**
 * Leaves the room for `url` without tripping the unload guard on the way, and
 * with a note for the page that comes up next.
 *
 * The note is the point: a button that swaps the whole page out from under you
 * owes you a sentence about what it did, and a toast fired here would die with
 * the page that fired it. See `shared/ui/pendingToast.js`.
 */
function leaveTo(url, note) {
  allowLeave();
  /* **Before the navigation, and it has to be.** `window.location.href` does not
     stop a running `setInterval` — the page keeps living until the next document
     commits, and the heartbeat is a 500 ms one. `new-match` vacates this seat
     server-side, so one more beat out of a page on its way out re-claims the
     chair we just left and puts the room back to looking occupied. */
  stopPresencePolling();
  clearRoomPhaseCache(state.room?.code);
  if (note) setPendingToast(note);
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

  /* Their seat is gone the moment they leave for a new match, so the name comes
     off `newMatch` in that case — it is recorded there for exactly this. Without
     the fallback every line below degrades to "Your opponent" the instant the
     thing they describe happens. */
  const them = state.room?.[state.mySide === "host" ? "guest" : "host"]?.username
    || state.room?.newMatch?.username
    || "Your opponent";

  /* The other player has left for a room of their own. They are not coming
     back, so there is nobody to offer a rematch to — but the room is still here
     and so is this screen, which is the point: being left behind should not
     take the match you just played off your screen. */
  const gone = Boolean(state.room?.newMatch) && state.room.newMatch.by !== state.mySide;
  if (gone && !announcedNewMatch) {
    announcedNewMatch = true;
    showToast(`${them} started a different match.`);
  }
  if (!gone) announcedNewMatch = false;

  /* An answer to my offer arrives as the offer disappearing, so the transition
     is the news. `iAnswered` covers the case where the one who cleared it was
     me — my own decline, or my own cancel. */
  if (!iAnswered && lastStage === "pending" && stage === "none" && !gone) {
    showToast(`${them} declined the rematch.`);
  }
  if (!iAnswered && lastStage === "incoming" && stage === "none" && !gone) {
    showToast(`${them} cancelled the rematch offer.`);
  }
  iAnswered = false;
  lastStage = stage;

  /* `disabled`, not a class: it has to stop the click as well as look spent. */
  const rematchBtn = document.getElementById("pmRematchBtn");
  if (rematchBtn) rematchBtn.disabled = gone;
  if (row.dataset.opponent !== (gone ? "gone" : "here")) {
    row.dataset.opponent = gone ? "gone" : "here";
  }

  const status = document.getElementById("pmStatus");
  const text = gone
    ? `${them} started a different match. This room is still yours.`
    : theirs
      ? `${them} wants a rematch. Same players, back to the lobby.`
      : mine
        ? `Rematch offered. Waiting for ${them} to accept…`
        : "Played it out? Pick what happens next.";
  if (status && status.textContent !== text) status.textContent = text;
}

/**
 * The room went back to the lobby under us — both sides return to the lobby panel.
 *
 * **Both** sides arrive here: the one who accepted calls it directly, and the
 * one who offered is routed to it by the poll when the status leaves `done`. So
 * one line covers both, and both need it — a reload with no explanation looks
 * like the room fell over.
 *
 * The message is stashed rather than shown. It used to call `showToast` and
 * then `reload()` on the next line, which paints a toast into a document that
 * is already being torn down: neither player ever saw it.
 */
export function onRematchAccepted() {
  const them = state.room?.[state.mySide === "host" ? "guest" : "host"]?.username;
  setPendingToast(them
    ? `Rematch with ${them}. Same players, back to the lobby.`
    : "Rematch on. Back to the lobby.");
  clearRoomPhaseCache(state.room?.code);
  window.location.reload();
}
