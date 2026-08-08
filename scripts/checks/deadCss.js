/* ============================================================
   dead-css — class selectors no markup can ever match

   The sheets were swept down from 12,301 lines to 10,863 once; this is what
   keeps them there. A class counts as used if its token appears in any HTML
   file or any JS source — which is deliberately generous, so what survives is
   a safe deletion candidate rather than a guess.

   Two rules that keep it honest:
     - A class built by interpolation (`stage-${i}`) is reported as used, via
       the literal prefixes collected below.
     - A class inside `:not()` is an *exclusion*: `.card:not(.is-dead)` still
       styles every `.card`, so `is-dead` is not required for the rule to match
       and must not be counted as one.
   ============================================================ */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { relPath, walkFiles } from "./lib.js";

export const name = "dead-css";
export const summary = "class selectors no markup matches";

/** Blanks `:not(…)` arguments so exclusions are not read as requirements. */
function requiredPart(selector) {
  let out = "";
  let i = 0;
  while (i < selector.length) {
    const m = /^:not\(/i.exec(selector.slice(i));
    if (!m) { out += selector[i++]; continue; }
    i += m[0].length;
    let depth = 1;
    while (i < selector.length && depth) {
      if (selector[i] === "(") depth++;
      else if (selector[i] === ")") depth--;
      i++;
    }
  }
  return out;
}

export function run(ctx) {
  const { root, publicDir } = ctx;
  const failures = [];

  const markup = walkFiles(publicDir)
    .filter((f) => f.endsWith(".html") || f.endsWith(".js"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const tokens = new Set(markup.match(/[A-Za-z_][\w-]*/g) || []);
  const dynamicPrefixes = [...new Set(
    [...markup.matchAll(/([A-Za-z_][\w-]*)\$\{/g)].map((m) => m[1]).filter((p) => p.length >= 3),
  )];
  const isUsed = (cls) => tokens.has(cls) || dynamicPrefixes.some((p) => cls.startsWith(p));

  const sheets = walkFiles(join(publicDir, "css")).filter((f) => f.endsWith(".css"));
  let total = 0;

  for (const sheet of sheets) {
    const css = readFileSync(sheet, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const classes = new Set();
    for (const m of css.matchAll(/([^{}]+)\{/g)) {
      const selector = m[1].trim();
      if (!selector || selector.startsWith("@")) continue;
      for (const c of requiredPart(selector).match(/\.(-?[A-Za-z_][\w-]*)/g) || []) classes.add(c.slice(1));
    }
    total += classes.size;
    const dead = [...classes].filter((c) => !isUsed(c)).sort();
    if (dead.length) failures.push(`${relPath(root, sheet)}: ${dead.join(", ")}`);
  }

  return { failures, detail: `${total} class selectors across ${sheets.length} sheets` };
}
