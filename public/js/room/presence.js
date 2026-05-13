import { LOBBY_PRESENCE_POLL_MS } from './constants.js';
import { cb } from './callbacks.js';
import { state } from './state.js';
import { applyPresenceSnapshot } from './state.js';
import { getUser, getAnonId, getCurrentIdentity, showView } from './utils.js';

export function clearRoomPhaseCache(code) {
  try { if (code) sessionStorage.removeItem(`efb_room_${code}_phase`); } catch { /* ignore */ }
}

export async function registerPresence() {
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
      const errorView = document.getElementById("viewError");
      const errorTitle = document.getElementById("errorTitle");
      const errorIcon = document.getElementById("errorStateIcon");
      const errorBtn = document.getElementById("errorLeaveBtn");
      if (errorView) {
        errorView.classList.remove("is-room-closed");
        errorView.classList.remove("is-access-denied");
        errorView.classList.remove("is-host-lock");
        errorView.classList.remove("is-room-full");
      }
      const isHostLock = state.mySide === "host" && res.status === 409;
      const isKicked = res.status === 403;
      const isRoomFull = !isHostLock && res.status === 409; // guest slot already taken
      if (errorView) {
        errorView.classList.toggle("is-host-lock", isHostLock);
        errorView.classList.toggle("is-room-full", isRoomFull);
        errorView.classList.toggle("is-access-denied", isKicked);
      }
      if (errorTitle) {
        errorTitle.hidden = false;
        errorTitle.textContent = isHostLock
          ? "Host slot taken"
          : isRoomFull
            ? "Room is full"
            : "Access denied";
      }
      if (errorIcon) errorIcon.hidden = true;
      if (errorBtn) errorBtn.textContent = "Back to home";
      const msg = document.getElementById("errorMessage");
      if (msg) {
        if (isHostLock) {
          msg.textContent = "This room already has an active host. Use the invite link to join as a guest.";
        } else if (isRoomFull) {
          msg.textContent = "This room already has two players and cannot accept more connections.";
        } else {
          msg.textContent = data.error || "You were removed from this room.";
        }
      }
      showView("viewError");
      stopPresencePolling();
      state.phase = "error";
      return;
    }
    return;
  }
  if (data.room) applyPresenceSnapshot(data.room);
  state.presenceError = false;
  return data.room || null;
}

export async function fetchRoomSnapshot() {
  const code = state.room?.code;
  if (!code) return { changed: false };
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
  if (!res.ok) return { changed: false };
  const data = await res.json().catch(() => ({}));
  const room = data.room;
  if (!room) return { changed: false };
  const nextUpdatedAt = Number(room.updatedAt || 0);
  const changed = nextUpdatedAt > Number(state.lastRoomUpdatedAt || 0);
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
  try {
    const room = await registerPresence();
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
