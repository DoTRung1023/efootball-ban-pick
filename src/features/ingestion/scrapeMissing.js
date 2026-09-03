import "dotenv/config";
import db from "#lib/db.js";
import { isMainModule } from "#lib/cli.js";
import {
  fetchHTML,
  parsePlayers,
  detectTotal,
  pageURL,
  enrichBatch,
  upsertPlayers,
  backupCatalog,
  startLog,
  finishLog,
  failLog,
} from "./scrape.js";
import { ensureScrapeLogSchema } from "./schema.js";

const PAGE_DELAY         = 1500;
const FLUSH_EVERY        = 50;
const CONCURRENCY        = 4;
const EMPTY_PAGE_RETRIES = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bar(done, total, width = 28) {
  const pct = total > 0 ? Math.min(done / total, 1) : 0;
  const f   = Math.round(pct * width);
  return `[${"█".repeat(f)}${"░".repeat(width - f)}] ${done.toLocaleString()}/${total.toLocaleString()}`;
}

async function fetchAllSiteIds() {
  const firstHTML = await fetchHTML(pageURL(1));
  const total     = detectTotal(firstHTML);
  const estPages  = total ? Math.ceil(total / 35) : 1300;

  console.log(`SCAN  Scanning list pages…`);
  console.log(`   ${total?.toLocaleString() ?? "?"} players · ~${estPages} pages\n`);

  const ids = new Set();
  for (const p of parsePlayers(firstHTML)) ids.add(p.pesdb_id);

  for (let page = 2; page <= estPages; page++) {
    let html;
    try {
      html = await fetchHTML(pageURL(page));
    } catch (err) {
      // fetchHTML already retried internally (RETRY_MAX times) — skip this page.
      console.error(`\n  WARN  list fetch failed (page ${page}): ${err.message}`);
      await sleep(PAGE_DELAY);
      continue;
    }

    let list = parsePlayers(html);
    if (list.length === 0) {
      let recovered = false;
      for (let attempt = 1; attempt <= EMPTY_PAGE_RETRIES; attempt++) {
        process.stdout.write(`\n  WARN  empty page ${page} – retry ${attempt}/${EMPTY_PAGE_RETRIES}…\n`);
        await sleep(PAGE_DELAY * attempt);
        try {
          list = parsePlayers(await fetchHTML(pageURL(page)));
          if (list.length > 0) { recovered = true; break; }
        } catch (err) {
          console.error(`  WARN  fetch error on retry ${attempt}: ${err.message}`);
        }
      }
      if (!recovered) {
        console.error(`\n  WARN  giving up on page ${page}; continuing…`);
        continue;
      }
    }

    for (const p of list) ids.add(p.pesdb_id);
    if (page % 25 === 0 || page === estPages) {
      process.stdout.write(`\r  ${bar(page, estPages)}  ids: ${ids.size.toLocaleString()}   `);
    }
    await sleep(PAGE_DELAY);
  }

  process.stdout.write("\n");
  return { ids, total };
}

async function fetchDbIds() {
  const [rows] = await db.query("SELECT pesdb_id FROM players_catalog");
  return new Set(rows.map((r) => String(r.pesdb_id)));
}

/** The row this process opened, for the fatal handler at the bottom. */
let runningLogId = null;

async function main() {
  const startedAt = Date.now();

  /* Logged like a full or incremental run, so the console's scrape history
     shows every run rather than all but this one. The type is its own
     ('missing') because a gap-repair run must never be read as the cutoff for
     the next incremental — see getLastLog in scrape.js. */
  await ensureScrapeLogSchema();
  const logId = await startLog("missing");
  runningLogId = logId;

  await backupCatalog();

  const { ids: siteIds, total: siteTotal } = await fetchAllSiteIds();
  const dbIds = await fetchDbIds();

  const missing = [];
  for (const id of siteIds) if (!dbIds.has(id)) missing.push(id);

  console.log(`\nDIFF  Diff`);
  console.log(`   Site ids: ${siteIds.size.toLocaleString()} (site says: ${siteTotal?.toLocaleString() ?? "?"})`);
  console.log(`   DB ids:   ${dbIds.size.toLocaleString()}`);
  console.log(`   Missing:  ${missing.length.toLocaleString()}\n`);

  if (missing.length === 0) {
    console.log("DONE  Nothing to do.");
    /* Finished with zero upserted, not left dangling: "ran, found no gaps" is
       a result worth seeing in the history, and an unfinished row reads as a
       run that crashed. */
    await finishLog(logId, 0, null);
    await db.end();
    return;
  }

  let buffer    = [];
  let done      = 0;
  let upserted  = 0;
  const startTime = Date.now();

  console.log("FILL  Enriching missing players…\n");

  for (let bi = 0; bi < missing.length; bi += CONCURRENCY) {
    const batch   = missing.slice(bi, bi + CONCURRENCY).map((id) => ({ pesdb_id: id }));
    const results = await enrichBatch(batch);

    for (const enriched of results) {
      if (enriched) buffer.push(enriched);
    }
    done += batch.length;

    if (buffer.length >= FLUSH_EVERY) {
      await upsertPlayers(buffer);
      upserted += buffer.length;
      buffer = [];
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(`\r  ${bar(done, missing.length)}  ${elapsed}s   `);
  }

  if (buffer.length > 0) {
    await upsertPlayers(buffer);
    upserted += buffer.length;
  }

  /* null cutoff on purpose: this run filled holes below the high-water mark
     and did not raise it. */
  await finishLog(logId, upserted, null);

  process.stdout.write("\n");
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nDONE  Missing players processed: ${missing.length.toLocaleString()}, upserted: ${upserted.toLocaleString()}  (${elapsed}s)`);

  await db.end();
}

if (isMainModule(import.meta.url)) {
  main().catch(async (err) => {
    console.error("\nFatal:", err.message);
    await failLog(runningLogId);
    await db.end().catch(() => {});
    process.exit(1);
  });
}
