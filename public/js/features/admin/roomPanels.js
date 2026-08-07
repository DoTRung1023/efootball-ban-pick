/* ============================================================
   Active rooms — the OVERVIEW panel and the ROOMS tab

   Both render the same six columns from the same endpoint; only the target
   table and the "N LIVE" counter differ, so the row template is written once.
   Rooms are in-memory server-side, so this list empties on a server restart.
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { apiFetch } from "./adminApi.js";
import { fmtAge, phasePill, tableMessage } from "./format.js";

function roomRowsHtml(rooms) {
  return rooms.map((r) => `
      <tr>
        <td class="td-mono">${escapeHtml(r.code)}</td>
        <td>${escapeHtml(r.host || "—")}</td>
        <td>${escapeHtml(r.guest || "—")}</td>
        <td>${phasePill(r.phase)}</td>
        <td class="td-dim">${fmtAge(r.ageSec * 1000)}</td>
        <td><a href="/room/${escapeHtml(r.code)}" target="_blank" class="watch-btn">WATCH</a></td>
      </tr>
    `).join("");
}

export async function loadRoomsOverview() {
  try {
    const d = await apiFetch("/api/admin/rooms");
    document.getElementById("roomsLiveCount").textContent = `${d.rooms.length} LIVE`;
    const tbody = document.getElementById("roomsBody");
    if (!d.rooms.length) {
      tbody.innerHTML = tableMessage(6, "No active rooms");
      return;
    }
    tbody.innerHTML = roomRowsHtml(d.rooms);
  } catch {
    document.getElementById("roomsBody").innerHTML = tableMessage(6, "Failed to load");
  }
}

export async function loadRoomsFull() {
  const tbody = document.getElementById("roomsFullBody");
  tbody.innerHTML = tableMessage(6, "Loading…");
  try {
    const d = await apiFetch("/api/admin/rooms");
    document.getElementById("roomsFullCount").textContent = `${d.rooms.length} LIVE`;
    if (!d.rooms.length) {
      tbody.innerHTML = tableMessage(6, "No active rooms");
      return;
    }
    tbody.innerHTML = roomRowsHtml(d.rooms);
  } catch {
    tbody.innerHTML = tableMessage(6, "Failed to load");
  }
}

export function initRoomPanels() {
  document.getElementById("refreshRooms").addEventListener("click", loadRoomsOverview);
  document.getElementById("refreshRoomsFull").addEventListener("click", loadRoomsFull);
}
