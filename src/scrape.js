/**
 * npm run scrape
 *
 * ── First run  ──────────────────────────────────────────────────────────────
 *   Full scrape: fetches all ~41 k players sorted by overall_rating.
 *   Saves the highest pesdb_id seen as the cutoff for the next run.
 *
 * ── Subsequent runs ─────────────────────────────────────────────────────────
 *   Incremental scrape: sorts by id DESC (newest first) and stops as soon as
 *   it reaches players already in the DB (pesdb_id ≤ last cutoff).
 *   Much faster — typically finishes in seconds when only a few cards are new.
 *
 * ── Resume support ──────────────────────────────────────────────────────────
 *   .scrape-state.json is written after every DB flush.
 *   If the run is interrupted just re-run `npm run scrape` to continue.
 *
 * pesdb.net table columns (0-indexed, no <thead>):
 *   0: position | 1: name (link ?id=…) | 2: club | 3: nationality
 *   4: height   | 5: weight            | 6: age  | 7: overall_rating
 */

import "dotenv/config";
import * as cheerio from "cheerio";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import db from "./db.js";

const BASE       = "https://pesdb.net/efootball/";
const STATE_FILE = new URL("../.scrape-state.json", import.meta.url).pathname;
const PAGE_DELAY = 1000;   // ms between page fetches (2 s — be respectful)
const RETRY_MAX  = 4;
const FLUSH_EVERY = 200;   // upsert to DB every N players
const BATCH_SIZE  = 500;   // rows per INSERT

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "KHTML, like Gecko Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ─── State helpers ───────────────────────────────────────────────────────────

function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); }
  catch { return null; }
}

function saveState(s) {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

function clearState() {
  if (existsSync(STATE_FILE)) writeFileSync(STATE_FILE, "{}");
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHTML(url, attempt = 1) {
  const res = await fetch(url, { headers: HEADERS });

  if (res.status === 429) {
    const wait = Math.min(attempt * 15_000, 60_000);
    process.stdout.write(`\n  ⚠ 429 – waiting ${wait / 1000}s…\n`);
    await sleep(wait);
    if (attempt < RETRY_MAX) return fetchHTML(url, attempt + 1);
    throw new Error("Rate-limited after max retries. Run again in a few minutes.");
  }

  if (!res.ok) {
    if (attempt < RETRY_MAX) { await sleep(attempt * 2000); return fetchHTML(url, attempt + 1); }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  return res.text();
}

function pageURL(page, sortByID = false) {
  const sort = sortByID ? "id" : "overall_rating";
  return `${BASE}?sort=${sort}&order=0&all=1&page=${page}`;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

function parsePlayers(html) {
  const $ = cheerio.load(html);
  const players = [];

  $("table tbody tr").each((_, row) => {
    const $row = $(row);
    const cells = $row.find("td");
    if (cells.length < 8) return;

    const anchor = $row.find("a[href*='id=']").first();
    if (!anchor.length) return;

    const href = anchor.attr("href") ?? "";
    const m = href.match(/[?&]id=(\d+)/);
    if (!m) return;

    const num = (i) => { const v = parseInt(cells.eq(i).text().trim(), 10); return Number.isFinite(v) ? v : null; };
    const str = (i) => cells.eq(i).text().trim() || null;

    players.push({
      pesdb_id:    m[1],
      name:        anchor.text().trim(),
      position:    str(0),
      club:        str(2),
      nationality: str(3),
      height:      num(4),
      weight:      num(5),
      age:         num(6),
      overall:     num(7),
    });
  });

  return players;
}

function detectTotal(html) {
  const m = html.match(/(\d[\d,]+)\s*players?/i);
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function upsertPlayers(players) {
  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const rows = players.slice(i, i + BATCH_SIZE).map((p) => [
      p.pesdb_id, p.name, p.position, p.club,
      p.nationality, p.height, p.weight, p.age, p.overall,
    ]);
    await db.query(
      `INSERT INTO players_catalog
         (pesdb_id, name, position, club, nationality, height, weight, age, overall)
       VALUES ?
       ON DUPLICATE KEY UPDATE
         name        = VALUES(name),
         position    = VALUES(position),
         club        = VALUES(club),
         nationality = VALUES(nationality),
         height      = VALUES(height),
         weight      = VALUES(weight),
         age         = VALUES(age),
         overall     = VALUES(overall),
         updated_at  = CURRENT_TIMESTAMP`,
      [rows],
    );
  }
}

async function getLastLog() {
  const [rows] = await db.query(
    `SELECT max_pesdb_id, finished_at
     FROM scrape_logs
     WHERE finished_at IS NOT NULL
     ORDER BY id DESC
     LIMIT 1`,
  );
  return rows[0] ?? null;
}

async function startLog(type) {
  const [result] = await db.query(
    "INSERT INTO scrape_logs (scrape_type) VALUES (?)",
    [type],
  );
  return result.insertId;
}

async function finishLog(id, upserted, maxId) {
  await db.query(
    `UPDATE scrape_logs
     SET finished_at = CURRENT_TIMESTAMP,
         players_upserted = ?,
         max_pesdb_id = ?
     WHERE id = ?`,
    [upserted, maxId.toString(), id],
  );
}

// ─── Progress bar ────────────────────────────────────────────────────────────

function bar(done, total, width = 28) {
  const pct = total > 0 ? Math.min(done / total, 1) : 0;
  const f = Math.round(pct * width);
  return `[${"█".repeat(f)}${"░".repeat(width - f)}] ${done.toLocaleString()}/${(total ?? "?").toLocaleString()}`;
}

// ─── Full scrape ─────────────────────────────────────────────────────────────

async function runFull(logId, resumeState) {
  console.log("📦 Mode: FULL  (first run — fetching all players)");

  const firstHTML = await fetchHTML(pageURL(1));
  const total = detectTotal(firstHTML);
  const estPages = total ? Math.ceil(total / 35) : 1300;
  console.log(`   ${total?.toLocaleString() ?? "?"} players · ~${estPages} pages\n`);

  let buffer = [];
  let totalUpserted = resumeState?.totalUpserted ?? 0;
  let maxId = BigInt(resumeState?.maxId ?? "0");
  let nextPage = resumeState?.nextPage ?? 1;

  if (nextPage === 1) {
    const players = parsePlayers(firstHTML);
    buffer.push(...players);
    nextPage = 2;
  }

  let emptyStreak = 0;
  const startTime = Date.now();

  while (emptyStreak < 3) {
    const html = await fetchHTML(pageURL(nextPage));
    const players = parsePlayers(html);

    if (players.length === 0) { emptyStreak++; }
    else {
      emptyStreak = 0;
      for (const p of players) {
        const id = BigInt(p.pesdb_id);
        if (id > maxId) maxId = id;
      }
      buffer.push(...players);
    }

    nextPage++;

    if (buffer.length >= FLUSH_EVERY) {
      await upsertPlayers(buffer);
      totalUpserted += buffer.length;
      buffer = [];
      saveState({ mode: "full", nextPage, totalUpserted, maxId: maxId.toString(), logId });
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(
      `\r  ${bar(totalUpserted + buffer.length, total)}  page ${nextPage - 1}  ${elapsed}s`,
    );

    await sleep(PAGE_DELAY);
  }

  if (buffer.length > 0) {
    for (const p of buffer) { const id = BigInt(p.pesdb_id); if (id > maxId) maxId = id; }
    await upsertPlayers(buffer);
    totalUpserted += buffer.length;
  }

  process.stdout.write("\n");
  return { totalUpserted, maxId };
}

// ─── Incremental scrape ──────────────────────────────────────────────────────

async function runIncremental(logId, cutoffId) {
  console.log(`📬 Mode: INCREMENTAL  (new players since ${new Date().toISOString().slice(0, 10)})`);
  console.log(`   Cutoff pesdb_id: ${cutoffId.toLocaleString()}\n`);

  let buffer = [];
  let totalUpserted = 0;
  let maxId = cutoffId;
  let page = 1;
  const startTime = Date.now();

  while (true) {
    const html = await fetchHTML(pageURL(page, true)); // sort=id
    const players = parsePlayers(html);

    if (players.length === 0) break;

    // Only keep players newer than cutoff
    const newPlayers = players.filter((p) => BigInt(p.pesdb_id) > cutoffId);

    for (const p of newPlayers) {
      const id = BigInt(p.pesdb_id);
      if (id > maxId) maxId = id;
    }

    buffer.push(...newPlayers);

    const minPageId = BigInt(players[players.length - 1].pesdb_id);
    const allOld = players.every((p) => BigInt(p.pesdb_id) <= cutoffId);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(
      `\r  Found ${(totalUpserted + buffer.length).toLocaleString()} new players  page ${page}  ${elapsed}s`,
    );

    // Stop once we've passed the cutoff
    if (allOld || minPageId <= cutoffId) break;

    if (buffer.length >= FLUSH_EVERY) {
      await upsertPlayers(buffer);
      totalUpserted += buffer.length;
      buffer = [];
    }

    page++;
    await sleep(PAGE_DELAY);
  }

  if (buffer.length > 0) {
    await upsertPlayers(buffer);
    totalUpserted += buffer.length;
  }

  process.stdout.write("\n");
  return { totalUpserted, maxId };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const runStart = Date.now();

  // ── Check for in-progress resume state first ──
  const savedState = loadState();
  if (savedState?.logId && savedState?.mode) {
    console.log(`▶ Resuming interrupted ${savedState.mode} scrape (page ${savedState.nextPage})…`);
  }

  // ── Decide full vs incremental ──
  const lastLog = await getLastLog();

  let mode, cutoffId;

  if (!lastLog?.max_pesdb_id) {
    mode = "full";
  } else {
    mode = "incremental";
    cutoffId = BigInt(lastLog.max_pesdb_id);
    const when = new Date(lastLog.finished_at).toLocaleString();
    console.log(`   Last scrape: ${when}`);
  }

  // Use saved state's logId if resuming, otherwise start a fresh log entry
  const logId = savedState?.logId ?? (await startLog(mode));

  let result;
  if (mode === "full") {
    result = await runFull(logId, savedState?.mode === "full" ? savedState : null);
  } else {
    result = await runIncremental(logId, cutoffId);
  }

  // ── Finalise ──
  await finishLog(logId, result.totalUpserted, result.maxId);
  clearState();

  const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
  const label = mode === "incremental" && result.totalUpserted === 0
    ? "No new players found."
    : `${result.totalUpserted.toLocaleString()} players upserted.`;

  console.log(`\n✅ Done!  ${label}  (${elapsed}s)`);

  // ── Show recent log history ──
  const [logs] = await db.query(
    `SELECT id, scrape_type, started_at, finished_at,
            players_upserted, max_pesdb_id
     FROM scrape_logs
     ORDER BY id DESC
     LIMIT 5`,
  );
  console.log("\n── Scrape log (last 5 runs) ──────────────────────────────");
  console.table(logs.map((r) => ({
    id:       r.id,
    type:     r.scrape_type,
    started:  r.started_at?.toISOString().slice(0, 19).replace("T", " "),
    finished: r.finished_at?.toISOString().slice(0, 19).replace("T", " "),
    upserted: r.players_upserted?.toLocaleString() ?? "-",
  })));

  await db.end();
}

main().catch(async (err) => {
  console.error("\nFatal:", err.message);
  console.error("Run `npm run scrape` again to resume.");
  await db.end().catch(() => {});
  process.exit(1);
});
