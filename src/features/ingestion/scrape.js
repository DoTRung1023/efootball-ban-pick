/**
 * npm run scrape
 *
 * ── First run  ──────────────────────────────────────────────────────────────
 *   Full scrape: walks list pages sorted by overall_rating (~41 k rows), then
 *   fetches each player detail (?id=) for Dream Team stats (overall_max, card
 *   type, region, foot, playing style). Saves the highest pesdb_id seen as the
 *   cutoff for the next run.
 *
 * ── Subsequent runs ─────────────────────────────────────────────────────────
 *   Incremental scrape: list sorted by id DESC (newest first); checks each
 *   page against the DB and enriches any player not yet stored. Stops after
 *   CONSECUTIVE_OLD_PAGES_LIMIT consecutive fully-known pages once it has
 *   passed the cutoff boundary. This catches retroactively-added cards whose
 *   IDs fall below the previous cutoff.
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
import db from "#lib/db.js";
import path from "node:path";
import { isMainModule } from "#lib/cli.js";
import { ROOT_DIR } from "#lib/paths.js";

const BASE       = "https://pesdb.net/efootball/";
const STATE_FILE = path.join(ROOT_DIR, ".scrape-state.json");

/** Minimum ms between each enrichPlayer start (shared across concurrent tasks via slot reservation). */
const MIN_MS_BETWEEN_PLAYERS       = 400;
/** ms between list-page HTTP requests. */
const PAGE_DELAY_MS                = 1500;
/** ms between level-1 and max-level detail requests for the same player. */
const DETAIL_INNER_GAP_MS          = 300;
const RETRY_MAX                    = 6;
const FETCH_TIMEOUT_MS             = 30_000;
const RETRY_BASE_DELAY_MS          = 2_000;
const EMPTY_PAGE_RETRY_MAX         = 5;
const EMPTY_PAGE_RETRY_DELAY_MS    = 6_000;
/** Upsert this many enriched rows before flushing to DB. */
const FLUSH_EVERY                  = 50;
const BATCH_SIZE                   = 500;
/** Minimum ms between progress line redraws. */
const PROGRESS_INTERVAL_MS         = 1000;
/**
 * Incremental stop: after crossing the cutoff ID boundary, stop once this many
 * consecutive pages all have players already in the DB. Increase if the site
 * retroactively adds cards with IDs far below the cutoff.
 */
const CONSECUTIVE_OLD_PAGES_LIMIT  = 5;
/** Number of players to enrich concurrently per batch. */
const CONCURRENCY                  = 4;

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

let nextPlayerAt = 0;

/**
 * Slot-reservation rate limiter — safe for concurrent callers.
 * Each call atomically claims the next available time slot, so N concurrent
 * tasks will each get a slot spaced MIN_MS_BETWEEN_PLAYERS ms apart.
 */
async function pacePlayerRate() {
  const slot = Math.max(nextPlayerAt, Date.now());
  nextPlayerAt = slot + MIN_MS_BETWEEN_PLAYERS;
  const wait = slot - Date.now();
  if (wait > 0) await sleep(wait);
}

function isRetryableFetchError(err) {
  const name = err?.name;
  const code = err?.code;
  const msg  = String(err?.message ?? "");
  return (
    name === "AbortError"         ||
    code === "ETIMEDOUT"          ||
    code === "ECONNRESET"         ||
    code === "EAI_AGAIN"          ||
    code === "ENOTFOUND"          ||
    code === "ECONNREFUSED"       ||
    msg.includes("fetch failed")  ||
    msg.includes("timed out")     ||
    msg.includes("socket")
  );
}

async function fetchHTML(url, attempt = 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, { headers: HEADERS, signal: controller.signal });
  } catch (err) {
    clearTimeout(timeout);
    if (attempt < RETRY_MAX && isRetryableFetchError(err)) {
      const exp    = Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), 60_000);
      const wait   = exp + Math.floor(Math.random() * 750);
      process.stdout.write(`\n  WARN  network error – waiting ${Math.round(wait / 1000)}s…\n`);
      await sleep(wait);
      return fetchHTML(url, attempt + 1);
    }
    throw new Error(`fetch failed for ${url}: ${err?.message ?? String(err)}`);
  }
  clearTimeout(timeout);

  if (res.status === 429) {
    const wait = Math.min(attempt * 15_000, 60_000);
    process.stdout.write(`\n  WARN  429 – waiting ${wait / 1000}s…\n`);
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

/**
 * @param {number} page
 * @param {"overall_rating"|"id"} sort
 * @param {boolean} desc  true → order=1 (DESC/newest first), false → order=0 (ASC)
 *
 * NOTE: pesdb.net uses order=1 for DESC, order=0 for ASC. If pages come back in
 * the wrong order, flip the `desc` argument at the call site.
 */
function pageURL(page, sort = "overall_rating", desc = false) {
  return `${BASE}?sort=${sort}&order=${desc ? 1 : 0}&all=1&page=${page}`;
}

function playerURL(id)    { return `${BASE}?id=${id}`; }
function playerMaxURL(id) { return `${BASE}?id=${id}&mode=max_level`; }

// ─── List table (index pages) ────────────────────────────────────────────────

function parsePlayers(html) {
  const $ = cheerio.load(html);
  const players = [];

  $("table tbody tr").each((_, row) => {
    const $row  = $(row);
    const cells = $row.find("td");
    if (cells.length < 8) return;

    const anchor = $row.find("a[href*='id=']").first();
    if (!anchor.length) return;

    const href = anchor.attr("href") ?? "";
    const m    = href.match(/[?&]id=(\d+)/);
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

// ─── Detail parsers (Dream Team – Level 1 page) ──────────────────────────────

function thText($th) {
  return $th.text().replace(/\s+/g, " ").trim();
}

/** First column of player table: card image row ends with type text (Standard, Highlight, …). */
function parseCardType($, $root) {
  const $firstCell = $root.find("> tbody > tr").first().find("> td").first()
    .find("table tr").first().find("td").first();
  if (!$firstCell.length) return null;
  const t = $firstCell.text().replace(/\s+/g, " ").trim();
  return t || null;
}

/**
 * Read a label/value row from the player stats table.
 * Uses direct `th`/`td` children only to avoid matching nested table headers.
 */
function rowValue($, $scope, labelStart) {
  let val = null;
  $scope.find("tr").each((_, tr) => {
    const $tr = $(tr);
    const $th = $tr.children("th").first();
    if (!$th.length) return;
    if (!thText($th).startsWith(labelStart)) return;
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

function parseDetailLevel1(html, pesdb_id) {
  const $ = cheerio.load(html);
  const $player = $("table#table_0.player, table.player").first();
  if (!$player.length) return null;

  const name = rowValue($, $player, "Player Name");
  if (!name) return null;

  const maxLevelRaw = rowValue($, $player, "Maximum Level");
  let maxLevelCap   = parseInt(String(maxLevelRaw ?? "").replace(/\D/g, ""), 10);
  if (!Number.isFinite(maxLevelCap) || maxLevelCap < 1) maxLevelCap = 1;

  const overall = parseOverallNumeric(html);
  if (overall == null) return null;

  const intField = (label) => {
    const n = parseInt(rowValue($, $player, label) ?? "", 10);
    return Number.isFinite(n) ? n : null;
  };

  return {
    pesdb_id,
    name,
    position:      parsePositionAbbr($, $player),
    club:          rowValue($, $player, "Team Name"),
    league:        rowValue($, $player, "League"),
    nationality:   rowValue($, $player, "Nationality"),
    height:        intField("Height"),
    weight:        intField("Weight"),
    age:           intField("Age"),
    overall,
    overall_max:   maxLevelCap > 1 ? null : overall,
    _maxLevelCap:  maxLevelCap,
    card_type:     parseCardType($, $player),
    region:        rowValue($, $player, "Region"),
    foot:          rowValue($, $player, "Foot"),
    playing_style: parsePlayingStyle($),
  };
}

async function enrichPlayer(pesdb_id) {
  const html1 = await fetchHTML(playerURL(pesdb_id));
  const d     = parseDetailLevel1(html1, pesdb_id);
  if (!d) return null;

  const cap = d._maxLevelCap;
  delete d._maxLevelCap;

  if (DETAIL_INNER_GAP_MS > 0) await sleep(DETAIL_INNER_GAP_MS);

  if (cap > 1) {
    const html2 = await fetchHTML(playerMaxURL(pesdb_id));
    const om    = parseOverallNumeric(html2);
    d.overall_max = om != null ? om : d.overall;
  } else {
    d.overall_max = d.overall;
  }

  return d;
}

/** Enrich a batch of players concurrently, one slot each from pacePlayerRate. */
async function enrichBatch(players) {
  return Promise.all(
    players.map(async (p) => {
      await pacePlayerRate();
      try { return await enrichPlayer(p.pesdb_id); }
      catch (err) {
        console.error(`\n  WARN  detail fetch failed (id ${p.pesdb_id}): ${err.message}`);
        return null;
      }
    }),
  );
}

/**
 * The snapshot taken before a full run overwrites the catalog.
 *
 * **Two statements, not `CREATE TABLE … AS SELECT`.** That is MySQL-only: TiDB
 * has never implemented it and answers `'CREATE TABLE ... SELECT' is not
 * implemented yet`, which killed the first full scrape run against the
 * deployment four seconds in — before a single player was fetched. It worked on
 * a laptop for exactly as long as the laptop was the only place this ran.
 *
 * `LIKE` then `INSERT … SELECT` is the portable form and runs on both. It is
 * also the better backup: `AS SELECT` copies columns and data but drops the
 * primary key and every index, so the table this used to leave behind was a
 * heap that happened to hold the right rows.
 */
async function backupCatalog() {
  console.log("BACKUP  Backing up players_catalog → players_catalog_backup…");
  await db.query("DROP TABLE IF EXISTS players_catalog_backup");
  await db.query("CREATE TABLE players_catalog_backup LIKE players_catalog");
  await db.query("INSERT INTO players_catalog_backup SELECT * FROM players_catalog");
  const [[{ cnt }]] = await db.query("SELECT COUNT(*) AS cnt FROM players_catalog_backup");
  console.log(`   ${cnt.toLocaleString()} rows backed up.\n`);
}

// ─── DB ──────────────────────────────────────────────────────────────────────

async function upsertPlayers(players) {
  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const rows = players.slice(i, i + BATCH_SIZE).map((p) => [
      p.pesdb_id, p.name, p.position, p.club, p.league, p.nationality,
      p.height, p.weight, p.age, p.overall, p.overall_max,
      p.card_type, p.region, p.foot, p.playing_style,
    ]);
    await db.query(
      `INSERT INTO players_catalog
         (pesdb_id, name, position, club, league, nationality, height, weight, age,
          overall, overall_max, card_type, region, foot, playing_style)
       VALUES ?
       ON DUPLICATE KEY UPDATE
         name          = VALUES(name),
         position      = VALUES(position),
         club          = VALUES(club),
         league        = VALUES(league),
         nationality   = VALUES(nationality),
         height        = VALUES(height),
         weight        = VALUES(weight),
         age           = VALUES(age),
         overall       = VALUES(overall),
         overall_max   = VALUES(overall_max),
         card_type     = VALUES(card_type),
         region        = VALUES(region),
         foot          = VALUES(foot),
         playing_style = VALUES(playing_style)`,
      [rows],
    );
  }
}

/**
 * Returns the subset of `ids` not yet present in players_catalog.
 * Used by incremental scrape to catch retroactively-added cards regardless of ID value.
 */
async function fetchMissingIds(ids) {
  if (ids.length === 0) return new Set();
  const [rows] = await db.query(
    `SELECT pesdb_id FROM players_catalog WHERE pesdb_id IN (?)`,
    [ids],
  );
  const existing = new Set(rows.map((r) => String(r.pesdb_id)));
  return new Set(ids.filter((id) => !existing.has(id)));
}

/**
 * Adds the 'missing' enum member to a `scrape_logs` created before gap-repair
 * runs were logged. Same bargain as the other boot-time healers in this repo:
 * MySQL has no `ADD VALUE IF NOT EXISTS`, and an install that must find an
 * `ALTER` in `schema.sql` before `npm run scrape:missing` can record anything
 * is an install that is quietly broken. Runs on every scrape; does nothing on
 * all but one of them.
 */
export async function ensureScrapeLogSchema() {
  try {
    const [[col]] = await db.query(
      `SELECT COLUMN_TYPE AS type FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'scrape_logs'
         AND column_name = 'scrape_type'`,
    );
    if (col && !String(col.type).includes("'missing'")) {
      await db.query(
        `ALTER TABLE scrape_logs MODIFY scrape_type
         ENUM('full','incremental','missing') NOT NULL DEFAULT 'full'`,
      );
      console.log("scrape schema: added 'missing' to scrape_logs.scrape_type");
    }
  } catch (err) {
    /* A repair run that cannot widen the enum should still repair. It just
       will not be able to log itself, which `startLog` degrades to on its own. */
    console.error("scrape schema check skipped:", err.message);
  }
}

async function getLastLog() {
  const [rows] = await db.query(
    /* `scrape_type <> 'missing'` is load-bearing, not tidiness. This row picks
       the cutoff for the next incremental run, and a gap-repair run backfills
       *old* ids — it reaches no new high-water mark and stores NULL. Counting
       one here would read as "no cutoff known" and silently turn the next
       `npm run scrape` into a full ~41 k re-scrape. */
    `SELECT max_pesdb_id, finished_at
     FROM scrape_logs
     WHERE finished_at IS NOT NULL AND scrape_type <> 'missing'
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

/** `maxId` is null for a gap-repair run, which sets no cutoff — see getLastLog. */
async function finishLog(id, upserted, maxId) {
  await db.query(
    `UPDATE scrape_logs
     SET finished_at = CURRENT_TIMESTAMP,
         players_upserted = ?,
         max_pesdb_id = ?
     WHERE id = ?`,
    [upserted, maxId == null ? null : maxId.toString(), id],
  );
}

// ─── Progress ────────────────────────────────────────────────────────────────

function bar(done, total, width = 28) {
  const pct = total > 0 ? Math.min(done / total, 1) : 0;
  const f   = Math.round(pct * width);
  return `[${"█".repeat(f)}${"░".repeat(width - f)}] ${done.toLocaleString()}/${(total ?? "?").toLocaleString()}`;
}

function writeProgressLine(done, total, page, elapsedSec) {
  process.stdout.write(`\r  ${bar(done, total)}  page ${page}  ${elapsedSec}s   `);
}

// ─── Full scrape ─────────────────────────────────────────────────────────────

async function runFull(logId, resumeState) {
  console.log("MODE  Mode: FULL  (list by overall_rating + Dream Team detail per player)");

  let firstHTML = null;
  try {
    firstHTML = await fetchHTML(pageURL(1));
  } catch (err) {
    console.error(`\n  WARN  list fetch failed (page 1): ${err.message}`);
  }

  const total    = firstHTML ? detectTotal(firstHTML) : null;
  const estPages = total ? Math.ceil(total / 35) : 1300;
  console.log(`   ${total?.toLocaleString() ?? "?"} players · ~${estPages} pages\n`);

  let buffer       = [];
  let totalUpserted = resumeState?.totalUpserted ?? 0;
  let maxId         = BigInt(resumeState?.maxId ?? "0");
  let nextPage      = resumeState?.nextPage ?? 1;
  let rowInPage     = resumeState?.rowInPage ?? 0;

  const startTime       = Date.now();
  let lastProgressDraw  = 0;

  while (nextPage <= estPages) {
    let html;
    if (nextPage === 1 && rowInPage === 0 && firstHTML) {
      html = firstHTML;
    } else {
      try {
        html = await fetchHTML(pageURL(nextPage));
      } catch (err) {
        console.error(`\n  WARN  list fetch failed (page ${nextPage}): ${err.message}`);
        await sleep(PAGE_DELAY_MS);
        continue;
      }
    }

    let list = parsePlayers(html);

    if (list.length === 0) {
      let recovered = false;
      for (let a = 1; a <= EMPTY_PAGE_RETRY_MAX; a++) {
        process.stdout.write(`\n  WARN  empty page ${nextPage} – retry ${a}/${EMPTY_PAGE_RETRY_MAX}…\n`);
        await sleep(EMPTY_PAGE_RETRY_DELAY_MS * a);
        try {
          const retryHTML = await fetchHTML(pageURL(nextPage));
          list = parsePlayers(retryHTML);
          if (list.length > 0) { recovered = true; break; }
        } catch (err) {
          console.error(`  WARN  list fetch failed (page ${nextPage}, retry ${a}): ${err.message}`);
        }
      }
      if (!recovered) {
        console.error(`\n  WARN  giving up on empty page ${nextPage}; continuing…`);
        nextPage++;
        rowInPage = 0;
        await sleep(PAGE_DELAY_MS);
        continue;
      }
    }

    const pageStart = rowInPage;
    const slice     = list.slice(pageStart);

    for (let bi = 0; bi < slice.length; bi += CONCURRENCY) {
      const batch   = slice.slice(bi, bi + CONCURRENCY);
      const results = await enrichBatch(batch);

      for (const enriched of results) {
        if (!enriched) continue;
        buffer.push(enriched);
        const id = BigInt(enriched.pesdb_id);
        if (id > maxId) maxId = id;
      }

      const doneRow = pageStart + bi + batch.length;
      saveState({ mode: "full", nextPage, rowInPage: doneRow, totalUpserted, maxId: maxId.toString(), logId });

      if (buffer.length >= FLUSH_EVERY) {
        await upsertPlayers(buffer);
        totalUpserted += buffer.length;
        buffer = [];
      }

      const now = Date.now();
      if (now - lastProgressDraw >= PROGRESS_INTERVAL_MS || doneRow === list.length) {
        lastProgressDraw = now;
        writeProgressLine(totalUpserted + buffer.length, total, nextPage, ((now - startTime) / 1000).toFixed(0));
      }
    }

    rowInPage = 0;
    nextPage++;
    await sleep(PAGE_DELAY_MS);
  }

  if (buffer.length > 0) {
    await upsertPlayers(buffer);
    totalUpserted += buffer.length;
  }

  process.stdout.write("\n");
  return { totalUpserted, maxId };
}

// ─── Incremental scrape ──────────────────────────────────────────────────────

async function runIncremental(logId, cutoffId, lastFinishedAt = null, resumeState = null) {
  const sinceDay = lastFinishedAt
    ? new Date(lastFinishedAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  console.log(`MODE  Mode: INCREMENTAL  (new players since ${sinceDay})`);
  console.log(`   Cutoff pesdb_id: ${cutoffId.toLocaleString()}\n`);

  let buffer            = [];
  let totalUpserted     = resumeState?.totalUpserted ?? 0;
  let maxId             = resumeState?.maxId ? BigInt(resumeState.maxId) : cutoffId;
  let page              = resumeState?.page ?? 1;
  let consecutiveOld    = 0;

  const startTime      = Date.now();
  let lastProgressDraw = 0;

  while (true) {
    let html;
    try {
      // sort=id DESC so newest (highest) IDs appear first
      html = await fetchHTML(pageURL(page, "id", true));
    } catch (err) {
      console.error(`\n  WARN  list fetch failed (page ${page}): ${err.message}`);
      await sleep(PAGE_DELAY_MS);
      continue;
    }

    const list = parsePlayers(html);
    if (list.length === 0) break;

    // DB-membership check: find players not yet in the catalog.
    // This catches retroactively-added cards with IDs below the cutoff —
    // pure ID comparison (pesdb_id > cutoffId) would silently skip them.
    const allIds    = list.map((p) => p.pesdb_id);
    const missingIds = await fetchMissingIds(allIds);
    const newPlayers = list.filter((p) => missingIds.has(p.pesdb_id));

    // Use the smallest ID on this page (last element in DESC order) to detect
    // when we've crossed below the cutoff boundary.
    const minPageId  = BigInt(list[list.length - 1].pesdb_id);
    const pastCutoff = minPageId < cutoffId;

    if (newPlayers.length === 0) {
      consecutiveOld++;
      // Only stop after we've passed the cutoff AND seen N fully-known pages in a row.
      if (consecutiveOld >= CONSECUTIVE_OLD_PAGES_LIMIT && pastCutoff) break;
    } else {
      consecutiveOld = 0;
    }

    for (let bi = 0; bi < newPlayers.length; bi += CONCURRENCY) {
      const batch   = newPlayers.slice(bi, bi + CONCURRENCY);
      const results = await enrichBatch(batch);

      for (const enriched of results) {
        if (!enriched) continue;
        buffer.push(enriched);
        const id = BigInt(enriched.pesdb_id);
        if (id > maxId) maxId = id;
      }

      if (buffer.length >= FLUSH_EVERY) {
        await upsertPlayers(buffer);
        totalUpserted += buffer.length;
        buffer = [];
      }

      saveState({ mode: "incremental", page, totalUpserted, maxId: maxId.toString(), logId, cutoffId: cutoffId.toString() });

      const now = Date.now();
      if (now - lastProgressDraw >= PROGRESS_INTERVAL_MS || bi + batch.length >= newPlayers.length) {
        lastProgressDraw = now;
        writeProgressLine(totalUpserted + buffer.length, null, page, ((now - startTime) / 1000).toFixed(0));
      }
    }

    page++;
    await sleep(PAGE_DELAY_MS);
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
    // full uses `nextPage`, incremental uses `page`
    const page = savedState.nextPage ?? savedState.page ?? "?";
    const row  = (savedState.rowInPage ?? 0) > 0 ? `, row ${savedState.rowInPage}` : "";
    console.log(`RESUME  Resuming interrupted ${savedState.mode} scrape (page ${page}${row})…`);
  }

  const lastLog = await getLastLog();

  let mode;
  let cutoffId;

  if (!lastLog?.max_pesdb_id) {
    mode = "full";
  } else {
    mode     = "incremental";
    cutoffId = BigInt(lastLog.max_pesdb_id);
  }

  const isResume = !!savedState?.logId;
  const logId    = savedState?.logId ?? (await startLog(mode));

  if (!isResume) await backupCatalog();

  let result;
  if (mode === "full") {
    result = await runFull(logId, savedState?.mode === "full" ? savedState : null);
  } else {
    result = await runIncremental(logId, cutoffId, lastLog.finished_at, savedState?.mode === "incremental" ? savedState : null);
  }

  await finishLog(logId, result.totalUpserted, result.maxId);
  clearState();

  const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
  const label   =
    mode === "incremental" && result.totalUpserted === 0
      ? "No new players found."
      : `${result.totalUpserted.toLocaleString()} players upserted.`;

  console.log(`\nDONE  ${label}  (${elapsed}s)`);

  if (process.env.SCRAPE_SHOW_LOGS === "1") {
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
  }

  await db.end();
}

export {
  startLog,
  finishLog,
  fetchHTML,
  parsePlayers,
  detectTotal,
  pageURL,
  enrichPlayer,
  enrichBatch,
  pacePlayerRate,
  upsertPlayers,
  backupCatalog,
};

if (isMainModule(import.meta.url)) {
  main().catch(async (err) => {
    console.error("\nFatal:", err.message);
    console.error("Run `npm run scrape` again to resume.");
    await db.end().catch(() => {});
    process.exit(1);
  });
}
