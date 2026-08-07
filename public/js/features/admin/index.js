/* ============================================================
   admin — the /admin dashboard

   `initAdminApp` wires every panel first and only then attempts the stored-key
   re-auth, so a valid key can never reveal a half-wired dashboard.
   ============================================================ */

import { initCatalogTable } from "./catalogTable.js";
import { initDashboard } from "./dashboard.js";
import { initLoginGate, tryStoredKey } from "./loginGate.js";
import { initRoomPanels } from "./roomPanels.js";
import { initScrapePanels } from "./scrapePanels.js";
import { initAdminTabs } from "./tabs.js";
import { initUserPanels } from "./userPanels.js";

export function initAdminApp() {
  initLoginGate(initDashboard);
  initAdminTabs();
  initScrapePanels();
  initRoomPanels();
  initUserPanels();
  initCatalogTable();
  tryStoredKey(initDashboard);
}
