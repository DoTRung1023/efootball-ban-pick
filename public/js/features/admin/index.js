/* ============================================================
   admin — the /console dashboard

   `initConsole` wires every tab **before** anything can reveal the dashboard,
   so neither the gate form nor a stored token can show a half-wired one. Panel
   wiring lives in the `init*` functions rather than at module top level; keep
   it that way, or that ordering guarantee is lost.
   ============================================================ */

import { requireAuth } from "@/shared/lib/session.js";
import { initCatalogTab, rebuildColumnsPanel } from "./catalogTab.js";
import { loadColumnPrefs } from "./catalogColumns.js";
import { initGate, resume } from "./authGate.js";
import { initOverviewTab } from "./overviewTab.js";
import { initRoomsTab } from "./roomsTab.js";
import { initScrapeControl, resumeScrapeWatch } from "./scrapeControl.js";
import { initTabs, startTabs } from "./tabs.js";
import { initUsersTab } from "./usersTab.js";

export function initConsole() {
  /* No session at all is a sign-in problem, not a console one: `requireAuth`
     has already redirected to /signin and nothing below would be seen. */
  const user = requireAuth();
  if (!user) return;

  initTabs();
  initOverviewTab();
  initScrapeControl();
  initRoomsTab();
  initUsersTab();
  initCatalogTab();

  /**
   * What opening the dashboard means, for both ways in.
   *
   * The stored columns are fetched **before** the tabs start: they belong to
   * the account, not the browser, so they are only knowable once a session is
   * open — and a CATALOG tab that renders the defaults and then swaps to this
   * admin's columns is worse than one that waits a round trip for them. The
   * chooser is rebuilt only if the answer differed from what `initCatalogTab`
   * already drew.
   */
  const openDashboard = async () => {
    if (await loadColumnPrefs()) rebuildColumnsPanel();
    startTabs();
    resumeScrapeWatch();
  };

  /* Only now can the dashboard open — by the form, or by the stored token. */
  initGate(user, openDashboard);
  resume(openDashboard);
}
