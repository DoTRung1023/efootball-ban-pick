/* ============================================================
   Console gate — who gets in, and how

   Three things have to be true, and the gate checks them in this order:
   the browser holds a signed-in session, that account has `is_admin`, and the
   password is re-entered here. The first is a redirect, the last two are the
   server's answer to `POST /api/admin/session` — this module never decides
   for itself whether someone is an admin.

   `initGate` wires the form; `resume` runs the silent re-auth. They are
   separate so the caller can finish wiring the dashboard before a stored token
   can reveal it.
   ============================================================ */

import { clearToken, openSession, resumeSession } from "./adminApi.js";

/**
 * Opens the dashboard, once.
 *
 * Both the form and the silent resume can arrive here — a fast typist can beat
 * `resumeSession` to it — and the second caller must not tear down an overlay
 * that is already gone, or start the tab timers twice.
 */
function reveal(username) {
  const overlay = document.getElementById("gateOverlay");
  if (!overlay) return false;
  overlay.remove();
  document.getElementById("adminUser").textContent = (username || "ADMIN").toUpperCase();
  document.getElementById("dashboard").hidden = false;
  return true;
}

function showError(message) {
  document.getElementById("gateError").textContent = message;
}

/** Wires the gate form against the already signed-in user. */
export function initGate(user, onOpen) {
  document.getElementById("gateIdentity").textContent = `Signed in as ${user.username}`;

  const form = document.getElementById("gateForm");
  const input = document.getElementById("gatePassword");
  const submit = document.getElementById("gateSubmit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = input.value;
    if (!password) return;

    submit.disabled = true;
    submit.textContent = "CHECKING…";
    showError("");

    const result = await openSession(user.id, password);

    submit.disabled = false;
    submit.textContent = "UNLOCK CONSOLE";

    if (!result.ok) {
      input.value = "";
      input.focus();
      showError(result.error);
      return;
    }
    if (reveal(result.username)) onOpen();
  });

  document.getElementById("exitConsoleBtn").addEventListener("click", () => {
    clearToken();
    window.location.href = "/";
  });
}

/** Re-opens the dashboard with the sessionStorage token, if it is still valid. */
export async function resume(onOpen) {
  const session = await resumeSession();
  if (!session) return;
  if (reveal(session.username)) onOpen();
}
