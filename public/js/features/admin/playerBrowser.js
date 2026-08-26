/* ============================================================
   Player browser — the catalog, filtered, as a grid you can pick from

   Two tabs run one of these: SIGN-IN PAGE picks a showcase list, TEST CARDS
   marks placeholder rows. Both want the same controls My Players and the
   CATALOG tab have, and they come from the same modules — `SORT_CATEGORIES`
   and `buildPlayerFilterPanel`. Four browsers over one table; none of them owns
   a private copy of what "sort by overall max" or "position: CF" means.

   ## A factory, not a module with state

   It used to be a singleton with module-level `state` and hardcoded `sc…` ids,
   which is fine for one tab and wrong for two — the second would have shared
   the first's rows, offset and filters. Every one of those is a closure now.

   ## Elements in, not ids

   The caller passes **elements**, having looked them up itself. That is not
   ceremony: `scripts/checks/domIds.js` only sees a literal inside
   `getElementById(...)`, so ids routed through a config object are invisible to
   it. Each tab does its own eleven lookups, spelled out, and the check covers
   them. Both control modules dropped their `const el = (id) => …` shorthand for
   the same reason — that alias hides the literal just as effectively, and 67 of
   the console's lookups are still behind it today.

   The two runtime-built dropdown panels are the exception: they are created
   here, so their ids come through as strings and nothing verifies them.

   ## It reads the admin catalog

   `/api/admin/catalog`, not the public `/api/players`: this grid has to show
   cards marked as test data — one tab exists to mark them, and the other has to
   be able to put one on the sign-in page deliberately. The public endpoint
   hides them and has no switch that says otherwise, which is the point.

   The module knows nothing about saving. It renders cards and calls back when
   one is *added*; the tab's control module owns the list, draws it in the side
   panel, and is where removal happens.
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
import { apiFetch } from "./adminApi.js";

const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * @param els        the tab's own elements: search, sortWrap, sortBtn,
 *                   sortLabel, sortDirBtn, sortDirIcon, filterWrap, filterBtn,
 *                   infoBtn, grid, more
 * @param filterIds  the id map `buildPlayerFilterPanel` writes its controls to
 * @param panelIds   { sort, filter } — ids for the two panels built here
 * @param tips       { add, picked, full } — what a card says on hover
 * @param isPicked   is this id already on the tab's list?
 * @param canPick    is there room for another? (`() => true` where there is no cap)
 * @param onAdd      (id, name) for a click on a card that is neither
 */
export function createPlayerBrowser({
  els, filterIds, panelIds, tips,
  isPicked = () => false,
  canPick = () => true,
  onAdd = () => {},
}) {
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
  let searchTimer = null;

  /* ── Query ──────────────────────────────────────────────── */

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
    return `/api/admin/catalog?${params}`;
  }

  /** `append` is the LOAD MORE path; everything else replaces the page. */
  async function fetchPage({ append = false } = {}) {
    try {
      const data = await apiFetch(browseUrl());
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

  /* ── Cards ──────────────────────────────────────────────── */

  function makeCard(player) {
    const id = String(player.id);
    const card = document.createElement("div");
    card.className = "player-card pb-card";
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

    /* Adding is the only thing this grid does. A card already on the list is
       inert here and comes off from the side panel instead — one place that
       adds, one that takes away, rather than a single target whose meaning
       flips depending on state the card no longer has to explain. */
    card.addEventListener("click", () => {
      if (isPicked(id) || !canPick()) return;
      onAdd(id, player.name);
    });
    return card;
  }

  /**
   * The two states a card can be in that are not "click me".
   *
   * `is-picked` — already on the list. `is-blocked` — the list is full and this
   * one is not on it. Toggles classes rather than rebuilding, so a repaint
   * costs nothing.
   */
  function refreshMarks() {
    const full = !canPick();
    els.grid.querySelectorAll(".pb-card").forEach((card) => {
      const picked = isPicked(card.dataset.id);
      card.classList.toggle("is-picked", picked);
      card.classList.toggle("is-blocked", full && !picked);
      /* Set here rather than in `makeCard`: the reason a card is inert changes
         as the list does, and this runs on every change. `renderGrid` calls it
         once a page is built, so a fresh card is never left without one. */
      card.title = picked ? tips.picked : full ? tips.full : tips.add;
    });
  }

  function renderGrid() {
    els.grid.innerHTML = "";
    if (!state.rows.length) {
      els.grid.innerHTML = `<div class="pb-empty">No cards match.</div>`;
      els.more.hidden = true;
      return;
    }
    state.rows.forEach((p) => els.grid.appendChild(makeCard(p)));
    els.grid.classList.toggle("info-hidden", !state.showInfo);
    els.more.hidden = !state.more;
    refreshMarks();
  }

  /* ── Toolbar ────────────────────────────────────────────── */

  let sortPanel = null;

  function updateSortUi() {
    const cat = SORT_CATEGORIES.find((c) => c.key === state.sortCategory);
    els.sortLabel.textContent = cat ? cat.label.toUpperCase() : "SORT";
    els.sortDirIcon.innerHTML = state.sortDir === "desc"
      ? icon("arrow-down", { size: 13 })
      : icon("arrow-up", { size: 13 });
    els.sortDirBtn.title = cat
      ? (state.sortDir === "desc" ? cat.descTip : cat.ascTip)
      : "Toggle sort direction";
    sortPanel?.querySelectorAll(".sort-option").forEach((opt) => {
      opt.classList.toggle("active", opt.dataset.sort === state.sortCategory);
    });
  }

  function buildSortPanel() {
    const panel = document.createElement("div");
    panel.className = "ap-dd-panel sort-dd-panel";
    panel.id = panelIds.sort;
    SORT_CATEGORIES.forEach((cat) => {
      const item = document.createElement("div");
      item.className = `sort-option${cat.key === state.sortCategory ? " active" : ""}`;
      item.dataset.sort = cat.key;
      item.innerHTML = `<span>${escapeHtml(cat.label)}</span>`
        + icon("check", { size: 13, className: "sort-check" });
      item.addEventListener("click", () => {
        state.sortCategory = cat.key;
        updateSortUi();
        closeDdPanel(panelIds.sort, els.sortBtn.id);
        reload();
      });
      panel.appendChild(item);
    });
    return panel;
  }

  function updateFilterBadge() {
    els.filterBtn.classList.toggle("has-active", hasActivePlayerFilters(state));
  }

  function buildFilterPanel() {
    return buildPlayerFilterPanel({
      panelId: panelIds.filter,
      ids: filterIds,
      state,
      autocomplete: true,
      onChange: () => { updateFilterBadge(); reload(); },
      onClear: () => {
        resetPlayerFilterState(state);
        document.getElementById(panelIds.filter)?.remove();
        els.filterWrap.appendChild(buildFilterPanel());
        updateFilterBadge();
        reload();
      },
    });
  }

  function updateInfoUi() {
    els.infoBtn.textContent = state.showInfo ? "HIDE INFO" : "SHOW INFO";
    els.infoBtn.classList.toggle("is-off", !state.showInfo);
    els.infoBtn.setAttribute("aria-pressed", state.showInfo ? "true" : "false");
    els.grid.classList.toggle("info-hidden", !state.showInfo);
  }

  function init() {
    sortPanel = buildSortPanel();
    els.sortWrap.appendChild(sortPanel);
    els.filterWrap.appendChild(buildFilterPanel());
    updateSortUi();
    updateFilterBadge();
    updateInfoUi();
    getPlayerFilterOptions();

    /* Two panels, one open at a time — the same dance the CATALOG tab does.
       Scoped to this browser's own pair, so the other tab's panels are not
       something this one can close. */
    const panels = [[panelIds.sort, els.sortBtn.id], [panelIds.filter, els.filterBtn.id]];
    panels.forEach(([panelId, btnId]) => {
      document.getElementById(btnId).addEventListener("click", (ev) => {
        ev.stopPropagation();
        panels.forEach(([other, otherBtn]) => { if (other !== panelId) closeDdPanel(other, otherBtn); });
        toggleDdPanel(panelId, btnId);
      });
    });
    document.addEventListener("click", () => {
      panels.forEach(([panelId, btnId]) => closeDdPanel(panelId, btnId));
    });
    els.sortWrap.addEventListener("click", (ev) => ev.stopPropagation());
    els.filterWrap.addEventListener("click", (ev) => ev.stopPropagation());

    els.sortDirBtn.addEventListener("click", () => {
      state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
      updateSortUi();
      reload();
    });

    els.search.addEventListener("input", (e) => {
      const value = e.target.value.trim();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.search = value; reload(); }, SEARCH_DEBOUNCE_MS);
    });

    els.infoBtn.addEventListener("click", () => {
      state.showInfo = !state.showInfo;
      updateInfoUi();
    });

    els.more.addEventListener("click", () => {
      state.offset += PAGE_SIZE;
      fetchPage({ append: true });
    });

    reload();
  }

  return { init, refreshMarks };
}
