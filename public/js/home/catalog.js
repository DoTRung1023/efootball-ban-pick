import { PAGE_SIZE, getUser, showToast,
         escapeHtml, playerDetailSublineHtml, playerDetailTooltipText, hasFullOvrPair, ovrPairInnerHtml,
         posClass, CARD_IMG, ANON_PLAYER_IMG, makePlayerImg,
         openDdPanel, closeDdPanel, toggleDdPanel } from './utils.js';
import { cb } from './callbacks.js';

export const SORT_CATEGORIES = [
  { key: "overall_max", label: "Overall Max",       descVal: "overall_max_desc", ascVal: "overall_max_asc", bidir: true,  descTip: "Highest max rating first", ascTip: "Lowest max rating first" },
  { key: "overall",     label: "Overall Level 1",   descVal: "overall_desc",     ascVal: "overall_asc",     bidir: true,  descTip: "Highest Level 1 first",    ascTip: "Lowest Level 1 first"    },
  { key: "name",        label: "Player Name",    descVal: "name_asc",        ascVal: "name_desc",       bidir: true,  descTip: "A → Z",                 ascTip: "Z → A"                 },
  { key: "position",    label: "Position",       descVal: "position_asc",    ascVal: "position_desc",   bidir: true,  descTip: "CF → SS → … → GK",     ascTip: "GK → … → SS → CF"       },
  { key: "height",      label: "Height",         descVal: "height_desc",     ascVal: "height_asc",      bidir: true,  descTip: "Tallest first",          ascTip: "Shortest first"        },
  { key: "weight",      label: "Weight",         descVal: "weight_desc",     ascVal: "weight_asc",      bidir: true,  descTip: "Heaviest first",         ascTip: "Lightest first"        },
  { key: "age",         label: "Age",            descVal: "age_desc",        ascVal: "age_asc",         bidir: true,  descTip: "Oldest first",           ascTip: "Youngest first"        },
  { key: "club",        label: "Club",           descVal: "club_asc",        ascVal: "club_desc",       bidir: true,  descTip: "A → Z (club)",          ascTip: "Z → A (club)"          },
  { key: "nationality", label: "Nationality",    descVal: "nationality_asc", ascVal: "nationality_desc", bidir: true, descTip: "A → Z (nationality)", ascTip: "Z → A (nationality)" },
];

const catalog = {
  players:       [],
  offset:        0,
  query:         "",
  filterPositions: new Set(),
  filterFoot:          new Set(),
  filterPlayingStyle:  new Set(),
  filterCardType:      new Set(),
  filterLeague:        new Set(),
  sortCategory:  "overall_max",
  sortDir:       "desc",
  sortBy:        "overall_max_desc",
  filterClub:       "",
  filterNation:     "",
  filterOverallMin:     "",
  filterOverallMax:     "",
  filterMaxOverallMin:  "",
  filterMaxOverallMax:  "",
  filterHeightMin:  "",
  filterHeightMax:  "",
  filterWeightMin:  "",
  filterWeightMax:  "",
  filterAgeMin:     "",
  filterAgeMax:     "",
  hasMore:       true,
  loading:       false,
  addedPesdbIds: new Set(),
};

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
    playerFilterOptionsCache = { foot: [], playing_style: [], card_type: [], league: [] };
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
      const open = msPanel.classList.toggle("open");
      msBtn.classList.toggle("open", open);
    });
    document.addEventListener("click", () => {
      msPanel.classList.remove("open");
      msBtn.classList.remove("open");
    });
    msPanel.addEventListener("click", (e) => e.stopPropagation());

    updateLabel();
  }
}

function hasActiveFilters() {
  return catalog.filterPositions.size || catalog.filterFoot.size || catalog.filterPlayingStyle.size
    || catalog.filterCardType.size || catalog.filterLeague.size
    || catalog.filterClub || catalog.filterNation
    || catalog.filterOverallMin || catalog.filterOverallMax
    || catalog.filterMaxOverallMin || catalog.filterMaxOverallMax
    || catalog.filterHeightMin || catalog.filterHeightMax
    || catalog.filterWeightMin || catalog.filterWeightMax
    || catalog.filterAgeMin    || catalog.filterAgeMax;
}

function updateFilterBadge() {
  const dot = document.getElementById("activeFilterDot");
  const btn = document.getElementById("filterDropBtn");
  const active = !!hasActiveFilters();
  if (dot) dot.style.display = active ? "inline-block" : "none";
  if (btn) btn.classList.toggle("has-active", active);
}

function getSortVal() {
  const cat = SORT_CATEGORIES.find((c) => c.key === catalog.sortCategory);
  if (!cat) return "overall_max_desc";
  return catalog.sortDir === "asc" ? cat.ascVal : cat.descVal;
}

function applySort(categoryKey) {
  catalog.sortCategory = categoryKey;
  catalog.sortBy = getSortVal();
  updateSortUI();
}

function toggleSortDir() {
  catalog.sortDir = catalog.sortDir === "desc" ? "asc" : "desc";
  catalog.sortBy  = getSortVal();
  updateSortUI();
  reloadCatalog();
}

function updateSortUI() {
  const cat     = SORT_CATEGORIES.find((c) => c.key === catalog.sortCategory);
  const labelEl = document.getElementById("sortDropLabel");
  const btn     = document.getElementById("sortDropBtn");
  const dirBtn  = document.getElementById("sortDirBtn");
  const dirIcon = document.getElementById("sortDirIcon");

  if (labelEl) labelEl.textContent = cat ? cat.label : "SORT";
  if (btn)     btn.classList.toggle("has-active", catalog.sortCategory !== "overall_max" || catalog.sortDir !== "desc");

  if (dirBtn && dirIcon) {
    dirBtn.style.display = "flex";
    dirIcon.textContent  = catalog.sortDir === "desc" ? "↓" : "↑";
    dirBtn.title = cat
      ? (catalog.sortDir === "desc" ? cat.descTip : cat.ascTip)
      : "Toggle sort direction";
  }

  document.querySelectorAll(".sort-option").forEach((el) => {
    el.classList.toggle("active", el.dataset.sort === catalog.sortCategory);
  });
}

function syncAddedPesdbIds() {
  catalog.addedPesdbIds.clear();
  cb.getSquadPlayers().forEach((p) => {
    if (p.pesdb_id) catalog.addedPesdbIds.add(String(p.pesdb_id));
  });
}

/* ──────────────── Fetch catalog ──────────────── */
async function fetchCatalog(reset = false) {
  if (catalog.loading) return;
  if (!catalog.hasMore && !reset) return;

  if (reset) {
    catalog.offset  = 0;
    catalog.hasMore = true;
    catalog.players = [];
  }

  catalog.loading = true;

  const params = new URLSearchParams({ limit: PAGE_SIZE, offset: catalog.offset, sortBy: catalog.sortBy });
  if (catalog.query)          params.set("q",           catalog.query);
  if (catalog.filterPositions.size) params.set("positions", [...catalog.filterPositions].join(","));
  if (catalog.filterClub)     params.set("club",         catalog.filterClub);
  if (catalog.filterNation)   params.set("nationality",  catalog.filterNation);
  if (catalog.filterHeightMin) params.set("heightMin",   catalog.filterHeightMin);
  if (catalog.filterHeightMax) params.set("heightMax",   catalog.filterHeightMax);
  if (catalog.filterWeightMin) params.set("weightMin",   catalog.filterWeightMin);
  if (catalog.filterWeightMax) params.set("weightMax",   catalog.filterWeightMax);
  if (catalog.filterAgeMin)   params.set("ageMin",       catalog.filterAgeMin);
  if (catalog.filterAgeMax)   params.set("ageMax",       catalog.filterAgeMax);
  if (catalog.filterFoot.size)         params.set("foot",         [...catalog.filterFoot].join(","));
  if (catalog.filterPlayingStyle.size)  params.set("playingStyle", [...catalog.filterPlayingStyle].join(","));
  if (catalog.filterCardType.size)      params.set("cardType",     [...catalog.filterCardType].join(","));
  if (catalog.filterLeague.size)        params.set("league",       [...catalog.filterLeague].join(","));
  if (catalog.filterOverallMin)        params.set("overallMin",        catalog.filterOverallMin);
  if (catalog.filterOverallMax)        params.set("overallMax",        catalog.filterOverallMax);
  if (catalog.filterMaxOverallMin)     params.set("maxOverallMin",     catalog.filterMaxOverallMin);
  if (catalog.filterMaxOverallMax)     params.set("maxOverallMax",     catalog.filterMaxOverallMax);

  try {
    const res   = await fetch("/api/players?" + params);
    const data  = await res.json();
    const fresh = data.players ?? [];
    catalog.players = reset ? fresh : [...catalog.players, ...fresh];
    catalog.offset += fresh.length;
    catalog.hasMore = fresh.length === PAGE_SIZE;
  } catch {
    showToast("Could not load catalog.", "error");
  } finally {
    catalog.loading = false;
  }
}

/* ──────────────── Render catalog list ──────────────── */
function renderCatalogList() {
  const list = document.getElementById("catalogList");
  if (!list) return;

  list.innerHTML = "";

  if (!catalog.players.length) {
    list.innerHTML = `<div class="catalog-empty"><p>NO PLAYERS FOUND</p></div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  catalog.players.forEach((p) => frag.appendChild(makeCatalogRow(p)));

  if (catalog.hasMore) {
    const btn = document.createElement("button");
    btn.className = "load-more-btn";
    btn.id        = "apLoadMoreBtn";
    btn.textContent = "LOAD MORE";
    btn.addEventListener("click", async () => {
      btn.disabled    = true;
      btn.textContent = "LOADING…";
      await fetchCatalog();
      renderCatalogList();
    });
    frag.appendChild(btn);
  }

  list.appendChild(frag);
}

function makeCatalogRow(player) {
  const row = document.createElement("div");
  row.className       = "catalog-row";
  row.dataset.pesdbId = player.id;

  const isAdded = catalog.addedPesdbIds.has(String(player.id));

  const imgWrap = document.createElement("div");
  imgWrap.className = "cr-img";
  imgWrap.dataset.initial = player.name[0] || "?";
  imgWrap.appendChild(makePlayerImg(CARD_IMG(player.id), player.name));

  const info = document.createElement("div");
  info.className = "cr-info";
  info.innerHTML = `
    <div class="cr-name">${escapeHtml(player.name)}</div>
    <div class="cr-detail">${playerDetailSublineHtml(player)}</div>
  `;

  const pos = document.createElement("span");
  pos.className   = `cr-pos ${posClass(player.position)}`;
  pos.textContent = player.position || "?";

  const ovr = document.createElement("span");
  ovr.className = `cr-ovr${hasFullOvrPair(player) ? " cr-ovr-dual" : ""}`;
  ovr.innerHTML = ovrPairInnerHtml(player);

  const addBtn = document.createElement("button");
  addBtn.className = `cr-add-btn ${isAdded ? "added" : ""}`;
  addBtn.title     = isAdded ? "Remove from team" : "Add to team";
  addBtn.innerHTML = isAdded
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (addBtn.classList.contains("added")) {
      removePlayerFromCatalog(player, addBtn);
    } else {
      addPlayerToSquad(player, addBtn);
    }
  });

  // Click row → open detail popup
  row.addEventListener("click", () => cb.openPlayerPopup(player, addBtn));

  row.appendChild(imgWrap);
  row.appendChild(info);
  row.appendChild(pos);
  row.appendChild(ovr);
  row.appendChild(addBtn);
  return row;
}

/* ──────────────── Add player to team ──────────────── */
async function addPlayerToSquad(player, btn) {
  const user = getUser();
  if (!user) return;

  btn.disabled = true;

  try {
    const res = await fetch("/api/my-players", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        userId: user.id, name: player.name, position: player.position,
        club: player.club, overall: player.overall, pesdbId: player.id,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 409) { showToast("Already in your players.", "error"); markAdded(btn, player.id); }
      else { showToast(data.error || "Could not add player.", "error"); btn.disabled = false; }
      return;
    }

    cb.addToSquadState({
      id:             data.id,
      name:           player.name,
      position:       player.position,
      club:           player.club,
      league:         player.league ?? null,
      overall:        player.overall,
      overall_max:    player.overall_max ?? null,
      pesdb_id:       player.id,
      nationality:    player.nationality ?? null,
      region:         player.region ?? null,
      card_type:      player.card_type ?? null,
      foot:           player.foot ?? null,
      playing_style:  player.playing_style ?? null,
      height:         player.height ?? null,
      weight:         player.weight ?? null,
      age:            player.age ?? null,
    });
    markAdded(btn, player.id);
    showToast(`${player.name} added to team!`, "success");
  } catch {
    showToast("Network error. Please try again.", "error");
    btn.disabled = false;
  }
}

function markAdded(btn, pesdbId) {
  btn.disabled  = false;
  btn.className = "cr-add-btn added";
  btn.title     = "Remove from team";
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
  catalog.addedPesdbIds.add(String(pesdbId));
}

function markRemoved(btn, pesdbId) {
  btn.disabled  = false;
  btn.className = "cr-add-btn";
  btn.title     = "Add to team";
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  catalog.addedPesdbIds.delete(String(pesdbId));
}

async function removePlayerFromCatalog(player, btn) {
  const user = getUser();
  if (!user) return;

  // Find the squad player id by pesdb_id
  const squadPlayer = cb.getSquadPlayers().find((p) => String(p.pesdb_id) === String(player.id));
  if (!squadPlayer) return;

  if (btn) btn.disabled = true;
  try {
    const res = await fetch("/api/my-players", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId: user.id, playerIds: [squadPlayer.id] }),
    });
    if (!res.ok) {
      showToast("Could not remove player.", "error");
      if (btn) btn.disabled = false;
      return;
    }

    cb.removeFromSquadState(squadPlayer.id);
    if (btn) markRemoved(btn, player.id);

    showToast(`${player.name} removed from team.`);
    return true;
  } catch {
    showToast("Network error. Please try again.", "error");
    if (btn) btn.disabled = false;
    return false;
  }
}

function refreshCatalogAddedState() {
  syncAddedPesdbIds();
  document.querySelectorAll(".catalog-row").forEach((row) => {
    const id  = row.dataset.pesdbId;
    const btn = row.querySelector(".cr-add-btn");
    if (btn && catalog.addedPesdbIds.has(String(id)) && !btn.classList.contains("added"))
      markAdded(btn, id);
  });
}

/* ──────────────── Sort & Filter dropdowns ──────────────── */
function buildSortPanel() {
  const panel = document.createElement("div");
  panel.className = "ap-dd-panel sort-dd-panel";
  panel.id        = "sortPanel";

  SORT_CATEGORIES.forEach((cat) => {
    const item = document.createElement("div");
    item.className    = `sort-option${cat.key === catalog.sortCategory ? " active" : ""}`;
    item.dataset.sort = cat.key;
    item.innerHTML    = `<span>${cat.label}</span>
      <svg class="sort-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>`;
    item.addEventListener("click", () => {
      applySort(cat.key);
      closeDdPanel("sortPanel", "sortDropBtn", "sortDropWrap");
      reloadCatalog();
    });
    panel.appendChild(item);
  });

  return panel;
}

function buildFilterPanel() {
  const panel = document.createElement("div");
  panel.className = "ap-dd-panel filter-dd-panel";
  panel.id        = "filterPanel";

  panel.innerHTML = `
    <div class="filter-section">
      <div class="filter-section-label">POSITION</div>
      <div class="pos-multiselect" id="posMultiselect">
        <button class="pos-ms-btn" id="posMsBtn" type="button">
          <span id="posMsLabel">All positions</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="posMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">FOOT</div>
      <div class="pos-multiselect" id="fcFootMs">
        <button class="pos-ms-btn" id="fcFootMsBtn" type="button">
          <span id="fcFootMsLabel">Any foot</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="fcFootMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">PLAYING STYLE</div>
      <div class="pos-multiselect" id="fcPsMs">
        <button class="pos-ms-btn" id="fcPsMsBtn" type="button">
          <span id="fcPsMsLabel">Any playing style</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="fcPsMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">CARD TYPE</div>
      <div class="pos-multiselect" id="fcCtMs">
        <button class="pos-ms-btn" id="fcCtMsBtn" type="button">
          <span id="fcCtMsLabel">Any card type</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="fcCtMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">LEAGUE</div>
      <div class="pos-multiselect" id="fcLgMs">
        <button class="pos-ms-btn" id="fcLgMsBtn" type="button">
          <span id="fcLgMsLabel">Any league</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="fcLgMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">OVERALL LEVEL 1</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="fcOvrMin" placeholder="Min" value="${catalog.filterOverallMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="fcOvrMax" placeholder="Max" value="${catalog.filterOverallMax}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">OVERALL MAX</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="fcOvrMaxMin" placeholder="Min" value="${catalog.filterMaxOverallMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="fcOvrMaxMax" placeholder="Max" value="${catalog.filterMaxOverallMax}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">CLUB</div>
      <div class="autocomplete-wrap">
        <input type="text" class="filter-input" id="fcClub" placeholder="e.g. FC Barcelona" value="${catalog.filterClub}" autocomplete="off">
        <div class="autocomplete-list" id="fcClubAc"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">NATIONALITY</div>
      <div class="autocomplete-wrap">
        <input type="text" class="filter-input" id="fcNation" placeholder="e.g. Brazil" value="${catalog.filterNation}" autocomplete="off">
        <div class="autocomplete-list" id="fcNationAc"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">HEIGHT (cm)</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="fcHeightMin" placeholder="Min" value="${catalog.filterHeightMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="fcHeightMax" placeholder="Max" value="${catalog.filterHeightMax}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">WEIGHT (kg)</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="fcWeightMin" placeholder="Min" value="${catalog.filterWeightMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="fcWeightMax" placeholder="Max" value="${catalog.filterWeightMax}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">AGE</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="fcAgeMin" placeholder="Min" value="${catalog.filterAgeMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="fcAgeMax" placeholder="Max" value="${catalog.filterAgeMax}">
      </div>
    </div>
    <div class="filter-section">
      <button class="filter-clear-btn" id="clearFiltersBtn">CLEAR ALL FILTERS</button>
    </div>
  `;

  // Position multi-select dropdown
  const POS_LIST = ["GK","CB","LB","RB","DMF","CMF","LMF","RMF","AMF","LWF","RWF","SS","CF"];
  const msPanel  = panel.querySelector("#posMsPanel");
  const msBtn    = panel.querySelector("#posMsBtn");
  const msLabel  = panel.querySelector("#posMsLabel");

  function updatePosLabel() {
    const sel = [...catalog.filterPositions];
    msLabel.textContent = sel.length === 0 ? "All positions"
      : sel.length <= 7  ? sel.join(", ")
      : `${sel.slice(0, 7).join(", ")} +${sel.length - 7}`;
    msBtn.classList.toggle("has-pos-filter", sel.length > 0);
  }

  POS_LIST.forEach((pos) => {
    const item = document.createElement("div");
    item.className  = `pos-ms-item${catalog.filterPositions.has(pos) ? " checked" : ""}`;
    item.dataset.pos = pos;
    item.innerHTML  = `<span class="pos-ms-check"></span><span>${pos}</span>`;
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      if (catalog.filterPositions.has(pos)) {
        catalog.filterPositions.delete(pos);
        item.classList.remove("checked");
      } else {
        catalog.filterPositions.add(pos);
        item.classList.add("checked");
      }
      updatePosLabel();
      updateFilterBadge();
      reloadCatalog();
    });
    msPanel.appendChild(item);
  });

  msBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = msPanel.classList.toggle("open");
    msBtn.classList.toggle("open", isOpen);
  });

  // Close pos panel when clicking outside
  document.addEventListener("click", () => msPanel.classList.remove("open"));
  msPanel.addEventListener("click", (e) => e.stopPropagation());

  updatePosLabel();

  // Text inputs (debounced)
  let filterTimer = null;
  function onFilterInput(id, key) {
    const el = panel.querySelector(`#${id}`);
    el?.addEventListener("input", () => {
      clearTimeout(filterTimer);
      catalog[key] = el.value.trim();
      filterTimer = setTimeout(() => { updateFilterBadge(); reloadCatalog(); }, 400);
    });
  }
  onFilterInput("fcClub",      "filterClub");
  onFilterInput("fcNation",    "filterNation");

  // Autocomplete for club & nationality
  initAutocomplete(
    panel.querySelector("#fcClub"),
    panel.querySelector("#fcClubAc"),
    "club",
    (val) => { catalog.filterClub = val; updateFilterBadge(); reloadCatalog(); }
  );
  initAutocomplete(
    panel.querySelector("#fcNation"),
    panel.querySelector("#fcNationAc"),
    "nationality",
    (val) => { catalog.filterNation = val; updateFilterBadge(); reloadCatalog(); }
  );
  onFilterInput("fcOvrMin",    "filterOverallMin");
  onFilterInput("fcOvrMax",    "filterOverallMax");
  onFilterInput("fcOvrMaxMin", "filterMaxOverallMin");
  onFilterInput("fcOvrMaxMax", "filterMaxOverallMax");
  onFilterInput("fcHeightMin", "filterHeightMin");
  onFilterInput("fcHeightMax", "filterHeightMax");
  onFilterInput("fcWeightMin", "filterWeightMin");
  onFilterInput("fcWeightMax", "filterWeightMax");
  onFilterInput("fcAgeMin",    "filterAgeMin");
  onFilterInput("fcAgeMax",    "filterAgeMax");

  const runCatMs = (o) =>
    wireAttributeMultiselects(panel, o, [
      {
        optionsKey: "foot",
        stateSet: catalog.filterFoot,
        panelSel: "#fcFootMsPanel",
        btnSel: "#fcFootMsBtn",
        labelSel: "#fcFootMsLabel",
        allLabel: "Any foot",
        onChange: () => { updateFilterBadge(); reloadCatalog(); },
      },
      {
        optionsKey: "playing_style",
        stateSet: catalog.filterPlayingStyle,
        panelSel: "#fcPsMsPanel",
        btnSel: "#fcPsMsBtn",
        labelSel: "#fcPsMsLabel",
        allLabel: "Any playing style",
        onChange: () => { updateFilterBadge(); reloadCatalog(); },
      },
      {
        optionsKey: "card_type",
        stateSet: catalog.filterCardType,
        panelSel: "#fcCtMsPanel",
        btnSel: "#fcCtMsBtn",
        labelSel: "#fcCtMsLabel",
        allLabel: "Any card type",
        onChange: () => { updateFilterBadge(); reloadCatalog(); },
      },
      {
        optionsKey: "league",
        stateSet: catalog.filterLeague,
        panelSel: "#fcLgMsPanel",
        btnSel: "#fcLgMsBtn",
        labelSel: "#fcLgMsLabel",
        allLabel: "Any league",
        onChange: () => { updateFilterBadge(); reloadCatalog(); },
      },
    ]);
  if (playerFilterOptionsCache) runCatMs(playerFilterOptionsCache);
  else getPlayerFilterOptions().then(runCatMs);

  // Clear all
  panel.querySelector("#clearFiltersBtn")?.addEventListener("click", () => {
    catalog.filterPositions.clear();
    catalog.filterFoot.clear();
    catalog.filterPlayingStyle.clear();
    catalog.filterCardType.clear();
    catalog.filterLeague.clear();
    catalog.filterClub = catalog.filterNation = "";
    catalog.filterOverallMin = catalog.filterOverallMax = "";
    catalog.filterMaxOverallMin = catalog.filterMaxOverallMax = "";
    catalog.filterHeightMin = catalog.filterHeightMax = "";
    catalog.filterWeightMin = catalog.filterWeightMax = "";
    catalog.filterAgeMin    = catalog.filterAgeMax    = "";
    // Rebuild filter panel to reset inputs visually
    const wrap = document.getElementById("filterDropWrap");
    const old  = document.getElementById("filterPanel");
    if (old) old.remove();
    wrap.appendChild(buildFilterPanel());
    updateFilterBadge();
    reloadCatalog();
  });

  return panel;
}



/* ──────────────── Add Player Modal ──────────────── */
let addPlayerModalOpen = false;

export function openAddPlayerModal() {
  if (addPlayerModalOpen) return;
  addPlayerModalOpen = true;
  syncAddedPesdbIds();
  getPlayerFilterOptions();
  reloadCatalog();
  document.getElementById("addPlayerOverlay")?.classList.add("open");
  document.body.style.overflow = "hidden";
  setTimeout(() => document.getElementById("apSearch")?.focus(), 100);
}

function closeAddPlayerModal() {
  addPlayerModalOpen = false;
  closeDdPanel("sortPanel",   "sortDropBtn");
  closeDdPanel("filterPanel", "filterDropBtn");
  document.getElementById("addPlayerOverlay")?.classList.remove("open");
  document.body.style.overflow = "";
  cb.renderSquad();
}

async function reloadCatalog() {
  const list = document.getElementById("catalogList");
  if (list) list.innerHTML = "";
  await fetchCatalog(true);
  renderCatalogList();
}

/* ──────────────── Player detail popup ──────────────── */
let popupCurrentPlayer = null;
let popupCurrentAddBtn = null;

function openPlayerPopup(player, rowAddBtn) {
  popupCurrentPlayer = player;
  popupCurrentAddBtn = rowAddBtn;

  const overlay = document.getElementById("playerPopupOverlay");
  const imgWrap = document.getElementById("playerPopupImg");
  const nameEl  = document.getElementById("playerPopupName");
  const clubEl  = document.getElementById("playerPopupClub");
  const statsEl = document.getElementById("playerPopupStats");
  const ovrEl   = document.getElementById("playerPopupOvr");
  const addBtn  = document.getElementById("playerPopupAdd");

  // Image
  imgWrap.innerHTML = "";
  imgWrap.classList.remove("no-img");
  imgWrap.appendChild(makePlayerImg(player.id ? CARD_IMG(player.id) : ANON_PLAYER_IMG, player.name));

  nameEl.textContent = player.name;

  clubEl.innerHTML = playerDetailSublineHtml(player);

  if (ovrEl) ovrEl.innerHTML = "";

  statsEl.innerHTML = "";

  const fromSquad = (rowAddBtn === null);
  const isAdded   = fromSquad || catalog.addedPesdbIds.has(String(player.id));
  addBtn.disabled    = false;
  addBtn.textContent = fromSquad  ? "− REMOVE FROM TEAM"
    : isAdded ? "✓ IN TEAM — click to remove"
    : "+ ADD TO TEAM";
  addBtn.classList.toggle("added", isAdded);

  overlay.classList.add("open");
}

function closePlayerPopup() {
  document.getElementById("playerPopupOverlay")?.classList.remove("open");
  popupCurrentPlayer = null;
  popupCurrentAddBtn = null;
}

export function initPlayerPopup() {
  document.getElementById("playerPopupClose")?.addEventListener("click", closePlayerPopup);
  document.getElementById("playerPopupOverlay")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("playerPopupOverlay")) closePlayerPopup();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePlayerPopup();
  });
  document.getElementById("playerPopupAdd")?.addEventListener("click", async () => {
    if (!popupCurrentPlayer) return;
    const addBtn = document.getElementById("playerPopupAdd");

    if (addBtn.classList.contains("added")) {
      // Remove from team
      addBtn.disabled = true;
      const ok = await removePlayerFromCatalog(popupCurrentPlayer, popupCurrentAddBtn);
      if (ok) {
        // If opened from squad card, close popup since player is gone
        if (!popupCurrentAddBtn) {
          closePlayerPopup();
        } else {
          addBtn.textContent = "+ ADD TO TEAM";
          addBtn.classList.remove("added");
          addBtn.disabled = false;
        }
      } else {
        addBtn.disabled = false;
      }
    } else {
      // Add to team
      addBtn.disabled = true;
      await addPlayerToSquad(popupCurrentPlayer, popupCurrentAddBtn);
      addBtn.textContent = "✓ IN TEAM — click to remove";
      addBtn.classList.add("added");
      addBtn.disabled = false;
    }
  });
}

export function initAddPlayerModal() {
  const overlay    = document.getElementById("addPlayerOverlay");
  const closeBtn   = document.getElementById("addPlayerClose");
  const searchIn   = document.getElementById("apSearch");

  // Build & inject dropdown panels
  const sortWrap   = document.getElementById("sortDropWrap");
  const filterWrap = document.getElementById("filterDropWrap");
  if (sortWrap)   sortWrap.appendChild(buildSortPanel());
  if (filterWrap) filterWrap.appendChild(buildFilterPanel());

  // Reflect the default sort in the button label immediately
  updateSortUI();

  // Sort button toggle
  document.getElementById("sortDropBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDdPanel("sortPanel", "sortDropBtn", "filterPanel", "filterDropBtn");
  });

  // Direction toggle (outside dropdown)
  document.getElementById("sortDirBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSortDir();
  });

  // Filter button toggle
  document.getElementById("filterDropBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDdPanel("filterPanel", "filterDropBtn", "sortPanel", "sortDropBtn");
  });

  // Click inside a panel doesn't close it
  document.getElementById("sortPanel")?.addEventListener("click",   (e) => e.stopPropagation());
  document.getElementById("filterPanel")?.addEventListener("click", (e) => e.stopPropagation());

  // Click outside closes open panels
  document.addEventListener("click", () => {
    closeDdPanel("sortPanel",   "sortDropBtn");
    closeDdPanel("filterPanel", "filterDropBtn");
  });

  closeBtn?.addEventListener("click", closeAddPlayerModal);

  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) closeAddPlayerModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && addPlayerModalOpen) closeAddPlayerModal();
  });

  // Search
  let searchTimer = null;
  searchIn?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      catalog.query = searchIn.value.trim();
      reloadCatalog();
    }, 350);
  });

}

/* ── Wire catalog-side callbacks ── */
cb.openPlayerPopup    = (player, addBtn) => openPlayerPopup(player, addBtn);
cb.openAddPlayerModal = () => openAddPlayerModal();
cb.onPlayersDeleted   = () => { syncAddedPesdbIds(); refreshCatalogAddedState(); };
