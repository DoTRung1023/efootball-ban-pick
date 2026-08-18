/* ============================================================
   ROOMS — the in-memory room list, refreshed while the tab is on screen

   Rooms are server memory, not rows: the list empties on a restart, and the
   server hides a room that has gone quiet without ending it.
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { apiFetch } from "./adminApi.js";
import { fmtSeconds, phasePill, tableMessage } from "./format.js";

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
        <td class="td-mono">${escapeHtml(r.code)}</td>
        <td>${escapeHtml(r.host || "—")}</td>
        <td>${escapeHtml(r.guest || "—")}</td>
        <td>${phasePill(r.phase)}</td>
        <td class="td-dim">${fmtSeconds(r.idleSec)}</td>
        <td><a href="/room/${encodeURIComponent(r.code)}" target="_blank" class="link-btn">WATCH</a></td>
      </tr>`).join("");
  } catch {
    tbody.innerHTML = tableMessage(COLS, "Failed to load");
  }
}

export function initRoomsTab() {
  document.getElementById("refreshRooms").addEventListener("click", loadRooms);
}
