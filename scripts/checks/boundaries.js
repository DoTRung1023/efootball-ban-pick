/* ============================================================
   boundaries — imports that cross a layer the wrong way

   `cycles` already catches two modules importing each other. This catches the
   thing that is not a cycle and is still wrong: a module reaching *up* the
   stack, or sideways into a neighbour's internals.

   The four rules below are not aspirations. Each one was true of every file in
   the repo the day it was written, so this check starts green and can only go
   red on a new mistake:

     1. `public/js/shared/` may not import a feature or a page.
        `shared/` is defined in CLAUDE.md as "helpers two or more features
        import today". The moment one reaches back into a feature it is not a
        helper any more, it is that feature's code sitting in the wrong folder
        — and every other page still pays to download it.

     2. `src/lib/` may not import a feature.
        Same shape on the server. `db.js`, `http.js`, `paths.js` and `cli.js`
        are underneath the features, not beside them.

     3. A client feature may not import another client feature.
        There is no barrel on the client (deliberately — with no bundler a
        barrel makes the browser fetch every module it re-exports), so a
        cross-feature import would have to reach a specific file, and that is
        exactly the coupling `shared/` exists to absorb. If two features need
        the same thing, it is a `shared/` module.

     4. A server feature may only import another feature through its barrel.
        `src/features/<name>/index.js` is the documented public surface. Deep
        paths make every internal file part of the contract, which is how a
        refactor of one feature turns into a diff across four.

   Why a check and not a paragraph: CLAUDE.md has said most of this since the
   restructure. A rule that fails the build is real; a rule in markdown is a
   wish.
   ============================================================ */

import { readFileSync } from "node:fs";
import { relPath } from "./lib.js";

export const name = "boundaries";
export const summary = "imports that cross a layer the wrong way";

const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;

/** Which layer a repo-relative path belongs to. */
function layerOf(rel) {
  if (rel.startsWith("public/js/shared/"))   return { kind: "client-shared" };
  if (rel.startsWith("public/js/pages/"))    return { kind: "client-page" };
  if (rel.startsWith("public/js/features/")) return { kind: "client-feature", feature: rel.split("/")[3] };
  if (rel.startsWith("src/lib/"))            return { kind: "server-lib" };
  if (rel.startsWith("src/features/"))       return { kind: "server-feature", feature: rel.split("/")[2] };
  return { kind: "other" };
}

/** Which layer a specifier points at. Relative specifiers never leave a folder. */
function targetOf(spec) {
  if (spec.startsWith("@/shared/"))   return { kind: "client-shared" };
  if (spec.startsWith("@/pages/"))    return { kind: "client-page" };
  if (spec.startsWith("@/features/")) return { kind: "client-feature", feature: spec.split("/")[2] };
  if (spec.startsWith("#lib/"))       return { kind: "server-lib" };
  if (spec.startsWith("#features/"))  return { kind: "server-feature", feature: spec.split("/")[1], spec };
  return null;
}

export function run(ctx) {
  const { root, jsFiles } = ctx;
  const failures = [];
  let checked = 0;

  for (const file of jsFiles) {
    const rel = relPath(root, file);
    const from = layerOf(rel);
    if (from.kind === "other") continue;
    const src = readFileSync(file, "utf8");

    for (const m of src.matchAll(IMPORT)) {
      const to = targetOf(m[1]);
      if (!to) continue;
      checked++;

      // 1 + 2 — a base layer reaching up into what is built on it
      if (from.kind === "client-shared" && (to.kind === "client-feature" || to.kind === "client-page")) {
        failures.push(`${rel}: shared/ imports ${m[1]} — a shared helper may not depend on a feature or a page`);
      }
      if (from.kind === "server-lib" && to.kind === "server-feature") {
        failures.push(`${rel}: lib/ imports ${m[1]} — lib sits underneath the features, not beside them`);
      }

      // 3 — sideways on the client
      if (from.kind === "client-feature" && to.kind === "client-feature" && to.feature !== from.feature) {
        failures.push(
          `${rel}: imports ${m[1]} — features/${from.feature} may not reach into features/${to.feature}; `
          + `move the shared part to public/js/shared/`,
        );
      }

      // 4 — sideways on the server, but only through the front door
      if (from.kind === "server-feature" && to.kind === "server-feature" && to.feature !== from.feature) {
        if (!/^#features\/[^/]+\/index\.js$/.test(to.spec)) {
          failures.push(
            `${rel}: imports ${m[1]} — reach another feature through its barrel `
            + `(#features/${to.feature}/index.js), not a file inside it`,
          );
        }
      }
    }
  }

  return { failures, detail: `${checked} cross-folder imports across ${jsFiles.length} modules` };
}
