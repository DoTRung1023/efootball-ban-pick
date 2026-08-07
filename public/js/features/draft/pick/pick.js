import { cb } from '@/features/draft/callbacks.js';
import { state } from '@/features/draft/state.js';
import { normalizeBanSortValue } from '@/features/draft/playerQuery.js';
import { normalizeMySquadPlayerForDraft } from '@/features/draft/players.js';
import { escapeHtml, showToast, getUser } from '@/features/draft/utils.js';

// Position groups for the tab bar
const PICK_TAB_GROUPS = {
  all: [],
  gk:  ["GK"],
  def: ["CB", "LB", "RB"],
  mid: ["DMF", "CMF", "LMF", "RMF", "AMF"],
  att: ["CF", "SS", "RWF", "LWF"],
};

export function renderPickToolbar() {
  const sortLabel = document.getElementById("pickSortLabel");
  const sortPanel = document.getElementById("pickSortPanel");
  const sortDirIcon = document.getElementById("pickSortDirIcon");
  if (!sortLabel || !sortPanel) return;

  const sortVal = normalizeBanSortValue(state.pickSort);
  const dir = sortVal.endsWith("_asc") ? "asc" : "desc";
  const baseKey = sortVal.replace(/_(asc|desc)$/, "");
  const labelMap = {
    overall_max: "OVR MAX",
    overall: "OVR Lvl 1",
    name: "Name",
    position: "Position",
    height: "Height",
    weight: "Weight",
    age: "Age",
    club: "Club",
    nationality: "Nationality",
  };
  sortLabel.textContent = labelMap[baseKey] || "OVR MAX";
  if (sortDirIcon) sortDirIcon.textContent = dir === "asc" ? "↑" : "↓";

  const sortCats = [
    { key: "overall_max", label: "Overall Max" },
    { key: "overall", label: "Overall Level 1" },
    { key: "name", label: "Player Name" },
    { key: "position", label: "Position" },
    { key: "club", label: "Club" },
    { key: "nationality", label: "Nationality" },
    { key: "height", label: "Height" },
    { key: "weight", label: "Weight" },
    { key: "age", label: "Age" },
  ];
  sortPanel.innerHTML = sortCats.map((c) => {
    const active = c.key === baseKey;
    return `<div class="sort-option ${active ? "active" : ""}" data-pick-sort-cat="${escapeHtml(c.key)}"><span>${escapeHtml(c.label)}</span><span class="sort-check">✓</span></div>`;
  }).join("");
}

export function renderPickPosTabs() {
  const tabs = document.querySelectorAll("[data-pick-tab]");
  tabs.forEach((tab) => {
    const g = tab.getAttribute("data-pick-tab") || "all";
    tab.classList.toggle("is-active", g === state.pickPosTab);
  });
}

export function bindPickPhaseUiOnce() {
  if (state.pickUiBound) return;
  const search = document.getElementById("pickSearch");
  const sortBtn = document.getElementById("pickSortBtn");
  const sortWrap = document.getElementById("pickSortWrap");
  const sortPanel = document.getElementById("pickSortPanel");
  const sortDirBtn = document.getElementById("pickSortDirBtn");
  if (!search) return;
  state.pickUiBound = true;

  search.addEventListener("input", (e) => {
    state.pickSearch = String(e.target.value || "");
    cb.renderDraftUi();
  });

  const closeSort = () => {
    sortBtn?.classList.remove("open");
    sortPanel?.classList.remove("open");
    sortBtn?.setAttribute("aria-expanded", "false");
  };

  document.addEventListener("click", (e) => {
    const t = e.target;
    const insideSort = sortWrap && t instanceof Element ? Boolean(t.closest("#pickSortWrap")) : false;
    if (!insideSort) closeSort();
  });

  sortBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const open = !Boolean(sortPanel?.classList.contains("open"));
    closeSort();
    if (open) {
      renderPickToolbar();
      sortBtn.classList.add("open");
      sortPanel?.classList.add("open");
      sortBtn.setAttribute("aria-expanded", "true");
    }
  });

  sortDirBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const cur = normalizeBanSortValue(state.pickSort);
    const baseKey = cur.replace(/_(asc|desc)$/, "");
    state.pickSort = cur.endsWith("_asc") ? `${baseKey}_desc` : `${baseKey}_asc`;
    cb.renderDraftUi();
  });

  sortPanel?.addEventListener("click", (e) => {
    const opt = e.target instanceof Element ? e.target.closest("[data-pick-sort-cat]") : null;
    if (!opt) return;
    const cat = String(opt.getAttribute("data-pick-sort-cat") || "");
    const cur = normalizeBanSortValue(state.pickSort);
    const dir = cur.endsWith("_asc") ? "asc" : "desc";
    state.pickSort = normalizeBanSortValue(`${cat}_${dir}`);
    cb.renderDraftUi();
    closeSort();
  });

  // Position tab bar
  const posTabs = document.getElementById("pickPosTabs");
  posTabs?.addEventListener("click", (e) => {
    const btn = e.target instanceof Element ? e.target.closest("[data-pick-tab]") : null;
    if (!btn) return;
    const group = btn.getAttribute("data-pick-tab") || "all";
    state.pickPosTab = group;
    state.pickFilterPosition = PICK_TAB_GROUPS[group] || [];
    renderPickPosTabs();
    cb.renderDraftUi();
  });
}

// Load the user's own squad for the pick grid (not the general catalog)
export async function fetchPlayers() {
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
  const loading = document.getElementById("draftLoading");
  state.loadingPlayers = true;
  state.mySquadLoading = true;
  if (loading) loading.hidden = false;
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
    state.mySquadLoading = false;
    if (loading) loading.hidden = true;
    cb.renderDraftUi();
  }
}
