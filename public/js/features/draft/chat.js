/**
 * Room chat — one floating dock for every stage of the room.
 *
 * It used to be the lobby's right-hand column, which meant the players lost the
 * only channel they had the moment the draft started. The dock lives outside
 * every `.view`, so switching lobby → ban → pick → Start Match leaves it
 * untouched, and `renderRoomChat` runs off the presence poll (which already
 * covers all four phases) rather than off any one phase's render.
 */

import { cb } from '@/features/draft/callbacks.js';
import { escapeHtml, showToast, getCurrentIdentity } from '@/features/draft/utils.js';
import { state, applyPresenceSnapshot } from '@/features/draft/state.js';
import { postAsMe } from '@/features/draft/api.js';

const pad2 = (n) => String(n).padStart(2, "0");

/* How many messages had been rendered the last time the panel was open. Kept
   here rather than on `state`: nothing outside this module reads it, and it is
   a property of the widget, not of the room. */
let seenCount = 0;
let isOpen = false;

const els = () => ({
  dock: document.getElementById("roomChat"),
  panel: document.getElementById("chatPanel"),
  launcher: document.getElementById("chatLauncher"),
  badge: document.getElementById("chatBadge"),
  log: document.getElementById("chatLog"),
  input: document.getElementById("chatInput"),
  sendBtn: document.querySelector("#chatForm button[type='submit']"),
});

/* ── Dragging ────────────────────────────────────────────────────────────────
   The dock can be put anywhere on screen. Position is the launcher's top-left
   in viewport pixels, and it lives in **sessionStorage**, so it belongs to the
   window it was dragged in.

   It was localStorage first, which is shared by every tab on the origin: drag
   the bubble in the host's window and the guest's window — a second window of
   the same browser, which is how a pair actually tests a room — opened with the
   bubble already parked in the middle of the page, nowhere near the corner it
   is supposed to default to. Per-window is also what "default bottom-right,
   then keep where I put it" means: stage changes and the reload that a rematch
   does are both inside one window, so the position survives exactly as far as
   it should. */

const DOCK_POS_KEY = "efb_chat_dock";
const EDGE_MARGIN = 8;
/* Under this, a pointer that moved is still a click. Pressing a 52px button
   without shifting a pixel is not something a hand reliably does. */
const DRAG_THRESHOLD_PX = 4;

let suppressClick = false;

function dockSize() {
  const { dock } = els();
  const r = dock?.getBoundingClientRect();
  return { w: r?.width || 52, h: r?.height || 52 };
}

/** Keeps the whole launcher on screen, including after the window is resized. */
function clampToViewport(x, y) {
  const { w, h } = dockSize();
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - w - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - h - EDGE_MARGIN);
  return { x: Math.min(Math.max(x, EDGE_MARGIN), maxX), y: Math.min(Math.max(y, EDGE_MARGIN), maxY) };
}

function applyDockPos(x, y) {
  const { dock } = els();
  if (!dock) return;
  const pos = clampToViewport(x, y);
  /* `right`/`bottom` have to go, or the fixed box is anchored on both axes and
     the width the CSS gave it fights the position the drag is setting. */
  dock.style.left = `${Math.round(pos.x)}px`;
  dock.style.top = `${Math.round(pos.y)}px`;
  dock.style.right = "auto";
  dock.style.bottom = "auto";
  const { w, h } = dockSize();
  /* Open away from the nearest edges: the panel is 330×420 and would otherwise
     hang off the screen the moment the launcher is anywhere but bottom-right. */
  dock.classList.toggle("is-flip-down", pos.y + h / 2 < window.innerHeight / 2);
  dock.classList.toggle("is-align-left", pos.x + w / 2 < window.innerWidth / 2);
  return pos;
}

function storedDockPos() {
  try {
    /* Anyone who dragged the dock while it was still browser-wide has a stale
       key sitting in localStorage; drop it rather than read it, or their next
       window opens wherever it was left months ago. */
    localStorage.removeItem(DOCK_POS_KEY);
    const raw = JSON.parse(sessionStorage.getItem(DOCK_POS_KEY) || "null");
    if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return null;
    return raw;
  } catch { return null; }
}

function saveDockPos(pos) {
  try { sessionStorage.setItem(DOCK_POS_KEY, JSON.stringify(pos)); } catch { /* private mode */ }
}

function initDockDrag() {
  const { dock, launcher } = els();
  const head = document.querySelector(".room-chat-head");
  if (!dock) return;

  const stored = storedDockPos();
  if (stored) applyDockPos(stored.x, stored.y);

  /* A resize can leave a stored position off-screen — re-clamp rather than
     lose the dock behind the edge of a smaller window. */
  window.addEventListener("resize", () => {
    if (!dock.style.left) return;
    applyDockPos(parseFloat(dock.style.left), parseFloat(dock.style.top));
  });

  let dragging = false;
  let startX = 0, startY = 0, originX = 0, originY = 0;

  const onDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    /* The close button lives inside the handle and is not a grip. */
    if (e.target.closest(".room-chat-close")) return;
    const r = dock.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    originX = r.left; originY = r.top;
    dragging = false;
    /* Capture keeps the drag alive when the pointer outruns the 52px button.
       Wrapped because a pointer that has already been released — or a
       synthetic event from a test harness — throws on an unknown id. */
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* not captureable */ }
    e.currentTarget.addEventListener("pointermove", onMove);
    e.currentTarget.addEventListener("pointerup", onUp, { once: true });
    e.currentTarget.addEventListener("pointercancel", onUp, { once: true });
  };

  const onMove = (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    dragging = true;
    dock.classList.add("is-dragging");
    applyDockPos(originX + dx, originY + dy);
  };

  const onUp = (e) => {
    e.currentTarget.removeEventListener("pointermove", onMove);
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* never captured */ }
    dock.classList.remove("is-dragging");
    if (!dragging) return;
    /* The click that follows this pointerup would toggle the panel — a drag
       that ends by opening the chat is not what the hand asked for. */
    suppressClick = true;
    saveDockPos(applyDockPos(parseFloat(dock.style.left), parseFloat(dock.style.top)));
  };

  launcher?.addEventListener("pointerdown", onDown);
  head?.addEventListener("pointerdown", onDown);
}

/** Binds the launcher, the close button and the composer. Called once, on boot. */
export function initRoomChat() {
  const { launcher, panel, input } = els();
  launcher?.addEventListener("click", () => {
    if (suppressClick) { suppressClick = false; return; }
    setOpen(!isOpen);
  });
  initDockDrag();
  document.getElementById("chatCloseBtn")?.addEventListener("click", () => setOpen(false));

  document.getElementById("chatForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = input?.value || "";
    if (!value.trim()) return;
    await sendRoomChatMessage(value);
    if (input) input.value = "";
  });

  /* Escape closes it, the way every other overlay on the page behaves. Scoped
     to the panel being open so it never swallows a key the phase wants. */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen && !panel?.hidden) setOpen(false);
  });

  renderRoomChat();
}

function setOpen(next) {
  const { panel, launcher, input } = els();
  isOpen = Boolean(next);
  if (panel) panel.hidden = !isOpen;
  launcher?.classList.toggle("is-open", isOpen);
  launcher?.setAttribute("aria-expanded", isOpen ? "true" : "false");
  if (isOpen) {
    markRead();
    if (input && !input.disabled) input.focus();
    scrollToLatest();
  }
  paintBadge();
}

function messageCount() {
  return Array.isArray(state.room?.chat) ? state.room.chat.length : 0;
}

function markRead() {
  seenCount = messageCount();
}

function paintBadge() {
  const { badge } = els();
  if (!badge) return;
  const unread = Math.max(0, messageCount() - seenCount);
  const show = unread > 0 && !isOpen;
  badge.hidden = !show;
  /* Two digits is the whole width the dot has; past that the exact number does
     not change what the player does about it. */
  badge.textContent = show ? (unread > 99 ? "99+" : String(unread)) : "";
}

function scrollToLatest() {
  const { log } = els();
  if (log) log.scrollTop = log.scrollHeight;
}

/**
 * Repaints the dock from `state.room`. Safe to call on every poll — it only
 * touches the DOM the snapshot can have changed.
 */
export function renderRoomChat() {
  const { dock, log, input, sendBtn } = els();
  if (!dock) return;

  /* Visible wherever there is a room to talk in. The two exit screens
     (`#viewError`, `#viewAbandoned`) are not rooms any more, and the DOM is the
     honest test — a phase name would have to be kept in step with them. */
  const inRoom = Boolean(state.room?.code)
    && !state.room?.closed
    && [...document.querySelectorAll("#viewLobby, #viewDraft")].some((v) => !v.hidden);
  dock.hidden = !inRoom;
  if (!inRoom) return;

  /* One seat filled is nobody to talk to. The lobby used to own this rule; it
     lives here now because the dock outlives the lobby. */
  const canChat = Boolean(state.room?.host && state.room?.guest);
  if (input) {
    input.disabled = !canChat;
    input.placeholder = canChat ? "Type a message..." : "Chat unlocks when both users are connected...";
  }
  if (sendBtn) sendBtn.disabled = !canChat;

  if (log) {
    const messages = Array.isArray(state.room.chat) ? state.room.chat : [];
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    if (!messages.length) {
      log.innerHTML = '<div class="chat-empty">No messages yet. Agree rules here before starting.</div>';
    } else {
      const myId = getCurrentIdentity().id;
      log.innerHTML = messages.map((m) => messageHtml(m, myId)).join("");
      /* Only follow the log when the reader was already at the bottom —
         yanking it down mid-scroll is how a chat loses an argument. */
      if (atBottom || isOpen) scrollToLatest();
    }
  }

  if (isOpen) markRead();
  paintBadge();
}

function messageHtml(message, myId) {
  if (String(message.senderId || "") === "system") {
    return `<div class="chat-announce">${escapeHtml(message.message || "")}</div>`;
  }

  const mine = String(message.senderId) === String(myId);
  const at = new Date(message.createdAt || Date.now());
  return `
      <div class="chat-item ${mine ? "is-mine" : ""}">
        <div class="chat-head">
          <span class="chat-name">${escapeHtml(message.senderName || "User")}</span>
          <span class="chat-time">${pad2(at.getHours())}:${pad2(at.getMinutes())}</span>
        </div>
        <div class="chat-msg">${escapeHtml(message.message || "")}</div>
      </div>
    `;
}

export async function sendRoomChatMessage(raw) {
  const message = String(raw || "").trim();
  if (!message || !state.room?.code) return;

  const { ok, data } = await postAsMe("chat", {
    username: getCurrentIdentity().username,
    message,
  });

  if (!ok) {
    showToast(data.error || "Could not send message.");
    return;
  }
  if (data.room) {
    applyPresenceSnapshot(data.room);
    renderRoomChat();
    cb.renderLobby();
  }
}
