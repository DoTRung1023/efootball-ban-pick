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
import { fmtSeconds, phasePill, tableMessage } from "./format.js";
import { initRoomDetail, openRoomDetail } from "./roomDetail.js";

const COLS = 6;
const CONFIRM_MS = 4000;

/** The one line this tab says out loud: a room closed, or a close refused. */
function notice(message, isError = false) {
  const el = document.getElementById("roomsNotice");
  el.textContent = message;
  el.className = isError ? "panel-notice is-error" : "panel-notice";
  el.hidden = !message;
}

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
        <td data-label=""><div class="room-actions"><button type="button" class="link-btn" data-watch="${escapeHtml(r.code)}">WATCH</button><button type="button" class="link-btn is-close" data-close="${escapeHtml(r.code)}" data-revoke-label="CLOSE">CLOSE</button></div></td>
      </tr>`).join("");
  } catch {
    tbody.innerHTML = tableMessage(COLS, "Failed to load");
  }
}

/* CLOSE arms on the first click and fires on the second, the same two-step the
   USERS tab uses for anything it cannot take back. It disarms itself, because
   this table is replaced every 10 s and a button left armed across a repaint
   would come back looking innocent.

   The armed state is held on the element rather than in module state so the
   repaint clears it for free — a room that ends while the button is armed takes
   the armed button with it. */
let closeTimer = null;

function armClose(btn) {
  clearTimeout(closeTimer);
  btn.dataset.armed = "1";
  btn.textContent = "CONFIRM?";
  btn.classList.add("is-armed");
  closeTimer = setTimeout(() => {
    delete btn.dataset.armed;
    btn.textContent = btn.dataset.revokeLabel || "CLOSE";
    btn.classList.remove("is-armed");
  }, CONFIRM_MS);
}

async function closeRoom(btn, code) {
  clearTimeout(closeTimer);
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
     to a button would be thrown away with the row it was bound to. */
  document.getElementById("roomsBody").addEventListener("click", (ev) => {
    const watch = ev.target.closest("[data-watch]")?.dataset.watch;
    if (watch) return openRoomDetail(watch);

    const btn = ev.target.closest("[data-close]");
    if (!btn) return;
    if (btn.dataset.armed) closeRoom(btn, btn.dataset.close);
    else armClose(btn);
  });
}
