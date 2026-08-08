/* ============================================================
   dom-ids — getElementById for an id no page provides

   With no bundler and no types, `document.getElementById("oldName")` returns
   null and the feature simply does nothing. Every wiring bug left behind by a
   markup rename looks exactly like this.

   An id counts as provided if the static HTML of a page that loads the module
   declares it, OR if a module that page loads creates it at runtime — dropdown
   panels are built with `panel.id = …` or a `panelId:` passed to the builder,
   and empty states come out of template strings. Ignoring those made seven live
   elements look dangling.
   ============================================================ */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { relPath, stripSource } from "./lib.js";

export const name = "dom-ids";
export const summary = "element lookups with no matching id";

export function run(ctx) {
  const { root, publicDir, jsFiles, resolveSpec } = ctx;
  const failures = [];
  const known = new Set(jsFiles);

  const pages = {};
  for (const html of readdirSync(publicDir).filter((f) => f.endsWith(".html"))) {
    const src = readFileSync(join(publicDir, html), "utf8");
    pages[html] = {
      ids: new Set([...src.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1])),
      entry: (src.match(/<script[^>]*type=["']module["'][^>]*src=["'](\/js\/[^"']+)["']/) || [])[1],
    };
  }

  // which pages load each module, following the graph from each page's entry
  const graph = new Map();
  for (const file of jsFiles) {
    const src = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
    const deps = new Set();
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g)) {
      const target = resolveSpec(m[1], file);
      if (target && known.has(target)) deps.add(target);
    }
    graph.set(file, [...deps]);
  }

  const pageOf = new Map();
  for (const [page, info] of Object.entries(pages)) {
    if (!info.entry) continue;
    const stack = [join(publicDir, info.entry)];
    const seen = new Set();
    while (stack.length) {
      const file = stack.pop();
      if (seen.has(file)) continue;
      seen.add(file);
      if (!pageOf.has(file)) pageOf.set(file, new Set());
      pageOf.get(file).add(page);
      for (const dep of graph.get(file) || []) stack.push(dep);
    }
  }

  // ids the modules themselves create
  const madeBy = new Map();
  for (const file of jsFiles) {
    const raw = readFileSync(file, "utf8");
    const made = new Set();
    for (const m of raw.matchAll(/\bid=["'`]([A-Za-z][\w-]*)["'`]/g)) made.add(m[1]);
    for (const m of raw.matchAll(/\.id\s*=\s*["'`]([A-Za-z][\w-]*)["'`]/g)) made.add(m[1]);
    for (const m of raw.matchAll(/\bpanelId\s*:\s*["'`]([A-Za-z][\w-]*)["'`]/g)) made.add(m[1]);
    if (made.size) madeBy.set(file, made);
  }
  const runtimeIds = {};
  for (const page of Object.keys(pages)) {
    const ids = new Set();
    for (const [file, made] of madeBy) {
      if (pageOf.get(file)?.has(page)) for (const id of made) ids.add(id);
    }
    runtimeIds[page] = ids;
  }

  let lookups = 0;
  for (const file of jsFiles) {
    const owners = pageOf.get(file);
    if (!owners) continue;                       // server-side or not page-reachable
    const src = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
    const wanted = new Set();
    for (const m of src.matchAll(/getElementById\(\s*["']([^"'`]+)["']\s*\)/g)) wanted.add(m[1]);
    for (const m of src.matchAll(/querySelector(?:All)?\(\s*["']#([A-Za-z][\w-]*)["']\s*\)/g)) wanted.add(m[1]);

    for (const id of wanted) {
      lookups++;
      const provided = [...owners].some((p) => pages[p].ids.has(id) || runtimeIds[p].has(id));
      if (!provided) {
        failures.push(`${relPath(root, file)}: #${id} is never provided by ${[...owners].join(", ")}`);
      }
    }
  }

  return { failures, detail: `${lookups} lookups across ${Object.keys(pages).length} pages` };
}
