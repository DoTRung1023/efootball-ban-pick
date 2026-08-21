/* ============================================================
   ICONS — the one way JS writes an icon

   The set itself is `public/icons/sprite.svg`, one `<symbol>` per icon, and it
   is the only place an icon's geometry or stroke weight is written. This module
   exists so the eighteen icons built inside template strings do not each spell
   the wrapper markup out again — which is how the inline copies drifted in the
   first place.

   Static markup writes the same thing by hand; there is no build step and no
   partials, so `home.html` and friends carry the `<svg><use/></svg>` literally.
   Both forms point at the same sprite, so an icon is still fixed in one place.

   `npm run check` reads every `#name` on both sides and fails on one the sprite
   does not define, so a renamed or mistyped icon is a failed build rather than
   a blank gap on the page.
   ============================================================ */

/** Where the sprite is served from. `src/server.js` mounts `public/` at the
    root, so this is a URL, not a filesystem path. */
const SPRITE = "/icons/sprite.svg";

/**
 * One icon, as an HTML string.
 *
 * `size` sets both dimensions — every symbol is on a 24×24 grid, so icons are
 * square and one number is the whole answer. Anything else about the icon is
 * the sprite's business: colour comes from `currentColor`, weight from the
 * `<symbol>`.
 *
 * The result is interpolated into `innerHTML` at every call site, so `name` and
 * `className` must never be user input — they are literals in this codebase,
 * and the check keeps `name` honest.
 */
export function icon(name, { size = 14, className = "" } = {}) {
  const cls = className ? ` class="${className}"` : "";
  return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"`
    + `><use href="${SPRITE}#${name}" /></svg>`;
}
