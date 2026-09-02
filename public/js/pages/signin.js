/* ============================================================
   eFootball Ban & Pick — Sign In page entry

   A module script is deferred, so this listener is registered before
   DOMContentLoaded fires.
   ============================================================ */

import { initPlayers } from '@/features/auth/signInBackdrop.js';
import { initForm, initPasswordToggle } from '@/features/auth/signInForm.js';
import { initSignupModal } from '@/features/auth/signUpModal.js';
import { applyVerifyStatus, initVerifyNotice } from '@/features/auth/verifyNotice.js';
import { showToast } from '@/shared/ui/toast.js';
import { takePendingToast } from '@/shared/ui/pendingToast.js';
import { installErrorReporter } from '@/shared/lib/errorReporter.js';

/* Outside the DOMContentLoaded listener below, so an error thrown while the
   page is still parsing is caught too. */
installErrorReporter({ notify: (message) => showToast(message, "error") });

document.addEventListener("DOMContentLoaded", () => {
  /* Why you are looking at a sign-in form — signing out is the only way here
     that is not simply "you are not signed in". */
  const pending = takePendingToast();
  if (pending) showToast(pending.message, pending.variant === "warn" ? "error" : "info");

  initPlayers();
  initPasswordToggle();
  initForm();
  initSignupModal();
  initVerifyNotice();

  /* `/verify-email` redirects here with what it made of the token. The param is
     stripped afterwards so a reload — or a bookmark of what is now just the
     sign-in page — does not replay a stale verdict. */
  const status = new URLSearchParams(window.location.search).get("verified");
  if (status) {
    applyVerifyStatus(status);
    window.history.replaceState({}, "", window.location.pathname);
  }
});
