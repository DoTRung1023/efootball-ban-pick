/* ============================================================
   OVERVIEW · ROOMS · USERS · CATALOG · SIGN-IN PAGE

   One registry drives everything: which panel is shown, what each tab fetches
   on activation, and how often — if at all — it refetches while it is the tab
   on screen. A tab with no `refreshMs` is loaded once per activation.

   The URL hash follows the active tab, so a reload lands back where you were.
   ============================================================ */

import { loadCatalog } from "./catalogTab.js";
import { loadOverview } from "./overviewTab.js";
import { loadRooms } from "./roomsTab.js";
import { loadTopPlayers } from "./topPlayersControl.js";
import { loadUsers } from "./usersTab.js";

/* Rooms are in-memory and cheap to read, so they poll fast. The overview costs
   six COUNT queries, so it does not. */
const TABS = {
  overview: { load: loadOverview, refreshMs: 60000 },
  rooms:    { load: loadRooms,    refreshMs: 10000 },
  users:    { load: loadUsers },
  catalog:  { load: loadCatalog },
  /* Keyed `showcase` rather than `sign-in`: the key is the URL hash, so it is
     an address, and the label above the tab is free to change without breaking
     a bookmark. No `refreshMs` — this tab is an editor, and a poll would throw
     away a half-built list under the admin's cursor. */
  showcase: { load: loadTopPlayers },
};

const DEFAULT_TAB = "overview";
const TICK_MS = 5000;

let activeTab = DEFAULT_TAB;
let loadedAt = 0;

/** Marks the tab button and shows only that tab's panel. */
function paint(tab) {
  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tab;
  });
}

function show(tab) {
  activeTab = tab;
  loadedAt = Date.now();
  paint(tab);
  TABS[tab].load();
}

function switchTab(tab) {
  if (!TABS[tab] || tab === activeTab) return;
  history.replaceState(null, "", `#${tab}`);
  show(tab);
}

/** Refetches the visible tab on its own cadence, and never in a background tab. */
function startRefreshLoop() {
  setInterval(() => {
    const { refreshMs, load } = TABS[activeTab];
    if (document.hidden || !refreshMs) return;
    if (Date.now() - loadedAt < refreshMs) return;
    loadedAt = Date.now();
    load();
  }, TICK_MS);
}

/** Called once the console session is open — shows and loads the first tab. */
export function startTabs() {
  const fromHash = location.hash.slice(1);
  show(TABS[fromHash] ? fromHash : DEFAULT_TAB);
  startRefreshLoop();
}

export function initTabs() {
  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}
