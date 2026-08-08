/* ============================================================
   OVERVIEW · SCRAPES · PLAYERS · USERS · ROOMS

   Each tab loads its data on activation rather than up front; only the
   OVERVIEW panels are fetched at boot.
   ============================================================ */

import { loadCatalog } from "./catalogTable.js";
import { loadRoomsFull } from "./roomPanels.js";
import { loadScrapesFull } from "./scrapePanels.js";
import { loadUsers } from "./userPanels.js";

const TABS = ["overview", "scrapes", "players", "users", "rooms"];

let activeTab = "overview";

/** The auto-refresh loop only touches whichever tab is on screen. */
export function getActiveTab() {
  return activeTab;
}

function switchTab(tab) {
  if (!TABS.includes(tab)) return;
  activeTab = tab;
  TABS.forEach((t) => {
    document.querySelector(`.admin-tab[data-tab="${t}"]`).classList.toggle("is-active", t === tab);
    document.getElementById("tab" + t.charAt(0).toUpperCase() + t.slice(1)).hidden = t !== tab;
  });
  if (tab === "scrapes") loadScrapesFull();
  if (tab === "players") loadCatalog();
  if (tab === "users") loadUsers();
  if (tab === "rooms") loadRoomsFull();
}

export function initAdminTabs() {
  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  document.querySelectorAll("[data-tab-switch]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tabSwitch));
  });
}
