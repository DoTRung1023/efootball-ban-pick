/* ============================================================
   eFootball Ban & Pick — Sign In page entry

   A module script is deferred, so this listener is registered before
   DOMContentLoaded fires.
   ============================================================ */

import { initPlayers } from '@/features/auth/signInBackdrop.js';
import { initForm, initPasswordToggle } from '@/features/auth/signInForm.js';
import { initSignupModal } from '@/features/auth/signUpModal.js';
import { showToast } from '@/shared/ui/toast.js';
import { takePendingToast } from '@/shared/ui/pendingToast.js';

document.addEventListener("DOMContentLoaded", () => {
  /* Why you are looking at a sign-in form — signing out is the only way here
     that is not simply "you are not signed in". */
  const pending = takePendingToast();
  if (pending) showToast(pending.message, pending.variant === "warn" ? "error" : "info");

  initPlayers();
  initPasswordToggle();
  initForm();
  initSignupModal();
});
