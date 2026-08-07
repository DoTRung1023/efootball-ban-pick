/* ============================================================
   Show/hide password

   The sign-in form and the sign-up modal both do this, with the same two
   inline SVG paths for the open and struck-through eye.
   ============================================================ */

const EYE_OPEN =
  `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
const EYE_CLOSED =
  `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;

/** Wires a toggle button to a password input. No-op when either is absent. */
export function bindPasswordToggle(btnId, inputId) {
  const btn   = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;

  btn.addEventListener("click", () => {
    const isText = input.type === "text";
    input.type = isText ? "password" : "text";

    const icon = btn.querySelector(".eye-icon");
    if (icon) icon.innerHTML = isText ? EYE_OPEN : EYE_CLOSED;
  });
}
