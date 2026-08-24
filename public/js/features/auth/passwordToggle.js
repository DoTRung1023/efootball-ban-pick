/* ============================================================
   Show/hide password

   The sign-in form and the sign-up modal both do this.

   Both eyes are sprite symbols and this swaps which one the existing `<use>`
   points at. It used to hold the two shapes as bare `<path>` strings and write
   them into the `<svg>` with `innerHTML` — which replaced the `<use>` on the
   first click, so from then on that icon was inline geometry that no longer
   tracked the sprite. `stroke-width` could drift there and nothing would say
   so. The `icons` check could not see it either: the strings had no `<svg>`
   wrapper for its geometry rule to match on. Both are fixed.
   ============================================================ */

/** Wires a toggle button to a password input. No-op when either is absent. */
export function bindPasswordToggle(btnId, inputId) {
  const btn   = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;

  btn.addEventListener("click", () => {
    const isText = input.type === "text";
    input.type = isText ? "password" : "text";

    /* Written out rather than built from a constant: the `icons` check reads
       the symbol name as a literal, and an interpolated one is invisible. */
    const use = btn.querySelector(".eye-icon use");
    if (use) use.setAttribute("href", isText ? "/icons/sprite.svg#eye" : "/icons/sprite.svg#eye-off");
  });
}
