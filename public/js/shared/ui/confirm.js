/* ============================================================
   Confirm dialog — resolves a promise from the #confirmOverlay markup

   The buttons are wired once on DOMContentLoaded, so importing this module is
   all a caller needs to do before awaiting `showConfirm`.
   ============================================================ */

/* Module-private: the pending promise's resolver. The underscore prefix these
   two carried was standing in for "not really public" — they are now simply
   not exported. `showConfirm` is the whole surface. */
let confirmResolve = null;

export function showConfirm(message) {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    const overlay = document.getElementById("confirmOverlay");
    const msgEl   = document.getElementById("confirmMessage");
    if (msgEl) msgEl.textContent = message;
    overlay?.classList.add("open");
  });
}

function closeConfirm(result) {
  document.getElementById("confirmOverlay")?.classList.remove("open");
  if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("confirmOk")?.addEventListener("click",     () => closeConfirm(true));
  document.getElementById("confirmCancel")?.addEventListener("click", () => closeConfirm(false));
  document.getElementById("confirmOverlay")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("confirmOverlay")) closeConfirm(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("confirmOverlay")?.classList.contains("open"))
      closeConfirm(false);
  });
});
