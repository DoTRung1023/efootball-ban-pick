/* ============================================================
   A toast that survives the navigation it is about.

   `showToast("Rematch on"); window.location.reload()` shows nothing. The
   element gets its class, the page is torn down microseconds later, and the
   message the user most needed — the explanation of why they are suddenly
   somewhere else — is the one message they never see. Every redirect in this
   app had that shape.

   So the message is written to `sessionStorage` *before* leaving and read back
   by whichever page comes up next. Session storage, not local: it is scoped to
   the tab that is navigating, so a second tab cannot swallow the note or show
   somebody else's.

   Read-once by design — `takePendingToast` clears as it reads, so a later
   reload does not replay a stale announcement.
   ============================================================ */

const KEY = "efb_pending_toast";

/**
 * Leaves a message for the next page. Call it immediately before assigning
 * `location` — after that assignment nothing local is guaranteed to run.
 */
export function setPendingToast(message, variant = "default") {
  const text = String(message || "").trim();
  if (!text) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ message: text, variant }));
  } catch {
    /* private browsing / storage disabled — the redirect still happens, it is
       just silent. Never worth throwing on the way out of a page. */
  }
}

/** The message left for this page, or null. Clears it. */
export function takePendingToast() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw);
    const message = String(parsed?.message || "").trim();
    return message ? { message, variant: String(parsed?.variant || "default") } : null;
  } catch {
    return null;
  }
}
