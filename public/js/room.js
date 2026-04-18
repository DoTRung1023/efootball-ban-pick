/* ============================================================
   eFootball Ban & Pick — Room Page (lightweight lobby)
   ============================================================ */

function showToast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 2400);
}

function getRoomCodeFromUrl() {
  const path = window.location.pathname || "";
  const m = path.match(/\/room\/([^/]+)$/);
  if (m?.[1]) return decodeURIComponent(m[1]).toUpperCase();
  const q = new URLSearchParams(window.location.search);
  return (q.get("code") || "").toUpperCase();
}

async function copyText(text, fallbackLabel = "Copied!") {
  try {
    await navigator.clipboard.writeText(text);
    showToast(fallbackLabel);
  } catch {
    showToast(text);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const code  = getRoomCodeFromUrl();
  const q     = new URLSearchParams(window.location.search);
  const bans  = q.get("bans");
  const picks = q.get("picks");
  const mode  = q.get("mode");

  document.getElementById("roomCodeLabel").textContent = code || "—";
  document.getElementById("roomModeLabel").textContent = mode ? mode.toUpperCase() : "—";
  document.getElementById("roomBansLabel").textContent = bans ?? "—";
  document.getElementById("roomPicksLabel").textContent = picks ?? "—";

  document.getElementById("copyInviteBtn")?.addEventListener("click", () => {
    copyText(window.location.href, "Invite link copied!");
  });

  document.getElementById("copyCodeBtn")?.addEventListener("click", () => {
    if (!code) return showToast("No room code.");
    copyText(code, "Code copied!");
  });
});

