/* ============================================================
   iconSprite — read `public/icons/sprite.svg`, derive one standalone
   file per symbol.

   The sprite stays the single source of geometry. `public/icons/svg/` is a
   *derived* view of it, not a second copy to maintain: `npm run icons`
   writes it and the `iconFiles` check fails if it drifts. Hand-editing a
   file in there is the drift the sprite was built to end, which is why every
   generated file says so on line one.

   The loose files are not decoration. A sprite `<use>` renders into a shadow
   tree, so it cannot be a CSS pseudo-element — the `content: "✓"` ticks are
   `mask-image: url(/icons/svg/check.svg)` instead, and that needs a real URL
   pointing at a real file.
   ============================================================ */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const SPRITE_REL = "icons/sprite.svg";
export const OUT_REL = "icons/svg";

/** The banner every generated file carries, so an edit to one looks wrong. */
export const BANNER = "<!-- Generated from icons/sprite.svg by `npm run icons` — do not edit. -->";

/**
 * Every `<symbol>` in the sprite, in document order.
 * Returns `{ id, attrs, body }` — `attrs` is the symbol's own presentation
 * (fill / stroke / stroke-width vary per icon and belong to the geometry).
 */
export function parseSprite(publicDir) {
  // Strip comments first: the sprite's own header says "One <symbol> per icon",
  // and that literal text matched the tag regex — swallowing the first real
  // symbol into a match with no id. A silent 33-of-34, which is why `run()`
  // below asserts the parsed count against a raw id count.
  const src = readFileSync(join(publicDir, SPRITE_REL), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const out = [];
  for (const m of src.matchAll(/<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/g)) {
    const attrs = m[1];
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    if (!id) continue;
    out.push({ id, attrs: attrs.replace(/\s*\bid="[^"]*"/, "").trim(), body: m[2].trim() });
  }
  return out;
}

/** The exact bytes `icons/svg/<id>.svg` should hold for one symbol. */
export function fileFor({ attrs, body }) {
  const inner = body.split("\n").map((l) => l.trim()).filter(Boolean).join("");
  return `${BANNER}\n<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>\n`;
}
