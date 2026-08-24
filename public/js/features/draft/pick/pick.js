import { cb } from '@/features/draft/callbacks.js';
import { state } from '@/features/draft/state.js';
import { normalizeSortValue } from '@/features/draft/playerQuery.js';
import { renderDraftFilterPanel, bindDraftFilterPanel } from '@/features/draft/playerFilters.js';
import { bindCardGridHover, bindGridInfoToggle } from '@/features/draft/shell/cardGrid.js';
import { renderSortPanel, sortCategoryLabel } from '@/features/draft/sortPanel.js';
import { normalizeMySquadPlayerForDraft } from '@/features/draft/players.js';
import { showToast, getUser } from '@/features/draft/utils.js';

import { icon } from '@/shared/icons/icon.js';
/**
 * Position groups for the tab bar.
 *
 * The tabs are a shortcut onto `state.pickFilterPositions` — the same array the
 * FILTER panel's POSITION multi-select edits. Keeping a second position field
 * just for the tabs meant two filters that could disagree about the same thing.
 */
const PICK_TAB_GROUPS = {
  all: [],
  gk:  ["GK"],
  def: ["CB", "LB", "RB"],
  mid: ["DMF", "CMF", "LMF", "RMF", "AMF"],
  att: ["CF", "SS", "RWF", "LWF"],
};

const sameMembers = (a, b) =>
  a.length === b.length && new Set([...a, ...b]).size === a.length;

/** The tab whose group matches the current selection exactly, or "" for none. */
function activePickTab() {
  const selected = Array.isArray(state.pickFilterPositions) ? state.pickFilterPositions : [];
  if (!selected.length) return "all";
  const hit = Object.entries(PICK_TAB_GROUPS).find(([, group]) => group.length && sameMembers(group, selected));
  return hit ? hit[0] : "";
}

export function renderPickToolbar() {
  const sortLabel = document.getElementById("pickSortLabel");
  const sortPanel = document.getElementById("pickSortPanel");
  const sortDirIcon = document.getElementById("pickSortDirIcon");
  const filterPanel = document.getElementById("pickFilterPanel");
  const filterBtn = document.getElementById("pickFilterBtn");
  if (!sortLabel || !sortPanel) return;

  const sortVal = normalizeSortValue(state.pickSort);
  const dir = sortVal.endsWith("_asc") ? "asc" : "desc";
  const baseKey = sortVal.replace(/_(asc|desc)$/, "");
  sortLabel.textContent = sortCategoryLabel(baseKey);
  if (sortDirIcon) sortDirIcon.innerHTML = dir === "asc" ? icon("arrow-up", { size: 13 }) : icon("arrow-down", { size: 13 });

  renderSortPanel(sortPanel, baseKey, "data-pick-sort-cat");
  renderDraftFilterPanel(filterPanel, state, "pick", filterBtn);
}

/**
 * Highlights whichever tab matches the live position filter.
 *
 * Derived every render rather than stored: the FILTER panel edits the same
 * array, so a remembered tab would go stale the moment a position was toggled
 * there.
 */
export function renderPickPosTabs() {
  const active = activePickTab();
  document.querySelectorAll("[data-pick-tab]").forEach((tab) => {
    tab.classList.toggle("is-active", (tab.getAttribute("data-pick-tab") || "all") === active);
  });
}

export function bindPickPhaseUiOnce() {
  if (state.pickUiBound) return;
  const search = document.getElementById("pickSearch");
  const sortBtn = document.getElementById("pickSortBtn");
  const sortWrap = document.getElementById("pickSortWrap");
  const sortPanel = document.getElementById("pickSortPanel");
  const sortDirBtn = document.getElementById("pickSortDirBtn");
  const filterBtn = document.getElementById("pickFilterBtn");
  const filterWrap = document.getElementById("pickFilterWrap");
  const filterPanel = document.getElementById("pickFilterPanel");
  if (!search) return;
  state.pickUiBound = true;

  search.addEventListener("input", (e) => {
    state.pickSearch = String(e.target.value || "");
    cb.renderDraftUi();
  });

  const closeAll = () => {
    sortBtn?.classList.remove("open");
    filterBtn?.classList.remove("open");
    sortPanel?.classList.remove("open");
    filterPanel?.classList.remove("open");
    sortBtn?.setAttribute("aria-expanded", "false");
    filterBtn?.setAttribute("aria-expanded", "false");
  };

  document.addEventListener("click", (e) => {
    const t = e.target;
    const insideSort = sortWrap && t instanceof Element ? Boolean(t.closest("#pickSortWrap")) : false;
    const insideFilter = filterWrap && t instanceof Element ? Boolean(t.closest("#pickFilterWrap")) : false;
    if (!insideSort && !insideFilter) closeAll();
  });

  sortBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const open = !Boolean(sortPanel?.classList.contains("open"));
    closeAll();
    if (open) {
      renderPickToolbar();
      sortBtn.classList.add("open");
      sortPanel?.classList.add("open");
      sortBtn.setAttribute("aria-expanded", "true");
    }
  });

  filterBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const open = !Boolean(filterPanel?.classList.contains("open"));
    closeAll();
    if (open) {
      renderPickToolbar();
      filterBtn.classList.add("open");
      filterPanel?.classList.add("open");
      filterBtn.setAttribute("aria-expanded", "true");
    }
  });

  sortDirBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const cur = normalizeSortValue(state.pickSort);
    const baseKey = cur.replace(/_(asc|desc)$/, "");
    state.pickSort = cur.endsWith("_asc") ? `${baseKey}_desc` : `${baseKey}_asc`;
    cb.renderDraftUi();
  });

  sortPanel?.addEventListener("click", (e) => {
    const opt = e.target instanceof Element ? e.target.closest("[data-pick-sort-cat]") : null;
    if (!opt) return;
    const cat = String(opt.getAttribute("data-pick-sort-cat") || "");
    const cur = normalizeSortValue(state.pickSort);
    const dir = cur.endsWith("_asc") ? "asc" : "desc";
    state.pickSort = normalizeSortValue(`${cat}_${dir}`);
    cb.renderDraftUi();
    closeAll();
  });

  // Position tab bar — writes the group into the shared position filter.
  const posTabs = document.getElementById("pickPosTabs");
  posTabs?.addEventListener("click", (e) => {
    const btn = e.target instanceof Element ? e.target.closest("[data-pick-tab]") : null;
    if (!btn) return;
    const group = btn.getAttribute("data-pick-tab") || "all";
    state.pickFilterPositions = [...(PICK_TAB_GROUPS[group] || [])];
    renderPickPosTabs();
    cb.renderDraftUi();
  });

  bindDraftFilterPanel(filterPanel, state, "pick", () => cb.renderDraftUi());
  bindGridInfoToggle("pickToggleInfoBtn", "pickGrid", "pickGridInfoHidden");

  // The pool is your own squad.
  bindCardGridHover("pickGrid", ".player-card", (el) => {
    const id = el.getAttribute("data-player-id");
    return (state.players || []).find((p) => String(p.id) === id) || null;
  });

  /* The lineup needs it most: a pitch or bench slot is artwork and an ×, with
     no footer to turn on. `data-pick-slot` is the index into `picks`, holes
     and all — see pick-phase.md. */
  const slotPlayer = (el) => {
    const picks = state.room?.picks?.[state.mySide];
    return Array.isArray(picks) ? picks[Number(el.getAttribute("data-pick-slot"))] || null : null;
  };
  bindCardGridHover("pickPitch", ".pick-slot--filled", slotPlayer);
  bindCardGridHover("pickBench", ".pick-slot--filled", slotPlayer);
}

// Load the user's own squad for the pick grid (not the general catalog)
async function fetchPlayers() {
  const user = getUser();
  if (!user?.id) return [];
  const res = await fetch(`/api/my-players?userId=${encodeURIComponent(user.id)}`);
  if (!res.ok) throw new Error("Players unavailable");
  const data = await res.json();
  const rows = Array.isArray(data.players) ? data.players : [];
  const dedup = new Map();
  rows.forEach((row) => {
    const p = normalizeMySquadPlayerForDraft(row);
    if (p.id && !dedup.has(p.id)) dedup.set(p.id, p);
  });
  return Array.from(dedup.values());
}

export async function loadDraftPlayers() {
  // The pick grid shows its own "Loading your squad..." off state.loadingPlayers;
  // there is no separate overlay element.
  state.loadingPlayers = true;
  try {
    const players = await fetchPlayers();
    state.players = players;
    state.mySquadPlayers = players;
  } catch {
    state.players = [];
    state.mySquadPlayers = [];
    showToast("Could not load your squad.");
  } finally {
    state.loadingPlayers = false;
    cb.renderDraftUi();
  }
}
