/* ============================================================
   debug-leftovers — `debugger` and console noise shipped to the browser

   Client code only. `src/` prints legitimately: the server logs, and both
   scrapers report progress from the terminal.
   ============================================================ */

import { readFileSync } from "node:fs";
import { relPath, stripSource } from "./lib.js";

export const name = "debug-leftovers";
export const summary = "debugger / console.log in client code";

export function run(ctx) {
  const { root, jsFiles } = ctx;
  const failures = [];

  for (const file of jsFiles) {
    const rel = relPath(root, file);
    if (rel.startsWith("src/")) continue;
    const src = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
    src.split("\n").forEach((line, i) => {
      if (/\bdebugger\b/.test(line) || /console\.(log|dir|table)\s*\(/.test(line)) {
        failures.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
      }
    });
  }

  return { failures, detail: `${jsFiles.length} modules` };
}
