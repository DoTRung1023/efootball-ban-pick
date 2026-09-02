/* ============================================================
   USERS — every account, and who may open this console

   Granting console access is done here rather than in MySQL: the seeder
   (`src/features/admin/bootstrap.js`) creates the first admin, and every one
   after that is promoted from this table.

   **Only a master admin sees any of these buttons** — and for a plain admin the
   ACTIONS column is not narrowed, it is *gone*, header and cells together. Every
   cell under it would be empty, and a headed column of nothing was holding a
   fifth of the table width away from the columns that had something in them.
   The roles are still worth seeing, they are just not theirs to change, so the
   ACCESS column stays exactly as it is. Hiding any of this is a courtesy and
   never the check: every role write is re-authorised against the database, so a
   hand-made request from a plain admin is refused too.

   ACCESS holds the role word; ACTIONS holds the buttons, in three fixed slots
   so they line up down the table; the last column is unheaded and holds one
   YOU badge, on your own row. `· YOU` used to trail the role, which put a fact
   about the *reader* inside the column that states the *account's* role. Every
   cell carries a `data-label` — what the card layout below 620px prints in
   front of its value; see the responsive block in `admin.css`.

   **The whole row is coloured by rung** — the accent for a master, full-strength
   text for an admin, the muted rung for everyone else — so which accounts carry
   power is answerable by scanning the table rather than by reading one column.
   The row's class carries it; the cells inherit. The word was briefly a pill
   beside the username as well, which put it in two columns of one row; the
   buttons that act on the role live here, so the word does too.

   **RESET PW does not ask for a password.** The server generates one, emails it
   to the address on the account and never returns it here, so this table can
   report where it went and nothing more. That makes it irreversible from the
   console's point of view — hence the same two-click arming as a role change.

   Lockouts the server refuses, and this table therefore does not offer:
   demoting yourself, standing yourself down, resetting your own password,
   demoting the last admin, revoking access from a master without standing them
   down first, and standing down the last master. The first three are one rule —
   **nobody acts on their own row** — and your own row renders its three action
   slots empty. Anything destructive is a two-click action: the first click arms
   the button, the second sends it.
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { apiFetch, apiSend, getSessionUserId, isSessionMaster } from "./adminApi.js";
import { fmtDate, fmtNum, notice, tableMessage } from "./format.js";
import { onConfirmedClick, reset as resetBtn } from "./confirmButton.js";
import { initPasswordModal, openConsolePasswordForm } from "./passwordModal.js";

const USER_ROWS = 50;
const COLS = 8;


/** This tab's one spoken line. The writer is `notice` in `format.js`;
    all this names is which element it writes to. */
/** What this account currently is, in one word. The third rung is a word rather
    than the em-dash it used to be: "—" reads as missing data in a column of real
    values, when what it means is an account with no console access. */
function roleLabel(user) {
  if (user.is_master_admin) return "MASTER";
  return user.is_admin ? "ADMIN" : "USER";
}

/** The class that colours each rung. Kept beside `roleLabel` so a new rung
    cannot be added in one place and missed in the other. */
const ROLE_CLASS = { MASTER: "is-master", ADMIN: "is-admin", USER: "is-user" };

/* The `title` is what the label has no room for — which power the click hands
   over, or takes away. `RESET PW` and `DELETE` carry their own below, because
   theirs name the account they would act on. */
const ROLE_TIPS = {
  "MAKE ADMIN":  "Give this account access to the console",
  "MAKE MASTER": "Let this admin change roles and reset passwords",
  "REVOKE":      "Take console access away from this account",
  "STAND DOWN":  "Remove master admin. The account keeps console access",
};

const grantBtn = (id, attr, value, label) =>
  `<button class="role-btn" data-user-id="${id}" data-${attr}="${value}"
           title="${ROLE_TIPS[label]}">${label}</button>`;

const revokeBtn = (id, attr, value, label) =>
  `<button class="role-btn is-revoke" data-user-id="${id}" data-${attr}="${value}"
           data-confirm-label="${label}" title="${ROLE_TIPS[label]}">${label}</button>`;

/**
 * The ACTIONS cell — **three fixed slots, always in the same order**.
 *
 *   1. promote   MAKE ADMIN · MAKE MASTER
 *   2. demote    REVOKE · STAND DOWN
 *   3. password  RESET PW
 *
 * A row that has nothing for a slot renders the slot empty rather than closing
 * the gap, which is the whole point: the buttons used to be a run of pills
 * packed left, so MAKE ADMIN on one row sat under MAKE MASTER on the next and
 * RESET PW landed at a different x in every row. Read down a column now and it
 * is one kind of action.
 *
 * **Your own row carries no buttons at all** — three empty slots, and the YOU
 * badge in the last column is what says why. This is a rule and not a layout:
 * an account with console access does not act on itself from this table, so a
 * role change and a password reset are both somebody else's to make. Standing
 * yourself down used to be the one exception; it is not one any more, and a
 * master hands the role on by having another master take it. The server refuses
 * all three the same way, so hiding them here is only the courtesy.
 *
 * Each remaining absence is also a server rule: a master's access comes off
 * only after the master flag does, so losing the role is two deliberate steps;
 * and your own password is changed under Edit Profile.
 */
function actionsCell(user, isSelf, canManage) {
  const id = Number(user.id);

  /* **A plain admin gets one slot, not four.** They can delete a plain account
     and nothing else, so three empty slots would be 336px of table reserved for
     buttons that are never drawn — the same dead width that got the whole
     column hidden from them before DELETE existed. */
  const del = deleteBtn(user, isSelf, canManage);
  if (!canManage) {
    return `<div class="role-actions is-slim"><span class="role-slot">${del}</span></div>`;
  }

  const promote = isSelf || user.is_master_admin
    ? ""
    : user.is_admin
      ? grantBtn(id, "make-master", "1", "MAKE MASTER")
      : grantBtn(id, "make-admin", "1", "MAKE ADMIN");

  const demote = isSelf
    ? ""
    : user.is_master_admin
      ? revokeBtn(id, "make-master", "0", "STAND DOWN")
      : user.is_admin
        ? revokeBtn(id, "make-admin", "0", "REVOKE")
        : "";

  /* `data-revoke-label` is what `armConfirm` puts back when the arming times
     out — without it the button would disarm into reading "REVOKE". */
  const resetPw = isSelf
    ? ""
    : `<button class="role-btn is-pw" data-reset-pw="${id}"
               data-confirm-label="RESET PW"
               data-username="${escapeHtml(user.username)}"
               title="Generates a new password and emails it to ${escapeHtml(user.email)}">RESET PW</button>`;

  const slot = (html) => `<span class="role-slot">${html}</span>`;
  return `<div class="role-actions">${slot(promote)}${slot(demote)}${slot(resetPw)}${slot(del)}</div>`;
}

/**
 * DELETE, in the fourth slot — **the only button a plain admin ever gets**.
 *
 * Who may delete whom is the server's rule and this only draws it: a master
 * reaches any row but their own, a plain admin only a row with no console
 * access. Drawing DELETE on an admin's row for a plain admin would be offering
 * a 403.
 *
 * It says DELETE and not REMOVE because of what it takes with it. The `title`
 * spells that out, since the cascade is not visible from this table: the
 * account's squad, its game plans, its saved settings.
 */
function deleteBtn(user, isSelf, canManage) {
  if (isSelf) return "";
  if (!canManage && user.is_admin) return "";
  return `<button class="role-btn is-revoke" data-delete-user="${Number(user.id)}"
           data-confirm-label="DELETE"
           data-username="${escapeHtml(user.username)}"
           title="Deletes ${escapeHtml(user.username)} and everything on the account — squad, game plans, settings. This cannot be undone">DELETE</button>`;
}

export async function loadUsers() {
  const tbody = document.getElementById("usersBody");
  /* Both master-only pieces of chrome are settled before the fetch, off the
     session rather than off the response: the ACTIONS header would otherwise
     appear for a frame over "Loading…" and then be taken away. */
  const canManage = isSessionMaster();
  document.getElementById("consolePwBtn").hidden = !canManage;
  /* **Shown to a plain admin too, now that DELETE is in it.** It is hidden only
     when the column would be entirely empty, which it no longer is for anyone
     with console access — see `actionsCell`, which gives a plain admin one slot
     rather than the master's four. */
  document.getElementById("usersActionsHead").hidden = false;

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
      const role = roleLabel(u);
      /* An unconfirmed address is why that account cannot sign in, and why a
         password reset would be mailed somewhere nobody has proved they read.
         Both questions get asked at this table, so the answer belongs in it. */
      const verify = u.email_verified
        ? ""
        : ` <span class="role-pill is-unverified" title="This address was never confirmed. The account cannot sign in">UNCONFIRMED</span>`;
      /* The rung colours every cell in the row, not just the ACCESS word. The
         cells inherit it, dimmed ones included; the pills and the buttons keep
         their own colours, being controls rather than data. */
      return `
      <tr class="role-row ${ROLE_CLASS[role]}">
        <td data-label="ACCOUNT">${escapeHtml(u.username)}</td>
        <td class="td-dim" data-label="EMAIL">${escapeHtml(u.email)}${verify}</td>
        <td class="col-lo" data-label="SQUAD">${fmtNum(u.playerCount)}</td>
        <td class="col-lo" data-label="PLANS">${fmtNum(u.planCount)}</td>
        <td class="td-dim col-mid" data-label="JOINED">${fmtDate(u.created_at)}</td>
        <td data-label="ACCESS"><span class="access-role ${ROLE_CLASS[role]}">${role}</span></td>
        <td data-label="ACTIONS">${actionsCell(u, isSelf, canManage)}</td>
        <td class="col-you" data-label="">${isSelf ? `<span class="role-pill is-you">YOU</span>` : ""}</td>
      </tr>`;
    }).join("");
  } catch {
    tbody.innerHTML = tableMessage(COLS, "Failed to load");
  }
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

/**
 * Generates and mails a new password for one account.
 *
 * Nothing comes back but where it went: `delivered: false` means the server
 * has no SMTP host and printed the password to its log instead, which is a
 * different sentence to say and not an error to hide — somebody has to know
 * the account's password changed and where to read it.
 */
async function resetPassword(btn) {
  const username = btn.dataset.username;
  btn.disabled = true;
  btn.textContent = "SENDING…";
  try {
    const { email, delivered } = await apiSend(
      `/api/admin/users/${Number(btn.dataset.resetPw)}/password`,
      "PATCH",
      {},
    );
    notice(
      delivered
        ? `New password emailed to ${email}.`
        : `Password reset for ${username}, but no mail server is configured. The new password is in the server log.`,
    );
    loadUsers();
  } catch (err) {
    /* The password is unchanged when the send fails — the server writes it only
       after the mail is away — so this really is "nothing happened", and the
       button goes all the way back — `resetBtn` is what does that, label and
       armed state together, because one restored without the other would leave
       a button reading RESET PW that fires on a single click. The success path
       never notices: `loadUsers` replaces the row underneath it. */
    notice(err.message, true);
    resetBtn(btn);
  }
}

/**
 * Deletes one account, and everything the schema cascades with it.
 *
 * Two clicks, like every other irreversible button here — and this is the most
 * irreversible of them: `ON DELETE CASCADE` from `users` takes the squad, the
 * game plans and their rows, the saved settings and any pending email
 * verification. There is no undo and nothing is archived.
 *
 * On a refusal the button goes all the way back rather than just relabelled,
 * for the reason `resetPassword` gives.
 */
async function deleteUser(btn) {
  const username = btn.dataset.username;
  btn.disabled = true;
  btn.textContent = "DELETING…";
  try {
    await apiSend(`/api/admin/users/${Number(btn.dataset.deleteUser)}`, "DELETE");
    notice(`${username} deleted, with their squad and game plans.`);
    loadUsers();
  } catch (err) {
    /* The server owns these — "the last admin cannot be removed" and "only a
       master admin can delete an account that has console access" are its rules
       to state. */
    notice(err.message, true);
    resetBtn(btn);
  }
}

export function initUsersTab() {
  initPasswordModal();

  document.getElementById("refreshUsers").addEventListener("click", () => {
    notice("");
    loadUsers();
  });

  document.getElementById("consolePwBtn").addEventListener("click", async () => {
    notice("");
    /* Asked fresh every time: the first rotation turns a console with no shared
       password into one that has it, and the form is shaped by the answer. */
    let configured = true;
    try {
      ({ configured } = await apiFetch("/api/admin/console-password"));
    } catch (err) {
      notice(err.message, true);
      return;
    }
    openConsolePasswordForm({ hasExisting: configured, onDone: (msg) => notice(msg) });
  });

  /* One delegated listener; the rows are replaced on every load. Which of these
     needs a second click is not decided here — `confirmButton.js` reads it off
     the button, which is why there is no `.is-revoke` test left in this file. */
  onConfirmedClick(
    document.getElementById("usersBody"),
    [
      ["[data-delete-user]", deleteUser],
      ["[data-reset-pw]", resetPassword],
      [".role-btn", setRole],
    ],
    { before: () => notice("") },
  );
}
