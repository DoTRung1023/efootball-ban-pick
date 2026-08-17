/* ============================================================
   Table cell formatting — numbers, durations, and the coloured pills
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";

export function fmtNum(n) {
  return n == null ? "—" : Number(n).toLocaleString();
}

export function fmtAge(ms) {
  const s = Math.floor(ms / 1000);
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

export function fmtDuration(start, end) {
  if (!start) return "—";
  const endTs = end ? new Date(end).getTime() : Date.now();
  const ms = endTs - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m + ":" + String(rem).padStart(2, "0");
}

export function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-AU", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function phasePill(phase) {
  /* `live` = a match being played. It borrows the ready pill rather than
     earning a colour of its own: the dashboard's palette marks *attention*, and
     a room mid-match needs none. */
  const cls = { ban: "is-ban", pick: "is-pick", lobby: "is-lobby", ready: "is-ready", live: "is-ready", done: "is-done" };
  return `<span class="phase-pill ${cls[phase] || "is-lobby"}">${escapeHtml(phase.toUpperCase())}</span>`;
}

export function statusPill(log) {
  if (!log.finished_at) return `<span class="status-pill is-running">RUNNING</span>`;
  if (log.players_upserted > 0) return `<span class="status-pill is-success">SUCCESS</span>`;
  return `<span class="status-pill is-success">DONE</span>`;
}

export function cardTypeBadge(type) {
  if (!type) return "";
  const t = type.toLowerCase();
  let cls = "";
  if (t.includes("iconic")) cls = "is-iconic";
  else if (t.includes("highlight")) cls = "is-highlight";
  else if (t.includes("epic")) cls = "is-epic";
  return `<span class="card-type-badge ${cls}" title="${escapeHtml(type)}">${escapeHtml(type)}</span>`;
}

/** Shown in a table body when a panel's fetch rejects. */
export function tableMessage(colspan, text) {
  return `<tr><td colspan="${colspan}" class="td-empty">${text}</td></tr>`;
}
