/* ============================================================
   admin — the /console dashboard

   `initConsole` wires every tab **before** anything can reveal the dashboard,
   so neither the gate form nor a stored token can show a half-wired one. Panel
   wiring lives in the `init*` functions rather than at module top level; keep
   it that way, or that ordering guarantee is lost.
   ============================================================ */

import { requireAuth } from "@/shared/lib/session.js";
import { initCatalogTab } from "./catalogTab.js";
import { initGate, resume } from "./authGate.js";
import { initOverviewTab } from "./overviewTab.js";
import { initRoomsTab } from "./roomsTab.js";
import { initTabs, startTabs } from "./tabs.js";
import { initUsersTab } from "./usersTab.js";

export function initConsole() {
  /* No session at all is a sign-in problem, not a console one: `requireAuth`
     has already redirected to /signin and nothing below would be seen. */
  const user = requireAuth();
  if (!user) return;

  initTabs();
  initOverviewTab();
  initRoomsTab();
  initUsersTab();
  initCatalogTab();

  /* Only now can the dashboard open — by the form, or by the stored token. */
  initGate(user, startTabs);
  resume(startTabs);
}
