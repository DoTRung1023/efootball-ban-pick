import { requireAuth } from '@/shared/lib/session.js';
import { initUserMenu, initEditProfile } from '@/features/auth/index.js';
import { loadSquad, initSquadSearchSortFilter, initSquadControls } from '@/features/squad/index.js';
import { initAddPlayerModal, initPlayerPopup } from '@/features/catalog/index.js';
import { loadGamePlans, initGamePlans } from '@/features/gamePlans/index.js';
import { initRoomModal, initRoomHub } from '@/features/rooms/index.js';

/** Nav tabs ↔ tab panels. Home-page chrome, so it lives with the page entry. */
function initTabs() {
  const tabs   = document.querySelectorAll(".nav-tab");
  const panels = document.querySelectorAll(".tab-panel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach((t)   => t.classList.toggle("active", t.dataset.tab === target));
      panels.forEach((p) => p.classList.toggle("active", p.id === target + "Panel"));
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth();
  if (!user) return;
  initUserMenu(user);
  initEditProfile();
  initTabs();
  initRoomHub();
  initRoomModal();
  initAddPlayerModal();
  initSquadSearchSortFilter();
  initPlayerPopup();
  initSquadControls(user.id);
  initGamePlans(user.id);
  await loadSquad(user.id);
  loadGamePlans(user.id);
});
