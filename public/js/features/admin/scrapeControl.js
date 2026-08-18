/* ============================================================
   Starting, watching and stopping a scrape

   The output pane is the child process's real stdout, polled while it runs. It
   is deliberately not a progress bar: the scrapers know how many pages they
   have left and say so, and this page has no business inventing a percentage
   from that — the last one it drew was hardcoded.

   Polling only runs while a scrape does. The OVERVIEW tab's own 60 s refresh is
   far too slow to watch one, and a 2 s poll would be wasteful the rest of the time.
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { apiFetch, apiSend } from "./adminApi.js";
import { fmtSeconds } from "./format.js";
import { loadScrapeRuns } from "./overviewTab.js";

const POLL_MS = 2000;

const MODE_LABEL = { update: "Update catalog", missing: "Repair gaps" };

let pollTimer = null;

const el = (id) => document.getElementById(id);

function setButtonsDisabled(disabled) {
  el("scrapeUpdateBtn").disabled = disabled;
  el("scrapeMissingBtn").disabled = disabled;
}

function renderStatus({ running, run }) {
  const box = el("scrapeStatus");
  if (!run) {
    box.hidden = true;
    setButtonsDisabled(false);
    return;
  }

  box.hidden = false;
  setButtonsDisabled(running);
  el("scrapeStopBtn").hidden = !running;
  el("scrapeDot").hidden = !running;

  const label = MODE_LABEL[run.mode] || run.mode;
  const seconds = Math.floor(((run.endedAt || Date.now()) - run.startedAt) / 1000);
  el("scrapeStatusLabel").textContent = running
    ? `${label} · running · ${fmtSeconds(seconds)}`
    : `${label} · ${run.stopped ? "stopped" : run.exitCode === 0 ? "finished" : "failed"} · ${fmtSeconds(seconds)}`;

  const pane = el("scrapeOutput");
  const atBottom = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 20;
  pane.innerHTML = run.output.map((line) => escapeHtml(line)).join("\n");
  /* Follow the tail, unless the reader has scrolled up to look at something. */
  if (atBottom) pane.scrollTop = pane.scrollHeight;
}

async function poll() {
  try {
    const status = await apiFetch("/api/admin/scrape/status");
    renderStatus(status);
    if (!status.running) {
      stopPolling();
      loadScrapeRuns(); // the run's row is only complete once it has exited
    }
  } catch {
    stopPolling();
  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(poll, POLL_MS);
  poll();
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

function showError(message) {
  const box = el("scrapeStatus");
  box.hidden = false;
  el("scrapeDot").hidden = true;
  el("scrapeStopBtn").hidden = true;
  el("scrapeStatusLabel").textContent = message;
  setButtonsDisabled(false);
}

async function start(mode) {
  setButtonsDisabled(true);
  try {
    await apiSend("/api/admin/scrape", "POST", { mode });
    startPolling();
  } catch (err) {
    /* 409 carries the runner's own reason — already running, here or in a terminal. */
    showError(err.message);
  }
}

export function initScrapeControl() {
  el("scrapeUpdateBtn").addEventListener("click", () => start("update"));
  el("scrapeMissingBtn").addEventListener("click", () => start("missing"));
  el("scrapeStopBtn").addEventListener("click", async () => {
    el("scrapeStopBtn").disabled = true;
    try { await apiSend("/api/admin/scrape/stop", "POST", {}); } catch { /* it already ended */ }
    el("scrapeStopBtn").disabled = false;
    poll();
  });
}

/** Called when the console opens: a scrape may already have been running. */
export async function resumeScrapeWatch() {
  try {
    const status = await apiFetch("/api/admin/scrape/status");
    renderStatus(status);
    if (status.running) startPolling();
  } catch { /* the panel simply stays empty */ }
}
