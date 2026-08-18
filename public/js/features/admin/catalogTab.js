/* ============================================================
   CATALOG — paginated browser over the scraped player catalog + CSV export

   Reads the public `/api/players`, not an admin route, so these two fetches are
   the only ones on the page that carry no console token.

   The endpoint returns a page, never a count, so there is no total to show and
   no last page to jump to: a full page means "there is probably more", which is
   all NEXT needs to know.
   ============================================================ */

import { CARD_IMG, escapeHtml } from "@/shared/players/playerMeta.js";
import { cardTypeBadge, tableMessage } from "./format.js";

const PAGE_SIZE = 25;
const EXPORT_LIMIT = 5000;
const COLS = 8;

/* `name_desc` is the A–Z option on purpose: SORT_MAP in catalogQuery.js maps
   name_desc -> `name ASC`. The key names there describe the arrow the home page
   draws, not the direction MySQL sorts. */
const SORTS = [
  { key: "overall_max_desc", label: "OVERALL MAX ↓" },
  { key: "overall_max_asc",  label: "OVERALL MAX ↑" },
  { key: "overall_desc",     label: "OVERALL ↓" },
  { key: "name_desc",        label: "NAME A–Z" },
  { key: "position_asc",     label: "POSITION" },
];

/** CSV column header -> the field name the API actually returns. */
const EXPORT_COLUMNS = [
  ["pesdb_id", "id"], ["name", "name"], ["position", "position"],
  ["overall", "overall"], ["overall_max", "overall_max"], ["card_type", "card_type"],
  ["club", "club"], ["league", "league"], ["nationality", "nationality"],
  ["region", "region"], ["foot", "foot"], ["playing_style", "playing_style"],
  ["height", "height"], ["weight", "weight"], ["age", "age"],
];

let page = 0;
let sortIdx = 0;
let search = "";
let searchTimer = null;

function catalogUrl(limit, offset) {
  const params = new URLSearchParams({ sortBy: SORTS[sortIdx].key, limit, offset });
  if (search) params.set("q", search);
  return `/api/players?${params}`;
}

async function fetchPlayers(limit, offset) {
  const r = await fetch(catalogUrl(limit, offset));
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return d.players || [];
}

export async function loadCatalog() {
  const tbody = document.getElementById("catalogBody");
  tbody.innerHTML = tableMessage(COLS, "Loading…");

  const offset = page * PAGE_SIZE;
  try {
    const players = await fetchPlayers(PAGE_SIZE, offset);
    const hasMore = players.length === PAGE_SIZE;

    document.getElementById("catalogPrev").disabled = page === 0;
    document.getElementById("catalogNext").disabled = !hasMore;

    if (!players.length) {
      tbody.innerHTML = tableMessage(COLS, search ? "No players match that name" : "Catalog is empty");
      document.getElementById("catalogPageInfo").textContent = "0 results";
      return;
    }

    tbody.innerHTML = players.map((p, i) => `
      <tr>
        <td class="td-rank">${offset + i + 1}</td>
        <td>${escapeHtml(p.name)}</td>
        <td class="td-dim">${escapeHtml(p.position || "—")}</td>
        <td class="td-ovr">${p.overall ?? "—"}</td>
        <td class="td-ovr">${p.overall_max ?? "—"}</td>
        <td>${cardTypeBadge(p.card_type)}</td>
        <td class="td-dim">${escapeHtml(p.club || "—")}</td>
        <td><a class="td-mono link-btn" href="${CARD_IMG(p.id)}" target="_blank">${escapeHtml(String(p.id))}</a></td>
      </tr>`).join("");

    document.getElementById("catalogPageInfo").textContent =
      `${offset + 1}–${offset + players.length}`;
  } catch {
    tbody.innerHTML = tableMessage(COLS, "Failed to load");
  }
}

/** Exports the current sort and search — every page of it, not the one on screen. */
async function exportCsv(btn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "EXPORTING…";
  try {
    const players = await fetchPlayers(EXPORT_LIMIT, 0);
    const csv = [
      EXPORT_COLUMNS.map(([header]) => header).join(","),
      ...players.map((p) =>
        EXPORT_COLUMNS.map(([, key]) => `"${String(p[key] ?? "").replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `catalog_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    /* Revoking in the same tick cancels the download in Safari. */
    setTimeout(() => URL.revokeObjectURL(url), 0);
    btn.textContent = label;
  } catch {
    btn.textContent = "EXPORT FAILED";
    setTimeout(() => { btn.textContent = label; }, 2000);
  } finally {
    btn.disabled = false;
  }
}

export function initCatalogTab() {
  document.getElementById("catalogSortBtn").addEventListener("click", () => {
    sortIdx = (sortIdx + 1) % SORTS.length;
    document.getElementById("catalogSortLabel").textContent = SORTS[sortIdx].label;
    page = 0;
    loadCatalog();
  });

  document.getElementById("catalogSearch").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value.trim();
    searchTimer = setTimeout(() => {
      search = value;
      page = 0;
      loadCatalog();
    }, 300);
  });

  document.getElementById("catalogPrev").addEventListener("click", () => {
    page--;
    loadCatalog();
  });

  /* Both buttons are disabled at the ends of the range, and a disabled button
     dispatches no click, so neither handler needs a bounds check of its own. */
  document.getElementById("catalogNext").addEventListener("click", () => {
    page++;
    loadCatalog();
  });

  document.getElementById("exportCsvBtn").addEventListener("click", (e) => exportCsv(e.currentTarget));
}
