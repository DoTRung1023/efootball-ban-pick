/* ============================================================
   bindings — is every symbol a module references actually bound?

   The gap the `imports` check cannot see. It proves every import resolves; it
   cannot prove a module does not *use* a name whose import was rewritten away
   during a move or a split. In the browser that is a ReferenceError at first
   use, not at load, so the page renders and then dies on a click.

   This is deliberately narrow: it only considers names that some module in the
   project exports, since those are the ones a refactor drops.

   Known limitation: the `(?<![\w$.])` lookbehind also excludes `...NAME`, so a
   spread-prefixed use of an unbound name is missed.
   ============================================================ */

import { readFileSync } from "node:fs";
import { relPath, stripSource } from "./lib.js";

export const name = "bindings";
export const summary = "references to names no longer imported";

export function run(ctx) {
  const { root, jsFiles } = ctx;
  const failures = [];

  // The candidate pool: if a module references one of these and does not bind
  // it locally, that is the bug.
  const exportedSomewhere = new Set();
  for (const file of jsFiles) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/^\s*export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      exportedSomewhere.add(m[1]);
    }
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const raw of m[1].split(",")) {
        const part = raw.trim();
        if (!part) continue;
        const as = part.split(/\s+as\s+/);
        exportedSomewhere.add((as[1] || as[0]).trim());
      }
    }
  }

  for (const file of jsFiles) {
    const raw = readFileSync(file, "utf8");
    const src = stripSource(raw);          // a name inside a string is not a use
    const bound = new Set();

    // `export { a } from "./x.js"` names a symbol without binding it locally
    for (const m of raw.matchAll(/export\s*\{([^}]*)\}\s*from\s*["'][^"']+["']/g)) {
      for (const p of m[1].split(",")) {
        const t = p.trim();
        if (!t) continue;
        for (const part of t.split(/\s+as\s+/)) bound.add(part.trim());
      }
    }
    // object property keys are not free references
    for (const m of src.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*:/g)) bound.add(m[1]);

    for (const m of raw.matchAll(/import\s+([\s\S]*?)\s+from\s*["'][^"']+["']/g)) {
      const clause = m[1];
      const named = clause.match(/\{([\s\S]*)\}/);
      if (named) {
        for (const part of named[1].split(",")) {
          const t = part.trim();
          if (!t) continue;
          const as = t.split(/\s+as\s+/);
          bound.add((as[1] || as[0]).trim());
        }
      }
      const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
      if (ns) bound.add(ns[1]);
      const def = clause.replace(/\{[\s\S]*\}/, "").replace(/\*\s+as\s+[A-Za-z_$][\w$]*/, "").split(",")[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(def)) bound.add(def);
    }

    // local declarations at any depth
    for (const m of src.matchAll(/(?:^|[\s;{(,])(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) bound.add(m[1]);
    // destructuring targets
    for (const m of src.matchAll(/(?:const|let|var)\s*(?:\{([^}]*)\}|\[([^\]]*)\])/g)) {
      for (const part of (m[1] || m[2] || "").split(",")) {
        const t = part.trim().split(":").pop().split("=")[0].trim().replace(/^\.\.\./, "");
        if (/^[A-Za-z_$][\w$]*$/.test(t)) bound.add(t);
      }
    }
    // parameters (loose on purpose — a false "bound" is safer than a false alarm)
    for (const m of src.matchAll(/(?:function\*?\s*[A-Za-z_$\w]*\s*|\)\s*=>|\(\s*)\(([^)]*)\)/g)) {
      for (const part of (m[1] || "").split(",")) {
        const t = part.trim().split("=")[0].trim().replace(/^\.\.\./, "");
        if (/^[A-Za-z_$][\w$]*$/.test(t)) bound.add(t);
      }
    }
    for (const m of src.matchAll(/\(([^)]*)\)\s*=>/g)) {
      for (const part of (m[1] || "").split(",")) {
        const t = part.trim().split("=")[0].trim().replace(/^\.\.\./, "");
        if (/^[A-Za-z_$][\w$]*$/.test(t)) bound.add(t);
      }
    }
    for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) bound.add(m[1]);
    for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) bound.add(m[1]);

    for (const symbol of exportedSomewhere) {
      if (bound.has(symbol)) continue;
      const escaped = symbol.replace(/\$/g, "\\$");
      // require the name to be *used* — followed by a call, member access,
      // operator or separator — not merely to appear
      const useRe = new RegExp(String.raw`(?<![\w$.])${escaped}\s*(?:\(|\.|\[|\)|,|;|\s*[=<>!+\-*/&|?:]|$)`, "m");
      if (useRe.test(src)) failures.push(`${relPath(root, file)}: "${symbol}" is used but never bound`);
    }
  }

  return { failures, detail: `${jsFiles.length} modules` };
}
