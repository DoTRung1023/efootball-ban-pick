/* ============================================================
   The "confirm your email" strip under the sign-in form

   One element, three ways to arrive at it: a sign-in refused because the
   address was never confirmed, a sign-up that has just sent a link, and a
   return trip from `/verify-email` that did not end in `ok`. All three need
   the same next step, so they share the strip and the RESEND button on it.

   **Who to resend to** is the only fiddly part. The server takes a
   username-or-email and answers the same thing whatever it finds, so this
   module remembers whichever identifier got us here and falls back to whatever
   is typed in the username field — which is where somebody following an
   expired link from their inbox will be looking anyway.
   ============================================================ */

import { showToast } from "@/shared/ui/toast.js";

const el = (id) => document.getElementById(id);

/** The account the last message was about, so RESEND has a subject. */
let lastIdentifier = "";

export function showVerifyNotice(message, identifier = "") {
  if (identifier) lastIdentifier = identifier;
  el("verifyText").textContent = message;
  el("verifyNotice").hidden = false;
}

export function hideVerifyNotice() {
  el("verifyNotice").hidden = true;
}

/**
 * What `/verify-email` sent us back with.
 *
 * The statuses are `consumeVerificationToken`'s, and every one of them lands
 * here rather than on a page of its own: whatever happened to the link, the
 * next thing you want is this sign-in form. Only the three recoverable
 * failures raise the strip — a confirmed address has nothing left to do.
 */
export function applyVerifyStatus(status) {
  const messages = {
    ok:      ["Email confirmed. You can sign in now.", "success"],
    already: ["That address is already confirmed. Sign in below.", "info"],
    expired: ["That confirmation link has expired.", "error"],
    stale:   ["That link was sent to an older address for this account.", "error"],
    invalid: ["That confirmation link is not valid.", "error"],
    error:   ["Something went wrong confirming that link.", "error"],
  };
  const [message, variant] = messages[status] || messages.error;
  showToast(message, variant);

  if (status === "ok" || status === "already") return;
  showVerifyNotice(`${message} Enter your username or email and ask for a new one.`);
}

export function initVerifyNotice() {
  const btn = el("verifyResend");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const identifier = lastIdentifier || el("username").value.trim();
    if (!identifier) {
      showToast("Enter your username or email first.", "error");
      el("username").focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = "SENDING…";
    try {
      const res = await fetch("/api/verify-email/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: identifier }),
      });
      const data = await res.json();
      /* The server's wording is deliberately non-committal about whether that
         account exists — repeating it verbatim is the point, not laziness. */
      showToast(data.message || "Link sent.", "info");
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "RESEND LINK";
    }
  });
}
