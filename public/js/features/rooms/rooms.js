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

function genCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function initRoomModal() {
  const overlay   = document.getElementById("roomOverlay");
  const codeInput = document.getElementById("roomCode");

  if (!overlay) return;

  const open  = () => {
    if (codeInput) codeInput.value = genCode();
    const sb = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.paddingRight = sb + "px";
    document.body.style.overflow = "hidden";
    overlay.classList.add("open");
  };
  const close = () => {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
  };

  document.getElementById("roomHubCreateBtn")?.addEventListener("click", open);
  document.getElementById("roomClose")?.addEventListener("click", close);
  document.getElementById("roomCancel")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open") && !addPlayerModalOpen) close();
  });

  document.getElementById("regenCode")?.addEventListener("click", () => { if (codeInput) codeInput.value = genCode(); });

  document.getElementById("copyCode")?.addEventListener("click", async () => {
    const code = codeInput?.value;
    if (!code) return;
    try { await navigator.clipboard.writeText(code); showToast("Room code copied!", "success"); }
    catch { showToast(code, "info"); }
  });

  document.getElementById("startRoomBtn")?.addEventListener("click", () => {
    const code  = codeInput?.value;
    close();
    goToRoom({ code, mode: "host" });
  });
}

/* ============================================================
   Room Hub (Create / Join)
   ============================================================ */
export function initRoomHub() {
  const input = document.getElementById("joinRoomCode");
  const btn   = document.getElementById("joinRoomBtn");
  if (!input || !btn) return;

  const submit = () => goToRoom({ code: input.value, mode: "join", btn: btn });

  input.addEventListener("input", () => {
    input.value = normalizeRoomCode(input.value).slice(0, 10);
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
      let code = "";
      try {
        const url = new URL(text.trim());
        const match = url.pathname.match(/\/room\/([A-Z0-9]+)/i);
        if (match) code = normalizeRoomCode(match[1]);
      } catch {
        code = normalizeRoomCode(text);
      }
      if (code) {
        input.value = code.slice(0, 10);
        input.focus();
      } else {
        showToast("Nothing useful on the clipboard.", "info");
      }
    } catch {
      showToast("Could not read clipboard.", "info");
    }
  });

  // Extract room code from a pasted invite link
  const linkInput = document.getElementById("joinRoomLink");
  linkInput?.addEventListener("input", function () {
    const val = this.value.trim();
    if (!val) return;
    try {
      const url = new URL(val);
      const match = url.pathname.match(/\/room\/([A-Z0-9]+)/i);
      if (match) {
        const code = normalizeRoomCode(match[1]).slice(0, 10);
        if (code) {
          input.value = code;
          this.value = "";
          showToast("Room code extracted.", "success");
          input.focus();
        }
      }
    } catch { /* not a valid URL yet — keep typing */ }
  });

  // Tab navigation links (MANAGE › / EDIT ›)
  document.querySelectorAll("[data-switch-tab]").forEach((el) => {
    el.addEventListener("click", () => {
      const target = el.dataset.switchTab;
      document.querySelector(`.nav-tab[data-tab="${target}"]`)?.click();
    });
  });
}
