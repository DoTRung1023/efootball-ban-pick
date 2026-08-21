/* Writes an icon from `public/icons/sprite.svg`. Static markup spells the same
   `<svg><use/></svg>` by hand — there is no build step — so both forms point at
   the one sprite. Why the sprite owns geometry and stroke-width: DESIGN.md §5a. */

/** A URL, not a path — `src/server.js` mounts `public/` at the root. */
const SPRITE = "/icons/sprite.svg";

/**
 * `size` sets both dimensions — every symbol is on a 24x24 grid, so icons are
 * square and one number is the whole answer.
 *
 * Interpolated into `innerHTML` at every call site, so `name` and `className`
 * must stay literals. The `icons` check keeps `name` honest.
 */
export function icon(name, { size = 14, className = "" } = {}) {
  const cls = className ? ` class="${className}"` : "";
  return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"`
    + `><use href="${SPRITE}#${name}" /></svg>`;
}
