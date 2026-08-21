/**
 * Running a scrape from the console.
 *
 * The two scrapers are **child processes, never in-process calls**: both end
 * with `await db.end()`, which would tear down the connection pool the server
 * shares with every other request. Spawning them also means a crash in a scrape
 * cannot take the server with it, and that stopping one is a signal away.
 *
 * Stopping is safe by design. `scrape.js` writes `.scrape-state.json` after each
 * row, so a killed run resumes from where it stopped the next time it starts —
 * which is why STOP is offered at all.
 *
 * What the console shows is the child's real stdout, kept in a ring buffer. The
 * scrapers draw progress with `\r` and no newline, so the partial line is
 * tracked separately and shown as the live one; without that the pane would sit
 * blank for minutes at a time.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import db from "#lib/db.js";
import { describeError } from "#lib/http.js";

/** Mode → script. A fixed table: nothing from the request reaches a path. */
const SCRIPTS = {
  update: "../ingestion/scrape.js",
  missing: "../ingestion/scrapeMissing.js",
};

export const SCRAPE_MODES = Object.keys(SCRIPTS);

const MAX_LINES = 200;
const MAX_LINE_CHARS = 300;

/* An unfinished `scrape_logs` row older than this is a run that died, not one
   still going — the same reading `scrapeRunState` applies in the client, and the
   two thresholds are a pair to keep in step. */
const STALE_RUN_MS = 60 * 60 * 1000;

/** The one run this server owns, or null. There is never more than one. */
let current = null;

function pushLine(run, text) {
  run.lines.push(text.slice(0, MAX_LINE_CHARS));
  if (run.lines.length > MAX_LINES) run.lines.shift();
}

/**
 * Splits child output into lines.
 *
 * A `\r` rewrites the line being drawn rather than starting a new one, so only
 * the last segment of each line is kept — otherwise one progress bar would fill
 * the whole buffer with its own frames.
 */
function consume(run, chunk) {
  const parts = (run.pending + chunk).split("\n");
  run.pending = parts.pop() ?? "";
  for (const part of parts) {
    const text = part.split("\r").pop().trimEnd();
    if (text) pushLine(run, text);
  }
}

/** True when a scrape not started here looks like it is still going. */
async function foreignRunInProgress() {
  const [[row]] = await db.query(
    `SELECT started_at FROM scrape_logs
     WHERE finished_at IS NULL ORDER BY id DESC LIMIT 1`,
  );
  if (!row) return false;
  return Date.now() - new Date(row.started_at).getTime() < STALE_RUN_MS;
}

/**
 * Starts a scrape.
 * Resolves `{ ok: true }`, or `{ ok: false, error }` when one is already going.
 */
export async function startScrape(mode) {
  if (!SCRIPTS[mode]) return { ok: false, error: "Unknown scrape mode." };
  if (current?.child) return { ok: false, error: "A scrape is already running." };

  /* A run started from a terminal is invisible to this module, but not to the
     log table. Two at once would fight over `.scrape-state.json`. */
  try {
    if (await foreignRunInProgress()) {
      return { ok: false, error: "A scrape is already running (started outside the console)." };
    }
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }

  const script = fileURLToPath(new URL(SCRIPTS[mode], import.meta.url));
  const child = spawn(process.execPath, [script], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const run = {
    child, mode, pid: child.pid,
    startedAt: Date.now(), endedAt: null,
    exitCode: null, stopped: false,
    lines: [], pending: "",
  };
  current = run;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => consume(run, chunk));
  child.stderr.on("data", (chunk) => consume(run, chunk));

  child.on("error", (err) => {
    pushLine(run, `failed to start: ${describeError(err)}`);
    run.child = null;
    run.endedAt = Date.now();
    run.exitCode = -1;
  });

  child.on("close", (code, signal) => {
    if (run.pending) { pushLine(run, run.pending.split("\r").pop().trimEnd()); run.pending = ""; }
    run.child = null;
    run.endedAt = Date.now();
    run.exitCode = code;
    pushLine(run, run.stopped
      ? "STOPPED  The next run resumes from where this one left off."
      : code === 0 ? "DONE  Finished." : `Exited with ${signal || `code ${code}`}.`);
  });

  return { ok: true };
}

export function stopScrape() {
  if (!current?.child) return { ok: false, error: "No scrape is running." };
  current.stopped = true;
  current.child.kill("SIGTERM");
  return { ok: true };
}

/** What the console polls: the run this server owns, finished or not. */
export function scrapeStatus() {
  if (!current) return { running: false, run: null };
  const { mode, pid, startedAt, endedAt, exitCode, stopped, lines, pending } = current;
  const live = pending.split("\r").pop().trimEnd();
  return {
    running: Boolean(current.child),
    run: {
      mode, pid, startedAt, endedAt, exitCode, stopped,
      output: live ? [...lines, live] : [...lines],
    },
  };
}

/* A scrape outliving the server that started it would write the same resume
   file as the next one — `node --watch` restarts on every save. */
process.on("exit", () => current?.child?.kill("SIGTERM"));
