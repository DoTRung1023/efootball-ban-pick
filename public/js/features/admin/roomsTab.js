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
import { apiFetch, apiSend } from "./adminApi.js";
import { fmtSeconds, notice as panelNotice, phasePill, tableMessage } from "./format.js";
import { initRoomDetail, openRoomDetail } from "./roomDetail.js";
import { onConfirmedClick } from "./confirmButton.js";

const COLS = 6;

/** This tab's one spoken line. The writer is `notice` in `format.js`;
    all this names is which element it writes to. */
const notice = (message, isError) => panelNotice("roomsNotice", message, isError);

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
        <td data-label="HOST">${seatCell(r, "host")}</td>
        <td data-label="GUEST">${seatCell(r, "guest")}</td>
        <td data-label="PHASE">${phasePill(r.phase)}</td>
        <td class="td-dim col-lo" data-label="IDLE">${fmtSeconds(r.idleSec)}</td>
        <td data-label=""><div class="room-actions"><button type="button" class="link-btn" data-watch="${escapeHtml(r.code)}" title="Inspect this room read-only. It does not take a seat in it">WATCH</button><button type="button" class="link-btn is-close" data-close="${escapeHtml(r.code)}" data-confirm-label="CLOSE" title="End this room for both players. The code cannot be reopened">CLOSE</button></div></td>
      </tr>`).join("");
  } catch {
    tbody.innerHTML = tableMessage(COLS, "Failed to load");
  }
}

/**
 * One seat, and what happened to it.
 *
 * A seat vacated by NEW MATCH is not the same as one nobody ever took, and the
 * table used to print `—` for both. The room the leaver left behind keeps its
 * heartbeat — the other player is still sitting on the post-match screen — so it
 * stays on this list looking healthy, and `—` reads as "waiting for a guest"
 * rather than "this one is over". The name is what makes it legible: the leaver
 * is usually the host, and the host is who an admin would go looking for.
 */
function seatCell(room, side) {
  const name = room[side];
  if (name) return escapeHtml(name);
  if (room.newMatch?.by !== side) return "—";
  const who = room.newMatch.username;
  return `<span class="td-dim">${escapeHtml(who || "—")} · left for a new room</span>`;
}

/* CLOSE arms on the first click and fires on the second — `confirmButton.js`
   owns that, and reads it off the button's `data-confirm-label`. Nothing here
   restores the label on failure: this table is replaced every 10 s, so the
   armed button goes with it. */
async function closeRoom(btn) {
  const code = btn.dataset.close;
  btn.disabled = true;
  btn.textContent = "CLOSING…";
  try {
    await apiSend(`/api/admin/rooms/${encodeURIComponent(code)}/close`, "POST");
    notice(`Room ${code} closed.`);
  } catch (err) {
    /* The server owns the message — "Room is not live" is its answer to a room
       that ended between the poll and the click, and that is worth reading. */
    notice(err.message, true);
  }
  loadRooms();
}

export function initRoomsTab() {
  document.getElementById("refreshRooms").addEventListener("click", loadRooms);
  initRoomDetail();
  /* Delegated: the rows are replaced wholesale every 10 s, so a listener bound
     to a button would be thrown away with the row it was bound to. WATCH is in
     the same table because it is the same click — it simply carries no
     `data-confirm-label`, so it fires on the first one. */
  onConfirmedClick(
    document.getElementById("roomsBody"),
    [
      ["[data-watch]", (btn) => openRoomDetail(btn.dataset.watch)],
      ["[data-close]", closeRoom],
    ],
    { before: () => notice("") },
  );
}
