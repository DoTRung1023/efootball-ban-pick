import "dotenv/config";
import db from "./db.js";
import {
  fetchHTML,
  parsePlayers,
  detectTotal,
  pageURL,
  enrichPlayer,
  pacePlayerRate,
  upsertPlayers,
} from "./scrape.js";

const PAGE_DELAY = 3000;
const FLUSH_EVERY = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bar(done, total, width = 28) {
  const pct = total > 0 ? Math.min(done / total, 1) : 0;
  const f = Math.round(pct * width);
  return `[${"█".repeat(f)}${"░".repeat(width - f)}] ${done.toLocaleString()}/${total.toLocaleString()}`;
}

async function fetchAllSiteIds() {
  const firstHTML = await fetchHTML(pageURL(1));
  const total = detectTotal(firstHTML);
  const estPages = total ? Math.ceil(total / 35) : 1300;

  console.log(`🌐 Scanning list pages…`);
  console.log(`   ${total?.toLocaleString() ?? "?"} players · ~${estPages} pages\n`);

  const ids = new Set();
  const addFromList = (list) => {
    for (const p of list) ids.add(p.pesdb_id);
  };

  addFromList(parsePlayers(firstHTML));

  for (let page = 2; page <= estPages; page++) {
    let html;
    try {
      html = await fetchHTML(pageURL(page));
    } catch (err) {
      console.error(`\n  ⚠ list fetch failed (page ${page}): ${err.message}`);
      await sleep(PAGE_DELAY);
      page--;
      continue;
    }

    const list = parsePlayers(html);
    if (list.length === 0) {
      console.error(`\n  ⚠ empty list page ${page}; retrying…`);
      await sleep(PAGE_DELAY);
      page--;
      continue;
    }

    addFromList(list);
    if (page % 25 === 0 || page === estPages) {
      process.stdout.write(`\r  ${bar(page, estPages)}  ids: ${ids.size.toLocaleString()}   `);
    }
    await sleep(PAGE_DELAY);
  }

  process.stdout.write("\n");
  return { ids, total, estPages };
}

async function fetchDbIds() {
  const [rows] = await db.query("SELECT pesdb_id FROM players_catalog");
  const ids = new Set(rows.map((r) => String(r.pesdb_id)));
  return ids;
}

async function main() {
  const startedAt = Date.now();

  const { ids: siteIds, total: siteTotal } = await fetchAllSiteIds();
  const dbIds = await fetchDbIds();

  const missing = [];
  for (const id of siteIds) if (!dbIds.has(id)) missing.push(id);

  console.log(`\n🔎 Diff`);
  console.log(`   Site ids: ${siteIds.size.toLocaleString()} (site says: ${siteTotal?.toLocaleString() ?? "?"})`);
  console.log(`   DB ids:   ${dbIds.size.toLocaleString()}`);
  console.log(`   Missing:  ${missing.length.toLocaleString()}\n`);

  if (missing.length === 0) {
    console.log("✅ Nothing to do.");
    await db.end();
    return;
  }

  let buffer = [];
  let done = 0;
  const startTime = Date.now();

  console.log("🩹 Enriching missing players…\n");

  for (const id of missing) {
    await pacePlayerRate();

    let enriched = null;
    try {
      enriched = await enrichPlayer(id);
    } catch (err) {
      console.error(`\n  ⚠ detail fetch failed (id ${id}): ${err.message}`);
      enriched = null;
    }

    if (enriched) buffer.push(enriched);
    done++;

    if (buffer.length >= FLUSH_EVERY) {
      await upsertPlayers(buffer);
      buffer = [];
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(`\r  ${bar(done, missing.length)}  ${elapsed}s   `);
  }

  if (buffer.length > 0) await upsertPlayers(buffer);

  process.stdout.write("\n");
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n✅ Done!  Missing players processed: ${missing.length.toLocaleString()}  (${elapsed}s)`);

  await db.end();
}

main().catch(async (err) => {
  console.error("\nFatal:", err.message);
  await db.end().catch(() => {});
  process.exit(1);
});

