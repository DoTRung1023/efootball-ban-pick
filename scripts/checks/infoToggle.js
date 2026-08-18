/* ============================================================
   info-toggle — SHOW INFO / HIDE INFO may only show and hide the footer

   Three grids carry the toggle: the ban grid, the pick pool and the home
   page's My Players. On My Players it has always meant one thing — `.pc-footer`
   appears or disappears and the card keeps its width. The pick pool drifted:
   its columns were widened while info was on, so pressing the button made every
   card grow and then shrink again, which reads as the grid resizing rather than
   a footer opening.

   The rule this enforces: **a selector qualified by `.info-hidden` (or
   `:not(.info-hidden)`) may not declare a property that changes how much space
   anything takes.** Showing the footer changes the card's *height* — that is
   the point, and it happens because a hidden element becomes visible, not
   because a rule said so.

   `display` is the exception, because `display: none` on the footer is the
   whole mechanism.

   Not covered: a width change smuggled in through a custom property, or one
   applied from JavaScript. Neither exists today; both would be a deliberate
   act rather than the drift this catches.
   ============================================================ */

import { readFileSync } from "node:fs";
import { relPath, walkFiles } from "./lib.js";

export const name = "info-toggle";
export const summary = "SHOW INFO changes card size instead of just the footer";

/* Anything that resizes a box or the track it sits in. `display` is absent on
   purpose; `height`/`width` catch their `min-`/`max-` forms via the prefix. */
const LAYOUT_PROPS = [
  "grid-template-columns", "grid-template-rows", "grid-auto-columns", "grid-auto-rows",
  "width", "height", "flex-basis", "aspect-ratio", "padding", "margin", "gap", "font-size",
];

const isLayoutProp = (prop) =>
  LAYOUT_PROPS.some((p) => prop === p || prop.endsWith(`-${p}`) || prop.startsWith(`${p}-`) ||
    prop === `min-${p}` || prop === `max-${p}`);

export function run(ctx) {
  const { root, publicDir } = ctx;
  const failures = [];
  const sheets = [...walkFiles(`${publicDir}/css`)].filter((f) => f.endsWith(".css"));

  for (const file of sheets) {
    const rel = relPath(root, file);
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

    // Every `selector { declarations }` pair, comments already gone.
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].trim();
      if (!selector.includes("info-hidden")) continue;

      for (const decl of match[2].split(";")) {
        const prop = decl.split(":")[0]?.trim().toLowerCase();
        if (!prop || !isLayoutProp(prop)) continue;
        const line = css.slice(0, match.index).split("\n").length;
        failures.push(
          `${rel}:${line}  ${selector.replace(/\s+/g, " ").slice(0, 60)} sets ${prop} — ` +
          `the info toggle may only show and hide the footer, not resize the card`,
        );
      }
    }
  }

  return { failures, detail: `${sheets.length} sheets` };
}
