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
import { importSpecifiers, relPath, stripSource } from "./lib.js";

export const name = "boundaries";
export const summary = "imports that cross a layer the wrong way";

/* The five layers, once. Each row carries both ways of naming the same place:
   where its files live on disk, and how another module addresses it. Writing
   the taxonomy twice (a `layerOf` ladder and a near-identical `targetOf` one)
   meant a sixth layer had to be added in two places with the `kind` strings
   kept in sync by hand.

   `seg` is the path segment holding the feature name, counted from the repo
   root for `dir` and from the specifier's own start for `spec`. */
const LAYERS = [
  { kind: "client-shared",  dir: "public/js/shared/",   spec: "@/shared/" },
  { kind: "client-page",    dir: "public/js/pages/",    spec: "@/pages/" },
  { kind: "client-feature", dir: "public/js/features/", spec: "@/features/", dirSeg: 3, specSeg: 2 },
  { kind: "server-lib",     dir: "src/lib/",            spec: "#lib/" },
  { kind: "server-feature", dir: "src/features/",       spec: "#features/", dirSeg: 2, specSeg: 1 },
];

/** Which layer a repo-relative path belongs to. */
function layerOf(rel) {
  const row = LAYERS.find((l) => rel.startsWith(l.dir));
  if (!row) return { kind: "other" };
  return { kind: row.kind, feature: row.dirSeg ? rel.split("/")[row.dirSeg] : undefined };
}

/** Which layer a specifier points at. Relative specifiers never leave a folder. */
function targetOf(spec) {
  const row = LAYERS.find((l) => spec.startsWith(l.spec));
  if (!row) return null;
  return { kind: row.kind, feature: row.specSeg ? spec.split("/")[row.specSeg] : undefined, spec };
}

export function run(ctx) {
  const { root, jsFiles } = ctx;
  const failures = [];
  let checked = 0;

  for (const file of jsFiles) {
    const rel = relPath(root, file);
    const from = layerOf(rel);
    if (from.kind === "other") continue;
    /* Stripped, so a specifier named in a comment is not read as a real
       dependency. This used to scan raw source. */
    const src = stripSource(readFileSync(file, "utf8"), { keepStrings: true });

    for (const spec of importSpecifiers(src)) {
      const to = targetOf(spec);
      if (!to) continue;
      checked++;

      // 1 + 2 — a base layer reaching up into what is built on it
      if (from.kind === "client-shared" && (to.kind === "client-feature" || to.kind === "client-page")) {
        failures.push(`${rel}: shared/ imports ${spec} — a shared helper may not depend on a feature or a page`);
      }
      if (from.kind === "server-lib" && to.kind === "server-feature") {
        failures.push(`${rel}: lib/ imports ${spec} — lib sits underneath the features, not beside them`);
      }

      // 3 — sideways on the client
      if (from.kind === "client-feature" && to.kind === "client-feature" && to.feature !== from.feature) {
        failures.push(
          `${rel}: imports ${spec} — features/${from.feature} may not reach into features/${to.feature}; `
          + `move the shared part to public/js/shared/`,
        );
      }

      // 4 — sideways on the server, but only through the front door
      if (from.kind === "server-feature" && to.kind === "server-feature" && to.feature !== from.feature) {
        if (!/^#features\/[^/]+\/index\.js$/.test(to.spec)) {
          failures.push(
            `${rel}: imports ${spec} — reach another feature through its barrel `
            + `(#features/${to.feature}/index.js), not a file inside it`,
          );
        }
      }
    }
  }

  return { failures, detail: `${checked} cross-folder imports across ${jsFiles.length} modules` };
}
