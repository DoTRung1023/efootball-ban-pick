/* ============================================================
   The four stat tiles across the top of the OVERVIEW tab
   ============================================================ */

import { apiFetch } from "./adminApi.js";
import { fmtNum, fmtRelative } from "./format.js";

export async function loadStats() {
  try {
    const d = await apiFetch("/api/admin/stats");
    document.getElementById("statCatalog").textContent = fmtNum(d.catalogCount);
    document.getElementById("statUsers").textContent = fmtNum(d.userCount);
    const sub = document.getElementById("statUsersSub");
    if (d.newUsersThisWeek > 0) {
      sub.textContent = `+${d.newUsersThisWeek} this week`;
      sub.className = "stat-sub is-pos";
    } else {
      sub.textContent = "0 this week";
      sub.className = "stat-sub";
    }

    document.getElementById("statRooms").textContent = fmtNum(d.activeRoomCount);
    const roomSub = document.getElementById("statRoomsSub");
    roomSub.textContent = d.draftRoomCount > 0 ? `${d.draftRoomCount} in draft` : "none in draft";
    roomSub.className = d.draftRoomCount > 0 ? "stat-sub is-pos" : "stat-sub";

    if (d.lastScrape) {
      document.getElementById("statScrape").textContent = fmtRelative(d.lastScrape.started_at);
      const scrapeSub = document.getElementById("statScrapeSub");
      scrapeSub.textContent = d.lastScrape.finished_at ? "✓ complete" : "⟳ running";
      scrapeSub.className = d.lastScrape.finished_at ? "stat-sub is-pos" : "stat-sub is-warn";
    }
  } catch {
    // silent
  }
}
