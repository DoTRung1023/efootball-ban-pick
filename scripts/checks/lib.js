/* ============================================================
   Shared helpers for the static checks

   There is no bundler and no type checker, so nothing between writing a
   module and loading it in a browser will tell you that an import is wrong.
   These helpers are what the checks in this folder are built from.
   ============================================================ */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";

/** Every file under `dir`, skipping `node_modules` and dotfolders. */
export function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

/** Repo-relative path with forward slashes, for stable output on any platform. */
export const relPath = (root, p) => relative(root, p).split(sep).join("/");

/**
 * Blanks comments and string/template/regex literals while preserving offsets
 * and line structure, by scanning character by character.
 *
 * A regex-based stripper cannot do this. `"…,*acceptheader*;q=0.8"` style
 * strings contain the character pair that closes a block comment, so a naive
 * /\/\*[\s\S]*?\*\// swallows everything to the next real one — in
 * `src/features/ingestion/scrape.js` that silently erased 26 lines of live code
 * and made three used imports look unused.
 *
 * With `keepStrings` the string contents survive; use that when a check needs
 * to see selectors or ids that only appear inside strings.
 */
export function stripSource(src, { keepStrings = false } = {}) {
  const out = new Array(src.length);
  const blank = (i) => { out[i] = src[i] === "\n" ? "\n" : " "; };
  const keep = (i) => { out[i] = src[i]; };
  const take = keepStrings ? keep : blank;

  let i = 0;
  // Whether a `/` starts a regex or is division: a regex may only follow an
  // operator, punctuation or a keyword — never a value.
  let prevSignificant = "";
  let word = "";

  while (i < src.length) {
    const c = src[i];
    const c2 = src[i + 1];

    if (c === "/" && c2 === "/") {                        // line comment
      while (i < src.length && src[i] !== "\n") blank(i++);
      continue;
    }
    if (c === "/" && c2 === "*") {                        // block comment
      blank(i++); blank(i++);
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) blank(i++);
      if (i < src.length) { blank(i++); blank(i++); }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {            // string / template
      const quote = c;
      take(i++);
      while (i < src.length) {
        if (src[i] === "\\") { take(i++); if (i < src.length) take(i++); continue; }
        if (src[i] === quote) { take(i++); break; }
        // `${ … }` inside a template holds real code — keep scanning it as code
        if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
          keep(i++); keep(i++);
          let depth = 1;
          while (i < src.length && depth) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            if (!depth) { keep(i++); break; }
            keep(i++);
          }
          continue;
        }
        take(i++);
      }
      prevSignificant = quote;
      continue;
    }
    if (c === "/" && /[=(,:;[!&|?{}+\-*%~^<>]|^$|return|typeof|case|in|of|do|else|yield|await/.test(prevSignificant)) {
      blank(i++);                                         // regex literal
      let inClass = false;
      while (i < src.length) {
        if (src[i] === "\\") { blank(i++); if (i < src.length) blank(i++); continue; }
        if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        else if (src[i] === "/" && !inClass) { blank(i++); break; }
        else if (src[i] === "\n") break;                  // not a regex after all
        blank(i++);
      }
      while (i < src.length && /[a-z]/.test(src[i])) blank(i++);   // flags
      prevSignificant = "/";
      continue;
    }

    keep(i);
    if (/[\w$]/.test(c)) {
      word += c;                        // accumulate, never re-slice the source:
      prevSignificant = word;           // slicing per character made this O(n^2)
    } else if (!/\s/.test(c)) {
      word = "";
      prevSignificant = c;
    }
    i++;
  }
  return out.join("");
}

/**
 * Resolves an import specifier the way the *platform* will, since each alias is
 * resolved by a different one: `@/` by the browser's import map, `#…` by Node's
 * `imports` field. Returns null for bare npm specifiers.
 */
export function makeResolver(root, pkgImports = {}) {
  const publicDir = join(root, "public");
  const jsRoot = join(publicDir, "js");
  return function resolveSpec(spec, fromFile) {
    if (spec.startsWith("@/")) return join(jsRoot, spec.slice(2));
    if (spec.startsWith("#")) {
      for (const [key, val] of Object.entries(pkgImports)) {
        if (key.endsWith("*")) {
          const prefix = key.slice(0, -1);
          if (spec.startsWith(prefix)) return join(root, val.replace("*", spec.slice(prefix.length)));
        } else if (spec === key) {
          return join(root, val);
        }
      }
      return null;                                        // unmapped # specifier
    }
    if (spec.startsWith("/")) return join(publicDir, spec);
    if (spec.startsWith("./") || spec.startsWith("../")) return resolve(dirname(fromFile), spec);
    return null;                                          // bare -> node_modules
  };
}

/**
 * True only if the file exists *and* every path segment matches on-disk casing.
 * macOS is case-insensitive and Linux deployment is not, so `Utils.js` imported
 * as `utils.js` works locally and 404s in production.
 */
export function makeExistsExact(root) {
  const cache = new Map();
  return function existsExact(abs) {
    if (cache.has(abs)) return cache.get(abs);
    let ok = existsSync(abs);
    if (ok) {
      const rel = relative(root, abs);
      if (!rel.startsWith("..")) {
        let cur = root;
        for (const seg of rel.split(sep)) {
          let names;
          try { names = readdirSync(cur); } catch { ok = false; break; }
          if (!names.includes(seg)) { ok = false; break; }
          cur = join(cur, seg);
        }
      }
    }
    cache.set(abs, ok);
    return ok;
  };
}

/** Every name a module exports, following `export * from` chains. */
export function makeExportCollector(resolveSpec) {
  const cache = new Map();
  return function collectExports(abs, seen = new Set()) {
    if (cache.has(abs)) return cache.get(abs);
    if (seen.has(abs)) return new Set();
    seen.add(abs);

    const names = new Set();
    let src;
    try { src = readFileSync(abs, "utf8"); } catch { return names; }

    for (const m of src.matchAll(/^\s*export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      names.add(m[1]);
    }
    if (/^\s*export\s+default\b/m.test(src)) names.add("default");
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const raw of m[1].split(",")) {
        const part = raw.trim();
        if (!part) continue;
        const as = part.split(/\s+as\s+/);
        names.add((as[1] || as[0]).trim());
      }
    }
    for (const m of src.matchAll(/export\s*\*\s*from\s*["']([^"']+)["']/g)) {
      const target = resolveSpec(m[1], abs);
      if (target) for (const n of collectExports(target, seen)) names.add(n);
    }
    for (const m of src.matchAll(/export\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*["'][^"']+["']/g)) {
      names.add(m[1]);
    }

    cache.set(abs, names);
    return names;
  };
}

/** The names bound inside an import clause (`{ a, b as c }`, `* as ns`, default). */
export function importedNames(clause) {
  const names = [];
  const named = clause.match(/\{([\s\S]*)\}/);
  if (named) {
    for (const raw of named[1].split(",")) {
      const part = raw.trim();
      if (!part) continue;
      const as = part.split(/\s+as\s+/);
      names.push((as[1] || as[0]).trim());
    }
  }
  const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
  if (ns) names.push(ns[1]);
  const def = clause.replace(/\{[\s\S]*\}/, "").replace(/\*\s+as\s+[A-Za-z_$][\w$]*/, "").split(",")[0].trim();
  if (/^[A-Za-z_$][\w$]*$/.test(def)) names.push(def);
  return names;
}
