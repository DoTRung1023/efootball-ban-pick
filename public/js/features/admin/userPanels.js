/* ============================================================
   Users — Recent Signups on OVERVIEW (8 rows) and the USERS tab (50 rows)

   The wide table adds a rank column and the email address, so the two row
   templates stay separate.
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { apiFetch } from "./adminApi.js";
import { fmtDate, fmtNum, fmtRelative, tableMessage } from "./format.js";

export async function loadSignups() {
  try {
    const d = await apiFetch("/api/admin/recent-users?limit=8");
    const tbody = document.getElementById("signupsBody");
    if (!d.users.length) {
      tbody.innerHTML = tableMessage(4, "No users yet");
      return;
    }
    tbody.innerHTML = d.users.map((u) => `
      <tr>
        <td>${escapeHtml(u.username)}</td>
        <td>${fmtNum(u.playerCount)}</td>
        <td>${fmtNum(u.planCount)}</td>
        <td class="td-dim">${fmtRelative(u.created_at)}</td>
      </tr>
    `).join("");
  } catch {
    document.getElementById("signupsBody").innerHTML = tableMessage(4, "Failed to load");
  }
}

export async function loadUsers() {
  const tbody = document.getElementById("usersFullBody");
  tbody.innerHTML = tableMessage(6, "Loading…");
  try {
    const d = await apiFetch("/api/admin/recent-users?limit=50");
    if (!d.users.length) {
      tbody.innerHTML = tableMessage(6, "No users yet");
      return;
    }
    tbody.innerHTML = d.users.map((u, i) => `
      <tr>
        <td class="td-dim">${i + 1}</td>
        <td>${escapeHtml(u.username)}</td>
        <td class="td-dim">${escapeHtml(u.email)}</td>
        <td>${fmtNum(u.playerCount)}</td>
        <td>${fmtNum(u.planCount)}</td>
        <td class="td-dim">${fmtDate(u.created_at)}</td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = tableMessage(6, "Failed to load");
  }
}

export function initUserPanels() {
  document.getElementById("refreshUsers").addEventListener("click", loadUsers);
}
