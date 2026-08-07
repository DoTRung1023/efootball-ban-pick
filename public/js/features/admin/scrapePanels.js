/* ============================================================
   Scrape runs — the OVERVIEW panel (8 rows, 6 columns) and the SCRAPES tab
   (50 rows, 8 columns)

   The wide table adds finished_at and max_pesdb_id, so the two row templates
   are genuinely different and stay separate.
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { apiFetch } from "./adminApi.js";
import { fmtDate, fmtDuration, fmtNum, statusPill, tableMessage } from "./format.js";

export async function loadScrapeOverview() {
  try {
    const d = await apiFetch("/api/admin/scrape-logs?limit=8");
    const running = d.logs.find((l) => !l.finished_at);

    const banner = document.getElementById("scrapeRunningBanner");
    if (running) {
      banner.hidden = false;
      document.getElementById("scrapeRunningLabel").textContent =
        `Full scrape #${running.id}`;
      const fill = document.getElementById("scrapeRunningFill");
      if (running.players_upserted) {
        fill.style.width = "60%";
      } else {
        fill.style.width = "20%";
      }
    } else {
      banner.hidden = true;
    }

    const tbody = document.getElementById("scrapeLogsBody");
    if (!d.logs.length) {
      tbody.innerHTML = tableMessage(6, "No scrape runs yet");
      return;
    }
    tbody.innerHTML = d.logs.map((l) => `
      <tr>
        <td class="td-mono">#${l.id}</td>
        <td><span class="phase-pill is-lobby">${escapeHtml(l.scrape_type.toUpperCase())}</span></td>
        <td>${l.players_upserted != null ? fmtNum(l.players_upserted) : "—"}</td>
        <td class="td-dim">${fmtDuration(l.started_at, l.finished_at)}</td>
        <td class="td-dim">${fmtDate(l.started_at)}</td>
        <td>${statusPill(l)}</td>
      </tr>
    `).join("");
  } catch {
    document.getElementById("scrapeLogsBody").innerHTML = tableMessage(6, "Failed to load");
  }
}

export async function loadScrapesFull() {
  const tbody = document.getElementById("scrapeFullBody");
  tbody.innerHTML = tableMessage(8, "Loading…");
  try {
    const d = await apiFetch("/api/admin/scrape-logs?limit=50");
    if (!d.logs.length) {
      tbody.innerHTML = tableMessage(8, "No scrape runs yet");
      return;
    }
    tbody.innerHTML = d.logs.map((l) => `
      <tr>
        <td class="td-mono">#${l.id}</td>
        <td><span class="phase-pill is-lobby">${escapeHtml(l.scrape_type.toUpperCase())}</span></td>
        <td>${l.players_upserted != null ? fmtNum(l.players_upserted) : "—"}</td>
        <td class="td-dim">${fmtDuration(l.started_at, l.finished_at)}</td>
        <td class="td-dim">${fmtDate(l.started_at)}</td>
        <td class="td-dim">${fmtDate(l.finished_at)}</td>
        <td class="td-mono td-dim">${l.max_pesdb_id ? fmtNum(l.max_pesdb_id) : "—"}</td>
        <td>${statusPill(l)}</td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = tableMessage(8, "Failed to load");
  }
}

export function initScrapePanels() {
  document.getElementById("refreshScrapes").addEventListener("click", loadScrapeOverview);
  document.getElementById("refreshScrapesFull").addEventListener("click", loadScrapesFull);
}
