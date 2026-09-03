/* ============================================================
   Table cell formatting — numbers, durations, and the pills
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { showToast } from "@/shared/ui/toast.js";

export function fmtNum(n) {
  return n == null ? "—" : Number(n).toLocaleString();
}

/** Compact elapsed time from a count of seconds. */
export function fmtSeconds(sec) {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m " + (s % 60) + "s";
  return Math.floor(s / 3600) + "h " + Math.floor((s % 3600) / 60) + "m";
}

export function fmtRelative(ts) {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

/** A finished run's wall time; an unfinished one is measured against now. */
export function fmtDuration(start, end) {
  if (!start) return "—";
  const endTs = end ? new Date(end).getTime() : Date.now();
  const s = Math.floor((endTs - new Date(start).getTime()) / 1000);
  if (s < 60) return s + "s";
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

export function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-AU", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/* `live` = a match being played. It borrows the ready pill rather than earning a
   colour of its own: the palette here marks *attention*, and a room mid-match
   needs none. An unknown or missing phase falls back to the lobby pill. */
const PHASE_CLASS = {
  ban: "is-ban", pick: "is-pick", lobby: "is-lobby",
  ready: "is-ready", live: "is-ready", done: "is-done",
};

export function phasePill(phase) {
  const label = String(phase || "lobby");
  return `<span class="phase-pill ${PHASE_CLASS[label] || "is-lobby"}">${escapeHtml(label.toUpperCase())}</span>`;
}

const STALE_RUN_MS = 60 * 60 * 1000;

/**
 * `done` · `running` · `stalled`.
 *
 * `scrape_logs` has no status column and a crashed run never writes
 * `finished_at`, so the dashboard reported a run that died in April as still
 * running, forever. An hour is far longer than any real run takes.
 */
/**
 * `failed` · `done` · `stalled` · `running`, in that order of certainty.
 *
 * `failed` is checked first because a run that threw sets `finished_at` on its
 * way out — it has to, or it would hold the console's start lock for an hour —
 * and without this line that would read as a success.
 *
 * `stalled` is still the backstop for the deaths no handler sees: a kill -9, an
 * out-of-memory, a container that went away. Those leave the row open and only
 * the clock can tell.
 */
export function scrapeRunState(log) {
  if (log.failed) return "failed";
  if (log.finished_at) return "done";
  return Date.now() - new Date(log.started_at).getTime() > STALE_RUN_MS ? "stalled" : "running";
}

export function scrapeStatusPill(log) {
  const state = scrapeRunState(log);
  return `<span class="status-pill is-${state}">${state.toUpperCase()}</span>`;
}

export function cardTypeBadge(type) {
  if (!type) return "—";
  return `<span class="card-type-badge" title="${escapeHtml(type)}">${escapeHtml(type)}</span>`;
}

/** Shown in a table body while it loads, when it is empty, or when it fails. */
export function tableMessage(colspan, text) {
  return `<tr><td colspan="${colspan}" class="td-empty">${escapeHtml(text)}</td></tr>`;
}

/**
 * What a panel says out loud — a write that was refused, or one that went
 * through.
 *
 * **This was an inline line per tab and is now the app's toast.** Each of the
 * three tabs owned a `<p class="panel-notice">` in its own corner of the
 * layout, so the same sentence appeared in a different place depending on which
 * tab you were on, and it stayed there until the next action cleared it — long
 * after it had stopped being news. The toast is bottom-centre on every screen
 * and times itself out of the way, which is how the rest of the app already
 * announces things.
 *
 * `id` is gone with the elements. Passing `""` is still how a tab says "clear
 * the last message before starting the next action", and it is now a no-op:
 * there is nothing to clear, and showing an empty toast would be worse than
 * showing nothing.
 */
export function notice(message, isError = false) {
  if (!message) return;
  showToast(message, isError ? "error" : "success");
}
