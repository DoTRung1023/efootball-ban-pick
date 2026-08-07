/** Lobby chat log and message sending. */

import { cb } from '@/features/draft/callbacks.js';
import { escapeHtml, showToast, getCurrentIdentity } from '@/features/draft/utils.js';
import { state, applyPresenceSnapshot } from '@/features/draft/state.js';
import { postAsMe } from '@/features/draft/api.js';

const pad2 = (n) => String(n).padStart(2, "0");

export function renderLobbyChat() {
  const log = document.getElementById("chatLog");
  const room = state.room;
  if (!log || !room) return;

  const messages = Array.isArray(room.chat) ? room.chat : [];
  if (!messages.length) {
    log.innerHTML = '<div class="chat-empty">No messages yet. Agree rules here before starting.</div>';
    return;
  }

  const myId = getCurrentIdentity().id;
  log.innerHTML = messages.map((m) => messageHtml(m, myId)).join("");
  log.scrollTop = log.scrollHeight;
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

export async function sendLobbyChatMessage(raw) {
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
    cb.renderLobby();
  }
}
