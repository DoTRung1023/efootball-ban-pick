/* ============================================================
   The console-password form

   One job: rotating the shared password that unlocks /console. It used to
   carry a second form — a master typing a new password for somebody else's
   account — and that is gone on purpose: a reset now generates its own
   password and emails it, so there is nothing for a human to type. See the
   PATCH `/users/:id/password` route.

   What is left is still shaped as a configurable form (`open({…})`) rather
   than being inlined, because the "current password" field is conditional and
   the submit path already handles it.

   Nothing here is a permission check. The button that opens this is hidden
   from a non-master, but the endpoint re-reads the database and refuses a
   caller who is not a master, which is the check that counts.
   ============================================================ */

import { apiSend } from "./adminApi.js";

const el = (id) => document.getElementById(id);

/** Mirrors PASSWORD_MIN in `src/features/auth/routes.js`. The server states the
    real rule; this is only so the form can answer without a round trip. */
const PASSWORD_MIN = 6;

/** The form currently on screen: `{ title, sub, fields, validate, send }`. */
let active = null;

function close() {
  active = null;
  el("pwModal").hidden = true;
  el("pwForm").reset();
  el("pwError").textContent = "";
}

/**
 * Fields, not modes.
 *
 * This took `needsCurrent` and `confirmOnly`, two booleans that between them
 * branched in three places — which field to hide, which validation to run, what
 * to call the submit button. They were describing one thing badly: *which fields
 * this form has*. Saying that directly deletes all three branches, and the
 * module goes back to owning the chrome rather than knowing about its callers.
 */
const FIELDS = { current: "pwCurrentField", next: "pwNewField", confirm: "pwConfirmField" };

function open(config) {
  active = config;
  el("pwTitle").textContent = config.title;
  el("pwSub").textContent = config.sub;
  el("pwNewLabel").textContent = config.newLabel || "New password";
  el("pwCurrentLabel").textContent = config.currentLabel || "Current console password";
  for (const [name, id] of Object.entries(FIELDS)) el(id).hidden = !config.fields.includes(name);

  /* **`btn--primary` comes off when `btn--danger` goes on**, rather than both
     being worn at once: primary is the accent fill and danger is a red label,
     and together they drew red text on lime. They are two answers to the same
     question — this is the button you press — and DESIGN.md §3 gives that
     answer in one hue at a time. */
  const submit = el("pwSubmit");
  submit.textContent = config.submitLabel || "SAVE";
  submit.classList.toggle("btn--danger", Boolean(config.danger));
  submit.classList.toggle("btn--primary", !config.danger);

  el("pwError").textContent = "";
  el("pwForm").reset();
  el("pwModal").hidden = false;
  el(config.fields[0] === "current" ? "pwCurrent" : "pwNew").focus();
}

/**
 * Re-types a password to authorise something, rather than to change one.
 *
 * The only caller is the catalog wipe, and the password it asks for is the one
 * the gate took — shared or per-account, whichever this install uses. The
 * server decides which and says so on a mismatch; this form does not need to
 * know, and deliberately does not say, so it cannot claim the wrong one.
 */
export function openConfirmPasswordForm({ title, sub, submitLabel, send, done, onDone }) {
  open({
    title,
    sub,
    currentLabel: "Console password",
    fields: ["current"],
    validate: ({ current }) => !current && "Enter your console password.",
    danger: true,
    submitLabel,
    busyLabel: "WORKING…",
    send,
    done,
    onDone,
  });
}

/** Rotate the shared console password. The `current` field is dropped on an
    install that has none yet — there would be nothing to confirm against. */
export function openConsolePasswordForm({ hasExisting, onDone }) {
  open({
    title: "Console password",
    sub: hasExisting
      ? "Every admin unlocks the console with this. Changing it does not end sessions that are already open."
      : "No shared console password is set. Admins are unlocking with their own account passwords. Setting one switches that over.",
    newLabel: "New console password",
    fields: hasExisting ? ["current", "next", "confirm"] : ["next", "confirm"],
    validate: ({ current, next, confirm }) =>
      (next.length < PASSWORD_MIN && `At least ${PASSWORD_MIN} characters.`)
      || (next !== confirm && "The two passwords do not match.")
      || (hasExisting && !current && "Enter the current console password."),
    send: (current, next) =>
      apiSend("/api/admin/console-password", "PUT", {
        currentPassword: current,
        newPassword: next,
      }),
    done: "Console password updated.",
    onDone,
  });
}

export function initPasswordModal() {
  el("pwCancel").addEventListener("click", close);
  el("pwModal").addEventListener("click", (ev) => {
    if (ev.target === ev.currentTarget) close();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && active) close();
  });

  el("pwForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!active) return;

    const current = el("pwCurrent").value;
    const next = el("pwNew").value;
    const confirm = el("pwConfirm").value;
    const fail = (message) => { el("pwError").textContent = message; };

    /* Each form owns what "valid" means for the fields it asked for; this only
       reports the first thing wrong. */
    const problem = active.validate({ current, next, confirm });
    if (problem) return fail(problem);

    const submit = el("pwSubmit");
    const restore = submit.textContent;
    submit.disabled = true;
    submit.textContent = active.busyLabel || "SAVING…";
    fail("");
    try {
      await active.send(current, next);
      const { done, onDone } = active;
      close();
      onDone?.(done);
    } catch (err) {
      /* The server owns these messages — the minimum length and "the current
         console password is incorrect" are its rules to state. */
      fail(err.message);
    } finally {
      submit.disabled = false;
      submit.textContent = restore;
    }
  });
}
