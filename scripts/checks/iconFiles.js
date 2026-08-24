/* ============================================================
   iconFiles — `public/icons/svg/` must still match the sprite

   The loose per-icon files are generated (`npm run icons`), and generated
   files rot the moment someone edits one by hand or adds a symbol without
   re-running the generator. This check regenerates them in memory and
   compares bytes, so the derived folder can never quietly disagree with the
   sprite it claims to mirror.

   It also asserts the parse found every symbol. The first version of the
   parser returned 33 of 34 — the sprite's header comment contains the literal
   text "<symbol>", which matched the tag regex and swallowed the first icon.
   A generator that silently skips an icon is worse than no generator, so the
   count is checked against a raw id scan rather than trusted.
   ============================================================ */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseSprite, fileFor, SPRITE_REL, OUT_REL } from "../iconSprite.js";

export const name = "iconFiles";
export const summary = "icons/svg/ out of sync with the sprite";

export function run(ctx) {
  const { publicDir } = ctx;
  const failures = [];

  if (!existsSync(join(publicDir, SPRITE_REL))) return { failures: [], detail: "no sprite" };

  const raw = readFileSync(join(publicDir, SPRITE_REL), "utf8");
  const rawIds = [...raw.matchAll(/<symbol\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  const symbols = parseSprite(publicDir);

  if (symbols.length !== rawIds.length) {
    failures.push(
      `${SPRITE_REL}: parsed ${symbols.length} symbols but ${rawIds.length} ids are present `
      + `— the parser is skipping one, do not trust the generated folder`,
    );
  }

  const outDir = join(publicDir, OUT_REL);
  if (!existsSync(outDir)) {
    return { failures: [`${OUT_REL}/ is missing — run \`npm run icons\``], detail: "" };
  }

  const onDisk = new Set(readdirSync(outDir).filter((f) => f.endsWith(".svg")));
  for (const sym of symbols) {
    const file = `${sym.id}.svg`;
    onDisk.delete(file);
    const path = join(outDir, file);
    if (!existsSync(path)) {
      failures.push(`${OUT_REL}/${file} is missing — run \`npm run icons\``);
      continue;
    }
    if (readFileSync(path, "utf8") !== fileFor(sym)) {
      failures.push(`${OUT_REL}/${file} does not match the sprite — run \`npm run icons\``);
    }
  }
  for (const orphan of onDisk) {
    failures.push(`${OUT_REL}/${orphan} has no symbol in the sprite — run \`npm run icons\``);
  }

  return { failures, detail: `${symbols.length} generated files match ${SPRITE_REL}` };
}
