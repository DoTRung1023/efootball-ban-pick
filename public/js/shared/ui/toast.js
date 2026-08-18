/* ============================================================
   Toast — the home-page flavour

   Variants are `info` (default), `success` and `error`; the class is written
   straight onto `#toast` and styled in `css/shared/modals.css` and
   `css/features/auth/auth.css`.

   The room page has its own `showToast` in `features/draft/utils.js` (a
   `toast--warn` variant, styled in `css/features/draft/shell.css`). The two are
   deliberately not merged: the class names differ, so unifying them would be a
   visible behaviour change rather than a refactor. **They do now agree on how
   long a message stays up** — both ask `readingTime.js`, because how long text
   takes to read is a property of the text, not of which page it appeared on.
   ============================================================ */

import { readingTimeMs } from "./readingTime.js";

let toastTimer = null;

export function showToast(message, type = "info") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  /* Was a flat 3500ms. That is generous for "Room code copied!" and short for
     the longest messages on this page, which is the wrong way round. */
  toastTimer = setTimeout(() => el.classList.remove("show"), readingTimeMs(message));
}
