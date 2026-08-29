/**
 * The exit guard: asks before the browser takes the user out of a live room.
 *
 * Leave and Close room already confirm. Closing the tab, reloading, hitting
 * back, or typing a new address go nowhere near those buttons, and **nothing
 * else catches them** — this room has no presence TTL (see
 * `room/presence-and-reconnect.md`), so a seat abandoned that way is held until
 * the server restarts and the other player sits waiting for someone who is not
 * coming back.
 *
 * **Two halves, because one hook cannot do it.** `beforeunload` catches every
 * exit but can only ever raise the browser's own dialog; the History API cannot
 * see a tab close but can cancel a *back* navigation, which is the one exit
 * where the dialog can be ours. They share `armed()` and `allowLeave()`.
 *
 * Three properties of the `beforeunload` half are the browser's call, not ours,
 * and all three are worth knowing before changing anything here:
 *
 * - **The wording belongs to the browser.** `preventDefault()` asks for the
 *   dialog; it cannot supply the text, and a returned string is ignored by
 *   every current engine. `askConfirm` cannot be used *there* — it is
 *   asynchronous, and unload does not wait. The back half can, because the
 *   navigation has already been cancelled by the time it asks.
 * - **It needs sticky activation.** A page the user has never clicked in is
 *   allowed to unload silently, so a guest who opens an invite link and closes
 *   the tab straight away is not asked. Every path that costs something
 *   involves at least one click, so this is a thin edge, but it is real.
 * - **A reload looks exactly like a close.** Which is why this only asks; it
 *   must never post the leave itself. Doing that would evict a player for
 *   pressing F5, and reconnecting to your own room is the behaviour the
 *   presence rules are built around.
 */

import { state } from '@/features/draft/state.js';
import { askConfirm } from '@/features/draft/utils.js';
import { leavePresence } from '@/features/draft/engine/presence.js';

/** Phases where the seat is live and walking out costs the other player. */
const GUARDED_PHASES = new Set(["lobby", "draft", "ready"]);

let leaving = false;

/** True while there is a seat worth asking about. Both halves share this test. */
const armed = () =>
  !leaving && Boolean(state.room?.code) && GUARDED_PHASES.has(state.phase);

/**
 * Stands the guard down, permanently.
 *
 * Call it on every exit the app is itself driving: the two Leave buttons, which
 * have already asked their own question, and the terminal screens, where the
 * room is over and a second dialog is pure noise. Every one of those ends in
 * navigation, so there is nothing to re-arm for.
 */
export function allowLeave() {
  leaving = true;
}

export function initLeaveGuard() {
  window.addEventListener("beforeunload", (e) => {
    if (!armed()) return;
    e.preventDefault();
    // Legacy support (Chrome/Edge before 119); the value is never displayed.
    e.returnValue = true;
  });
  initBackGuard();
  initDisconnectBeacon();
}

/* ── The lobby disconnect beacon ──────────────────────────────
   A tab that closes is a seat nobody reclaims — there is no presence TTL — so
   in the **lobby** the close is reported and the seat really is given up. The
   server then promotes the guest, or deletes a room with nobody left in it.

   **Lobby only, and that is the whole safety argument.** Mid-draft the same
   beacon would hand a crashed tab, a locked phone or a mis-swipe the power to
   reset both squads, and a draft is expensive to lose where a lobby seat is
   not. Past the lobby the seat is held exactly as before and the opponent's
   badge carries the news (`opponentLiveness`).

   `pagehide`, not `unload`: `unload` is unreliable on mobile and disqualifies
   the page from the back/forward cache. `sendBeacon` because the request has to
   outlive the document — a normal `fetch` is cancelled on unload, and the Blob
   type is what makes `express.json()` parse it (a bare string is sent as
   `text/plain` and arrives as an empty body). */

function initDisconnectBeacon() {
  window.addEventListener("pagehide", () => {
    // The Leave button and the back-guard have already posted their own leave.
    if (leaving) return;
    if (state.phase !== "lobby") return;
    const code = state.room?.code;
    if (!code || !navigator.sendBeacon) return;

    const body = JSON.stringify({ reason: "disconnect" });
    navigator.sendBeacon(
      `/api/rooms/${encodeURIComponent(code)}/leave`,
      new Blob([body], { type: "application/json" }),
    );
  });
}

/* ── The back button ──────────────────────────────────────────
   The one exit where the dialog can be ours. `beforeunload` fires for back too,
   but only the browser's own prompt; the History API lets us cancel the
   navigation first and then ask properly.

   The trick is that a `popstate` cannot be prevented — by the time it fires the
   entry has already been popped. What can be done is push a spare entry on
   arrival, so the first back press lands on *that* rather than leaving the page,
   and then push it again to undo the pop. The user stays put and gets
   `askConfirm`.

   Accepted cost: back takes two presses, and every cancel adds another entry to
   the stack. That is the price of the styled dialog, and it is why this covers
   back only — nothing can intercept a tab close.                            */

const BACK_GUARD_STATE = "efb-room-guard";
/** 2 minutes at 500 ms — far past any legitimate join, including a slow reconnect. */
const ARM_ATTEMPT_LIMIT = 240;

let backGuardPushed = false;
let dialogOpen = false;

/** The spare entry, pushed once we are somewhere worth guarding. */
function pushGuardEntry() {
  if (backGuardPushed) return;
  backGuardPushed = true;
  // Same URL, so nothing visible changes.
  history.pushState({ [BACK_GUARD_STATE]: true }, "", location.href);
}

function initBackGuard() {
  /* Arriving in a room is asynchronous — `initLeaveGuard` runs on
     DOMContentLoaded, long before the phase is known. Wait for a guarded phase
     rather than pushing an entry into a page the user may never have entered.

     Bounded, because a page that never reaches one is a real outcome: a 409
     lands on `#viewError`, which is not guarded and never will be, and an
     unbounded 2 Hz interval would sit there for as long as the tab is open. */
  let armAttempts = 0;
  const armWhenInRoom = setInterval(() => {
    if (armed()) pushGuardEntry();
    if (armed() || leaving || (armAttempts += 1) > ARM_ATTEMPT_LIMIT) {
      clearInterval(armWhenInRoom);
    }
  }, 500);

  window.addEventListener("popstate", async () => {
    if (!armed()) return;
    /* A second press while the dialog is up would stack a second dialog and pop
       an entry we never re-pushed. */
    if (dialogOpen) {
      pushGuardEntry();
      return;
    }

    // Undo the pop: this is what keeps the user in the room.
    backGuardPushed = false;
    pushGuardEntry();

    dialogOpen = true;
    const isHost = state.mySide === "host";
    const ok = await askConfirm(
      isHost
        ? { title: "Close Room", message: "Close room for everyone?", okText: "Close room" }
        : { title: "Leave Room", message: "Leave the room?", okText: "Leave" },
    );
    dialogOpen = false;
    if (!ok) return;

    allowLeave();
    await leavePresence();
    window.location.href = "/";
  });
}
