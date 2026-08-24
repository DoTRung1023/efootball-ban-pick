/* ============================================================
   CATALOG — paginated browser over the scraped player catalog

   Reads the public `/api/players`, not an admin route, so these fetches are the
   only ones on the page that carry no console token.

   The endpoint returns a page, never a count, so there is no total to show and
   no last page to jump to: a full page means "there is probably more", which is
   all NEXT needs to know.

   Sort and filter are the **same** controls as My Players — `SORT_CATEGORIES`
   and `buildPlayerFilterPanel`, not console-local copies — so the two cannot
   drift into offering different options over the same table. The columns are
   the console's own: `catalogColumns.js` says which are fixed, which are
   optional, and which are on. Enough of them are optional that the table can
   outgrow the panel, which is why `.table-wrap` scrolls sideways.
   ============================================================ */

import { CARD_IMG, escapeHtml } from "@/shared/players/playerMeta.js";
import { icon } from "@/shared/icons/icon.js";
import { SORT_CATEGORIES } from "@/shared/players/sort.js";
import {
  buildPlayerFilterPanel,
  createPlayerFilterState,
  getPlayerFilterOptions,
  hasActivePlayerFilters,
  playerFilterParams,
  resetPlayerFilterState,
} from "@/shared/players/filterPanel.js";
import { closeDdPanel, toggleDdPanel } from "@/shared/ui/dropdown.js";
import { CATALOG_COLUMNS, isColumnOn, resetColumns, toggleColumn, visibleColumns }
  from "./catalogColumns.js";
import { cardTypeBadge, tableMessage } from "./format.js";

const PAGE_SIZE = 25;

/** Filter fields plus the paging and sort state the panel does not own. */
const state = {
  ...createPlayerFilterState(),
  sortCategory: "overall_max",
  sortDir: "desc",
  page: 0,
  search: "",
};

let searchTimer = null;

const el = (id) => document.getElementById(id);

/* ── Query ────────────────────────────────────────────────── */

function sortValue() {
  const cat = SORT_CATEGORIES.find((c) => c.key === state.sortCategory) || SORT_CATEGORIES[0];
  return state.sortDir === "asc" ? cat.ascVal : cat.descVal;
}

function catalogUrl(offset) {
  const params = playerFilterParams(
    state,
    new URLSearchParams({ limit: PAGE_SIZE, offset, sortBy: sortValue() }),
  );
  if (state.search) params.set("q", state.search);
  return `/api/players?${params}`;
}

async function fetchPlayers(offset) {
  const r = await fetch(catalogUrl(offset));
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return d.players || [];
}

/* ── Cells ────────────────────────────────────────────────── */

const dim = (v) => `<td class="td-dim">${escapeHtml(String(v ?? "—"))}</td>`;
const plain = (v) => `<td>${escapeHtml(String(v ?? "—"))}</td>`;
const num = (v) => `<td class="td-ovr">${v ?? "—"}</td>`;

/** One renderer per column key; anything absent falls back to a dim cell. */
const CELLS = {
  name: (p) => `<td>${escapeHtml(p.name)}</td>`,
  position: (p) => dim(p.position),
  overall: (p) => num(p.overall),
  overall_max: (p) => num(p.overall_max),
  card_type: (p) => `<td>${cardTypeBadge(p.card_type)}</td>`,
  club: (p) => dim(p.club),
  id: (p) => `<td><a class="td-mono link-btn" href="${CARD_IMG(p.id)}" target="_blank">${escapeHtml(String(p.id))}</a></td>`,
  height: (p) => num(p.height),
  weight: (p) => num(p.weight),
  age: (p) => num(p.age),
};

function cellHtml(column, player, rank) {
  if (column.key === "rank") return `<td class="td-rank">${rank}</td>`;
  const render = CELLS[column.key];
  return render ? render(player) : dim(player[column.key]);
}

/* ── Rendering ────────────────────────────────────────────── */

export async function loadCatalog() {
  const columns = visibleColumns();
  const tbody = el("catalogBody");

  el("catalogHead").innerHTML = columns
    .map((c) => `<th>${escapeHtml(c.label)}</th>`)
    .join("");
  tbody.innerHTML = tableMessage(columns.length, "Loading…");

  const offset = state.page * PAGE_SIZE;
  try {
    const players = await fetchPlayers(offset);
    const hasMore = players.length === PAGE_SIZE;

    el("catalogPrev").disabled = state.page === 0;
    el("catalogNext").disabled = !hasMore;

    if (!players.length) {
      const why = state.search || hasActivePlayerFilters(state)
        ? "No players match those filters"
        : "Catalog is empty";
      tbody.innerHTML = tableMessage(columns.length, why);
      el("catalogPageInfo").textContent = "0 results";
      return;
    }

    tbody.innerHTML = players
      .map((p, i) => `<tr>${columns.map((c) => cellHtml(c, p, offset + i + 1)).join("")}</tr>`)
      .join("");

    el("catalogPageInfo").textContent = `${offset + 1}–${offset + players.length}`;
  } catch {
    tbody.innerHTML = tableMessage(columns.length, "Failed to load");
  }
}

/** Any change to what is being asked for sends you back to the first page. */
function reload() {
  state.page = 0;
  loadCatalog();
}

/* ── Sort dropdown ────────────────────────────────────────── */

function updateSortUi() {
  const cat = SORT_CATEGORIES.find((c) => c.key === state.sortCategory);
  el("acSortLabel").textContent = cat ? cat.label.toUpperCase() : "SORT";
  el("acSortDirIcon").innerHTML = state.sortDir === "desc" ? icon("arrow-down", { size: 13 }) : icon("arrow-up", { size: 13 });
  el("acSortDirBtn").title = cat
    ? (state.sortDir === "desc" ? cat.descTip : cat.ascTip)
    : "Toggle sort direction";
  document.querySelectorAll("#acSortPanel .sort-option").forEach((opt) => {
    opt.classList.toggle("active", opt.dataset.sort === state.sortCategory);
  });
}

function buildSortPanel() {
  const panel = document.createElement("div");
  panel.className = "ap-dd-panel sort-dd-panel";
  panel.id = "acSortPanel";

  SORT_CATEGORIES.forEach((cat) => {
    const item = document.createElement("div");
    item.className = `sort-option${cat.key === state.sortCategory ? " active" : ""}`;
    item.dataset.sort = cat.key;
    item.innerHTML = `<span>${escapeHtml(cat.label)}</span>
      ${icon("check", { size: 13, className: "sort-check" })}`;
    item.addEventListener("click", () => {
      state.sortCategory = cat.key;
      updateSortUi();
      closeDdPanel("acSortPanel", "acSortBtn");
      reload();
    });
    panel.appendChild(item);
  });
  return panel;
}

/* ── Filter dropdown ──────────────────────────────────────── */

/* The panel addresses every control by id, so the console needs its own set —
   these share a `cc` prefix so they cannot collide with the home page's. */
const FILTER_IDS = {
  posWrap: "ccPosMs", posBtn: "ccPosMsBtn", posLabel: "ccPosMsLabel", posPanel: "ccPosMsPanel",
  ctWrap: "ccCtMs", ctBtn: "ccCtMsBtn", ctLabel: "ccCtMsLabel", ctPanel: "ccCtMsPanel",
  psWrap: "ccPsMs", psBtn: "ccPsMsBtn", psLabel: "ccPsMsLabel", psPanel: "ccPsMsPanel",
  footWrap: "ccFootMs", footBtn: "ccFootMsBtn", footLabel: "ccFootMsLabel", footPanel: "ccFootMsPanel",
  lgWrap: "ccLgMs", lgBtn: "ccLgMsBtn", lgLabel: "ccLgMsLabel", lgPanel: "ccLgMsPanel",
  rgWrap: "ccRgMs", rgBtn: "ccRgMsBtn", rgLabel: "ccRgMsLabel", rgPanel: "ccRgMsPanel",
  ovrMin: "ccOvrMin", ovrMax: "ccOvrMax",
  ovrMaxMin: "ccOvrMaxMin", ovrMaxMax: "ccOvrMaxMax",
  club: "ccClub", clubAc: "ccClubAc", nation: "ccNation", nationAc: "ccNationAc",
  ageMin: "ccAgeMin", ageMax: "ccAgeMax",
  heightMin: "ccHeightMin", heightMax: "ccHeightMax",
  weightMin: "ccWeightMin", weightMax: "ccWeightMax",
  clearBtn: "ccClearFilters",
};

function updateFilterBadge() {
  el("acFilterBtn").classList.toggle("has-active", hasActivePlayerFilters(state));
}

function buildFilterPanel() {
  return buildPlayerFilterPanel({
    panelId: "acFilterPanel",
    ids: FILTER_IDS,
    state,
    autocomplete: true,
    onChange: () => { updateFilterBadge(); reload(); },
    onClear: () => {
      resetPlayerFilterState(state);
      /* Rebuilt rather than walked, so every input resets visually too. */
      el("acFilterPanel")?.remove();
      el("acFilterWrap").appendChild(buildFilterPanel());
      updateFilterBadge();
      reload();
    },
  });
}

/* ── Column chooser ───────────────────────────────────────── */

function buildColumnsPanel() {
  const panel = document.createElement("div");
  panel.className = "ap-dd-panel cols-dd-panel";
  panel.id = "acColsPanel";

  const optional = CATALOG_COLUMNS.filter((c) => !c.fixed);
  const fixedNames = CATALOG_COLUMNS.filter((c) => c.fixed).map((c) => c.label).join(" · ");

  panel.innerHTML = `<div class="filter-section-label">ALWAYS SHOWN — ${escapeHtml(fixedNames)}</div>`;

  optional.forEach((col) => {
    const item = document.createElement("div");
    item.className = `pos-ms-item${isColumnOn(col.key) ? " checked" : ""}`;
    item.innerHTML = `<span class="pos-ms-check"></span><span>${escapeHtml(col.label)}</span>`;
    item.addEventListener("click", (ev) => {
      ev.stopPropagation();
      toggleColumn(col.key);
      item.classList.toggle("checked", isColumnOn(col.key));
      /* Only the table is redrawn — the page of players it is drawing has not
         changed, so this must not go back to page one or refetch. */
      loadCatalog();
    });
    panel.appendChild(item);
  });

  const reset = document.createElement("button");
  reset.className = "filter-clear-btn";
  reset.textContent = "RESET TO DEFAULT COLUMNS";
  reset.addEventListener("click", (ev) => {
    ev.stopPropagation();
    resetColumns();
    rebuildColumnsPanel();
    closeDdPanel("acColsPanel", "acColsBtn");
    loadCatalog();
  });
  panel.appendChild(reset);

  return panel;
}

/**
 * Redraws the chooser from the current selection.
 *
 * Each item's tick is written once, when the item is built, so anything that
 * changes the selection from outside this panel has to rebuild it. Two callers:
 * RESET, and the console applying this admin's stored columns — which arrive
 * after `initCatalogTab` has already wired a panel full of defaults.
 */
export function rebuildColumnsPanel() {
  el("acColsPanel")?.remove();
  el("acColsWrap").appendChild(buildColumnsPanel());
}

/* ── Wiring ───────────────────────────────────────────────── */

export function initCatalogTab() {
  el("acSortWrap").appendChild(buildSortPanel());
  el("acFilterWrap").appendChild(buildFilterPanel());
  el("acColsWrap").appendChild(buildColumnsPanel());
  updateSortUi();
  updateFilterBadge();
  /* Warms the cache the multiselects fill from, so the first open is not empty. */
  getPlayerFilterOptions();

  /* Three panels, one open at a time. `toggleDdPanel` only closes one sibling,
     so the other two are closed here before it opens the third. */
  const panels = [
    ["acSortPanel", "acSortBtn"],
    ["acFilterPanel", "acFilterBtn"],
    ["acColsPanel", "acColsBtn"],
  ];
  panels.forEach(([panelId, btnId]) => {
    el(btnId).addEventListener("click", (ev) => {
      ev.stopPropagation();
      panels.forEach(([otherPanel, otherBtn]) => {
        if (otherPanel !== panelId) closeDdPanel(otherPanel, otherBtn);
      });
      toggleDdPanel(panelId, btnId);
    });
  });
  /* Clicking anywhere else closes all three; the panels stop their own clicks
     from reaching this. */
  document.addEventListener("click", () => {
    panels.forEach(([panelId, btnId]) => closeDdPanel(panelId, btnId));
  });
  el("acSortWrap").addEventListener("click", (ev) => ev.stopPropagation());
  el("acFilterWrap").addEventListener("click", (ev) => ev.stopPropagation());
  el("acColsWrap").addEventListener("click", (ev) => ev.stopPropagation());

  el("acSortDirBtn").addEventListener("click", () => {
    state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
    updateSortUi();
    reload();
  });

  el("catalogSearch").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value.trim();
    searchTimer = setTimeout(() => {
      state.search = value;
      reload();
    }, 300);
  });

  el("catalogPrev").addEventListener("click", () => {
    state.page--;
    loadCatalog();
  });

  /* Both buttons are disabled at the ends of the range, and a disabled button
     dispatches no click, so neither handler needs a bounds check of its own. */
  el("catalogNext").addEventListener("click", () => {
    state.page++;
    loadCatalog();
  });
}
