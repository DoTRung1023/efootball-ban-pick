#!/usr/bin/env node
/* ============================================================
   npm run check — the static gate that stands in for a build

   There is no bundler, no type checker and no test runner, so nothing between
   writing a module and loading it in a browser will tell you that an import is
   wrong, a symbol is unbound, or an element id no longer exists. Each check in
   `scripts/checks/` closes one of those gaps.

     npm run check                 run every check
     npm run check -- imports      run only the named check(s)
     npm run check -- --self-test  prove the checks can still fail

   `--self-test` is the important one. Every check here has, at some point,
   returned a confident false pass — a stripper that blanked live code, a
   harness that measured the wrong thing. It builds a tiny fixture project,
   asserts every check passes on it, then plants one defect at a time and
   asserts the matching check catches it. A green `npm run check` only means
   something if the checks are still capable of going red.
   ============================================================ */

import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

import { walkFiles, makeResolver, makeExistsExact, makeExportCollector } from "./checks/lib.js";
import * as imports from "./checks/imports.js";
import * as bindings from "./checks/bindings.js";
import * as unusedImports from "./checks/unusedImports.js";
import * as cycles from "./checks/cycles.js";
import * as domIds from "./checks/domIds.js";
import * as debugLeftovers from "./checks/debugLeftovers.js";
import * as deadCss from "./checks/deadCss.js";
import * as infoToggle from "./checks/infoToggle.js";
import * as icons from "./checks/icons.js";

const CHECKS = [imports, bindings, unusedImports, cycles, domIds, debugLeftovers, deadCss, infoToggle, icons];
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Everything the checks share, gathered once. */
function buildContext(root) {
  const publicDir = join(root, "public");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const resolveSpec = makeResolver(root, pkg.imports || {});
  const jsFiles = [...walkFiles(join(publicDir, "js")), ...walkFiles(join(root, "src"))]
    .filter((f) => f.endsWith(".js"));
  return {
    root,
    publicDir,
    pkg,
    jsFiles,
    resolveSpec,
    existsExact: makeExistsExact(root),
    collectExports: makeExportCollector(resolveSpec),
  };
}

function runChecks(root, only = []) {
  const ctx = buildContext(root);
  return CHECKS
    .filter((c) => !only.length || only.includes(c.name))
    .map((check) => ({ check, result: check.run(ctx) }));
}

/* ---------- normal run ---------- */

function report(root, only) {
  const runs = runChecks(root, only);
  if (!runs.length) {
    console.error(`no check matches ${only.join(", ")} — known: ${CHECKS.map((c) => c.name).join(", ")}`);
    return 2;
  }

  let failed = 0;
  for (const { check, result } of runs) {
    const label = check.name.padEnd(16);
    if (result.failures.length) {
      failed++;
      console.log(`FAIL  ${label}${result.failures.length} problem(s) — ${check.summary}`);
      for (const f of result.failures) console.log(`        ${f}`);
    } else {
      console.log(`ok    ${label}${result.detail}`);
    }
  }
  const plural = runs.length === 1 ? "check" : "checks";
  console.log(failed ? `\n${failed} of ${runs.length} ${plural} failed` : `\nall ${runs.length} ${plural} passed`);
  return failed ? 1 : 0;
}

/* ---------- self-test ---------- */

// A minimal but complete project: one page, an entry module, a feature, a
// shared helper, a backend module behind the `#lib/*` alias, and a stylesheet.
const FIXTURE = {
  "package.json": JSON.stringify({ type: "module", imports: { "#lib/*": "./src/lib/*" } }, null, 2),

  "public/home.html": `<!doctype html>
<html><head>
<script type="importmap">{"imports":{"@/":"/js/"}}</script>
<link rel="stylesheet" href="/css/app.css">
<script type="module" src="/js/pages/home.js"></script>
</head><body>
<div id="grid" class="thing-card"></div>
<svg width="14" height="14" viewBox="0 0 24 24"><use href="/icons/sprite.svg#plus" /></svg>
<a href="/about">about</a>
<div class="player-grid info-hidden"><div class="pc-footer"></div></div>
</body></html>`,

  "public/icons/sprite.svg":
    `<svg xmlns="http://www.w3.org/2000/svg">\n` +
    `  <symbol id="plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n` +
    `    <line x1="12" y1="5" x2="12" y2="19" />\n` +
    `    <line x1="5" y1="12" x2="19" y2="12" />\n` +
    `  </symbol>\n</svg>\n`,

  "public/css/app.css":
    `.thing-card { color: red; }\n` +
    `.player-grid.info-hidden .pc-footer { display: none; }\n`,

  "public/js/pages/home.js":
    `import { initThing } from '@/features/thing/thing.js';\ninitThing();\n`,

  "public/js/features/thing/thing.js":
    `import { helper } from '@/shared/helper.js';\n` +
    `export function initThing() {\n` +
    `  const el = document.getElementById("grid");\n` +
    `  return helper(el);\n` +
    `}\n`,

  "public/js/shared/helper.js": `export function helper(el) { return el; }\n`,

  "src/pages.js": `const PAGES = { "/": "home.html", "/about": "home.html" };\nexport default PAGES;\n`,

  "src/lib/db.js": `export function connect() { return null; }\n`,
  "src/server.js": `import { connect } from '#lib/db.js';\nconnect();\n`,
};

// One planted defect per check. `expect` names the check that must catch it.
const DEFECTS = [
  {
    expect: "info-toggle",
    what: "the info toggle resizing the card instead of just hiding the footer",
    file: "public/css/app.css",
    from: ".player-grid.info-hidden .pc-footer { display: none; }",
    to: ".player-grid.info-hidden .pc-footer { display: none; }\n"
      + ".player-grid:not(.info-hidden) { grid-template-columns: repeat(2, 1fr); }",
  },
  {
    expect: "imports",
    what: "an import whose casing does not match the file on disk",
    file: "public/js/features/thing/thing.js",
    from: "@/shared/helper.js",
    to: "@/shared/Helper.js",
  },
  {
    expect: "imports",
    what: "a link to a page URL the router does not serve",
    file: "public/home.html",
    from: '<a href="/about">about</a>',
    to: '<a href="/abuot">about</a>',
  },
  {
    expect: "bindings",
    what: "a symbol used after its import was removed",
    file: "public/js/features/thing/thing.js",
    from: "import { helper } from '@/shared/helper.js';\n",
    to: "",
  },
  {
    expect: "unused-imports",
    what: "an imported name nothing references",
    file: "public/js/features/thing/thing.js",
    from: "  return helper(el);",
    to: "  return el;",
  },
  {
    expect: "cycles",
    what: "two modules importing each other",
    file: "public/js/shared/helper.js",
    from: "export function helper(el) { return el; }",
    to: "import { initThing } from '@/features/thing/thing.js';\n" +
        "export function helper(el) { return initThing ? el : el; }",
  },
  {
    expect: "dom-ids",
    what: "a lookup for an id no page provides",
    file: "public/js/features/thing/thing.js",
    from: 'getElementById("grid")',
    to: 'getElementById("nope")',
  },
  {
    expect: "debug-leftovers",
    what: "a console.log left in client code",
    file: "public/js/features/thing/thing.js",
    from: "export function initThing() {",
    to: "export function initThing() {\n  console.log('here');",
  },
  {
    expect: "icons",
    what: "a <use> naming a symbol the sprite does not define",
    file: "public/home.html",
    from: 'sprite.svg#plus',
    to: 'sprite.svg#pluss',
  },
  {
    expect: "dead-css",
    what: "a class selector no markup matches",
    file: "public/css/app.css",
    from: ".thing-card { color: red; }",
    to: ".thing-card { color: red; }\n.orphan-panel { color: blue; }",
  },
];

function writeFixture(root, overrides = {}) {
  for (const [rel, content] of Object.entries({ ...FIXTURE, ...overrides })) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), "banpick-check-"));
  let bad = 0;
  try {
    writeFixture(root);
    const clean = runChecks(root);
    const noisy = clean.filter(({ result }) => result.failures.length);
    if (noisy.length) {
      bad++;
      console.log("FAIL  clean fixture should pass every check, but:");
      for (const { check, result } of noisy) {
        for (const f of result.failures) console.log(`        ${check.name}: ${f}`);
      }
    } else {
      console.log(`ok    clean fixture      all ${clean.length} checks pass on a project with no defects`);
    }

    for (const defect of DEFECTS) {
      const base = FIXTURE[defect.file];
      if (!base.includes(defect.from)) {
        bad++;
        console.log(`FAIL  ${defect.expect.padEnd(16)}fixture anchor missing: ${JSON.stringify(defect.from.slice(0, 40))}`);
        continue;
      }
      rmSync(root, { recursive: true, force: true });
      writeFixture(root, { [defect.file]: base.replace(defect.from, defect.to) });

      const caught = runChecks(root).find(({ check }) => check.name === defect.expect);
      if (caught?.result.failures.length) {
        console.log(`ok    ${defect.expect.padEnd(16)}caught ${defect.what}`);
      } else {
        bad++;
        console.log(`FAIL  ${defect.expect.padEnd(16)}did NOT catch ${defect.what}`);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  console.log(bad ? `\nself-test: ${bad} problem(s) — these checks cannot be trusted` : "\nself-test: every check still catches the defect it exists for");
  return bad ? 1 : 0;
}

/* ---------- entry ---------- */

const args = process.argv.slice(2);
process.exit(args.includes("--self-test")
  ? selfTest()
  : report(REPO_ROOT, args.filter((a) => !a.startsWith("--"))));
