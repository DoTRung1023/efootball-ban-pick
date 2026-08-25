/* ============================================================
   SHOWCASE browser — the catalog, filtered, for picking a showcase list

   The same controls as My Players and the CATALOG tab, from the same modules:
   `SORT_CATEGORIES` and `buildPlayerFilterPanel`. Three browsers over one
   table; none of them owns a private copy of what "sort by overall max" or
   "position: CF" means.

   It reads the public `/api/players`, so filtering happens in SQL rather than
   over a page of results — the catalog is ~42k rows and there is no version of
   client-side filtering that is honest about that.

   This module knows nothing about saving. It renders cards and calls back when
   one is clicked; `topPlayersControl.js` owns the list itself and draws it as
   card art in the CHOSEN column. That split is why the grid can repaint from
   `refreshShowcaseMarks()` without either side reaching into the other.
   ============================================================ */

import { CARD_IMG, escapeHtml, makePlayerImg, playerDetailSublineHtml }
  from "@/shared/players/playerMeta.js";
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

const el = (id) => document.getElementById(id);

const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;

const state = {
  ...createPlayerFilterState(),
  sortCategory: "overall_max",
  sortDir: "desc",
  search: "",
  rows: [],
  offset: 0,
  more: false,
  showInfo: true,
};

/** Supplied by the list owner; this module never mutates the picked list. */
let hooks = { isPicked: () => false, canPick: () => true, onToggle: () => {} };
let searchTimer = null;

const FILTER_IDS = {
  posWrap: "scPosMs", posBtn: "scPosMsBtn", posLabel: "scPosMsLabel", posPanel: "scPosMsPanel",
  ctWrap: "scCtMs", ctBtn: "scCtMsBtn", ctLabel: "scCtMsLabel", ctPanel: "scCtMsPanel",
  psWrap: "scPsMs", psBtn: "scPsMsBtn", psLabel: "scPsMsLabel", psPanel: "scPsMsPanel",
  footWrap: "scFootMs", footBtn: "scFootMsBtn", footLabel: "scFootMsLabel", footPanel: "scFootMsPanel",
  lgWrap: "scLgMs", lgBtn: "scLgMsBtn", lgLabel: "scLgMsLabel", lgPanel: "scLgMsPanel",
  rgWrap: "scRgMs", rgBtn: "scRgMsBtn", rgLabel: "scRgMsLabel", rgPanel: "scRgMsPanel",
  ovrMin: "scOvrMin", ovrMax: "scOvrMax",
  ovrMaxMin: "scOvrMaxMin", ovrMaxMax: "scOvrMaxMax",
  club: "scClub", clubAc: "scClubAc", nation: "scNation", nationAc: "scNationAc",
  ageMin: "scAgeMin", ageMax: "scAgeMax",
  heightMin: "scHeightMin", heightMax: "scHeightMax",
  weightMin: "scWeightMin", weightMax: "scWeightMax",
  clearBtn: "scClearFilters",
};

/* ── Query ──────────────────────────────────────────────────── */

function sortValue() {
  const cat = SORT_CATEGORIES.find((c) => c.key === state.sortCategory) || SORT_CATEGORIES[0];
  return state.sortDir === "asc" ? cat.ascVal : cat.descVal;
}

function browseUrl() {
  const params = playerFilterParams(
    state,
    new URLSearchParams({ limit: PAGE_SIZE, offset: state.offset, sortBy: sortValue() }),
  );
  if (state.search) params.set("q", state.search);
  return `/api/players?${params}`;
}

/** `append` is the LOAD MORE path; everything else replaces the page. */
async function fetchPage({ append = false } = {}) {
  try {
    const res = await fetch(browseUrl());
    const data = await res.json();
    const rows = data.players || [];
    state.rows = append ? [...state.rows, ...rows] : rows;
    /* A full page means "probably more"; the endpoint returns no total. */
    state.more = rows.length === PAGE_SIZE;
  } catch {
    if (!append) state.rows = [];
    state.more = false;
  }
  renderGrid();
}

function reload() {
  state.offset = 0;
  fetchPage();
}

/* ── Cards ──────────────────────────────────────────────────── */

function makeCard(player) {
  const id = String(player.id);
  const card = document.createElement("div");
  card.className = "player-card sc-card";
  card.dataset.id = id;

  const wrap = document.createElement("div");
  wrap.className = "pc-img-wrap";
  wrap.dataset.initial = (player.name || "?")[0];
  wrap.appendChild(makePlayerImg(CARD_IMG(id), player.name));

  card.appendChild(wrap);

  const footer = document.createElement("div");
  footer.className = "pc-footer";
  footer.innerHTML =
    `<div class="pc-footer-meta pmeta-in-card pc-footer-detail-only">${playerDetailSublineHtml(player)}</div>`;
  card.appendChild(footer);

  card.addEventListener("click", () => hooks.onToggle(id, player.name));
  return card;
}

/**
 * The cap, and nothing else.
 *
 * A card carried a tick and an accent outline when it was on the list. That
 * indication moved out to the CHOSEN column, so what is left here is the one
 * state the column cannot show: *this* card cannot be added, because the list
 * is full. A card already on the list is never blocked — clicking it is how
 * you make room.
 *
 * Toggles a class rather than rebuilding, so a repaint costs nothing.
 */
export function refreshShowcaseMarks() {
  const grid = el("scGrid");
  if (!grid) return;
  const full = !hooks.canPick();
  grid.querySelectorAll(".sc-card").forEach((card) => {
    card.classList.toggle("is-blocked", full && !hooks.isPicked(card.dataset.id));
  });
}

function renderGrid() {
  const grid = el("scGrid");
  if (!grid) return;
  grid.innerHTML = "";
  if (!state.rows.length) {
    grid.innerHTML = `<div class="sc-empty">No cards match.</div>`;
    el("scMore").hidden = true;
    return;
  }
  state.rows.forEach((p) => grid.appendChild(makeCard(p)));
  grid.classList.toggle("info-hidden", !state.showInfo);
  el("scMore").hidden = !state.more;
  refreshShowcaseMarks();
}

/* ── Toolbar ────────────────────────────────────────────────── */

function updateSortUi() {
  const cat = SORT_CATEGORIES.find((c) => c.key === state.sortCategory);
  el("scSortLabel").textContent = cat ? cat.label.toUpperCase() : "SORT";
  el("scSortDirIcon").innerHTML = state.sortDir === "desc"
    ? icon("arrow-down", { size: 13 })
    : icon("arrow-up", { size: 13 });
  el("scSortDirBtn").title = cat
    ? (state.sortDir === "desc" ? cat.descTip : cat.ascTip)
    : "Toggle sort direction";
  document.querySelectorAll("#scSortPanel .sort-option").forEach((opt) => {
    opt.classList.toggle("active", opt.dataset.sort === state.sortCategory);
  });
}

function buildSortPanel() {
  const panel = document.createElement("div");
  panel.className = "ap-dd-panel sort-dd-panel";
  panel.id = "scSortPanel";
  SORT_CATEGORIES.forEach((cat) => {
    const item = document.createElement("div");
    item.className = `sort-option${cat.key === state.sortCategory ? " active" : ""}`;
    item.dataset.sort = cat.key;
    item.innerHTML = `<span>${escapeHtml(cat.label)}</span>`
      + icon("check", { size: 13, className: "sort-check" });
    item.addEventListener("click", () => {
      state.sortCategory = cat.key;
      updateSortUi();
      closeDdPanel("scSortPanel", "scSortBtn");
      reload();
    });
    panel.appendChild(item);
  });
  return panel;
}

function updateFilterBadge() {
  el("scFilterBtn").classList.toggle("has-active", hasActivePlayerFilters(state));
}

function buildFilterPanel() {
  return buildPlayerFilterPanel({
    panelId: "scFilterPanel",
    ids: FILTER_IDS,
    state,
    autocomplete: true,
    onChange: () => { updateFilterBadge(); reload(); },
    onClear: () => {
      resetPlayerFilterState(state);
      el("scFilterPanel")?.remove();
      el("scFilterWrap").appendChild(buildFilterPanel());
      updateFilterBadge();
      reload();
    },
  });
}

function updateInfoUi() {
  const btn = el("scInfoBtn");
  btn.textContent = state.showInfo ? "HIDE INFO" : "SHOW INFO";
  btn.classList.toggle("is-off", !state.showInfo);
  btn.setAttribute("aria-pressed", state.showInfo ? "true" : "false");
  el("scGrid").classList.toggle("info-hidden", !state.showInfo);
}

export function initShowcaseBrowser(callbacks) {
  hooks = { ...hooks, ...callbacks };

  el("scSortWrap").appendChild(buildSortPanel());
  el("scFilterWrap").appendChild(buildFilterPanel());
  updateSortUi();
  updateFilterBadge();
  updateInfoUi();
  getPlayerFilterOptions();

  /* Two panels, one open at a time — the same dance the CATALOG tab does. */
  const panels = [["scSortPanel", "scSortBtn"], ["scFilterPanel", "scFilterBtn"]];
  panels.forEach(([panelId, btnId]) => {
    el(btnId).addEventListener("click", (ev) => {
      ev.stopPropagation();
      panels.forEach(([other, otherBtn]) => { if (other !== panelId) closeDdPanel(other, otherBtn); });
      toggleDdPanel(panelId, btnId);
    });
  });
  document.addEventListener("click", () => {
    panels.forEach(([panelId, btnId]) => closeDdPanel(panelId, btnId));
  });
  el("scSortWrap").addEventListener("click", (ev) => ev.stopPropagation());
  el("scFilterWrap").addEventListener("click", (ev) => ev.stopPropagation());

  el("scSortDirBtn").addEventListener("click", () => {
    state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
    updateSortUi();
    reload();
  });

  el("scSearch").addEventListener("input", (e) => {
    const value = e.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.search = value; reload(); }, SEARCH_DEBOUNCE_MS);
  });

  el("scInfoBtn").addEventListener("click", () => {
    state.showInfo = !state.showInfo;
    updateInfoUi();
  });

  el("scMore").addEventListener("click", () => {
    state.offset += PAGE_SIZE;
    fetchPage({ append: true });
  });

  reload();
}
