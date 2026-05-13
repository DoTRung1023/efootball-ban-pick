import { requireAuth, initTabs, initUserMenu, initEditProfile } from './home/utils.js';
import { loadSquad, initSquadSearchSortFilter, initSquadControls } from './home/squad.js';
import { initAddPlayerModal, initPlayerPopup } from './home/catalog.js';
import { loadGamePlans, initGamePlans } from './home/plans.js';
import { initRoomModal, initRoomHub } from './home/rooms.js';

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
