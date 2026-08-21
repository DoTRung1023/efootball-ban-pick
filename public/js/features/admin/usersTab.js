/* ============================================================
   USERS — every account, and who may open this console

   Granting console access is done here rather than in MySQL: the seeder
   (`src/features/admin/bootstrap.js`) creates the first admin, and every one
   after that is promoted from this table.

   **Only a master admin sees any of these buttons.** A plain admin gets the
   same table with the ACCESS column reduced to labels — the roles are still
   worth seeing, they are just not theirs to change. Hiding the controls is a
   courtesy and never the check: every role write is re-authorised against the
   database, so a hand-made request from a plain admin is refused too.

   Lockouts the server refuses, and this table therefore does not offer:
   demoting yourself, demoting the last admin, revoking access from a master
   without standing them down first, and standing down the last master.
   Anything destructive is a two-click action — the first click arms the
   button, the second sends it.
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { apiFetch, apiSend, getSessionUserId, isSessionMaster } from "./adminApi.js";
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

/** What this account currently is, in one word. */
function roleLabel(user) {
  if (user.is_master_admin) return "MASTER";
  return user.is_admin ? "ADMIN" : "—";
}

const grantBtn = (id, attr, value, label) =>
  `<button class="role-btn" data-user-id="${id}" data-${attr}="${value}">${label}</button>`;

const revokeBtn = (id, attr, value, label) =>
  `<button class="role-btn is-revoke" data-user-id="${id}" data-${attr}="${value}"
           data-revoke-label="${label}">${label}</button>`;

/**
 * The ACCESS cell.
 *
 * Your own row can stand yourself down but never revoke your own access — the
 * server refuses the second, and offering a button that always fails would be
 * worse than not offering one. Revoking a master is likewise absent rather than
 * refused: the master flag comes off first, which makes losing the role two
 * deliberate steps instead of one.
 */
function accessCell(user, isSelf, canManage) {
  if (!canManage) return `<span class="access-static">${roleLabel(user)}</span>`;

  const id = Number(user.id);
  const parts = [];

  if (isSelf) {
    parts.push(`<span class="access-static">${roleLabel(user)} · YOU</span>`);
    if (user.is_master_admin) parts.push(revokeBtn(id, "make-master", "0", "STAND DOWN"));
    return parts.join(" ");
  }

  if (!user.is_admin) return grantBtn(id, "make-admin", "1", "MAKE ADMIN");

  if (user.is_master_admin) {
    parts.push(revokeBtn(id, "make-master", "0", "STAND DOWN"));
  } else {
    parts.push(grantBtn(id, "make-master", "1", "MAKE MASTER"));
    parts.push(revokeBtn(id, "make-admin", "0", "REVOKE"));
  }
  return parts.join(" ");
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
    const canManage = isSessionMaster();
    document.getElementById("usersHint").textContent = canManage
      ? "You are a master admin: you may grant or revoke console access and designate other masters."
      : "Only a master admin can change roles. The first master comes from ADMIN_EMAIL in the server environment.";

    tbody.innerHTML = d.users.map((u) => {
      const isSelf = Number(u.id) === Number(selfId);
      /* One pill, not two — master implies admin, and a row reading
         "ADMIN MASTER" says nothing the second word did not. */
      const pill = u.is_master_admin
        ? ` <span class="role-pill is-master">MASTER</span>`
        : u.is_admin ? ` <span class="role-pill">ADMIN</span>` : "";
      return `
      <tr>
        <td>${escapeHtml(u.username)}${pill}</td>
        <td class="td-dim">${escapeHtml(u.email)}</td>
        <td>${fmtNum(u.playerCount)}</td>
        <td>${fmtNum(u.planCount)}</td>
        <td class="td-dim">${fmtDate(u.created_at)}</td>
        <td>${accessCell(u, isSelf, canManage)}</td>
      </tr>`;
    }).join("");
  } catch {
    tbody.innerHTML = tableMessage(COLS, "Failed to load");
  }
}

/** First click on a destructive button only arms it; it disarms itself if left
    alone. The original label is carried on the element because there are two of
    them now, and "REVOKE" was hardcoded here when there was only one. */
function armConfirm(btn) {
  clearTimeout(confirmTimer);
  btn.dataset.armed = "1";
  btn.textContent = "CONFIRM?";
  btn.classList.add("is-armed");
  confirmTimer = setTimeout(() => {
    delete btn.dataset.armed;
    btn.textContent = btn.dataset.revokeLabel || "REVOKE";
    btn.classList.remove("is-armed");
  }, CONFIRM_MS);
}

/** Which of the two role endpoints this button drives, and what to say after. */
function roleRequest(btn) {
  const userId = Number(btn.dataset.userId);
  if (btn.dataset.makeMaster !== undefined) {
    const isMaster = btn.dataset.makeMaster === "1";
    return {
      path: `/api/admin/users/${userId}/master`,
      body: { isMaster },
      done: isMaster ? "Master admin granted." : "Master admin stood down.",
    };
  }
  const isAdmin = btn.dataset.makeAdmin === "1";
  return {
    path: `/api/admin/users/${userId}/role`,
    body: { isAdmin },
    done: isAdmin ? "Console access granted." : "Console access removed.",
  };
}

async function setRole(btn) {
  const { path, body, done } = roleRequest(btn);
  clearTimeout(confirmTimer);
  btn.disabled = true;
  notice("");
  try {
    await apiSend(path, "PATCH", body);
    notice(done);
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
    /* Anything that takes a role away is armed first; granting one is not. */
    const isDestructive = btn.classList.contains("is-revoke");
    if (isDestructive && btn.dataset.armed !== "1") {
      armConfirm(btn);
      return;
    }
    setRole(btn);
  });
}
