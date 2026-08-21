/* ============================================================
   ROOMS — the in-memory room list, refreshed while the tab is on screen

   Rooms are server memory, not rows: the list empties on a restart, and the
   server hides a room that has gone quiet without ending it.

   **WATCH opens `roomDetail.js`, and is a button rather than a link to
   `/room/<code>` on purpose.** The room page has two seats and claims one on
   load, so that link answered 409 "Host slot taken" — and would have been worse
   than broken on a room whose guest seat was still free.
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { apiFetch } from "./adminApi.js";
import { fmtSeconds, phasePill, tableMessage } from "./format.js";
import { initRoomDetail, openRoomDetail } from "./roomDetail.js";

const COLS = 6;

export async function loadRooms() {
  const tbody = document.getElementById("roomsBody");
  try {
    const d = await apiFetch("/api/admin/rooms");
    document.getElementById("roomsCount").textContent = `${d.rooms.length} LIVE`;

    if (!d.rooms.length) {
      tbody.innerHTML = tableMessage(COLS, "No active rooms");
      return;
    }
    tbody.innerHTML = d.rooms.map((r) => `
      <tr>
        <td class="td-mono" data-label="CODE">${escapeHtml(r.code)}</td>
        <td data-label="HOST">${escapeHtml(r.host || "—")}</td>
        <td data-label="GUEST">${escapeHtml(r.guest || "—")}</td>
        <td data-label="PHASE">${phasePill(r.phase)}</td>
        <td class="td-dim col-lo" data-label="IDLE">${fmtSeconds(r.idleSec)}</td>
        <td data-label=""><button type="button" class="link-btn" data-watch="${escapeHtml(r.code)}">WATCH</button></td>
      </tr>`).join("");
  } catch {
    tbody.innerHTML = tableMessage(COLS, "Failed to load");
  }
}

export function initRoomsTab() {
  document.getElementById("refreshRooms").addEventListener("click", loadRooms);
  initRoomDetail();
  /* Delegated: the rows are replaced wholesale every 10 s, so a listener bound
     to a button would be thrown away with the row it was bound to. */
  document.getElementById("roomsBody").addEventListener("click", (ev) => {
    const code = ev.target.closest("[data-watch]")?.dataset.watch;
    if (code) openRoomDetail(code);
  });
}
