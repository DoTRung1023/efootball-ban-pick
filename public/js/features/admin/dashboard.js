/* ============================================================
   Dashboard boot and the 10 s refresh loop
   ============================================================ */

import { loadDataQuality } from "./dataQualityPanel.js";
import { loadRoomsFull, loadRoomsOverview } from "./roomPanels.js";
import { loadScrapeOverview } from "./scrapePanels.js";
import { loadSignups } from "./userPanels.js";
import { loadStats } from "./statsPanel.js";
import { getActiveTab } from "./tabs.js";

const REFRESH_MS = 10000;

/** Only refreshes whichever room view is on screen; other tabs are inert. */
function startAutoRefresh() {
  setInterval(() => {
    if (getActiveTab() === "overview") {
      loadRoomsOverview();
      loadStats();
    } else if (getActiveTab() === "rooms") {
      loadRoomsFull();
    }
  }, REFRESH_MS);
}

/** Called once the admin key is accepted — the OVERVIEW tab's five panels. */
export function initDashboard() {
  loadStats();
  loadScrapeOverview();
  loadRoomsOverview();
  loadSignups();
  loadDataQuality();
  startAutoRefresh();
}
