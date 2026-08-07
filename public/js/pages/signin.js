/* ============================================================
   eFootball Ban & Pick — Sign In page entry

   A module script is deferred, so this listener is registered before
   DOMContentLoaded fires.
   ============================================================ */

import { initParticles, initPlayers } from '@/features/auth/signInBackdrop.js';
import { initForm, initPasswordToggle } from '@/features/auth/signInForm.js';
import { initSignupModal } from '@/features/auth/signUpModal.js';

document.addEventListener("DOMContentLoaded", () => {
  initParticles();
  initPlayers();
  initPasswordToggle();
  initForm();
  initSignupModal();
});
