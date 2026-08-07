/* ============================================================
   PLAYERS tab — paginated catalog browser + CSV export

   Reads the public `/api/players` endpoint, not an admin one, so it needs no
   admin key. `catalogTotal` is an estimate: the endpoint returns a page, not a
   count, so a full page is assumed to have at least one more row behind it —
   which is all the Next button needs to know.
   ============================================================ */

import { CARD_IMG, escapeHtml } from "@/shared/players/playerMeta.js";
import { cardTypeBadge, tableMessage } from "./format.js";

const CATALOG_LIMIT = 8;

const CATALOG_SORTS = [
  { key: "overall_max_desc", label: "OVERALL MAX ↓" },
  { key: "overall_max_asc",  label: "OVERALL MAX ↑" },
  { key: "overall_desc",     label: "OVERALL ↓" },
  { key: "name_asc",         label: "NAME A–Z" },
  { key: "position_asc",     label: "POSITION" },
];

let catalogPage = 0;
let catalogTotal = 0;
let catalogSort = "overall_max_desc";
let catalogSearch = "";
let searchTimer = null;
let sortIdx = 0;

function catalogUrl(limit, offset) {
  let url = `/api/players?sortBy=${catalogSort}&limit=${limit}&offset=${offset}`;
  if (catalogSearch) url += `&q=${encodeURIComponent(catalogSearch)}`;
  return url;
}

export async function loadCatalog() {
  const tbody = document.getElementById("catalogBody");
  tbody.innerHTML = tableMessage(11, "Loading…");
  try {
    const offset = catalogPage * CATALOG_LIMIT;
    const r = await fetch(catalogUrl(CATALOG_LIMIT, offset));
    const d = await r.json();
    const players = d.players || [];

    if (!players.length) {
      tbody.innerHTML = tableMessage(11, "No players found");
      document.getElementById("catalogPageInfo").textContent = "0 results";
      document.getElementById("catalogPrev").disabled = true;
      document.getElementById("catalogNext").disabled = true;
      return;
    }

    catalogTotal = players.length < CATALOG_LIMIT
      ? offset + players.length
      : offset + players.length + 1; // approximate

    tbody.innerHTML = players.map((p, i) => `
      <tr>
        <td class="td-rank">${offset + i + 1}</td>
        <td>${escapeHtml(p.name)}</td>
        <td class="td-dim">${escapeHtml(p.position || "—")}</td>
        <td class="td-ovr">${p.overall ?? "—"}</td>
        <td class="td-max">${p.overall_max ?? "—"}</td>
        <td>${cardTypeBadge(p.card_type)}</td>
        <td class="td-dim">${escapeHtml(p.club || "—")}</td>
        <td class="td-dim">${escapeHtml(p.league || "—")}</td>
        <td class="td-dim">${escapeHtml(p.region || "—")}</td>
        <td class="td-mono td-dim">${p.id}</td>
        <td><a href="${CARD_IMG(p.id)}" target="_blank" class="watch-btn">VIEW</a></td>
      </tr>
    `).join("");

    const start = offset + 1;
    const end = offset + players.length;
    document.getElementById("catalogPageInfo").textContent = `${start}–${end}`;
    document.getElementById("catalogPrev").disabled = catalogPage === 0;
    document.getElementById("catalogNext").disabled = players.length < CATALOG_LIMIT;
  } catch {
    tbody.innerHTML = tableMessage(11, "Failed to load");
  }
}

/** Exports the current sort/search, not the current page — up to 5 000 rows. */
async function exportCsv() {
  try {
    const r = await fetch(catalogUrl(5000, 0));
    const d = await r.json();
    const players = d.players || [];

    const header = ["pesdb_id","name","position","overall","overall_max","card_type","club","league","nationality","region","foot","playing_style","height","weight","age"];
    const rows = players.map((p) =>
      header.map((k) => {
        const v = String(p[k] ?? "").replace(/"/g, '""');
        return `"${v}"`;
      }).join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `catalog_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    alert("Export failed.");
  }
}

export function initCatalogTable() {
  document.getElementById("catalogSortBtn").addEventListener("click", () => {
    sortIdx = (sortIdx + 1) % CATALOG_SORTS.length;
    catalogSort = CATALOG_SORTS[sortIdx].key;
    document.getElementById("catalogSortLabel").textContent = CATALOG_SORTS[sortIdx].label;
    catalogPage = 0;
    loadCatalog();
  });

  document.getElementById("catalogSearch").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      catalogSearch = e.target.value.trim();
      catalogPage = 0;
      loadCatalog();
    }, 300);
  });

  document.getElementById("catalogPrev").addEventListener("click", () => {
    if (catalogPage > 0) { catalogPage--; loadCatalog(); }
  });

  document.getElementById("catalogNext").addEventListener("click", () => {
    if ((catalogPage + 1) * CATALOG_LIMIT < catalogTotal) { catalogPage++; loadCatalog(); }
  });

  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
}
