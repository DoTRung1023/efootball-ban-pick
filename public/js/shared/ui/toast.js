/* ============================================================
   Toast — the home-page flavour

   Variants are `info` (default), `success` and `error`; the class is written
   straight onto `#toast` and styled in `css/shared/modals.css` and
   `css/features/auth/auth.css`.

   The room page has its own `showToast` in `features/draft/utils.js` (a
   `toast--warn` variant on a 2.4 s timer, styled in
   `css/features/draft/shell.css`). The two are deliberately not merged: the class
   names and durations are different, so unifying them would be a visible
   behaviour change rather than a refactor.
   ============================================================ */

let toastTimer = null;

export function showToast(message, type = "info") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}
