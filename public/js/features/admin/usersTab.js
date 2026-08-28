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
   demoting yourself, demoting the last admin, revoking access from a master
   without standing them down first, and standing down the last master.
   Anything destructive is a two-click action — the first click arms the
   button, the second sends it.
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { apiFetch, apiSend, getSessionUserId, isSessionMaster } from "./adminApi.js";
import { fmtDate, fmtNum, tableMessage } from "./format.js";
import { initPasswordModal, openConsolePasswordForm } from "./passwordModal.js";

const USER_ROWS = 50;
const COLS = 8;
const CONFIRM_MS = 4000;

let confirmTimer = null;

function notice(message, isError = false) {
  const el = document.getElementById("usersNotice");
  el.textContent = message;
  el.className = isError ? "panel-notice is-error" : "panel-notice";
  el.hidden = !message;
}

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

const grantBtn = (id, attr, value, label) =>
  `<button class="role-btn" data-user-id="${id}" data-${attr}="${value}">${label}</button>`;

const revokeBtn = (id, attr, value, label) =>
  `<button class="role-btn is-revoke" data-user-id="${id}" data-${attr}="${value}"
           data-revoke-label="${label}">${label}</button>`;

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
 * Which buttons exist at all is unchanged, and each absence is a rule the
 * server enforces: you can stand yourself down but never revoke your own
 * access; a master's access comes off only after the master flag does, so
 * losing the role is two deliberate steps; and your own password is changed
 * under Edit Profile, not from a table of other people's accounts.
 */
function actionsCell(user, isSelf) {
  const id = Number(user.id);

  const promote = isSelf || user.is_master_admin
    ? ""
    : user.is_admin
      ? grantBtn(id, "make-master", "1", "MAKE MASTER")
      : grantBtn(id, "make-admin", "1", "MAKE ADMIN");

  const demote = user.is_master_admin
    ? revokeBtn(id, "make-master", "0", "STAND DOWN")
    : !isSelf && user.is_admin
      ? revokeBtn(id, "make-admin", "0", "REVOKE")
      : "";

  /* `data-revoke-label` is what `armConfirm` puts back when the arming times
     out — without it the button would disarm into reading "REVOKE". */
  const resetPw = isSelf
    ? ""
    : `<button class="role-btn is-pw" data-reset-pw="${id}"
               data-revoke-label="RESET PW"
               data-username="${escapeHtml(user.username)}"
               title="Generates a new password and emails it to ${escapeHtml(user.email)}">RESET PW</button>`;

  const slot = (html) => `<span class="role-slot">${html}</span>`;
  return `<div class="role-actions">${slot(promote)}${slot(demote)}${slot(resetPw)}</div>`;
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
    document.getElementById("consolePwBtn").hidden = !canManage;

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
        <td data-label="ACTIONS">${canManage ? actionsCell(u, isSelf) : ""}</td>
        <td class="col-you" data-label="">${isSelf ? `<span class="role-pill is-you">YOU</span>` : ""}</td>
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

/**
 * Generates and mails a new password for one account.
 *
 * Nothing comes back but where it went: `delivered: false` means the server
 * has no SMTP host and printed the password to its log instead, which is a
 * different sentence to say and not an error to hide — somebody has to know
 * the account's password changed and where to read it.
 */
async function resetPassword(btn) {
  clearTimeout(confirmTimer);
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
       button goes all the way back to disarmed. Restoring the label without
       clearing `armed` would leave one reading RESET PW that fires on a single
       click; the success path never notices because `loadUsers` replaces the
       row underneath it. */
    notice(err.message, true);
    delete btn.dataset.armed;
    btn.classList.remove("is-armed");
    btn.disabled = false;
    btn.textContent = "RESET PW";
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

  /* Delegated: the rows are replaced on every load. */
  document.getElementById("usersBody").addEventListener("click", (e) => {
    const reset = e.target.closest("[data-reset-pw]");
    if (reset) {
      notice("");
      if (reset.dataset.armed !== "1") {
        armConfirm(reset);
        return;
      }
      resetPassword(reset);
      return;
    }

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
