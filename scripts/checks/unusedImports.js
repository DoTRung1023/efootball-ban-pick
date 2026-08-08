/* ============================================================
   unused-imports — names a module imports and never references

   Harmless at runtime, but with no bundler each one is a module the browser
   fetches for nothing, and a false claim about what the file depends on. An
   unused `showConfirm` sitting in squad.js is how the missing bulk-delete
   confirmation went unnoticed.
   ============================================================ */

import { readFileSync } from "node:fs";
import { relPath, stripSource, importedNames } from "./lib.js";

export const name = "unused-imports";
export const summary = "imported names nothing references";

export function run(ctx) {
  const { root, jsFiles } = ctx;
  const failures = [];

  for (const file of jsFiles) {
    // keepStrings, because a name can legitimately be referenced from inside a
    // template literal that builds markup
    const src = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
    // `...NAME` is a use, but the lookbehind below excludes a leading dot
    const body = src
      .replace(/\.\.\./g, " ")
      .replace(/(?:^|\n)\s*import\s+[\s\S]*?\s+from\s*["'][^"']+["'];?/g, "\n");

    for (const m of src.matchAll(/import\s+([\s\S]*?)\s+from\s*["']([^"']+)["']/g)) {
      for (const imported of importedNames(m[1])) {
        const escaped = imported.replace(/\$/g, "\\$");
        const re = new RegExp(String.raw`(?<![\w$.])${escaped}(?![\w$])`);
        if (!re.test(body)) {
          failures.push(`${relPath(root, file)}: "${imported}" imported from ${m[2]} but never used`);
        }
      }
    }
  }

  return { failures, detail: `${jsFiles.length} modules` };
}
