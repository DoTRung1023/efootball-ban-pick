/* ============================================================
   cycles — import cycles in the module graph

   The graph is acyclic on purpose: that is what the `cb` callback registries in
   `pages/home/callbacks.js` and `features/draft/callbacks.js` exist for. Nothing
   enforced it, and with ESM a cycle does not throw — it hands one side a
   temporal-dead-zone binding, so the failure surfaces as an undefined value far
   from its cause.
   ============================================================ */

import { readFileSync } from "node:fs";
import { relPath, stripSource } from "./lib.js";

export const name = "cycles";
export const summary = "import cycles";

export function run(ctx) {
  const { root, jsFiles, resolveSpec } = ctx;
  const failures = [];
  const known = new Set(jsFiles);

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

  const cycles = [];
  const state = new Map();                     // 0 = visiting, 1 = done
  function visit(node, stack) {
    if (state.get(node) === 1) return;
    if (state.get(node) === 0) {
      const at = stack.indexOf(node);
      if (at >= 0) cycles.push([...stack.slice(at), node]);
      return;
    }
    state.set(node, 0);
    stack.push(node);
    for (const dep of graph.get(node) || []) visit(dep, stack);
    stack.pop();
    state.set(node, 1);
  }
  for (const file of jsFiles) visit(file, []);

  const seen = new Set();
  for (const cycle of cycles) {
    const key = [...cycle].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    failures.push(cycle.map((f) => relPath(root, f)).join(" -> "));
  }

  return { failures, detail: `${jsFiles.length} modules` };
}
