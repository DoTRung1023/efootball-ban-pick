import { getUser } from '@/shared/lib/session.js';
import { state } from './state.js';

/* Shared with the home bundle — see @/shared/players/playerMeta.js and
   @/shared/lib/session.js. Re-exported so room modules keep importing them
   from "./utils.js" as before. */
export { escapeHtml } from "@/shared/players/playerMeta.js";
export { getUser } from "@/shared/lib/session.js";

export function showToast(message, variant = "default") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("toast--warn");
  if (variant === "warn") el.classList.add("toast--warn");
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.classList.remove("show");
    el.classList.remove("toast--warn");
  }, 2400);
}

export function askConfirm({ title = "Confirm", message = "Are you sure?", okText = "OK", cancelText = "Cancel" }) {
  const overlay = document.getElementById("confirmOverlay");
  const titleEl = document.getElementById("confirmTitle");
  const msgEl = document.getElementById("confirmMessage");
  const okBtn = document.getElementById("confirmOkBtn");
  const cancelBtn = document.getElementById("confirmCancelBtn");
  if (!overlay || !titleEl || !msgEl || !okBtn || !cancelBtn) {
    return Promise.resolve(window.confirm(message));
  }

  titleEl.textContent = title;
  msgEl.textContent = message;
  okBtn.textContent = okText;
  cancelBtn.textContent = cancelText;
  overlay.removeAttribute("hidden");

  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      overlay.setAttribute("hidden", "");
      overlay.removeEventListener("click", onBackdrop);
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKey);
      resolve(v);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onBackdrop = (e) => { if (e.target === overlay) finish(false); };
    const onKey = (e) => {
      if (e.key === "Escape") finish(false);
      if (e.key === "Enter") finish(true);
    };
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
    okBtn.focus();
  });
}

export function showView(id) {
  ["viewError", "viewAbandoned", "viewLobby", "viewDraft", "viewDone"].forEach((vid) => {
    const el = document.getElementById(vid);
    if (!el) return;
    if (vid === id) {
      el.removeAttribute("hidden");
      el.classList.add("is-active");
    } else {
      el.setAttribute("hidden", "");
      el.classList.remove("is-active");
    }
  });
  // Update stage tabs when view changes — imported lazily to avoid circular dep
  // (updateStageTabs lives in room.js which imports utils.js; call via cb if needed)
  // For now we rely on room.js overriding showView after import, or call cb.
  // The simplest approach: room.js wraps showView after defining updateStageTabs.
}

export function getRoomCodeFromUrl() {
  const path = window.location.pathname || "";
  const m = path.match(/\/room\/([^/]+)$/);
  if (m?.[1]) return decodeURIComponent(m[1]).toUpperCase();
  const q = new URLSearchParams(window.location.search);
  return (q.get("code") || "").toUpperCase();
}

export function parseQuery() {
  const q = new URLSearchParams(window.location.search);
  return {
    mode: (q.get("mode") || "").toLowerCase(),
  };
}

/**
 * Stable id for signed-out users, so presence does not churn every request.
 *
 * **`localStorage`, not `sessionStorage`** — and the difference is a seat. A
 * signed-out player who closes the tab used to come back as a brand-new person:
 * the room has no presence TTL, so their old id sat in the seat forever and the
 * room was unusable from then on. `efb_user` is already localStorage for signed-in
 * players; this is the same promise for everyone else.
 *
 * The old sessionStorage value is adopted if it is still there, so a tab open
 * across this change keeps its seat instead of losing it on the next reload.
 */
export function getAnonId() {
  try {
    let id = localStorage.getItem("efb_room_anon_id") || sessionStorage.getItem("efb_room_anon_id");
    if (!id) {
      id = `anon-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
    }
    localStorage.setItem("efb_room_anon_id", id);
    return id;
  } catch {
    return `anon-${Date.now()}`;
  }
}

export function getCurrentIdentity() {
  const user = getUser();
  if (user?.id) return { id: String(user.id), username: user.username || "User" };
  return { id: getAnonId(), username: state.mySide === "host" ? "Host" : "Guest" };
}
