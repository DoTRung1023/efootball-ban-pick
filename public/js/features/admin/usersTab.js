/* ============================================================
   USERS — every account, newest first, with what each one owns
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { apiFetch } from "./adminApi.js";
import { fmtDate, fmtNum, tableMessage } from "./format.js";

const USER_ROWS = 50;
const COLS = 5;

export async function loadUsers() {
  const tbody = document.getElementById("usersBody");
  tbody.innerHTML = tableMessage(COLS, "Loading…");
  try {
    const d = await apiFetch(`/api/admin/users?limit=${USER_ROWS}`);
    document.getElementById("usersCount").textContent = String(d.users.length);

    if (!d.users.length) {
      tbody.innerHTML = tableMessage(COLS, "No users yet");
      return;
    }
    tbody.innerHTML = d.users.map((u) => `
      <tr>
        <td>${escapeHtml(u.username)}${u.is_admin ? ` <span class="role-pill">ADMIN</span>` : ""}</td>
        <td class="td-dim">${escapeHtml(u.email)}</td>
        <td>${fmtNum(u.playerCount)}</td>
        <td>${fmtNum(u.planCount)}</td>
        <td class="td-dim">${fmtDate(u.created_at)}</td>
      </tr>`).join("");
  } catch {
    tbody.innerHTML = tableMessage(COLS, "Failed to load");
  }
}

export function initUsersTab() {
  document.getElementById("refreshUsers").addEventListener("click", loadUsers);
}
