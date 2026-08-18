/* ============================================================
   imports — does every import and asset reference actually resolve?

   The substitute for a build step. For every JS module and every HTML asset:
     1. the target exists
     2. every path segment matches on-disk casing EXACTLY
     3. every named import exists as an export in the target
     4. the page's import map still maps `@/` to `/js/`
   ============================================================ */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { relPath } from "./lib.js";

export const name = "imports";
export const summary = "resolution, path casing and named exports";

const IMPORT_RE =
  /(?:^|\n)\s*import\s+(?:([\s\S]*?)\s+from\s*)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

/**
 * The URL paths `src/pages.js` serves a page for.
 *
 * A link to one of these is a route, not a file: nothing called `console`
 * exists under `public/`, and `/console` is still a valid href. Reading the
 * router keeps the two in step — a link to a page URL that was renamed or
 * never existed still fails.
 */
function readPageRoutes(root) {
  let src;
  try {
    src = readFileSync(join(root, "src", "pages.js"), "utf8");
  } catch {
    return []; // no router: every href is a file, as it was before
  }
  return [...src.matchAll(/["'](\/[^"']*)["']\s*:\s*["'][^"']+\.html["']/g)].map((m) => m[1]);
}

/** `/room/:code` matches `/room/ABCD`; every other segment is literal. */
function matchesRoute(url, routes) {
  const parts = url.split("/");
  return routes.some((route) => {
    const segments = route.split("/");
    return (
      segments.length === parts.length &&
      segments.every((seg, i) => (seg.startsWith(":") ? parts[i] !== "" : seg === parts[i]))
    );
  });
}

export function run(ctx) {
  const { root, publicDir, jsFiles, resolveSpec, existsExact, collectExports } = ctx;
  const failures = [];
  const rel = (p) => relPath(root, p);
  const pageRoutes = readPageRoutes(root);
  let importsChecked = 0;
  let htmlAssets = 0;
  let pageLinks = 0;

  for (const file of jsFiles) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(IMPORT_RE)) {
      const clause = m[1];
      const spec = m[2] || m[3];
      if (!spec) continue;

      const target = resolveSpec(spec, file);
      if (target === null) {
        if (spec.startsWith("#")) failures.push(`${rel(file)}: unmapped subpath import "${spec}"`);
        continue;                                        // bare npm specifier
      }
      importsChecked++;

      if (!existsExact(target)) {
        failures.push(`${rel(file)}: cannot resolve "${spec}" -> ${rel(target)} (missing, or casing differs from disk)`);
        continue;
      }
      if (statSync(target).isDirectory()) {
        failures.push(`${rel(file)}: "${spec}" resolves to a directory (no bundler means no index resolution)`);
        continue;
      }
      if (!clause) continue;                             // side-effect import

      const named = clause.match(/\{([\s\S]*)\}/);
      if (named) {
        const have = collectExports(target);
        for (const raw of named[1].split(",")) {
          const part = raw.trim();
          if (!part) continue;
          const importedName = part.split(/\s+as\s+/)[0].trim();
          if (importedName && !have.has(importedName)) {
            failures.push(`${rel(file)}: "${importedName}" is not exported by ${rel(target)}`);
          }
        }
      }
      const defMatch = clause.match(/^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/);
      if (defMatch && !clause.trimStart().startsWith("{") && !clause.trimStart().startsWith("*")) {
        if (!collectExports(target).has("default")) {
          failures.push(`${rel(file)}: no default export in ${rel(target)} (imported as ${defMatch[1]})`);
        }
      }
    }
  }

  for (const html of readdirSync(publicDir).filter((f) => f.endsWith(".html"))) {
    const src = readFileSync(join(publicDir, html), "utf8");
    for (const m of src.matchAll(/(?:href|src)\s*=\s*["'](\/[^"']+)["']/g)) {
      const url = m[1].split("?")[0].split("#")[0];
      if (url.startsWith("//") || /^https?:/.test(url)) continue;
      if (matchesRoute(url, pageRoutes)) { pageLinks++; continue; }
      htmlAssets++;
      if (!existsExact(join(publicDir, url))) {
        failures.push(`${html}: asset "${url}" is missing, or its casing differs from disk`);
      }
    }

    const importMap = src.match(/<script\s+type=["']importmap["']>([\s\S]*?)<\/script>/);
    if (importMap) {
      let map;
      try {
        map = JSON.parse(importMap[1]);
      } catch {
        failures.push(`${html}: import map is not valid JSON`);
        continue;
      }
      if (map.imports?.["@/"] !== "/js/") {
        failures.push(`${html}: import map "@/" is ${JSON.stringify(map.imports?.["@/"])}, expected "/js/"`);
      }
    } else if (/type=["']module["']/.test(src)) {
      failures.push(`${html}: has a module script but no import map, so "@/" will not resolve`);
    }
  }

  return {
    failures,
    detail: `${importsChecked} imports, ${htmlAssets} html assets, ${pageLinks} page links, ${jsFiles.length} modules`,
  };
}
