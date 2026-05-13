import { POSITION_OPTIONS } from './constants.js';
import { cb } from './callbacks.js';
import { state } from './state.js';
import { defaultRoomConfig } from './state.js';
import { normalizeBanSortValue, normalizeBanPositionValue } from './ban.js';
import { normalizeApiPlayer } from './players.js';
import { normalizeClubValue } from './allowance.js';
import { playerMatchesAllowanceCategory } from './allowance.js';
import { escapeHtml, showToast } from './utils.js';

export function renderPickToolbar() {
  const sortLabel = document.getElementById("pickSortLabel");
  const sortPanel = document.getElementById("pickSortPanel");
  const posPanel = document.getElementById("pickPosPanel");
  const posDot = document.getElementById("pickPosDot");
  const sortDirIcon = document.getElementById("pickSortDirIcon");
  if (!sortLabel || !sortPanel || !posPanel) return;

  const sortVal = normalizeBanSortValue(state.pickSort);
  const dir = sortVal.endsWith("_asc") ? "asc" : "desc";
  const baseKey = sortVal.replace(/_(asc|desc)$/, "");
  const labelMap = {
    overall_max: "Overall Max",
    overall: "Overall Level 1",
    name: "Player Name",
    position: "Position",
    height: "Height",
    weight: "Weight",
    age: "Age",
    club: "Club",
    nationality: "Nationality",
  };
  sortLabel.textContent = labelMap[baseKey] || "Overall Max";
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

  const selPos = (Array.isArray(state.pickFilterPosition) ? state.pickFilterPosition : []).map(normalizeBanPositionValue).filter(Boolean);
  posPanel.innerHTML = `
    <div class="filter-section">
      <div class="filter-section-label">POSITION</div>
      <div class="pos-multiselect">
        <button class="pos-ms-btn ${selPos.length ? "has-pos-filter" : ""}" id="pickPosMsBtn" type="button">
          <span id="pickPosMsLabel">${escapeHtml(!selPos.length ? "All positions" : selPos.length <= 7 ? selPos.join(", ") : `${selPos.slice(0, 7).join(", ")} +${selPos.length - 7}`)}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="pickPosMsPanel">
          ${POSITION_OPTIONS.map((v) => `<div class="pos-ms-item ${selPos.includes(v) ? "checked" : ""}" data-pick-pos-ms="${escapeHtml(v)}"><span class="pos-ms-check"></span><span>${escapeHtml(v)}</span></div>`).join("")}
        </div>
      </div>
    </div>
    <div class="filter-section">
      <button class="filter-clear-btn" id="pickClearFiltersBtn">CLEAR FILTERS</button>
    </div>
  `;
  if (posDot) posDot.style.display = selPos.length ? "inline-block" : "none";
}

export function bindPickPhaseUiOnce() {
  if (state.pickUiBound) return;
  const search = document.getElementById("pickSearch");
  const sortBtn = document.getElementById("pickSortBtn");
  const sortWrap = document.getElementById("pickSortWrap");
  const sortPanel = document.getElementById("pickSortPanel");
  const sortDirBtn = document.getElementById("pickSortDirBtn");
  const posBtn = document.getElementById("pickPosBtn");
  const posWrap = document.getElementById("pickPosWrap");
  const posPanel = document.getElementById("pickPosPanel");
  if (!search) return;
  state.pickUiBound = true;

  search.addEventListener("input", (e) => {
    state.pickSearch = String(e.target.value || "");
    cb.renderDraftUi();
  });

  const closeAll = () => {
    sortBtn?.classList.remove("open");
    posBtn?.classList.remove("open");
    sortPanel?.classList.remove("open");
    posPanel?.classList.remove("open");
    sortBtn?.setAttribute("aria-expanded", "false");
    posBtn?.setAttribute("aria-expanded", "false");
  };

  document.addEventListener("click", (e) => {
    const t = e.target;
    const insideSort = sortWrap && t instanceof Element ? Boolean(t.closest("#pickSortWrap")) : false;
    const insidePos = posWrap && t instanceof Element ? Boolean(t.closest("#pickPosWrap")) : false;
    if (!insideSort && !insidePos) closeAll();
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

  sortDirBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const cur = normalizeBanSortValue(state.pickSort);
    const baseKey = cur.replace(/_(asc|desc)$/, "");
    state.pickSort = cur.endsWith("_asc") ? `${baseKey}_desc` : `${baseKey}_asc`;
    cb.renderDraftUi();
  });

  posBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const open = !Boolean(posPanel?.classList.contains("open"));
    closeAll();
    if (open) {
      renderPickToolbar();
      posBtn.classList.add("open");
      posPanel?.classList.add("open");
      posBtn.setAttribute("aria-expanded", "true");
    }
  });

  sortPanel?.addEventListener("click", (e) => {
    const opt = e.target instanceof Element ? e.target.closest("[data-pick-sort-cat]") : null;
    if (!opt) return;
    const cat = String(opt.getAttribute("data-pick-sort-cat") || "");
    const cur = normalizeBanSortValue(state.pickSort);
    const dir = cur.endsWith("_asc") ? "asc" : "desc";
    state.pickSort = normalizeBanSortValue(`${cat}_${dir}`);
    cb.renderDraftUi();
    closeAll();
  });

  posPanel?.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const clear = e.target.closest("#pickClearFiltersBtn");
    if (clear) {
      state.pickFilterPosition = [];
      cb.renderDraftUi();
      return;
    }
    const item = e.target.closest("[data-pick-pos-ms]");
    if (item) {
      const raw = item.getAttribute("data-pick-pos-ms") || "";
      const v = normalizeBanPositionValue(raw);
      if (!v) return;
      const cur = new Set((Array.isArray(state.pickFilterPosition) ? state.pickFilterPosition : []).map(normalizeBanPositionValue).filter(Boolean));
      cur.has(v) ? cur.delete(v) : cur.add(v);
      state.pickFilterPosition = [...cur];
      cb.renderDraftUi();
      return;
    }
    const msBtn = e.target.closest("#pickPosMsBtn");
    if (msBtn) {
      const panel = document.getElementById("pickPosMsPanel");
      if (panel) {
        const open = !panel.classList.contains("open");
        panel.classList.toggle("open", open);
        msBtn.classList.toggle("open", open);
      }
      e.stopPropagation();
    }
  });
}

export async function fetchPlayers() {
  const params = new URLSearchParams({ limit: "500", sortBy: "overall_max_desc" });
  if (state.search.trim()) params.set("q", state.search.trim());
  if (state.position) params.set("position", state.position);
  const cfg = state.room?.config || defaultRoomConfig();
  const a = cfg.allowance || {};
  const enabled = new Set(cfg.allowanceEnabled || []);
  if (!cfg.allowAllPlayers) {
    if (enabled.has("position") && a.position) params.set("positions", a.position);
    if (enabled.has("overallMin") && a.overallMin) params.set("overallMin", a.overallMin);
    if (enabled.has("overallMax") && a.overallMax) params.set("overallMax", a.overallMax);
    if (enabled.has("overallMaxMin") && a.overallMaxMin) params.set("maxOverallMin", a.overallMaxMin);
    if (enabled.has("overallMaxMax") && a.overallMaxMax) params.set("maxOverallMax", a.overallMaxMax);
    if (enabled.has("club") && a.club) {
      const clubs = normalizeClubValue(a.club);
      if (clubs.length === 1) params.set("club", clubs[0]);
    }
    if (enabled.has("league") && a.league) params.set("league", a.league);
    if (enabled.has("nationality") && a.nationality) params.set("nationality", a.nationality);
    if (enabled.has("heightMin") && a.heightMin) params.set("heightMin", a.heightMin);
    if (enabled.has("heightMax") && a.heightMax) params.set("heightMax", a.heightMax);
    if (enabled.has("weightMin") && a.weightMin) params.set("weightMin", a.weightMin);
    if (enabled.has("weightMax") && a.weightMax) params.set("weightMax", a.weightMax);
    if (enabled.has("ageMin") && a.ageMin) params.set("ageMin", a.ageMin);
    if (enabled.has("ageMax") && a.ageMax) params.set("ageMax", a.ageMax);
    if (enabled.has("cardType") && a.cardType) params.set("cardType", a.cardType);
    if (enabled.has("foot") && a.foot) params.set("foot", a.foot);
    if (enabled.has("playingStyle") && a.playingStyle) params.set("playingStyle", a.playingStyle);
  }
  const res = await fetch(`/api/players?${params}`);
  if (!res.ok) throw new Error("Players unavailable");
  const data = await res.json();
  let rows = data.players || [];
  if (!cfg.allowAllPlayers && enabled.has("club") && a.club) {
    rows = rows.filter((p) => playerMatchesAllowanceCategory({ _raw: p }, "club", a.club));
  }
  if (!cfg.allowAllPlayers && enabled.has("region") && a.region) {
    const regionQ = String(a.region).toLowerCase();
    rows = rows.filter((p) => String(p.region || "").toLowerCase().includes(regionQ));
  }
  return rows.map(normalizeApiPlayer);
}

export async function loadDraftPlayers() {
  const loading = document.getElementById("draftLoading");
  state.loadingPlayers = true;
  if (loading) loading.hidden = false;
  try {
    state.players = await fetchPlayers();
  } catch {
    state.players = [];
    showToast("Could not load players.");
  } finally {
    state.loadingPlayers = false;
    if (loading) loading.hidden = state.loadingOpponentBanPlayers;
    cb.renderDraftUi();
  }
}
