/* ============================================================
   Ban phase toolbar — search, sort and the filter multi-selects
   ============================================================ */

import {
  CARD_TYPE_OPTIONS,
  FOOT_OPTIONS,
  PLAYING_STYLE_OPTIONS,
  POSITION_OPTIONS,
  REGION_OPTIONS,
} from "@/features/draft/constants.js";
import { LEAGUE_OPTIONS } from "@/features/draft/filterOptions.js";
import { state } from "@/features/draft/state.js";
import { escapeHtml } from "@/features/draft/utils.js";
import { toValidPosition, normalizeSortValue } from "@/features/draft/playerQuery.js";

export function renderBanToolbar() {
  const sortSelect = document.getElementById("banSort");
  const posSelect = document.getElementById("banPosition");
  const sortLabel = document.getElementById("banSortLabel");
  const sortPanel = document.getElementById("banSortPanel");
  const posPanel = document.getElementById("banPosPanel");
  const posDot = document.getElementById("banPosDot");
  const sortDirIcon = document.getElementById("banSortDirIcon");
  if (!sortSelect || !posSelect || !sortLabel || !sortPanel || !posPanel) return;

  const sortVal = normalizeSortValue(state.banSort);
  const posVal = "";
  sortSelect.value = sortVal;
  posSelect.value = posVal;

  // Home-style: sort category + direction toggle
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
  sortPanel.innerHTML = sortCats
    .map((c) => {
      const active = c.key === baseKey;
      return `
        <div class="sort-option ${active ? "active" : ""}" data-ban-sort-cat="${escapeHtml(c.key)}">
          <span>${escapeHtml(c.label)}</span>
          <span class="sort-check">✓</span>
        </div>
      `;
    })
    .join("");

  // Filter panel: matches all-players page
  function msLabel(arr, allText, max = 3) {
    return !arr.length ? allText : arr.length <= max ? arr.join(", ") : `${arr.slice(0, max).join(", ")} +${arr.length - max}`;
  }
  const selPos  = (Array.isArray(state.banFilterPositions)    ? state.banFilterPositions    : []).map(toValidPosition).filter(Boolean);
  const selFoot = Array.isArray(state.banFilterFoot)          ? state.banFilterFoot          : [];
  const selPs   = Array.isArray(state.banFilterPlayingStyle)  ? state.banFilterPlayingStyle  : [];
  const selCt   = Array.isArray(state.banFilterCardType)      ? state.banFilterCardType      : [];
  const selLg   = Array.isArray(state.banFilterLeague)        ? state.banFilterLeague        : [];
  const selRg   = Array.isArray(state.banFilterRegion)         ? state.banFilterRegion         : [];

  function msItemsHtml(options, selected, attr) {
    return options.map((v) => `
      <div class="pos-ms-item ${selected.includes(v) ? "checked" : ""}" data-${attr}="${escapeHtml(v)}">
        <span class="pos-ms-check"></span><span>${escapeHtml(v)}</span>
      </div>`).join("");
  }

  posPanel.innerHTML = `
    <div class="filter-group-label">IDENTITY</div>
    <div class="filter-section">
      <div class="filter-section-label">POSITION</div>
      <div class="pos-multiselect">
        <button class="pos-ms-btn ${selPos.length ? "has-pos-filter" : ""}" id="banPosMsBtn" type="button">
          <span id="banPosMsLabel">${escapeHtml(msLabel(selPos, "All positions", 7))}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="banPosMsPanel">${msItemsHtml(POSITION_OPTIONS, selPos, "ban-pos-ms")}</div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">CARD TYPE</div>
      <div class="pos-multiselect">
        <button class="pos-ms-btn ${selCt.length ? "has-pos-filter" : ""}" id="banCtMsBtn" type="button">
          <span id="banCtMsLabel">${escapeHtml(msLabel(selCt, "Any card type"))}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="banCtMsPanel">${msItemsHtml(CARD_TYPE_OPTIONS, selCt, "ban-ct-ms")}</div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">PLAYING STYLE</div>
      <div class="pos-multiselect">
        <button class="pos-ms-btn ${selPs.length ? "has-pos-filter" : ""}" id="banPsMsBtn" type="button">
          <span id="banPsMsLabel">${escapeHtml(msLabel(selPs, "Any playing style"))}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="banPsMsPanel">${msItemsHtml(PLAYING_STYLE_OPTIONS, selPs, "ban-ps-ms")}</div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">FOOT</div>
      <div class="pos-multiselect">
        <button class="pos-ms-btn ${selFoot.length ? "has-pos-filter" : ""}" id="banFootMsBtn" type="button">
          <span id="banFootMsLabel">${escapeHtml(msLabel(selFoot, "Any foot"))}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="banFootMsPanel">${msItemsHtml(FOOT_OPTIONS, selFoot, "ban-foot-ms")}</div>
      </div>
    </div>
    <div class="filter-group-label">STATS</div>
    <div class="filter-section">
      <div class="filter-section-label">OVERALL LEVEL 1</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="banFcOvrMin" placeholder="Min" value="${escapeHtml(String(state.banFilterOverallMin))}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="banFcOvrMax" placeholder="Max" value="${escapeHtml(String(state.banFilterOverallMax))}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">OVERALL MAX</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="banFcOvrMxMin" placeholder="Min" value="${escapeHtml(String(state.banFilterOverallMaxMin))}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="banFcOvrMxMax" placeholder="Max" value="${escapeHtml(String(state.banFilterOverallMaxMax))}">
      </div>
    </div>
    <div class="filter-group-label">CLUB & ORIGIN</div>
    <div class="filter-section">
      <div class="filter-section-label">LEAGUE</div>
      <div class="pos-multiselect">
        <button class="pos-ms-btn ${selLg.length ? "has-pos-filter" : ""}" id="banLgMsBtn" type="button">
          <span id="banLgMsLabel">${escapeHtml(msLabel(selLg, "Any league"))}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="banLgMsPanel">${msItemsHtml(LEAGUE_OPTIONS, selLg, "ban-lg-ms")}</div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">REGION</div>
      <div class="pos-multiselect">
        <button class="pos-ms-btn ${selRg.length ? "has-pos-filter" : ""}" id="banRgMsBtn" type="button">
          <span id="banRgMsLabel">${escapeHtml(msLabel(selRg, "Any region"))}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="banRgMsPanel">${msItemsHtml(REGION_OPTIONS, selRg, "ban-rg-ms")}</div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">CLUB</div>
      <input type="text" class="filter-input" id="banFcClub" placeholder="e.g. FC Barcelona" value="${escapeHtml(state.banFilterClub)}" autocomplete="off">
    </div>
    <div class="filter-section">
      <div class="filter-section-label">NATIONALITY</div>
      <input type="text" class="filter-input" id="banFcNation" placeholder="e.g. Brazil" value="${escapeHtml(state.banFilterNation)}" autocomplete="off">
    </div>
    <div class="filter-group-label">PHYSICAL</div>
    <div class="filter-section">
      <div class="filter-section-label">AGE</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="banFcAgeMin" placeholder="Min" value="${escapeHtml(String(state.banFilterAgeMin))}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="banFcAgeMax" placeholder="Max" value="${escapeHtml(String(state.banFilterAgeMax))}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">HEIGHT (cm)</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="banFcHtMin" placeholder="Min" value="${escapeHtml(String(state.banFilterHeightMin))}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="banFcHtMax" placeholder="Max" value="${escapeHtml(String(state.banFilterHeightMax))}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">WEIGHT (kg)</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="banFcWtMin" placeholder="Min" value="${escapeHtml(String(state.banFilterWeightMin))}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="banFcWtMax" placeholder="Max" value="${escapeHtml(String(state.banFilterWeightMax))}">
      </div>
    </div>
    <div class="filter-section">
      <button class="filter-clear-btn" id="banClearFiltersBtn">CLEAR ALL FILTERS</button>
    </div>
  `;

  const anyFilterActive = selPos.length || selFoot.length || selPs.length || selCt.length || selLg.length || selRg.length
    || state.banFilterOverallMin || state.banFilterOverallMax
    || state.banFilterOverallMaxMin || state.banFilterOverallMaxMax
    || state.banFilterClub || state.banFilterNation
    || state.banFilterHeightMin || state.banFilterHeightMax
    || state.banFilterWeightMin || state.banFilterWeightMax
    || state.banFilterAgeMin || state.banFilterAgeMax;
  if (posDot) {
    posDot.style.display = anyFilterActive ? "inline-block" : "none";
  }
}
