import { getUser, showToast } from './utils.js';

function normalizeRoomCode(raw) {
  const code = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[IO]/g, ""); // avoid ambiguous chars
  return code;
}

function goToRoom({ code, mode }) {
  const c = normalizeRoomCode(code);
  if (!c || c.length < 4) {
    showToast("Enter a valid room code.", "info");
    return;
  }
  const url = new URL(window.location.origin + `/room/${encodeURIComponent(c)}`);
  if (mode) url.searchParams.set("mode", String(mode));
  window.location.href = url.pathname + url.search;
}

function genCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function initRoomModal() {
  const overlay   = document.getElementById("roomOverlay");
  const codeInput = document.getElementById("roomCode");

  if (!overlay) return;

  const open  = () => { if (codeInput) codeInput.value = genCode(); overlay.classList.add("open"); document.body.style.overflow = "hidden"; };
  const close = () => { overlay.classList.remove("open"); document.body.style.overflow = ""; };

  document.getElementById("openRoomBtn")?.addEventListener("click", open);
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

  const submit = () => goToRoom({ code: input.value, mode: "join" });

  input.addEventListener("input", () => {
    input.value = normalizeRoomCode(input.value).slice(0, 10);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  btn.addEventListener("click", submit);
}

