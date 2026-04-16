/**
 * npm run scrape
 *
 * ── First run  ──────────────────────────────────────────────────────────────
 *   Full scrape: walks list pages sorted by overall_rating (~41 k rows), then
 *   fetches each player detail (?id=) for Dream Team stats (overall_max, card
 *   label, region, foot, playing style). Saves the highest pesdb_id seen as the
 *   cutoff for the next run.
 *
 * ── Subsequent runs ─────────────────────────────────────────────────────────
 *   Incremental scrape: list sorted by id DESC (newest first); enriches each new
 *   card and stops once the list page is entirely at or below the cutoff.
 *
 * ── Resume support ──────────────────────────────────────────────────────────
 *   .scrape-state.json is updated after each player row (so an interrupt can
 *   resume mid-page). Re-run `npm run scrape` to continue.
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

// NOTE: Uncomment to limit the rate of detail fetches.
/** Max detail fetches per second (spaces each `enrichPlayer` start). */
const MAX_PLAYERS_PER_SEC     = 1;
const MIN_MS_BETWEEN_PLAYERS  = 2000 / MAX_PLAYERS_PER_SEC;

/** ms between list-page HTTP requests (pagination). */
const PAGE_DELAY              = 3000;
/** ms between level-1 and max-level detail requests for the same player (usually 0). */
const DETAIL_INNER_GAP_MS     = 1000;
const RETRY_MAX               = 4;
/** Upsert this many enriched rows before counting as a flush (matches batching pressure). */
const FLUSH_EVERY             = 50;
const BATCH_SIZE              = 500;
/** Minimum ms between progress line redraws (also redraws at end of each list page). */
const PROGRESS_INTERVAL_MS    = 1000;

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

// NOTE: Uncomment to limit the rate of detail fetches.
let lastPacedPlayerAt = 0;

// /** Caps how fast we start `enrichPlayer` (detail fetches). */
async function pacePlayerRate() {
  const now = Date.now();
  const earliest = lastPacedPlayerAt + MIN_MS_BETWEEN_PLAYERS;
  if (now < earliest) await sleep(earliest - now);
  lastPacedPlayerAt = Date.now();
}

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

function playerURL(id) {
  return `${BASE}?id=${id}`;
}

function playerMaxURL(id) {
  return `${BASE}?id=${id}&mode=max_level`;
}

// ─── List table (index pages) ────────────────────────────────────────────────

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

    const num = (i) => {
      const v = parseInt(cells.eq(i).text().trim(), 10);
      return Number.isFinite(v) ? v : null;
    };
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

// ─── Detail parsers (Dream Team – Level 1 page) ──────────────────────────────

function thText($th) {
  return $th.text().replace(/\s+/g, " ").trim();
}

/** First column of player table: card image row ends with label text (Standard, Highlight, …). */
function parseCardLabel($, $root) {
  const $firstCell = $root.find("> tbody > tr").first().find("> td").first()
    .find("table tr").first().find("td").first();
  if (!$firstCell.length) return null;
  const t = $firstCell.text().replace(/\s+/g, " ").trim();
  return t || null;
}

/**
 * Read a label/value row from the player stats table.
 * Must use direct `th`/`td` children only: the root table wraps a nested table in one
 * outer `<tr><td>…</td></tr>`; `find("th")` would match nested headers while `find("td")`
 * still pointed at the outer cell — producing one giant concatenated "name".
 */
function rowValue($, $scope, labelStart) {
  let val = null;
  $scope.find("tr").each((_, tr) => {
    const $tr = $(tr);
    const $th = $tr.children("th").first();
    if (!$th.length) return;
    const th = thText($th);
    if (!th.startsWith(labelStart)) return;
    val = $tr.children("td").first().text().replace(/\s+/g, " ").trim();
    return false;
  });
  return val;
}

function parsePositionAbbr($, $player) {
  const v = rowValue($, $player, "Position");
  if (v) return v;
  return $player.find('span[class^="pos"] div').first().text().trim() || null;
}

function parsePlayingStyle($) {
  const $tbl = $("table.playing_styles").first();
  if (!$tbl.length) return null;
  let style = null;
  $tbl.find("tr").each((_, tr) => {
    const $tr = $(tr);
    if (!$tr.find("th").length) return;
    if (!thText($tr.find("th").first()).includes("Playing Style")) return;
    const $td = $tr.next("tr").find("td").first();
    if ($td.length) style = $td.text().trim();
    return false;
  });
  return style;
}

/** Overall Rating span id=a0 on Dream Team pages. */
function parseOverallNumeric(html) {
  const $ = cheerio.load(html);
  const t = $("#a0").first().text().trim();
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} html
 * @param {string} pesdb_id
 */
function parseDetailLevel1(html, pesdb_id) {
  const $ = cheerio.load(html);
  const $player = $("table#table_0.player, table.player").first();
  if (!$player.length) return null;

  const name = rowValue($, $player, "Player Name");
  if (!name) return null;

  const maxLevelRaw = rowValue($, $player, "Maximum Level");
  let maxLevelCap = parseInt(String(maxLevelRaw ?? "").replace(/\D/g, ""), 10);
  if (!Number.isFinite(maxLevelCap) || maxLevelCap < 1) maxLevelCap = 1;

  const overall = parseOverallNumeric(html);
  if (overall == null) return null;

  const card_label    = parseCardLabel($, $player);
  const region        = rowValue($, $player, "Region");
  const foot          = rowValue($, $player, "Foot");
  const playing_style = parsePlayingStyle($);
  const league        = rowValue($, $player, "League");

  return {
    pesdb_id,
    name,
    position:    parsePositionAbbr($, $player),
    club:        rowValue($, $player, "Team Name"),
    league,
    nationality: rowValue($, $player, "Nationality"),
    height:      (() => { const n = parseInt(rowValue($, $player, "Height") ?? "", 10); return Number.isFinite(n) ? n : null; })(),
    weight:      (() => { const n = parseInt(rowValue($, $player, "Weight") ?? "", 10); return Number.isFinite(n) ? n : null; })(),
    age:         (() => { const n = parseInt(rowValue($, $player, "Age") ?? "", 10); return Number.isFinite(n) ? n : null; })(),
    overall, // Level 1
    overall_max: maxLevelCap > 1 ? null : overall,
    _maxLevelCap: maxLevelCap, // internal: cap for enrichPlayer fetch only (not stored)
    card_label,
    region,
    foot,
    playing_style,
  };
}

async function enrichPlayer(pesdb_id) {
  const html1 = await fetchHTML(playerURL(pesdb_id));
  const d = parseDetailLevel1(html1, pesdb_id);
  if (!d) return null;

  const cap = d._maxLevelCap;
  delete d._maxLevelCap;

  if (DETAIL_INNER_GAP_MS > 0) await sleep(DETAIL_INNER_GAP_MS);

  if (cap > 1) {
    const html2 = await fetchHTML(playerMaxURL(pesdb_id));
    const om = parseOverallNumeric(html2);
    d.overall_max = om != null ? om : d.overall;
  } else {
    d.overall_max = d.overall;
  }

  return d;
}

// ─── DB ──────────────────────────────────────────────────────────────────────

async function upsertPlayers(players) {
  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const rows = players.slice(i, i + BATCH_SIZE).map((p) => [
      p.pesdb_id,
      p.name,
      p.position,
      p.club,
      p.league,
      p.nationality,
      p.height,
      p.weight,
      p.age,
      p.overall,
      p.overall_max,
      p.card_label,
      p.region,
      p.foot,
      p.playing_style,
    ]);
    await db.query(
      `INSERT INTO players_catalog
         (pesdb_id, name, position, club, league, nationality, height, weight, age,
          overall, overall_max,
          card_label, region, foot, playing_style)
       VALUES ?
       ON DUPLICATE KEY UPDATE
         name           = VALUES(name),
         position       = VALUES(position),
         club           = VALUES(club),
         league         = VALUES(league),
         nationality    = VALUES(nationality),
         height         = VALUES(height),
         weight         = VALUES(weight),
         age            = VALUES(age),
         overall        = VALUES(overall),
         overall_max    = VALUES(overall_max),
         card_label     = VALUES(card_label),
         region         = VALUES(region),
         foot           = VALUES(foot),
         playing_style  = VALUES(playing_style)`,
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

function bar(done, total, width = 28) {
  const pct = total > 0 ? Math.min(done / total, 1) : 0;
  const f = Math.round(pct * width);
  return `[${"█".repeat(f)}${"░".repeat(width - f)}] ${done.toLocaleString()}/${(total ?? "?").toLocaleString()}`;
}

function writeProgressLine(done, total, listPage, elapsedSec) {
  process.stdout.write(
    `\r  ${bar(done, total)}  page ${listPage}  ${elapsedSec}s   `,
  );
}

// ─── Full scrape ─────────────────────────────────────────────────────────────

async function runFull(logId, resumeState) {
  console.log("📦 Mode: FULL  (list by overall_rating + Dream Team detail per player)");

  // Only prefetch page 1 when starting from scratch (saves one request on resume).
  let firstHTML = null;
  if (!resumeState) {
    firstHTML = await fetchHTML(pageURL(1));
  }
  const total = firstHTML ? detectTotal(firstHTML) : null;
  const estPages = total ? Math.ceil(total / 35) : 1300;
  console.log(`   ${total?.toLocaleString() ?? "?"} players · ~${estPages} pages\n`);

  let buffer = [];
  let totalUpserted = resumeState?.totalUpserted ?? 0;
  let maxId = BigInt(resumeState?.maxId ?? "0");
  let nextPage = resumeState?.nextPage ?? 1;
  let rowInPage = resumeState?.rowInPage ?? 0;

  let emptyStreak = 0;
  const startTime = Date.now();
  let lastProgressDraw = 0;

  while (emptyStreak < 3) {
    const html =
      nextPage === 1 && rowInPage === 0 && firstHTML
        ? firstHTML
        : await fetchHTML(pageURL(nextPage));

    const list = parsePlayers(html);

    if (list.length === 0) {
      emptyStreak++;
      nextPage++;
      rowInPage = 0;
      await sleep(PAGE_DELAY);
      continue;
    }

    emptyStreak = 0;

    for (let i = rowInPage; i < list.length; i++) {
      const idStr = list[i].pesdb_id;
      // NOTE: Uncomment to limit the rate of detail fetches.
      await pacePlayerRate();
      const enriched = await enrichPlayer(idStr);
      if (enriched) {
        buffer.push(enriched);
        const id = BigInt(enriched.pesdb_id);
        if (id > maxId) maxId = id;
      }

      saveState({
        mode: "full",
        nextPage,
        rowInPage: i + 1,
        totalUpserted,
        maxId: maxId.toString(),
        logId,
      });

      if (buffer.length >= FLUSH_EVERY) {
        await upsertPlayers(buffer);
        totalUpserted += buffer.length;
        buffer = [];
      }

      const done = totalUpserted + buffer.length;
      const now = Date.now();
      const atPageEnd = i === list.length - 1;
      const tick = now - lastProgressDraw >= PROGRESS_INTERVAL_MS;
      if (tick || atPageEnd) {
        lastProgressDraw = now;
        const elapsed = ((now - startTime) / 1000).toFixed(0);
        writeProgressLine(done, total, nextPage, elapsed);
      }
    }

    rowInPage = 0;
    nextPage++;
    await sleep(PAGE_DELAY);
  }

  if (buffer.length > 0) {
    for (const p of buffer) {
      const id = BigInt(p.pesdb_id);
      if (id > maxId) maxId = id;
    }
    await upsertPlayers(buffer);
    totalUpserted += buffer.length;
  }

  process.stdout.write("\n");
  return { totalUpserted, maxId };
}

// ─── Incremental scrape ──────────────────────────────────────────────────────

async function runIncremental(logId, cutoffId, lastFinishedAt = null) {
  const sinceDay = lastFinishedAt
    ? new Date(lastFinishedAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  console.log(`📬 Mode: INCREMENTAL  (new players since ${sinceDay})`);
  console.log(`   Cutoff pesdb_id: ${cutoffId.toLocaleString()}\n`);

  let buffer = [];
  let totalUpserted = 0;
  let maxId = cutoffId;
  let page = 1;
  const startTime = Date.now();
  let lastProgressDraw = 0;

  while (true) {
    const html = await fetchHTML(pageURL(page, true));
    const list = parsePlayers(html);

    if (list.length === 0) break;

    const newPlayers = list.filter((p) => BigInt(p.pesdb_id) > cutoffId);

    for (let ni = 0; ni < newPlayers.length; ni++) {
      const row = newPlayers[ni];
      
      // NOTE: Uncomment to limit the rate of detail fetches.
      await pacePlayerRate();

      const enriched = await enrichPlayer(row.pesdb_id);
      if (enriched) {
        buffer.push(enriched);
        const id = BigInt(enriched.pesdb_id);
        if (id > maxId) maxId = id;
      }

      if (buffer.length >= FLUSH_EVERY) {
        await upsertPlayers(buffer);
        totalUpserted += buffer.length;
        buffer = [];
      }

      const done = totalUpserted + buffer.length;
      const now = Date.now();
      const atChunkEnd = ni === newPlayers.length - 1;
      const tick = now - lastProgressDraw >= PROGRESS_INTERVAL_MS;
      if (tick || atChunkEnd) {
        lastProgressDraw = now;
        const elapsed = ((now - startTime) / 1000).toFixed(0);
        writeProgressLine(done, null, page, elapsed);
      }
    }

    const minPageId = BigInt(list[list.length - 1].pesdb_id);
    const allOld = list.every((p) => BigInt(p.pesdb_id) <= cutoffId);

    if (allOld || minPageId <= cutoffId) break;

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

  const savedState = loadState();
  if (savedState?.logId && savedState?.mode) {
    const row =
      savedState.rowInPage > 0 ? `, row ${savedState.rowInPage}` : "";
    console.log(`▶ Resuming interrupted ${savedState.mode} scrape (page ${savedState.nextPage}${row})…`);
  }

  const lastLog = await getLastLog();

  let mode;
  let cutoffId;

  if (!lastLog?.max_pesdb_id) {
    mode = "full";
  } else {
    mode = "incremental";
    cutoffId = BigInt(lastLog.max_pesdb_id);
  }

  const logId = savedState?.logId ?? (await startLog(mode));

  let result;
  if (mode === "full") {
    result = await runFull(logId, savedState?.mode === "full" ? savedState : null);
  } else {
    result = await runIncremental(logId, cutoffId, lastLog.finished_at);
  }

  await finishLog(logId, result.totalUpserted, result.maxId);
  clearState();

  const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
  const label =
    mode === "incremental" && result.totalUpserted === 0
      ? "No new players found."
      : `${result.totalUpserted.toLocaleString()} players upserted.`;

  console.log(`\n✅ Done!  ${label}  (${elapsed}s)`);

  const [logs] = await db.query(
    `SELECT id, scrape_type, started_at, finished_at,
            players_upserted, max_pesdb_id
     FROM scrape_logs
     ORDER BY id DESC
     LIMIT 5`,
  );
  console.log("\n── Scrape log (last 5 runs) ──────────────────────────────");
  console.table(
    logs.map((r) => ({
      id:       r.id,
      type:     r.scrape_type,
      started:  r.started_at?.toISOString().slice(0, 19).replace("T", " "),
      finished: r.finished_at?.toISOString().slice(0, 19).replace("T", " "),
      upserted: r.players_upserted?.toLocaleString() ?? "-",
    })),
  );

  await db.end();
}

main().catch(async (err) => {
  console.error("\nFatal:", err.message);
  console.error("Run `npm run scrape` again to resume.");
  await db.end().catch(() => {});
  process.exit(1);
});
