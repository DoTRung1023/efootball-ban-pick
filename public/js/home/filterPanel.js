/* ============================================================
   The player filter panel — one implementation, three mount points

   The catalog toolbar (Add Player modal), the squad toolbar (My Players) and
   the plan picker (Game Plans) all show the same filter dropdown: the same
   four multi-selects, the same six ranges, the same club/nationality inputs
   and the same CLEAR ALL button. They used to be three near-identical
   builders (~800 lines) that had to be edited in lockstep.

   The three still differ in ways that are load-bearing, so they stay
   configurable rather than being unified away:

   - **element ids** — each mount point uses its own prefix scheme, and the
     schemes are irregular (`fcOvrMin` / `sqfOvrMin` / `ppFcOvrMin`). `room.css`
     and the surrounding event wiring reference these by string, so every id is
     passed in explicitly instead of being derived from a prefix.
   - **state object** — `catalog`, `squad` and `ppState` each own their filter
     fields. Field *names* are identical across all three.
   - **autocomplete** — the catalog and squad club/nationality inputs get an
     autocomplete list; the plan picker's do not.
   ============================================================ */

import { escapeHtml } from "./utils.js";

const POS_LIST = ["GK","CB","LB","RB","DMF","CMF","LMF","RMF","AMF","LWF","RWF","SS","CF"];

/** The six sets and twelve scalar fields every filter state object carries. */
const FILTER_SETS = ["filterPositions", "filterFoot", "filterPlayingStyle",
  "filterCardType", "filterLeague", "filterRegion"];
const FILTER_SCALARS = ["filterClub", "filterNation",
  "filterOverallMin", "filterOverallMax", "filterMaxOverallMin", "filterMaxOverallMax",
  "filterHeightMin", "filterHeightMax", "filterWeightMin", "filterWeightMax",
  "filterAgeMin", "filterAgeMax"];

/** Clears every filter field in place. Callers then rebuild their panel. */
export function resetPlayerFilterState(state) {
  FILTER_SETS.forEach((k) => state[k].clear());
  FILTER_SCALARS.forEach((k) => { state[k] = ""; });
}

/* ── autocomplete + shared option lists ─────────────────────────── */

export function initAutocomplete(inputEl, listEl, field, onPick) {
  let timer = null;

  inputEl.addEventListener("input", () => {
    clearTimeout(timer);
    const q = inputEl.value.trim();
    if (!q) { listEl.innerHTML = ""; listEl.classList.remove("open"); return; }

    timer = setTimeout(async () => {
      try {
        const res   = await fetch(`/api/players/distinct?field=${field}&q=${encodeURIComponent(q)}`);
        const items = await res.json();
        if (!items.length) { listEl.innerHTML = ""; listEl.classList.remove("open"); return; }

        listEl.innerHTML = items
          .map((v) => `<div class="autocomplete-item" data-val="${v.replace(/"/g, "&quot;")}">${v}</div>`)
          .join("");
        listEl.classList.add("open");

        listEl.querySelectorAll(".autocomplete-item").forEach((el) => {
          el.addEventListener("mousedown", (e) => {
            e.preventDefault();
            inputEl.value = el.dataset.val;
            onPick(el.dataset.val);
            listEl.innerHTML = "";
            listEl.classList.remove("open");
          });
        });
      } catch (_) {}
    }, 200);
  });

  inputEl.addEventListener("blur", () => {
    setTimeout(() => { listEl.innerHTML = ""; listEl.classList.remove("open"); }, 150);
  });
}

export let playerFilterOptionsCache = null;

export async function getPlayerFilterOptions() {
  if (playerFilterOptionsCache) return playerFilterOptionsCache;
  try {
    const res = await fetch("/api/players/filter-options");
    playerFilterOptionsCache = res.ok ? await res.json() : null;
  } catch {
    playerFilterOptionsCache = null;
  }
  if (!playerFilterOptionsCache) {
    playerFilterOptionsCache = { foot: [], playing_style: [], card_type: [], league: [], region: [] };
  }
  return playerFilterOptionsCache;
}

/** Multiselect dropdowns backed by distinct catalog values (foot, style, card type, league). */
export function wireAttributeMultiselects(panel, optionsByKey, configs) {
  for (const cfg of configs) {
    const values = optionsByKey[cfg.optionsKey] ?? [];
    const msPanel = panel.querySelector(cfg.panelSel);
    const msBtn = panel.querySelector(cfg.btnSel);
    const msLabel = panel.querySelector(cfg.labelSel);
    if (!msPanel || !msBtn || !msLabel) continue;

    const stateSet = cfg.stateSet;
    msPanel.innerHTML = "";

    function updateLabel() {
      const sel = [...stateSet];
      msLabel.textContent =
        sel.length === 0
          ? cfg.allLabel
          : sel.length <= 3
            ? sel.join(", ")
            : `${sel.slice(0, 3).join(", ")} +${sel.length - 3}`;
      msBtn.classList.toggle("has-pos-filter", sel.length > 0);
    }

    values.forEach((val) => {
      const item = document.createElement("div");
      item.className = `pos-ms-item${stateSet.has(val) ? " checked" : ""}`;
      item.innerHTML = `<span class="pos-ms-check"></span><span>${escapeHtml(val)}</span>`;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        if (stateSet.has(val)) {
          stateSet.delete(val);
          item.classList.remove("checked");
        } else {
          stateSet.add(val);
          item.classList.add("checked");
        }
        updateLabel();
        cfg.onChange();
      });
      msPanel.appendChild(item);
    });

    msBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = msPanel.classList.toggle("open");
      msBtn.classList.toggle("open", isOpen);
    });
    document.addEventListener("click", () => msPanel.classList.remove("open"));
    msPanel.addEventListener("click", (e) => e.stopPropagation());

    updateLabel();
  }
}

/* ── markup ─────────────────────────────────────────────────────── */

const chevron =
  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;

const multiselect = (wrapId, btnId, labelId, panelId, allLabel) => `
    <div class="pos-multiselect" id="${wrapId}">
      <button class="pos-ms-btn" id="${btnId}" type="button">
        <span id="${labelId}">${allLabel}</span>
        ${chevron}
      </button>
      <div class="pos-ms-panel" id="${panelId}"></div>
    </div>`;

const rangePair = (minId, maxId, minVal, maxVal) => `
    <div class="range-pair">
      <input type="number" class="filter-input" id="${minId}" placeholder="Min" value="${minVal}">
      <span class="range-sep">—</span>
      <input type="number" class="filter-input" id="${maxId}" placeholder="Max" value="${maxVal}">
    </div>`;

const section = (label, body) => `
  <div class="filter-section">
    <div class="filter-section-label">${label}</div>${body}
  </div>`;

function panelMarkup(ids, state, autocomplete) {
  const textInput = (id, placeholder, value) =>
    `<input type="text" class="filter-input" id="${id}" placeholder="${placeholder}" value="${value}" autocomplete="off">`;
  // the catalog and squad inputs sit inside an autocomplete wrapper; the plan
  // picker's are bare
  const acInput = (id, acId, placeholder, value) => autocomplete
    ? `
    <div class="autocomplete-wrap">
      ${textInput(id, placeholder, value)}
      <div class="autocomplete-list" id="${acId}"></div>
    </div>`
    : `
    ${textInput(id, placeholder, value)}`;

  return `
  <div class="filter-group-label">IDENTITY</div>
  ${section("POSITION", multiselect(ids.posWrap, ids.posBtn, ids.posLabel, ids.posPanel, "All positions"))}
  ${section("CARD TYPE", multiselect(ids.ctWrap, ids.ctBtn, ids.ctLabel, ids.ctPanel, "Any card type"))}
  ${section("PLAYING STYLE", multiselect(ids.psWrap, ids.psBtn, ids.psLabel, ids.psPanel, "Any playing style"))}
  ${section("FOOT", multiselect(ids.footWrap, ids.footBtn, ids.footLabel, ids.footPanel, "Any foot"))}
  <div class="filter-group-label">STATS</div>
  ${section("OVERALL LEVEL 1", rangePair(ids.ovrMin, ids.ovrMax, state.filterOverallMin, state.filterOverallMax))}
  ${section("OVERALL MAX", rangePair(ids.ovrMaxMin, ids.ovrMaxMax, state.filterMaxOverallMin, state.filterMaxOverallMax))}
  <div class="filter-group-label">CLUB & ORIGIN</div>
  ${section("LEAGUE", multiselect(ids.lgWrap, ids.lgBtn, ids.lgLabel, ids.lgPanel, "Any league"))}
  ${section("REGION", multiselect(ids.rgWrap, ids.rgBtn, ids.rgLabel, ids.rgPanel, "Any region"))}
  ${section("CLUB", acInput(ids.club, ids.clubAc, "e.g. FC Barcelona", state.filterClub))}
  ${section("NATIONALITY", acInput(ids.nation, ids.nationAc, "e.g. Brazil", state.filterNation))}
  <div class="filter-group-label">PHYSICAL</div>
  ${section("AGE", rangePair(ids.ageMin, ids.ageMax, state.filterAgeMin, state.filterAgeMax))}
  ${section("HEIGHT (cm)", rangePair(ids.heightMin, ids.heightMax, state.filterHeightMin, state.filterHeightMax))}
  ${section("WEIGHT (kg)", rangePair(ids.weightMin, ids.weightMax, state.filterWeightMin, state.filterWeightMax))}
  <div class="filter-section">
    <button class="filter-clear-btn" id="${ids.clearBtn}">CLEAR ALL FILTERS</button>
  </div>
`;
}

/* ── builder ────────────────────────────────────────────────────── */

/**
 * @param {object}   cfg
 * @param {string}   cfg.panelId       id for the panel element itself
 * @param {object}   cfg.ids           element ids (see the id map at each call site)
 * @param {object}   cfg.state         `catalog` | `squad` | `ppState`
 * @param {boolean} [cfg.autocomplete] wrap club/nationality in an autocomplete list
 * @param {Function} cfg.onChange      run after any filter edit (badge + re-render)
 * @param {Function} cfg.onClear       run when CLEAR ALL is pressed; owns the rebuild
 */
export function buildPlayerFilterPanel({ panelId, ids, state, autocomplete = false, onChange, onClear }) {
  const panel = document.createElement("div");
  panel.className = "ap-dd-panel filter-dd-panel";
  panel.id = panelId;
  panel.innerHTML = panelMarkup(ids, state, autocomplete);

  /* position multi-select — its own builder because the options are a fixed
     list rather than distinct values fetched from the catalog */
  const msPanel = panel.querySelector(`#${ids.posPanel}`);
  const msBtn   = panel.querySelector(`#${ids.posBtn}`);
  const msLabel = panel.querySelector(`#${ids.posLabel}`);

  function updatePosLabel() {
    const sel = [...state.filterPositions];
    msLabel.textContent = sel.length === 0 ? "All positions"
      : sel.length <= 7  ? sel.join(", ")
      : `${sel.slice(0, 7).join(", ")} +${sel.length - 7}`;
    msBtn.classList.toggle("has-pos-filter", sel.length > 0);
  }

  POS_LIST.forEach((pos) => {
    const item = document.createElement("div");
    item.className   = `pos-ms-item${state.filterPositions.has(pos) ? " checked" : ""}`;
    item.dataset.pos = pos;
    item.innerHTML   = `<span class="pos-ms-check"></span><span>${pos}</span>`;
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.filterPositions.has(pos)) {
        state.filterPositions.delete(pos);
        item.classList.remove("checked");
      } else {
        state.filterPositions.add(pos);
        item.classList.add("checked");
      }
      updatePosLabel();
      onChange();
    });
    msPanel.appendChild(item);
  });

  msBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = msPanel.classList.toggle("open");
    msBtn.classList.toggle("open", isOpen);
  });
  document.addEventListener("click", () => msPanel.classList.remove("open"));
  msPanel.addEventListener("click", (e) => e.stopPropagation());
  updatePosLabel();

  /* text + number inputs, debounced */
  let filterTimer = null;
  const onFilterInput = (id, key) => {
    const el = panel.querySelector(`#${id}`);
    el?.addEventListener("input", () => {
      clearTimeout(filterTimer);
      state[key] = el.value.trim();
      filterTimer = setTimeout(onChange, 400);
    });
  };
  onFilterInput(ids.club,       "filterClub");
  onFilterInput(ids.nation,     "filterNation");
  onFilterInput(ids.ovrMin,     "filterOverallMin");
  onFilterInput(ids.ovrMax,     "filterOverallMax");
  onFilterInput(ids.ovrMaxMin,  "filterMaxOverallMin");
  onFilterInput(ids.ovrMaxMax,  "filterMaxOverallMax");
  onFilterInput(ids.heightMin,  "filterHeightMin");
  onFilterInput(ids.heightMax,  "filterHeightMax");
  onFilterInput(ids.weightMin,  "filterWeightMin");
  onFilterInput(ids.weightMax,  "filterWeightMax");
  onFilterInput(ids.ageMin,     "filterAgeMin");
  onFilterInput(ids.ageMax,     "filterAgeMax");

  if (autocomplete) {
    initAutocomplete(
      panel.querySelector(`#${ids.club}`),
      panel.querySelector(`#${ids.clubAc}`),
      "club",
      (val) => { state.filterClub = val; onChange(); },
    );
    initAutocomplete(
      panel.querySelector(`#${ids.nation}`),
      panel.querySelector(`#${ids.nationAc}`),
      "nationality",
      (val) => { state.filterNation = val; onChange(); },
    );
  }

  /* attribute multi-selects, from distinct catalog values */
  const runMs = (options) =>
    wireAttributeMultiselects(panel, options, [
      { optionsKey: "foot",          stateSet: state.filterFoot,         allLabel: "Any foot",
        panelSel: `#${ids.footPanel}`, btnSel: `#${ids.footBtn}`, labelSel: `#${ids.footLabel}`, onChange },
      { optionsKey: "playing_style", stateSet: state.filterPlayingStyle, allLabel: "Any playing style",
        panelSel: `#${ids.psPanel}`,   btnSel: `#${ids.psBtn}`,   labelSel: `#${ids.psLabel}`,   onChange },
      { optionsKey: "card_type",     stateSet: state.filterCardType,     allLabel: "Any card type",
        panelSel: `#${ids.ctPanel}`,   btnSel: `#${ids.ctBtn}`,   labelSel: `#${ids.ctLabel}`,   onChange },
      { optionsKey: "league",        stateSet: state.filterLeague,       allLabel: "Any league",
        panelSel: `#${ids.lgPanel}`,   btnSel: `#${ids.lgBtn}`,   labelSel: `#${ids.lgLabel}`,   onChange },
      { optionsKey: "region",        stateSet: state.filterRegion,       allLabel: "Any region",
        panelSel: `#${ids.rgPanel}`,   btnSel: `#${ids.rgBtn}`,   labelSel: `#${ids.rgLabel}`,   onChange },
    ]);
  if (playerFilterOptionsCache) runMs(playerFilterOptionsCache);
  else getPlayerFilterOptions().then(runMs);

  panel.querySelector(`#${ids.clearBtn}`)?.addEventListener("click", onClear);

  return panel;
}
