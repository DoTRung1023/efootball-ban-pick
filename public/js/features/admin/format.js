/* ============================================================
   Table cell formatting — numbers, durations, and the pills
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";

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
export function scrapeRunState(log) {
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
 * The one line a panel is allowed to say out loud — a write that was refused, or
 * one that went through.
 *
 * Three tabs had a byte-identical private copy of this, differing only in the id
 * they wrote to. `tableMessage` above is the precedent: this module already owns
 * the small pieces of DOM every tab needs to produce.
 *
 * Passing `""` hides the line, which is how a tab clears the last message before
 * starting the next action.
 */
export function notice(id, message, isError = false) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.className = isError ? "panel-notice is-error" : "panel-notice";
  el.hidden = !message;
}
