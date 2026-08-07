/* ============================================================
   Confirm dialog — resolves a promise from the #confirmOverlay markup

   The buttons are wired once on DOMContentLoaded, so importing this module is
   all a caller needs to do before awaiting `showConfirm`.
   ============================================================ */

export let _confirmResolve = null;

export function showConfirm(message) {
  return new Promise((resolve) => {
    _confirmResolve = resolve;
    const overlay = document.getElementById("confirmOverlay");
    const msgEl   = document.getElementById("confirmMessage");
    if (msgEl) msgEl.textContent = message;
    overlay?.classList.add("open");
  });
}

export function _closeConfirm(result) {
  document.getElementById("confirmOverlay")?.classList.remove("open");
  if (_confirmResolve) { _confirmResolve(result); _confirmResolve = null; }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("confirmOk")?.addEventListener("click",     () => _closeConfirm(true));
  document.getElementById("confirmCancel")?.addEventListener("click", () => _closeConfirm(false));
  document.getElementById("confirmOverlay")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("confirmOverlay")) _closeConfirm(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("confirmOverlay")?.classList.contains("open"))
      _closeConfirm(false);
  });
});
