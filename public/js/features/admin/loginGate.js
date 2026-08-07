/* ============================================================
   Admin key gate

   `initLoginGate` wires the form; `tryStoredKey` runs the silent re-auth on
   load. They are separate so the caller can finish wiring the dashboard
   before a stored key can reveal it.
   ============================================================ */

import { clearAdminKey, getAdminKey, storeAdminKey, verifyKey } from "./adminApi.js";

function revealDashboard() {
  document.getElementById("loginOverlay").remove();
  document.getElementById("dashboard").hidden = false;
}

export function initLoginGate(onAuthed) {
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = document.getElementById("loginKey").value.trim();
    if (!key) return;
    if (await verifyKey(key)) {
      storeAdminKey(key);
      document.getElementById("loginError").textContent = "";
      revealDashboard();
      onAuthed();
    } else {
      document.getElementById("loginError").textContent = "Invalid admin key.";
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    clearAdminKey();
    location.reload();
  });
}

/** Re-auth with the sessionStorage key, if there is one. */
export function tryStoredKey(onAuthed) {
  const key = getAdminKey();
  if (!key) return;
  verifyKey(key).then((ok) => {
    if (ok) {
      revealDashboard();
      onAuthed();
    } else {
      clearAdminKey();
    }
  });
}
