/* ============================================================
   Data quality — four COUNT queries over players_catalog

   The bar width is scaled 8× so a fraction of a percent is still visible;
   the printed percentage is the true one.
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { apiFetch } from "./adminApi.js";
import { fmtNum } from "./format.js";

export async function loadDataQuality() {
  try {
    const d = await apiFetch("/api/admin/data-quality");
    const total = d.total || 1;

    const rows = [
      { label: "Missing playing style", count: d.missingStyle },
      { label: "Missing region",        count: d.missingRegion },
      { label: "Missing overall max",   count: d.missingOverallMax },
      { label: "Duplicate pesdb_id",    count: d.dupPesdbId },
    ];

    document.getElementById("dataQualityBody").innerHTML = rows.map((r) => {
      const pct = ((r.count / total) * 100).toFixed(2);
      const barClass = r.count === 0 ? "is-ok" : pct > 10 ? "is-bad" : "is-warn";
      return `
        <div class="dq-row">
          <span class="dq-label">${escapeHtml(r.label)}</span>
          <span class="dq-count">${fmtNum(r.count)}</span>
          <span class="dq-pct">(${pct}%)</span>
          <div class="dq-bar-wrap">
            <div class="dq-bar ${barClass}" style="width:${Math.min(100, (r.count / total) * 800).toFixed(1)}%"></div>
          </div>
        </div>
      `;
    }).join("");
  } catch {
    document.getElementById("dataQualityBody").innerHTML =
      `<div class="dq-row dq-skeleton">Failed to load</div>`;
  }
}
