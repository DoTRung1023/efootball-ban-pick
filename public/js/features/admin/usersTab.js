/* ============================================================
   USERS — every account, and who may open this console

   Granting console access is done here rather than in MySQL: the seeder
   (`src/features/admin/bootstrap.js`) creates the first admin, and every one
   after that is promoted from this table.

   Two lockouts the server refuses, and this table does not offer: demoting
   yourself, and demoting the last admin. Removing access is a two-click
   action — the first click arms the button, the second sends it.
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { apiFetch, apiSend, getSessionUserId } from "./adminApi.js";
import { fmtDate, fmtNum, tableMessage } from "./format.js";

const USER_ROWS = 50;
const COLS = 6;
const CONFIRM_MS = 4000;

let confirmTimer = null;

function notice(message, isError = false) {
  const el = document.getElementById("usersNotice");
  el.textContent = message;
  el.className = isError ? "panel-notice is-error" : "panel-notice";
  el.hidden = !message;
}

/** The ACCESS cell: your own row states, everyone else's acts. */
function accessCell(user, isSelf) {
  if (isSelf) return `<span class="access-static">ADMIN · YOU</span>`;
  return user.is_admin
    ? `<button class="role-btn is-revoke" data-user-id="${user.id}" data-make-admin="0">REVOKE</button>`
    : `<button class="role-btn" data-user-id="${user.id}" data-make-admin="1">MAKE ADMIN</button>`;
}

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
    const selfId = getSessionUserId();
    tbody.innerHTML = d.users.map((u) => {
      const isSelf = Number(u.id) === Number(selfId);
      return `
      <tr>
        <td>${escapeHtml(u.username)}${u.is_admin ? ` <span class="role-pill">ADMIN</span>` : ""}</td>
        <td class="td-dim">${escapeHtml(u.email)}</td>
        <td>${fmtNum(u.playerCount)}</td>
        <td>${fmtNum(u.planCount)}</td>
        <td class="td-dim">${fmtDate(u.created_at)}</td>
        <td>${accessCell(u, isSelf)}</td>
      </tr>`;
    }).join("");
  } catch {
    tbody.innerHTML = tableMessage(COLS, "Failed to load");
  }
}

/** First click on REVOKE only arms it; it disarms itself if left alone. */
function armConfirm(btn) {
  clearTimeout(confirmTimer);
  btn.dataset.armed = "1";
  btn.textContent = "CONFIRM?";
  btn.classList.add("is-armed");
  confirmTimer = setTimeout(() => {
    delete btn.dataset.armed;
    btn.textContent = "REVOKE";
    btn.classList.remove("is-armed");
  }, CONFIRM_MS);
}

async function setRole(btn) {
  const userId = Number(btn.dataset.userId);
  const isAdmin = btn.dataset.makeAdmin === "1";
  clearTimeout(confirmTimer);
  btn.disabled = true;
  notice("");
  try {
    await apiSend(`/api/admin/users/${userId}/role`, "PATCH", { isAdmin });
    notice(isAdmin ? "Console access granted." : "Console access removed.");
    loadUsers();
  } catch (err) {
    /* The server owns these messages — "the last admin cannot be removed" is
       its rule to state, not one this table should guess at. */
    notice(err.message, true);
    btn.disabled = false;
  }
}

export function initUsersTab() {
  document.getElementById("refreshUsers").addEventListener("click", () => {
    notice("");
    loadUsers();
  });

  /* Delegated: the rows are replaced on every load. */
  document.getElementById("usersBody").addEventListener("click", (e) => {
    const btn = e.target.closest(".role-btn");
    if (!btn) return;
    if (btn.dataset.makeAdmin === "0" && btn.dataset.armed !== "1") {
      armConfirm(btn);
      return;
    }
    setRole(btn);
  });
}
