#!/usr/bin/env node
/* ============================================================
   npm run icons — write `public/icons/svg/` from `public/icons/sprite.svg`

   One standalone file per symbol. Run it after adding, renaming or reshaping
   a symbol; `npm run check` fails if you forget. Never edit the output.
   ============================================================ */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSprite, fileFor, OUT_REL } from "./iconSprite.js";

const publicDir = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "public");
const outDir = join(publicDir, OUT_REL);

const symbols = parseSprite(publicDir);
mkdirSync(outDir, { recursive: true });

const want = new Set(symbols.map((s) => `${s.id}.svg`));
for (const stale of readdirSync(outDir).filter((f) => f.endsWith(".svg") && !want.has(f))) {
  rmSync(join(outDir, stale));
  console.log(`  removed  ${stale}`);
}

for (const sym of symbols) writeFileSync(join(outDir, `${sym.id}.svg`), fileFor(sym), "utf8");
console.log(`icons: wrote ${symbols.length} files to public/${OUT_REL}/`);
