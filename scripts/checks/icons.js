/* ============================================================
   icons — a <use> pointing at a symbol the sprite does not define

   Icons used to be inline SVG pasted at each site: 83 of them across eleven
   files, 26 actual shapes. The same icon existed at two stroke weights on the
   same screen, and fixing one meant finding the rest by eye. They are now one
   sprite, `public/icons/sprite.svg`, referenced by name.

   Referencing by name is only safer than pasting geometry if a wrong name is
   loud. It is not: `<use href="…#chevrn-down">` renders nothing at all, and an
   icon that silently fails to appear is exactly the bug the inline version
   could not have. This check is what makes the name trustworthy.

   Three things, in the order they matter:

     1. every name used must exist in the sprite  — a typo or a rename
     2. every symbol in the sprite must be used   — dead weight, as in dead-css
     3. no site may draw its own geometry         — the slop coming back

   (3) has one allowed exception, and it is a real one rather than a grandfather
   clause: `.room-chat-icon` is two-tone, and `shell.css` colours its `path` and
   its `circle` separately. A sprite `<use>` renders into a shadow tree those
   selectors cannot reach, so that icon has to stay inline. Anything else that
   wants an exception should have to argue for it here.
   ============================================================ */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { relPath } from "./lib.js";

export const name = "icons";
export const summary = "icon names with no matching symbol";

const SPRITE_REL = "icons/sprite.svg";

/** Inline SVGs that may keep their own geometry, by class, with the reason. */
const INLINE_ALLOWED = new Map([
  ["room-chat-icon", "two-tone; shell.css colours its path and circle separately"],
]);

const GEOMETRY = /<(path|circle|rect|polyline|polygon|line)\b/;

export function run(ctx) {
  const { root, publicDir, jsFiles } = ctx;
  const failures = [];

  const spritePath = join(publicDir, SPRITE_REL);
  if (!existsSync(spritePath)) {
    return { failures: [`${SPRITE_REL} is missing — every icon resolves to nothing`], detail: "" };
  }
  const sprite = readFileSync(spritePath, "utf8");
  const defined = new Set([...sprite.matchAll(/<symbol\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]));

  // Every file that can name an icon: the pages, and the client modules.
  const files = [
    ...readdirSync(publicDir).filter((f) => f.endsWith(".html")).map((f) => join(publicDir, f)),
    ...jsFiles.filter((f) => f.startsWith(join(publicDir, "js"))),
  ];

  const used = new Set();
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const here = new Set();
    for (const m of src.matchAll(/sprite\.svg#([A-Za-z][\w-]*)/g)) here.add(m[1]);
    for (const m of src.matchAll(/\bicon\(\s*["']([A-Za-z][\w-]*)["']/g)) here.add(m[1]);

    for (const n of here) {
      used.add(n);
      if (!defined.has(n)) failures.push(`${relPath(root, file)}: #${n} is not a symbol in ${SPRITE_REL}`);
    }

    // (3) geometry drawn outside the sprite
    for (const m of src.matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/g)) {
      if (!GEOMETRY.test(m[2])) continue;                       // a <use>, which is the point
      const cls = (m[1].match(/class="([^"]*)"/) || [])[1] || "";
      if (cls.split(/\s+/).some((c) => INLINE_ALLOWED.has(c))) continue;
      failures.push(
        `${relPath(root, file)}: inline <svg> draws its own geometry — add it to ${SPRITE_REL} `
        + `and reference it by name`,
      );
    }
  }

  // (2) symbols nothing references
  for (const n of defined) {
    if (!used.has(n)) failures.push(`${SPRITE_REL}: #${n} is defined but nothing uses it`);
  }

  return {
    failures,
    detail: `${used.size} of ${defined.size} symbols used across ${files.length} files`,
  };
}
