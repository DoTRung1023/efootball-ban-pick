import { cb } from '@/pages/home/callbacks.js';
import { showToast } from '@/shared/ui/toast.js';

function normalizeRoomCode(raw) {
  const code = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[IO]/g, ""); // avoid ambiguous chars
  return code;
}

async function goToRoom({ code, mode, btn: btnEl }) {
  const c = normalizeRoomCode(code);
  if (!c || c.length < 4) {
    showToast("Enter a valid room code.", "info");
    return;
  }

  if (mode === "join") {
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = "CHECKING…"; }
    try {
      const data = await fetch(`/api/rooms/${encodeURIComponent(c)}`).then(r => r.json());
      if (!data.room?.host) {
        showToast("Room not found. Check the code and try again.", "error");
        return;
      }
    } catch {
      showToast("Could not reach the server. Try again.", "error");
      return;
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = "ENTER CODE TO JOIN"; }
    }
  }

  const url = new URL(window.location.origin + `/room/${encodeURIComponent(c)}`);
  if (mode) url.searchParams.set("mode", String(mode));
  window.location.href = url.pathname + url.search;
}

/**
 * Sends a returning player straight back to the room they are still seated in.
 *
 * Closing a tab does not give up a seat, so without this the app forgets a
 * draft in progress the moment the tab goes: the phase cache is per-tab
 * `sessionStorage`, and the home page does not know the code in any case. The
 * server does — it is the one holding the seat.
 *
 * `location.replace`, not `href`: the home page is a place the user passed
 * through, and leaving it in the history means Back lands on a page that
 * immediately redirects here again.
 *
 * There is no trap. Leave in the room posts `/leave`, which frees the seat, so
 * the next visit here stays put.
 */
export async function redirectToActiveRoom(userId) {
  if (!userId) return false;
  try {
    const res = await fetch(`/api/rooms/mine?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return false;
    const room = (await res.json())?.room;
    if (!room?.code) return false;
    window.location.replace(`/room/${encodeURIComponent(room.code)}`);
    return true;
  } catch {
    return false; // offline: the home page is a fine place to land
  }
}

/** Codes the host hands out are this long; the join field counts against it. */
const ROOM_CODE_LENGTH = 6;

function genCode(len = ROOM_CODE_LENGTH) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/**
 * The host side of the Rooms tab: the room code and the button that opens it.
 *
 * This replaced a slide-in drawer. The code now lives on the page itself, so
 * there is no overlay to open, no body scroll-lock to restore, and no Escape
 * handler — the drawer's Escape branch referenced `addPlayerModalOpen`, which
 * is module-private to `catalog.js` and threw a ReferenceError every time it
 * ran. Nothing is behind a click any more, so the code is generated at boot.
 *
 * `refreshRoomHost` is separate because the squad count it prints is only
 * known once `loadSquad` resolves, which is after this binds.
 */
export function initRoomHost(user) {
  const codeEl = document.getElementById("roomCode");
  if (!codeEl) return;

  const setCode = (code) => { codeEl.textContent = code; };
  setCode(genCode());

  const avatar = document.getElementById("roomHostAvatar");
  const name   = document.getElementById("roomHostName");
  const label  = (user?.display_name || user?.username || "").trim();
  if (name)   name.textContent = label || "—";
  if (avatar) avatar.textContent = (label[0] || "?").toUpperCase();

  refreshRoomHost();

  document.getElementById("regenCode")?.addEventListener("click", () => setCode(genCode()));

  document.getElementById("copyCode")?.addEventListener("click", async () => {
    const code = codeEl.textContent.trim();
    if (!code) return;
    try { await navigator.clipboard.writeText(code); showToast("Room code copied!", "success"); }
    catch { showToast(code, "info"); }
  });

  document.getElementById("startRoomBtn")?.addEventListener("click", () => {
    goToRoom({ code: codeEl.textContent.trim(), mode: "host" });
  });
}

/** Repaint the host row's squad count. Safe to call before the squad loads. */
export function refreshRoomHost() {
  const meta = document.getElementById("roomHostMeta");
  if (!meta) return;
  const n = cb.getSquadPlayers().length;
  meta.textContent = n ? `HOST · ${n} PLAYERS` : "HOST";
}

/* ============================================================
   Room Hub (Create / Join)
   ============================================================ */
/** Pulls the code out of a `/room/CODE` URL. Returns "" for anything else. */
function codeFromInviteUrl(text) {
  try {
    const match = new URL(String(text).trim()).pathname.match(/\/room\/([A-Z0-9]+)/i);
    return match ? normalizeRoomCode(match[1]) : "";
  } catch {
    return ""; // not a URL — the caller falls back to treating it as a raw code
  }
}

export function initRoomHub() {
  const input = document.getElementById("joinRoomCode");
  const btn   = document.getElementById("joinRoomBtn");
  const count = document.getElementById("joinCodeCount");
  if (!input || !btn) return;

  const submit = () => goToRoom({ code: input.value, mode: "join", btn: btn });

  const paintCount = () => {
    if (count) count.textContent = `${input.value.length}/${ROOM_CODE_LENGTH}`;
  };

  input.addEventListener("input", () => {
    /* Paste a whole invite link and it collapses to the code. The separate
       link field this replaced is gone with the redesign; folding it in here
       means one box accepts either, which is what people were doing anyway. */
    const fromUrl = codeFromInviteUrl(input.value);
    input.value = (fromUrl || normalizeRoomCode(input.value)).slice(0, 10);
    if (fromUrl) showToast("Room code extracted.", "success");
    paintCount();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  btn.addEventListener("click", submit);

  // Paste clipboard into code input
  document.getElementById("pasteCodeBtn")?.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      // Try extracting from a URL first, then treat as raw code
      const code = codeFromInviteUrl(text) || normalizeRoomCode(text);
      if (code) {
        input.value = code.slice(0, 10);
        paintCount();
        input.focus();
      } else {
        showToast("Nothing useful on the clipboard.", "info");
      }
    } catch {
      showToast("Could not read clipboard.", "info");
    }
  });

  paintCount();

  // Tab navigation links (MANAGE › / EDIT ›)
  document.querySelectorAll("[data-switch-tab]").forEach((el) => {
    el.addEventListener("click", () => {
      const target = el.dataset.switchTab;
      document.querySelector(`.nav-tab[data-tab="${target}"]`)?.click();
    });
  });
}
