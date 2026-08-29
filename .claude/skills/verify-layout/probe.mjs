#!/usr/bin/env node
/* ============================================================
   probe — measure a real page at exact viewport widths

     node .claude/skills/verify-layout/probe.mjs --path /players --signin me@example.com:secret

   `--user` only seeds the account menu's nameplate. Anything the server answers
   needs `--signin`, because identity is an httpOnly cookie now — see auth.md.
     node .claude/skills/verify-layout/probe.mjs --path /room/ABC234 --anon anon-harness-host \
          --w 320,390,620,900,1440 --cta "#confirmPicksBtn"

   Serves the harness from `public/__probe.html` (same origin, so identity can be
   seeded and the iframe read), drives headless Chrome once per width, and deletes
   the harness afterwards. Exit 1 if any width fails.
   ============================================================ */

import { copyFileSync, rmSync, existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const PROBE_SRC = join(HERE, "probe.html");
const PROBE_DST = join(ROOT, "public", "__probe.html");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const BASE   = opt("base", "http://localhost:3000").replace(/\/$/, "");
const PATH   = opt("path", "/players");
const WIDTHS = opt("w", "320,390,768,1440").split(",").map((n) => Number(n.trim())).filter(Boolean);
const HEIGHT = Number(opt("h", 844));
const SETTLE = Number(opt("settle", 1500));
const USER   = opt("user", null);     // efb_user id, or a full JSON object — display only
const SIGNIN = opt("signin", null);   // "username:password" — what actually authenticates
const ANON   = opt("anon", null);     // efb_visitor cookie, for an unauthenticated room seat
const SCROLL = opt("scroll", null);
const CTA    = opt("cta", null);
const SEL    = opt("sel", null);      // pipe-separated selectors
const VAR    = opt("var", null);
const VAR_ON = opt("var-on", null);

if (!existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME}`);
  process.exit(2);
}

function hashFor(w) {
  const p = new URLSearchParams();
  p.set("path", PATH);
  p.set("w", String(w));
  p.set("h", String(HEIGHT));
  p.set("settle", String(SETTLE));
  if (USER) {
    const val = USER.trim().startsWith("{") ? USER : JSON.stringify({ id: Number(USER) || USER, username: "probe" });
    p.set("user", encodeURIComponent(val));
  }
  if (ANON)   p.set("anon", ANON);
  if (SIGNIN) p.set("signin", encodeURIComponent(SIGNIN));
  if (SCROLL) p.set("scroll", SCROLL);
  if (CTA)    p.set("cta", CTA);
  if (SEL)    p.set("sel", encodeURIComponent(SEL));
  if (VAR)    p.set("var", VAR);
  if (VAR_ON) p.set("varOn", encodeURIComponent(VAR_ON));
  return p.toString();
}

function runWidth(w) {
  /* A fresh profile per run: a stale SingletonLock makes Chrome exit 21 silently,
     and orphaned renderers from earlier runs stop timers advancing in new pages. */
  const profile = mkdtempSync(join(tmpdir(), "probe-prof-"));
  try {
    const dom = execFileSync(CHROME, [
      "--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
      `--user-data-dir=${profile}`,
      "--window-size=1800,1200",
      `--virtual-time-budget=${SETTLE + 6000}`,
      "--dump-dom",
      `${BASE}/__probe.html#${hashFor(w)}`,
    ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });

    const m = dom.match(/PROBE_B64_START([A-Za-z0-9+/=]+)PROBE_B64_END/);
    if (!m) return { fail: ["probe produced no output — page never ran (server down? path 404?)"], warn: [], info: {}, viewport: { asked: w } };
    return JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));
  } catch (err) {
    return { fail: [`chrome failed: ${err.message.split("\n")[0]}`], warn: [], info: {}, viewport: { asked: w } };
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

let failed = 0;
copyFileSync(PROBE_SRC, PROBE_DST);
try {
  console.log(`\n▶ ${PATH} @ ${WIDTHS.join(", ")} px  (${BASE})\n`);
  for (const w of WIDTHS) {
    const r = runWidth(w);
    const bad = r.fail?.length > 0;
    if (bad) failed++;
    console.log(`${bad ? "FAIL" : "ok  "}  ${String(w).padStart(4)}px  viewport=${r.viewport?.actual ?? "?"}  tokens=${r.info?.tokenBg || "-"}`);
    for (const f of r.fail ?? [])  console.log(`        ✗ ${f}`);
    for (const o of r.info?.overflow ?? []) console.log(`          · ${o}`);
    for (const wn of r.warn ?? [])  console.log(`        ! ${wn}`);
    for (const s of r.info?.squeezed ?? []) console.log(`          · ${s}`);
    if (r.info?.scroll)  console.log(`        scroll: ${JSON.stringify(r.info.scroll)}`);
    if (r.info?.cta)     console.log(`        cta:    ${JSON.stringify(r.info.cta)}`);
    if (r.info?.rects)   console.log(`        rects:  ${JSON.stringify(r.info.rects)}`);
    if (r.info?.cssVar)  console.log(`        var:    ${JSON.stringify(r.info.cssVar)}`);
  }
  console.log(failed ? `\n${failed} of ${WIDTHS.length} widths failed\n` : `\nall ${WIDTHS.length} widths clean\n`);
} finally {
  rmSync(PROBE_DST, { force: true });   // never leave a page in the served directory
}
process.exit(failed ? 1 : 0);
