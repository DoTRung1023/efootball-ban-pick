import {
  LOBBY_PRESENCE_POLL_MS,
  OPPONENT_CONNECTED_MS,
  OPPONENT_GONE_MS,
} from '@/features/draft/constants.js';
import { cb } from '@/features/draft/callbacks.js';
import { state } from '@/features/draft/state.js';
import { applyPresenceSnapshot } from '@/features/draft/state.js';
import { getUser, getAnonId, getCurrentIdentity, showToast, showView } from '@/features/draft/utils.js';
import { paintErrorView } from '@/features/draft/errorView.js';
import { clearTurnTimer } from './draftFlow.js';

export function clearRoomPhaseCache(code) {
  try { if (code) sessionStorage.removeItem(`efb_room_${code}_phase`); } catch { /* ignore */ }
}

/**
 * Which seat is actually mine, according to the server.
 *
 * `initLobby` guesses from the URL — `?mode=join` means guest, anything else
 * means host — and that guess is wrong every time somebody returns to a room by
 * a route that does not carry the query string: browser history, a retyped
 * address, the rejoin redirect. The guest then posts `role: "host"`,
 * `claimHostSeat` sees a different id in the seat and answers **409 "Room
 * already has an active host"**, and they are locked out of a room they are
 * still sitting in.
 *
 * It is also what makes host promotion possible at all. Promote the guest
 * server-side and their client keeps posting `role: "guest"`; the guest seat is
 * empty by then, so `claimGuestSeat` hands it back and one person ends up
 * seated as both. The seat has to come from the server, and it has to be able
 * to change mid-session.
 */
function adoptSeat(room) {
  if (!room) return;
  const me = String(getCurrentIdentity().id || "");
  if (!me) return;
  const side = String(room.host?.id || "") === me
    ? "host"
    : String(room.guest?.id || "") === me
      ? "guest"
      : null;
  if (side && side !== state.mySide) state.mySide = side;
}

/**
 * The same, before the first heartbeat goes out.
 *
 * Order matters: the 409 above is raised by the *claim*, so asking afterwards
 * is too late. A room with no entry yet, or one where neither seat is ours,
 * leaves the URL's guess standing — which is right, because that is exactly the
 * case where we are arriving rather than returning.
 */
async function adoptSeatFromServer() {
  const code = state.room?.code;
  if (!code) return;
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
    if (!res.ok) return;
    adoptSeat((await res.json())?.room);
  } catch {
    /* offline — the guess stands, and the claim will fail loudly if it is wrong */
  }
}

/**
 * Did the last heartbeat land us on `#viewError` for good?
 *
 * The 403/409/410 branches of `registerPresence` paint that screen and then
 * return `undefined` — the same value a plain network failure returns. Both
 * callers used to read that as "reconnect failed" and answer it by showing the
 * lobby, which painted straight over the error they had just been given: a
 * kicked player saw a working lobby (stale, with their own squad stats under
 * the host) instead of "Access denied", and a guest opening a closed room never
 * saw "Room closed" either. The phase is the only thing that separates the two.
 */
const wentTerminal = () => state.phase === "error";

async function registerPresence() {
  const code = state.room?.code;
  if (!code) return;
  const user = getUser();
  const userId = user?.id ?? getAnonId();
  const username = user?.username ?? (state.mySide === "host" ? "You" : "Guest");
  const role = state.mySide === "host" ? "host" : "guest";
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/presence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role, userId, username,
      stagedBans: state.stagedBans.map((p) => ({ id: String(p.id), name: p.name || "" })),
      /* Lets the other side tell a backgrounded tab from a departing one. A
         hidden tab's heartbeat is throttled to about once a minute, so without
         this its `lastSeenAt` is indistinguishable from a browser that closed. */
      hidden: Boolean(document.hidden),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 410 && data.room) {
      applyPresenceSnapshot(data.room);
      if (state.room?.closed) cb.showRoomClosed(state.room.closeReason || "Host closed the room.");
      stopPresencePolling();
      state.phase = "error";
      return;
    }
    if (res.status === 409 || res.status === 403) {
      const isHostLock = state.mySide === "host" && res.status === 409;
      const isRoomFull = !isHostLock && res.status === 409; // guest slot already taken
      paintErrorView({
        modifier: isHostLock ? "is-host-lock" : isRoomFull ? "is-room-full" : "is-access-denied",
        title: isHostLock ? "Host slot taken" : isRoomFull ? "Room is full" : "Access denied",
        icon: false,
        leaveText: "Back to home",
        message: isHostLock
          ? "This room already has an active host. Use the invite link to join as a guest."
          : isRoomFull
            ? "This room already has two players and cannot accept more connections."
            : data.error || "You were removed from this room.",
      });
      stopPresencePolling();
      state.phase = "error";
      return;
    }
    return;
  }
  if (data.room) {
    adoptSeat(data.room);
    applyPresenceSnapshot(data.room);
  }
  state.presenceError = false;
  return data.room || null;
}

async function fetchRoomSnapshot() {
  const code = state.room?.code;
  if (!code) return { changed: false };
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
  if (!res.ok) return { changed: false };
  const data = await res.json().catch(() => ({}));
  const room = data.room;
  if (!room) return { changed: false };
  const nextUpdatedAt = Number(room.updatedAt || 0);
  const changed = nextUpdatedAt > Number(state.lastRoomUpdatedAt || 0);
  /* Outside the `changed` guard on purpose: a promotion moves *us* between
     seats, and the snapshot that carries it must not be skipped. */
  adoptSeat(room);
  if (changed || !state.room?.host || !state.room?.guest) {
    applyPresenceSnapshot(room);
  }
  return { changed: changed || !state.room };
}

export async function leavePresence() {
  const code = state.room?.code;
  if (!code) return;
  clearRoomPhaseCache(code);
  const me = getCurrentIdentity();
  try {
    await fetch(`/api/rooms/${encodeURIComponent(code)}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId: me.id }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

export function stopPresencePolling() {
  if (state.presencePollId) {
    clearInterval(state.presencePollId);
    state.presencePollId = null;
  }
}

/**
 * How alive the other player looks, from their last heartbeat.
 *
 * The one place this is decided; every badge reads it rather than testing
 * `lastSeenAt` itself, because the thresholds are easy to get wrong and getting
 * them wrong is what deleted the server TTL (see
 * `room/presence-and-reconnect.md`).
 *
 * **Display only.** Nothing here frees a seat — that stays with Leave, the
 * host's Kick, and the turn timer's forfeit.
 *
 *   `connected`    — beating
 *   `away`         — stale, but the last beat said the tab was backgrounded.
 *                    Not a problem: a hidden tab is throttled to ~1/min.
 *   `reconnecting` — stale from a foreground tab. Refresh, tunnel, dropped wifi.
 *   `gone`         — stale past `OPPONENT_GONE_MS`. They are not coming back on
 *                    their own.
 *
 * An absent participant is `gone`: the seat is empty, which is the one case the
 * old `Boolean(theirInfo?.id)` test actually got right.
 */
export function opponentLiveness(participant) {
  if (!participant?.id) return "gone";
  const age = Date.now() - Number(participant.lastSeenAt || 0);
  if (age <= OPPONENT_CONNECTED_MS) return "connected";
  if (age >= OPPONENT_GONE_MS) return "gone";
  return participant.hidden ? "away" : "reconnecting";
}

/**
 * Coming back to the tab polls at once instead of waiting out the interval.
 *
 * While hidden, our own heartbeat is throttled to roughly once a minute, so on
 * return `lastSeenAt` can be nearly that stale — and the opponent is looking at
 * it. One immediate beat clears their badge instead of leaving us reading
 * "away" for another throttled tick.
 */
let visibilityBound = false;
function bindVisibilityHeartbeat() {
  if (visibilityBound) return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.presencePollId) void pollPresence();
  });
}

/**
 * Back to the lobby with the room still ours — the draft is over, the room is
 * not. Polling continues, so the moment a new guest joins the host sees them in
 * the matchup band exactly as the first time.
 *
 * The phase cache goes too: it is what makes a reload skip the lobby, and after
 * this the lobby is precisely where a reload should land.
 */
function returnToLobby() {
  clearRoomPhaseCache(state.room?.code);
  clearTurnTimer();
  state.phase = "lobby";
  state.stagedBans = [];
  state.opponentStagedBans = [];
  state.pickActiveSlot = null;
  state.pickPendingPlayerId = null;
  showToast("Your opponent left. Invite someone else to start again.");
  showView("viewLobby");
  cb.renderLobby();
}

export async function pollPresence() {
  if (!state.room?.code) return;
  // Allow presence polling during lobby, ready, and draft so clients stay in sync
  if (state.phase !== "lobby" && state.phase !== "ready" && state.phase !== "draft") return;
  try {
    const prevUpdatedAt = Number(state.lastRoomUpdatedAt || 0);
    const prevHostId = String(state.room?.host?.id || "");
    const prevGuestId = String(state.room?.guest?.id || "");
    const prevGuestReady = Boolean(state.room?.ready?.guest);
    const prevClosed = Boolean(state.room?.closed);
    const prevChatLen = Array.isArray(state.room?.chat) ? state.room.chat.length : 0;

    await registerPresence(); // heartbeat
    /* Kicked mid-session. Nothing below paints over `#viewError` today —
       `renderDraftUi` bails on the phase and the lobby branch tests for it —
       but everything below reads and re-applies the state of a room we have
       just been thrown out of, and it does it after `stopPresencePolling`. */
    if (wentTerminal()) return;
    const snap = await fetchRoomSnapshot();
    if (state.room?.closed) {
      stopPresencePolling();
      cb.showRoomClosed(state.room.closeReason || "Host closed the room.");
      return;
    }
    const nextHostId = String(state.room?.host?.id || "");
    const nextGuestId = String(state.room?.guest?.id || "");
    const nextGuestReady = Boolean(state.room?.ready?.guest);
    const nextClosed = Boolean(state.room?.closed);
    const nextChatLen = Array.isArray(state.room?.chat) ? state.room.chat.length : 0;
    const nextUpdatedAt = Number(state.lastRoomUpdatedAt || 0);
    const presenceChanged =
      prevHostId !== nextHostId ||
      prevGuestId !== nextGuestId ||
      prevGuestReady !== nextGuestReady ||
      prevClosed !== nextClosed ||
      prevChatLen !== nextChatLen;
    const configChanged = nextUpdatedAt > prevUpdatedAt;

    /* The guest left (or was kicked) mid-draft. The **room** did not go anywhere
       — the host still holds the code — so drop back to the lobby and keep
       polling for somebody new, rather than running a countdown to the home page
       and abandoning a room that still exists. The server has already reset the
       draft; this just follows it. Both the ban and the pick board come back
       here the same way.

       Only the guest slot can empty like this: the host leaving closes the room,
       which the `state.room.closed` branch above catches first. */
    if ((state.phase === "draft" || state.phase === "ready") && prevGuestId && !nextGuestId && !state.room?.closed) {
      returnToLobby();
      return;
    }

    if (state.phase === "lobby") {
      if (cb.tryEnterDraftFromRoomSnapshot()) return;
      if (snap.changed || presenceChanged || configChanged) cb.renderLobby();
      return;
    }

    if (String(state.room?.status || "") === "done" && cb.isBothMatchReady()) {
      stopPresencePolling();
      state.phase = "done";
      cb.showDone();
      return;
    }

    cb.renderDraftUi();
  } catch {
    state.presenceError = true;
  }
}

export async function registerAndPollPresence() {
  bindVisibilityHeartbeat();
  await adoptSeatFromServer();
  try {
    const room = await registerPresence();
    if (wentTerminal()) return;
    if (!room) {
      // Reconnect failed — clear cached phase and fall back to lobby
      clearRoomPhaseCache(state.room?.code);
      if (!document.getElementById("viewLobby")?.offsetParent) {
        showView("viewLobby");
        cb.renderLobby();
      }
      return;
    }
    await fetchRoomSnapshot();
  } catch (e) {
    console.warn("Room presence register failed", e);
    clearRoomPhaseCache(state.room?.code);
    if (!document.getElementById("viewLobby")?.offsetParent) {
      showView("viewLobby");
      cb.renderLobby();
    }
    return;
  }
  if (cb.tryEnterDraftFromRoomSnapshot()) return;
  // Server says we're in lobby — clear cached phase and show lobby
  clearRoomPhaseCache(state.room?.code);
  if (!document.getElementById("viewLobby")?.offsetParent) showView("viewLobby");
  stopPresencePolling();
  state.presencePollId = setInterval(pollPresence, LOBBY_PRESENCE_POLL_MS);
  cb.renderLobby();
}
